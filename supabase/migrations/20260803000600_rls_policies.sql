-- BMIS 006 — row level security.
--
-- This file is the security boundary of the whole system. The anon key ships
-- to the browser and must be assumed public; anything the React app enforces
-- is convenience only. Every table is default-deny: RLS on, and a role gets a
-- capability only where a policy below grants it.
--
-- Role ranks (public.role_rank): super_admin 5 > finance 4 > auditor 3 >
-- amil 2 > viewer 1. Note that `auditor` outranks `amil` for reads but must
-- never write — write policies therefore use can_write(), never
-- has_min_role('amil').

alter table public.branches            enable row level security;
alter table public.profiles            enable row level security;
alter table public.fund_types          enable row level security;
alter table public.asnaf_categories    enable row level security;
alter table public.accounts            enable row level security;
alter table public.programs            enable row level security;
alter table public.donors              enable row level security;
alter table public.donations           enable row level security;
alter table public.beneficiaries       enable row level security;
alter table public.distributions       enable row level security;
alter table public.settings            enable row level security;
alter table public.period_locks        enable row level security;
alter table public.audit_log           enable row level security;
alter table public.doc_counters        enable row level security;
alter table public.matview_refresh_log enable row level security;

-- doc_counters has no policy at all: only next_counter() (definer) touches it.

-- ------------------------------------------------------------------ profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_min_role('auditor'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Self-update must not become privilege escalation.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql
set search_path = '' as $$
begin
  if not (public.is_super_admin() or public.is_service_role())
     and (new.role is distinct from old.role
          or new.is_active is distinct from old.is_active
          or new.branch_id is distinct from old.branch_id) then
    raise exception 'Hanya super admin yang dapat mengubah peran atau status pengguna'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger trg_profiles_privileges before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- --------------------------------------------------------------- master data
create policy fund_types_read on public.fund_types for select to authenticated using (true);
create policy fund_types_write on public.fund_types for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy asnaf_read on public.asnaf_categories for select to authenticated using (true);
create policy asnaf_write on public.asnaf_categories for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy branches_read on public.branches for select to authenticated using (true);
create policy branches_write on public.branches for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_write on public.settings for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create policy refresh_log_read on public.matview_refresh_log for select to authenticated using (true);

-- ------------------------------------------------------------------ accounts
create policy accounts_select on public.accounts for select to authenticated
  using (public.has_min_role('auditor'));
create policy accounts_insert on public.accounts for insert to authenticated
  with check (public.has_min_role('finance') and public.can_write());
create policy accounts_update on public.accounts for update to authenticated
  using (public.has_min_role('finance') and public.can_write());
create policy accounts_delete on public.accounts for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------------ programs
create policy programs_select on public.programs for select to authenticated using (true);
create policy programs_insert on public.programs for insert to authenticated
  with check (public.has_min_role('finance') and public.can_write());
create policy programs_update on public.programs for update to authenticated
  using (public.has_min_role('finance') and public.can_write());
create policy programs_delete on public.programs for delete to authenticated
  using (public.is_super_admin());

-- -------------------------------------------------------------------- donors
-- viewer is absent by design: it reads donors_masked_v instead.
create policy donors_select on public.donors for select to authenticated
  using (public.has_min_role('amil'));
create policy donors_insert on public.donors for insert to authenticated
  with check (public.can_write() and created_by = auth.uid());
create policy donors_update on public.donors for update to authenticated
  using (public.has_min_role('finance') and public.can_write()
         or (public.current_role() = 'amil' and created_by = auth.uid()));
create policy donors_delete on public.donors for delete to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------- donations
-- amil sees only what they entered; finance and above see everything.
create policy donations_select on public.donations for select to authenticated
  using (public.has_min_role('auditor')
         or (public.current_role() = 'amil' and created_by = auth.uid()));

create policy donations_insert on public.donations for insert to authenticated
  with check (public.can_write()
              and created_by = auth.uid()
              and status in ('draft','pending')
              and verified_by is null);

-- amil may correct their own entry only while it is still unverified
create policy donations_update_own on public.donations for update to authenticated
  using (public.current_role() = 'amil'
         and created_by = auth.uid()
         and status in ('draft','pending'))
  with check (public.current_role() = 'amil'
              and created_by = auth.uid()
              and status in ('draft','pending')
              and verified_by is null);

-- finance and super_admin: verify, reject, void. The creator <> verifier rule
-- is a table constraint, so it cannot be bypassed from here.
create policy donations_update_finance on public.donations for update to authenticated
  using (public.has_min_role('finance') and public.can_write())
  with check (public.has_min_role('finance') and public.can_write());

-- No DELETE policy for anyone, at any rank. Donations are voided, not deleted.

-- ------------------------------------------------------------- beneficiaries
create policy beneficiaries_select on public.beneficiaries for select to authenticated
  using (public.has_min_role('amil'));
create policy beneficiaries_insert on public.beneficiaries for insert to authenticated
  with check (public.can_write() and created_by = auth.uid());
create policy beneficiaries_update on public.beneficiaries for update to authenticated
  using (public.is_super_admin()
         or (public.current_role() = 'amil' and created_by = auth.uid()));
create policy beneficiaries_delete on public.beneficiaries for delete to authenticated
  using (public.is_super_admin());

-- ------------------------------------------------------------- distributions
create policy distributions_select on public.distributions for select to authenticated
  using (public.has_min_role('auditor')
         or (public.current_role() = 'amil' and requested_by = auth.uid()));

create policy distributions_insert on public.distributions for insert to authenticated
  with check (public.can_write()
              and requested_by = auth.uid()
              and created_by = auth.uid()
              and status = 'requested'
              and approved_by is null);

create policy distributions_update_own on public.distributions for update to authenticated
  using (public.current_role() = 'amil'
         and requested_by = auth.uid()
         and status = 'requested')
  with check (public.current_role() = 'amil'
              and requested_by = auth.uid()
              and status = 'requested'
              and approved_by is null);

create policy distributions_update_finance on public.distributions for update to authenticated
  using (public.has_min_role('finance') and public.can_write())
  with check (public.has_min_role('finance') and public.can_write());

create policy distributions_delete on public.distributions for delete to authenticated
  using (public.is_super_admin());

-- -------------------------------------------------------------- period locks
create policy period_locks_select on public.period_locks for select to authenticated using (true);
create policy period_locks_insert on public.period_locks for insert to authenticated
  with check (public.has_min_role('finance') and public.can_write());
create policy period_locks_delete on public.period_locks for delete to authenticated
  using (public.is_super_admin());

-- ----------------------------------------------------------------- audit log
-- Append-only for everyone: readable by auditor and above, and there is
-- deliberately no INSERT/UPDATE/DELETE policy. Rows arrive only through
-- audit_row(), which is SECURITY DEFINER and therefore bypasses RLS.
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.has_min_role('auditor'));

-- --------------------------------------------------------------------- grants
revoke all on all tables in schema public from anon;
revoke all on public.mv_monthly_fund_summary from authenticated, anon;
revoke all on public.mv_monthly_distribution_summary from authenticated, anon;
grant select on public.donors_masked_v, public.donations_public_v to authenticated;

-- ------------------------------------------------- custom access token hook
-- Puts the role into the JWT so RLS never has to join profiles per row.
-- Register in supabase/config.toml (or Dashboard → Auth → Hooks).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable
set search_path = '' as $$
declare
  claims jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  meta   jsonb := coalesce(claims -> 'app_metadata', '{}'::jsonb);
  p      record;
begin
  select role, is_active, branch_id into p
  from public.profiles where id = (event ->> 'user_id')::uuid;

  -- deactivated users fall back to the least-privileged role
  meta := meta || jsonb_build_object(
    'user_role', case when coalesce(p.is_active, false) then coalesce(p.role::text, 'viewer')
                      else 'viewer' end,
    'branch_id', p.branch_id);

  return jsonb_set(event, '{claims,app_metadata}', meta);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.profiles to supabase_auth_admin;
create policy profiles_auth_admin_read on public.profiles for select to supabase_auth_admin using (true);
