-- BMIS 008 — donor-facing transfer codes.
--
-- BMM publishes a 3-digit code per programme and asks donors to append it to
-- the transfer amount: "Rp100.153" means Rp 100.000 intended for code 153. The
-- code is therefore the only attribution signal on a bank mutation, so it has
-- to be queryable, unique, and resolvable to a fund type.
--
-- Some codes name a fund type directly (101 Zakat Maal, 112 Fidyah) and the
-- rest name a programme, so the column lives on both tables and
-- donation_codes_v is the single lookup the app uses.

alter table public.fund_types add column transfer_code text;
alter table public.programs   add column code text;

-- Codes are three digits in the published table; 200 and 210 show the range is
-- not fixed at 1xx, so only the shape is constrained.
alter table public.fund_types
  add constraint fund_types_transfer_code_format check (transfer_code ~ '^\d{3}$');
alter table public.programs
  add constraint programs_code_format check (code ~ '^\d{3}$');

-- A code must resolve to exactly one destination, across both tables. Partial
-- unique indexes cover each table; the cross-table half is enforced by the
-- trigger below, since a constraint cannot span two tables.
create unique index fund_types_transfer_code_uniq
  on public.fund_types (transfer_code) where transfer_code is not null;
create unique index programs_code_uniq
  on public.programs (code) where code is not null;

create or replace function public.guard_transfer_code_unique()
returns trigger language plpgsql
set search_path = '' as $$
declare
  v_code text := coalesce(
    (to_jsonb(new) ->> 'transfer_code'), (to_jsonb(new) ->> 'code'));
begin
  if v_code is null then return new; end if;

  if tg_table_name = 'programs' then
    if exists (select 1 from public.fund_types where transfer_code = v_code) then
      raise exception 'Kode % sudah dipakai oleh jenis dana', v_code
        using errcode = 'unique_violation';
    end if;
  else
    if exists (select 1 from public.programs where code = v_code) then
      raise exception 'Kode % sudah dipakai oleh program', v_code
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $$;

create trigger trg_programs_code_unique before insert or update on public.programs
  for each row execute function public.guard_transfer_code_unique();
create trigger trg_fund_types_code_unique before insert or update on public.fund_types
  for each row execute function public.guard_transfer_code_unique();

-- The lookup the client uses to turn a code into a destination. Invoker-rights
-- is correct here: both base tables are readable by every authenticated role,
-- including viewer, and the view exposes no donor data.
create view public.donation_codes_v with (security_invoker = true) as
  select ft.transfer_code                as code,
         ft.name                         as name,
         'fund_type'::text               as kind,
         ft.id                           as fund_type_id,
         null::uuid                      as program_id
  from public.fund_types ft
  where ft.transfer_code is not null and ft.is_active
  union all
  select p.code,
         p.name,
         'program'::text,
         p.fund_type_id,
         p.id
  from public.programs p
  where p.code is not null and p.status = 'active';

grant select on public.donation_codes_v to authenticated;

-- The published codes themselves live in seed.sql alongside the fund types and
-- programmes they name. Setting them here would be a no-op: this migration runs
-- before the seed, so there would be no rows to update.
