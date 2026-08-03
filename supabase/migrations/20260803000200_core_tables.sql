-- BMIS 002 — core tables

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role public.user_role not null default 'viewer',
  branch_id uuid references public.branches(id),
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fund_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  -- true for zakat_maal / zakat_fitrah / zakat_profesi: distribution is
  -- restricted to the 8 asnaf.
  is_zakat boolean not null default false,
  -- allowed asnaf for this fund type; empty array = unrestricted
  allowed_asnaf public.asnaf[] not null default '{}',
  -- wakaf uang: principal is preserved, only yield may be distributed
  preserve_principal boolean not null default false,
  requires_program boolean not null default false,
  amil_share_max numeric(5,4) not null default 0,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.asnaf_categories (
  code public.asnaf primary key,
  name text not null,
  description text,
  sort_order int not null default 0
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.account_type not null,
  bank_name text,
  account_number text,
  opening_balance numeric(15,2) not null default 0,
  is_active boolean not null default true,
  branch_id uuid references public.branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  fund_type_id uuid references public.fund_types(id),
  target_amount numeric(15,2) not null default 0 check (target_amount >= 0),
  start_date date,
  end_date date,
  status public.program_status not null default 'draft',
  pic_user_id uuid references public.profiles(id),
  branch_id uuid references public.branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.donors (
  id uuid primary key default gen_random_uuid(),
  donor_code text not null unique,
  donor_type public.donor_type not null default 'individual',
  full_name text not null,
  nik text,
  npwp text,
  phone text,
  email text,
  address text,
  city text,
  province text,
  is_recurring boolean not null default false,
  notes text,
  tags text[] not null default '{}',
  branch_id uuid references public.branches(id),
  merged_into_id uuid references public.donors(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create unique index donors_phone_uniq on public.donors (phone)
  where phone is not null and deleted_at is null;
create index donors_name_trgm on public.donors using gin (to_tsvector('simple', full_name));
create index donors_branch on public.donors (branch_id);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  donor_id uuid references public.donors(id),
  is_anonymous boolean not null default false,
  fund_type_id uuid not null references public.fund_types(id),
  program_id uuid references public.programs(id),
  account_id uuid not null references public.accounts(id),
  amount numeric(15,2) not null check (amount > 0),
  payment_method public.payment_method not null,
  payment_ref text,
  in_kind_description text,
  donated_at timestamptz not null default now(),
  status public.donation_status not null default 'draft',
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  reject_reason text,
  void_reason text,
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  proof_url text,
  notes text,
  sod_override_reason text,
  branch_id uuid references public.branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  -- Separation of duties (PRD 4.2): the creator may never be the verifier.
  -- A super_admin override is possible only by recording a reason, which the
  -- audit trigger then captures alongside the row.
  constraint donations_sod check (
    verified_by is null or verified_by <> created_by or sod_override_reason is not null),
  constraint donations_donor_required check (is_anonymous or donor_id is not null),
  constraint donations_verified_fields check (
    status <> 'verified' or (verified_by is not null and verified_at is not null))
);
create unique index donations_payment_ref_uniq on public.donations (payment_ref)
  where payment_ref is not null and status <> 'voided';
create index donations_donated_at on public.donations (donated_at desc);
create index donations_status on public.donations (status);
create index donations_fund_type on public.donations (fund_type_id);
create index donations_donor on public.donations (donor_id);
create index donations_created_by on public.donations (created_by);
-- dashboard and report queries always filter to verified rows by date
create index donations_verified_period on public.donations (donated_at)
  where status = 'verified';

create table public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  beneficiary_code text not null unique,
  full_name text not null,
  nik text,
  asnaf public.asnaf not null,
  phone text,
  address text,
  rt_rw text,
  village text,
  district text,
  city text,
  family_size int check (family_size is null or family_size >= 0),
  monthly_income numeric(15,2) check (monthly_income is null or monthly_income >= 0),
  verification_status public.verification_status not null default 'unverified',
  surveyed_by uuid references public.profiles(id),
  surveyed_at timestamptz,
  survey_notes text,
  documents jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  branch_id uuid references public.branches(id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);
create index beneficiaries_asnaf on public.beneficiaries (asnaf);
create index beneficiaries_status on public.beneficiaries (verification_status);

create table public.distributions (
  id uuid primary key default gen_random_uuid(),
  ref_no text not null unique,
  beneficiary_id uuid references public.beneficiaries(id),
  program_id uuid references public.programs(id),
  fund_type_id uuid not null references public.fund_types(id),
  account_id uuid not null references public.accounts(id),
  amount numeric(15,2) not null check (amount > 0),
  distribution_type public.distribution_type not null default 'cash',
  description text,
  distributed_at timestamptz not null default now(),
  status public.distribution_status not null default 'requested',
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  disbursed_by uuid references public.profiles(id),
  disbursed_at timestamptz,
  reject_reason text,
  proof_url text,
  recipient_signature_url text,
  notes text,
  sod_override_reason text,
  branch_id uuid references public.branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  constraint distributions_sod check (
    approved_by is null or approved_by <> requested_by or sod_override_reason is not null),
  constraint distributions_target check (beneficiary_id is not null or program_id is not null)
);
create index distributions_distributed_at on public.distributions (distributed_at desc);
create index distributions_status on public.distributions (status);
create index distributions_fund_type on public.distributions (fund_type_id);
create index distributions_beneficiary on public.distributions (beneficiary_id);

create table public.settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

create table public.period_locks (
  period text primary key check (period ~ '^\d{4}-\d{2}$'),
  locked_by uuid not null references public.profiles(id),
  locked_at timestamptz not null default now(),
  note text
);

create table public.audit_log (
  id bigserial primary key,
  table_name text not null,
  record_id uuid,
  action text not null,
  actor_id uuid,
  actor_role text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_log_table_record on public.audit_log (table_name, record_id);
create index audit_log_actor on public.audit_log (actor_id);
create index audit_log_created_at on public.audit_log (created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['branches','profiles','fund_types','accounts','programs',
                           'donors','donations','beneficiaries','distributions']
  loop
    execute format(
      'create trigger trg_%1$s_touch before update on public.%1$I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
