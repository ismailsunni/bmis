-- BMIS 001 — extensions, enums, role helpers
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

create type public.user_role as enum ('viewer','amil','auditor','finance','super_admin');
create type public.donor_type as enum ('individual','organization','anonymous');
create type public.payment_method as enum ('cash','transfer','qris','ewallet','in_kind');
create type public.donation_status as enum ('draft','pending','verified','rejected','voided');
create type public.asnaf as enum ('fakir','miskin','amil','muallaf','riqab','gharimin','fisabilillah','ibnu_sabil');
create type public.verification_status as enum ('unverified','survey_scheduled','verified','rejected');
create type public.distribution_type as enum ('cash','goods','service','scholarship');
create type public.distribution_status as enum ('requested','approved','disbursed','rejected');
create type public.account_type as enum ('cash','bank','ewallet');
create type public.program_status as enum ('draft','active','completed','cancelled');

-- Role is delivered as a JWT claim by the custom access token hook (see 006).
-- Never resolve it with a per-row subquery on profiles: dashboard policies run
-- over 100k+ rows and a subquery there is a hard performance regression.
create or replace function public.current_role()
returns text language sql stable
set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'user_role', ''),
    'viewer'
  );
$$;

create or replace function public.role_rank(r text)
returns int language sql immutable
set search_path = '' as $$
  select case r
    when 'super_admin' then 5
    when 'finance'     then 4
    when 'auditor'     then 3
    when 'amil'        then 2
    else 1 end;
$$;

create or replace function public.has_min_role(required text)
returns boolean language sql stable
set search_path = '' as $$
  select public.role_rank(public.current_role()) >= public.role_rank(required);
$$;

-- The invite Edge Function acts with the service role, whose JWT carries no
-- user_role claim. Without this it would be treated as a viewer and could not
-- assign roles at all.
create or replace function public.is_service_role()
returns boolean language sql stable
set search_path = '' as $$
  select coalesce(
           nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''),
           '') = 'service_role'
      or current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable
set search_path = '' as $$
  select public.current_role() = 'super_admin';
$$;

-- auditor outranks amil but is strictly read-only, so write policies must not
-- use has_min_role('amil'). This is the write-side predicate.
create or replace function public.can_write()
returns boolean language sql stable
set search_path = '' as $$
  select public.current_role() in ('amil','finance','super_admin');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
