-- BMIS 003 — audit trail, document numbering, business-rule triggers

-- ---------------------------------------------------------------- audit log
create or replace function public.audit_row()
returns trigger language plpgsql security definer
set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  uuid;
begin
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;

  -- no-op updates are noise; skip them
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  v_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  insert into public.audit_log (table_name, record_id, action, actor_id, actor_role,
                                old_value, new_value, reason)
  values (tg_table_name, v_id, tg_op, auth.uid(), public.current_role(),
          v_old, v_new,
          nullif(current_setting('bmis.audit_reason', true), ''));

  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','fund_types','accounts','programs','donors',
                           'donations','beneficiaries','distributions','settings',
                           'period_locks','branches']
  loop
    execute format(
      'create trigger trg_%1$s_audit after insert or update or delete on public.%1$I
         for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Set a reason for the next mutation in this transaction; the audit trigger
-- picks it up. Used by override paths (super_admin verify, donor merge, void).
-- Deliberately has no SET clause: a function carrying one runs inside its own
-- GUC nesting level, so every setting it changes — including this one — is
-- rolled back the moment it returns, and the reason would never reach the
-- trigger. Fully-qualified names keep it safe without SET search_path.
create or replace function public.set_audit_reason(p_reason text)
returns void language sql volatile as $$
  select pg_catalog.set_config('bmis.audit_reason', coalesce(p_reason, ''), true);
$$;

-- ------------------------------------------------------------ auth → profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce((new.raw_app_meta_data ->> 'user_role')::public.user_role, 'viewer')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------- numbering
create table public.doc_counters (
  scope text primary key,
  last_value bigint not null default 0
);

-- SECURITY DEFINER: doc_counters is not reachable by any role directly.
create or replace function public.next_counter(p_scope text)
returns bigint language plpgsql security definer
set search_path = '' as $$
declare v bigint;
begin
  insert into public.doc_counters (scope, last_value) values (p_scope, 1)
  on conflict (scope) do update set last_value = public.doc_counters.last_value + 1
  returning last_value into v;
  return v;
end $$;

-- KW/2026/08/0001, numbered per month of donated_at (Asia/Jakarta)
create or replace function public.assign_receipt_no()
returns trigger language plpgsql
set search_path = '' as $$
declare
  d date := (new.donated_at at time zone 'Asia/Jakarta')::date;
  scope text;
begin
  if new.receipt_no is not null and new.receipt_no <> '' then return new; end if;
  scope := 'donation:' || to_char(d, 'YYYY-MM');
  new.receipt_no := 'KW/' || to_char(d, 'YYYY/MM') || '/' ||
                    lpad(public.next_counter(scope)::text, 4, '0');
  return new;
end $$;

create trigger trg_donations_receipt_no before insert on public.donations
  for each row execute function public.assign_receipt_no();

create or replace function public.assign_donor_code()
returns trigger language plpgsql
set search_path = '' as $$
begin
  if coalesce(new.donor_code, '') = '' then
    new.donor_code := 'DNR-' || lpad(public.next_counter('donor')::text, 6, '0');
  end if;
  return new;
end $$;

create or replace function public.assign_beneficiary_code()
returns trigger language plpgsql
set search_path = '' as $$
begin
  if coalesce(new.beneficiary_code, '') = '' then
    new.beneficiary_code := 'MST-' || lpad(public.next_counter('beneficiary')::text, 6, '0');
  end if;
  return new;
end $$;

create trigger trg_donors_code before insert on public.donors
  for each row execute function public.assign_donor_code();
create trigger trg_beneficiaries_code before insert on public.beneficiaries
  for each row execute function public.assign_beneficiary_code();

create or replace function public.assign_ref_no()
returns trigger language plpgsql
set search_path = '' as $$
declare d date := (new.distributed_at at time zone 'Asia/Jakarta')::date;
begin
  if new.ref_no is not null and new.ref_no <> '' then return new; end if;
  new.ref_no := 'SLR/' || to_char(d, 'YYYY/MM') || '/' ||
                lpad(public.next_counter('distribution:' || to_char(d, 'YYYY-MM'))::text, 4, '0');
  return new;
end $$;

create trigger trg_distributions_ref_no before insert on public.distributions
  for each row execute function public.assign_ref_no();

-- ------------------------------------------------------------- period locks
create or replace function public.assert_period_open(p_when timestamptz)
returns void language plpgsql stable security definer
set search_path = '' as $$
declare p text := to_char(p_when at time zone 'Asia/Jakarta', 'YYYY-MM');
begin
  if public.is_super_admin() then return; end if;
  if exists (select 1 from public.period_locks where period = p) then
    raise exception 'Periode % sudah dikunci', p using errcode = 'check_violation';
  end if;
end $$;

create or replace function public.guard_period_lock()
returns trigger language plpgsql
set search_path = '' as $$
declare col text := tg_argv[0];
begin
  perform public.assert_period_open((to_jsonb(new) ->> col)::timestamptz);
  if tg_op = 'UPDATE' then
    perform public.assert_period_open((to_jsonb(old) ->> col)::timestamptz);
  end if;
  return new;
end $$;

create trigger trg_donations_period before insert or update on public.donations
  for each row execute function public.guard_period_lock('donated_at');
create trigger trg_distributions_period before insert or update on public.distributions
  for each row execute function public.guard_period_lock('distributed_at');

-- ----------------------------------------------------- fund-type invariants
create or replace function public.guard_donation_fund_rules()
returns trigger language plpgsql
set search_path = '' as $$
declare ft public.fund_types%rowtype;
begin
  select * into ft from public.fund_types where id = new.fund_type_id;
  if ft.requires_program and new.program_id is null then
    raise exception 'Dana % memerlukan program tertentu', ft.name
      using errcode = 'check_violation';
  end if;
  if not ft.is_active then
    raise exception 'Jenis dana % tidak aktif', ft.name using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_donations_fund_rules before insert or update on public.donations
  for each row execute function public.guard_donation_fund_rules();

-- Zakat may only reach the 8 asnaf, and only asnaf allowed for that fund type.
-- Wakaf principal is never a distribution source.
create or replace function public.guard_distribution_fund_rules()
returns trigger language plpgsql
set search_path = '' as $$
declare
  ft public.fund_types%rowtype;
  b  public.beneficiaries%rowtype;
begin
  select * into ft from public.fund_types where id = new.fund_type_id;

  if ft.preserve_principal then
    raise exception 'Pokok % tidak boleh disalurkan; hanya hasil pengelolaannya', ft.name
      using errcode = 'check_violation';
  end if;

  if ft.is_zakat then
    if new.beneficiary_id is null then
      raise exception 'Penyaluran zakat harus menunjuk mustahik dengan asnaf yang jelas'
        using errcode = 'check_violation';
    end if;
    select * into b from public.beneficiaries where id = new.beneficiary_id;
    if b.verification_status <> 'verified' then
      raise exception 'Mustahik % belum terverifikasi', b.full_name
        using errcode = 'check_violation';
    end if;
    if array_length(ft.allowed_asnaf, 1) is not null
       and not (b.asnaf = any (ft.allowed_asnaf)) then
      raise exception 'Asnaf % tidak berhak menerima %', b.asnaf, ft.name
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger trg_distributions_fund_rules before insert or update on public.distributions
  for each row execute function public.guard_distribution_fund_rules();
