-- BMIS 010 — membership gate for authenticated-but-unadmitted accounts.
--
-- Enabling Google sign-in means anyone with a Google account can reach the auth
-- endpoint. Invite-only currently rests entirely on GoTrue's signup being
-- disabled; if that is ever switched on, a stranger arrives as a `viewer` and a
-- viewer can read fund types, programmes, settings, masked donor names, every
-- verified donation via donations_public_v, the fund balance report and the
-- whole dashboard. That is the organisation's financial picture.
--
-- So: having an auth account is not membership. A profile starts inactive, an
-- admin admits it, and an unadmitted account resolves to the role 'none', which
-- ranks below viewer and is denied everywhere.

-- current_role() is called by every policy in the system, so it must not be
-- able to raise. Casting the claims GUC straight to jsonb throws on an empty
-- string — '' is not null, and ''::jsonb is a syntax error — which would turn
-- one unset setting into an error on every query rather than a safe default.
create or replace function public.current_role()
returns text language sql stable
set search_path = '' as $$
  select coalesce(
    nullif(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb
        -> 'app_metadata' ->> 'user_role',
      ''),
    'viewer'
  );
$$;

create or replace function public.is_service_role()
returns boolean language sql stable
set search_path = '' as $$
  select coalesce(
           nullif(
             nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
             ''),
           '') = 'service_role'
      or current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

-- Unknown or inactive now means no access rather than viewer access.
create or replace function public.role_rank(r text)
returns int language sql immutable
set search_path = '' as $$
  select case r
    when 'super_admin' then 5
    when 'finance'     then 4
    when 'auditor'     then 3
    when 'amil'        then 2
    when 'viewer'      then 1
    else 0 end;
$$;

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

  -- no profile, or not yet admitted: 'none' outranks nothing
  meta := meta || jsonb_build_object(
    'user_role', case when coalesce(p.is_active, false) then coalesce(p.role::text, 'viewer')
                      else 'none' end,
    'branch_id', p.branch_id);

  return jsonb_set(event, '{claims,app_metadata}', meta);
end $$;

-- A profile created by the signup trigger is inert until an admin activates it.
-- invite-user sets is_active explicitly, so invitations are unaffected.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name', ''),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'user_role')::public.user_role, 'viewer'),
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Every previously unconditional read now requires at least viewer rank.
drop policy fund_types_read   on public.fund_types;
drop policy asnaf_read        on public.asnaf_categories;
drop policy branches_read     on public.branches;
drop policy settings_read     on public.settings;
drop policy refresh_log_read  on public.matview_refresh_log;
drop policy programs_select   on public.programs;
drop policy period_locks_select on public.period_locks;

create policy fund_types_read on public.fund_types for select to authenticated
  using (public.has_min_role('viewer'));
create policy asnaf_read on public.asnaf_categories for select to authenticated
  using (public.has_min_role('viewer'));
create policy branches_read on public.branches for select to authenticated
  using (public.has_min_role('viewer'));
create policy settings_read on public.settings for select to authenticated
  using (public.has_min_role('viewer'));
create policy refresh_log_read on public.matview_refresh_log for select to authenticated
  using (public.has_min_role('viewer'));
create policy programs_select on public.programs for select to authenticated
  using (public.has_min_role('viewer'));
create policy period_locks_select on public.period_locks for select to authenticated
  using (public.has_min_role('viewer'));

-- The two definer-rights views bypass RLS by design, so they carry the check
-- themselves. donation_codes_v is invoker-rights over the tables above and is
-- therefore already gated.
create or replace view public.donors_masked_v as
  select id, donor_code, donor_type,
         case when public.current_role() = 'viewer'
              then split_part(full_name, ' ', 1) || ' ***' else full_name end as full_name,
         case when public.current_role() = 'viewer'
              then null else left(nik, 4) || '****' end as nik_masked,
         case when public.current_role() = 'viewer' then null else city end as city,
         province, is_recurring, tags, branch_id, created_at
  from public.donors
  where deleted_at is null
    and public.has_min_role('viewer');

create or replace view public.donations_public_v as
  select d.id, d.receipt_no, d.fund_type_id, ft.name as fund_type_name,
         d.program_id, p.name as program_name,
         d.amount, d.payment_method, d.donated_at, d.branch_id
  from public.donations d
  join public.fund_types ft on ft.id = d.fund_type_id
  left join public.programs p on p.id = d.program_id
  where d.status = 'verified'
    and public.has_min_role('viewer');

create or replace function public.rpc_fund_balance_report(p_from date, p_to date)
returns table (
  fund_type_id uuid, fund_type_code text, fund_type_name text,
  opening numeric, collected numeric, distributed numeric, closing numeric
) language sql stable security definer
set search_path = '' as $$
  with ft as (
    select * from public.fund_types
    where is_active and public.has_min_role('viewer')),
  don as (
    select fund_type_id,
      sum(amount) filter (where (donated_at at time zone 'Asia/Jakarta')::date < p_from) as before,
      sum(amount) filter (where (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as during
    from public.donations where status = 'verified' group by 1),
  dis as (
    select fund_type_id,
      sum(amount) filter (where (distributed_at at time zone 'Asia/Jakarta')::date < p_from) as before,
      sum(amount) filter (where (distributed_at at time zone 'Asia/Jakarta')::date between p_from and p_to) as during
    from public.distributions where status = 'disbursed' group by 1)
  select ft.id, ft.code, ft.name,
         coalesce(don.before, 0) - coalesce(dis.before, 0)                       as opening,
         coalesce(don.during, 0)                                                 as collected,
         coalesce(dis.during, 0)                                                 as distributed,
         coalesce(don.before, 0) - coalesce(dis.before, 0)
           + coalesce(don.during, 0) - coalesce(dis.during, 0)                   as closing
  from ft
  left join don on don.fund_type_id = ft.id
  left join dis on dis.fund_type_id = ft.id
  order by ft.sort_order;
$$;

create or replace function public.rpc_dashboard_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer
set search_path = '' as $$
declare
  r          text := public.current_role();
  span       int  := greatest(p_to - p_from + 1, 1);
  prev_from  date := p_from - span;
  prev_to    date := p_from - 1;
  collected  numeric;
  prev_coll  numeric;
  distributed numeric;
  ytd        numeric;
  result     jsonb;
begin
  -- An auth account is not membership. Someone who signed in with Google but
  -- has not been admitted by an admin carries role 'none' and must not receive
  -- the organisation's figures from a definer-rights function.
  if not public.has_min_role('viewer') then
    raise exception 'Akun Anda belum diaktifkan oleh pengurus'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(sum(amount), 0) into collected from public.donations
   where status = 'verified'
     and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to;

  select coalesce(sum(amount), 0) into prev_coll from public.donations
   where status = 'verified'
     and (donated_at at time zone 'Asia/Jakarta')::date between prev_from and prev_to;

  select coalesce(sum(amount), 0) into distributed from public.distributions
   where status = 'disbursed'
     and (distributed_at at time zone 'Asia/Jakarta')::date between p_from and p_to;

  select coalesce(sum(amount), 0) into ytd from public.donations
   where status = 'verified'
     and (donated_at at time zone 'Asia/Jakarta')::date
         >= date_trunc('year', p_to)::date
     and (donated_at at time zone 'Asia/Jakarta')::date <= p_to;

  result := jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'refreshed_at', (select refreshed_at from public.matview_refresh_log where view_name = 'dashboard'),
    'kpi', jsonb_build_object(
      'collected', collected,
      'collected_prev', prev_coll,
      'collected_delta_pct', case when prev_coll > 0
        then round((collected - prev_coll) / prev_coll * 100, 1) else null end,
      'collected_ytd', ytd,
      'annual_target', coalesce((select (value ->> 'annual_target')::numeric
                                 from public.settings where key = 'targets'), 0),
      'distributed', distributed,
      -- ACR: BAZNAS-style allocation-to-collection ratio
      'acr', case when collected > 0 then round(distributed / collected * 100, 1) else null end,
      'available_balance', (select coalesce(sum(public.fund_balance(id)), 0) from public.fund_types),
      'active_donors', (select count(distinct donor_id) from public.donations
                        where status = 'verified' and donated_at > now() - interval '12 months'),
      'pending', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
                  from public.donations where status = 'pending')
    ),
    'balances', (select coalesce(jsonb_agg(jsonb_build_object(
        'fund_type_id', ft.id, 'code', ft.code, 'name', ft.name,
        'balance', public.fund_balance(ft.id)) order by ft.sort_order), '[]'::jsonb)
      from public.fund_types ft where ft.is_active),
    'trend', (select coalesce(jsonb_agg(t order by t ->> 'month'), '[]'::jsonb) from (
        select jsonb_build_object('month', to_char(m.month, 'YYYY-MM'),
                                  'fund_type_id', m.fund_type_id,
                                  'fund_type_name', ft.name,
                                  'collected', m.collected) as t
        from public.mv_monthly_fund_summary m
        join public.fund_types ft on ft.id = m.fund_type_id
        where m.month >= date_trunc('month', p_to - interval '11 months')) s),
    'composition', (select coalesce(jsonb_agg(jsonb_build_object(
        'name', ft.name, 'code', ft.code, 'amount', x.amount)), '[]'::jsonb)
      from (select fund_type_id, sum(amount) as amount from public.donations
            where status = 'verified'
              and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to
            group by 1) x join public.fund_types ft on ft.id = x.fund_type_id),
    'collection_vs_distribution', (select coalesce(jsonb_agg(jsonb_build_object(
        'month', y.month, 'collected', y.collected, 'distributed', y.distributed)
        order by y.month), '[]'::jsonb) from (
        select to_char(coalesce(c.month, d.month), 'YYYY-MM') as month,
               coalesce(sum(c.collected), 0) as collected,
               coalesce(sum(d.distributed), 0) as distributed
        from public.mv_monthly_fund_summary c
        full join public.mv_monthly_distribution_summary d
          on d.month = c.month and d.fund_type_id = c.fund_type_id
        where coalesce(c.month, d.month) >= date_trunc('month', p_to - interval '11 months')
        group by 1) y),
    'asnaf', (select coalesce(jsonb_agg(jsonb_build_object(
        'asnaf', ac.code, 'name', ac.name, 'amount', coalesce(x.amount, 0))
        order by ac.sort_order), '[]'::jsonb)
      from public.asnaf_categories ac
      left join (
        select b.asnaf, sum(d.amount) as amount
        from public.distributions d
        join public.beneficiaries b on b.id = d.beneficiary_id
        join public.fund_types ft on ft.id = d.fund_type_id
        where d.status = 'disbursed' and ft.is_zakat
          and (d.distributed_at at time zone 'Asia/Jakarta')::date between p_from and p_to
        group by 1) x on x.asnaf = ac.code),
    'programs', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', p.id, 'name', p.name, 'target', p.target_amount,
                 'collected', coalesce(c.amount, 0), 'end_date', p.end_date) as x
        from public.programs p
        left join (select program_id, sum(amount) as amount from public.donations
                   where status = 'verified' group by 1) c on c.program_id = p.id
        where p.status = 'active'
        order by coalesce(c.amount, 0) desc limit 5) pr),
    'payment_methods', (select coalesce(jsonb_agg(jsonb_build_object(
        'method', payment_method, 'amount', amount, 'count', n)), '[]'::jsonb)
      from (select payment_method, sum(amount) as amount, count(*) as n
            from public.donations where status = 'verified'
              and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to
            group by 1) z)
  );

  -- Sections below identify donors or expose operational detail: not for viewer.
  if r <> 'viewer' then
    result := result || jsonb_build_object(
      'recent', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('id', d.id, 'receipt_no', d.receipt_no,
                                    'amount', d.amount, 'donated_at', d.donated_at,
                                    'donor_name', case when d.is_anonymous then 'Hamba Allah'
                                                       else dn.full_name end,
                                    'fund_type_name', ft.name) as x
          from public.donations d
          join public.fund_types ft on ft.id = d.fund_type_id
          left join public.donors dn on dn.id = d.donor_id
          where d.status = 'verified'
          order by d.verified_at desc nulls last limit 20) s),
      'top_donors', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select jsonb_build_object('id', dn.id, 'name', dn.full_name,
                                    'amount', sum(d.amount), 'count', count(*)) as x
          from public.donations d join public.donors dn on dn.id = d.donor_id
          where d.status = 'verified' and not d.is_anonymous
            and (d.donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          group by dn.id, dn.full_name order by sum(d.amount) desc limit 10) s),
      'alerts', jsonb_build_object(
        'stale_pending', (select count(*) from public.donations
                          where status = 'pending' and created_at < now() - interval '3 days'),
        'negative_funds', (select coalesce(jsonb_agg(ft.name), '[]'::jsonb)
                           from public.fund_types ft where public.fund_balance(ft.id) < 0),
        'at_risk_donors', (select count(*) from public.donors dn
                           where dn.is_recurring and dn.deleted_at is null
                             and not exists (select 1 from public.donations d
                                             where d.donor_id = dn.id and d.status = 'verified'
                                               and d.donated_at > now() - interval '2 months'))));
  end if;

  if r = 'amil' then
    result := result || jsonb_build_object('mine', (
      select jsonb_build_object(
        'collected', coalesce(sum(amount) filter (where status = 'verified'), 0),
        'pending_count', count(*) filter (where status in ('draft','pending')))
      from public.donations
      where created_by = auth.uid()
        and (donated_at at time zone 'Asia/Jakarta')::date between p_from and p_to));
  end if;

  if r in ('auditor','super_admin') then
    result := result || jsonb_build_object('audit_summary', (
      select coalesce(jsonb_agg(jsonb_build_object('action', action, 'count', n)), '[]'::jsonb)
      from (select action, count(*) as n from public.audit_log
            where created_at > now() - interval '7 days' group by 1) a));
  end if;

  return result;
end $$;
revoke execute on function public.rpc_dashboard_summary(date, date) from public;
grant execute on function public.rpc_dashboard_summary(date, date) to authenticated;
