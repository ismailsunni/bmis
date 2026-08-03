-- BMIS 004 — fund balances, balance guard, mutation RPCs

-- Only verified donations count as inflow (PRD 6.3); approved-but-not-yet-
-- disbursed distributions are treated as committed so two approvals cannot
-- both spend the same money.
-- SECURITY DEFINER: an amil only sees their own donations under RLS, so an
-- invoker-rights balance would be wrong exactly where the guard matters.
create or replace function public.fund_balance(p_fund_type_id uuid)
returns numeric language sql stable security definer
set search_path = '' as $$
  select
    coalesce((select sum(amount) from public.donations
              where fund_type_id = p_fund_type_id and status = 'verified'), 0)
  - coalesce((select sum(amount) from public.distributions
              where fund_type_id = p_fund_type_id
                and status in ('approved','disbursed')), 0);
$$;

create or replace function public.amil_share_used(p_fund_type_id uuid)
returns numeric language sql stable security definer
set search_path = '' as $$
  select coalesce(sum(d.amount), 0)
  from public.distributions d
  join public.beneficiaries b on b.id = d.beneficiary_id
  where d.fund_type_id = p_fund_type_id
    and d.status in ('approved','disbursed')
    and b.asnaf = 'amil';
$$;

-- Runs when a distribution becomes approved or disbursed. Guards the fund
-- balance and the sharia cap on the amil share.
create or replace function public.guard_distribution_balance()
returns trigger language plpgsql
set search_path = '' as $$
declare
  ft        public.fund_types%rowtype;
  available numeric;
  collected numeric;
  b_asnaf   public.asnaf;
begin
  if new.status not in ('approved','disbursed') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('approved','disbursed') then return new; end if;

  select * into ft from public.fund_types where id = new.fund_type_id;
  available := public.fund_balance(new.fund_type_id);

  if new.amount > available then
    raise exception 'Saldo % tidak mencukupi: tersedia %, diminta %',
      ft.name, available, new.amount using errcode = 'check_violation';
  end if;

  if ft.amil_share_max > 0 and new.beneficiary_id is not null then
    select asnaf into b_asnaf from public.beneficiaries where id = new.beneficiary_id;
    if b_asnaf = 'amil' then
      select coalesce(sum(amount), 0) into collected from public.donations
        where fund_type_id = new.fund_type_id and status = 'verified';
      if public.amil_share_used(new.fund_type_id) + new.amount
         > collected * ft.amil_share_max then
        raise exception 'Hak amil untuk % melebihi batas %%%',
          ft.name, round(ft.amil_share_max * 100, 2) using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end $$;

create trigger trg_distributions_balance before insert or update on public.distributions
  for each row execute function public.guard_distribution_balance();

-- ------------------------------------------------------------- mutation RPCs
-- These exist so that state transitions carry their side effects (timestamps,
-- actor, audit reason) atomically instead of trusting the client to set them.

create or replace function public.rpc_verify_donation(p_id uuid, p_override_reason text default null)
returns public.donations language plpgsql
set search_path = '' as $$
declare d public.donations%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang memverifikasi donasi' using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.donations where id = p_id;
  if d.id is null then raise exception 'Donasi tidak ditemukan'; end if;
  if d.status not in ('draft','pending') then
    raise exception 'Donasi berstatus % tidak dapat diverifikasi', d.status;
  end if;
  if d.created_by = auth.uid() and not public.is_super_admin() then
    raise exception 'Pemisahan tugas: pembuat entri tidak boleh memverifikasinya sendiri'
      using errcode = 'insufficient_privilege';
  end if;
  if d.created_by = auth.uid() and coalesce(p_override_reason, '') = '' then
    raise exception 'Override pemisahan tugas memerlukan alasan';
  end if;

  perform public.set_audit_reason(p_override_reason);
  update public.donations set
    status = 'verified', verified_by = auth.uid(), verified_at = now(),
    sod_override_reason = nullif(p_override_reason, '')
  where id = p_id returning * into d;
  return d;
end $$;

create or replace function public.rpc_reject_donation(p_id uuid, p_reason text)
returns public.donations language plpgsql
set search_path = '' as $$
declare d public.donations%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_reason, '') = '' then raise exception 'Alasan penolakan wajib diisi'; end if;
  perform public.set_audit_reason(p_reason);
  update public.donations set status = 'rejected', reject_reason = p_reason
    where id = p_id and status in ('draft','pending') returning * into d;
  if d.id is null then raise exception 'Donasi tidak dapat ditolak'; end if;
  return d;
end $$;

-- Donations are never deleted; a verified donation is reversed by voiding it.
create or replace function public.rpc_void_donation(p_id uuid, p_reason text)
returns public.donations language plpgsql
set search_path = '' as $$
declare d public.donations%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_reason, '') = '' then raise exception 'Alasan pembatalan wajib diisi'; end if;
  perform public.set_audit_reason(p_reason);
  update public.donations set status = 'voided', void_reason = p_reason,
                              voided_by = auth.uid(), voided_at = now()
    where id = p_id and status <> 'voided' returning * into d;
  if d.id is null then raise exception 'Donasi tidak dapat dibatalkan'; end if;
  return d;
end $$;

create or replace function public.rpc_approve_distribution(p_id uuid, p_override_reason text default null)
returns public.distributions language plpgsql
set search_path = '' as $$
declare r public.distributions%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang menyetujui penyaluran' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.distributions where id = p_id;
  if r.status <> 'requested' then raise exception 'Status % tidak dapat disetujui', r.status; end if;
  if r.requested_by = auth.uid() and not public.is_super_admin() then
    raise exception 'Pemisahan tugas: pengaju tidak boleh menyetujui pengajuannya sendiri'
      using errcode = 'insufficient_privilege';
  end if;
  if r.requested_by = auth.uid() and coalesce(p_override_reason, '') = '' then
    raise exception 'Override pemisahan tugas memerlukan alasan';
  end if;

  perform public.set_audit_reason(p_override_reason);
  update public.distributions set
    status = 'approved', approved_by = auth.uid(), approved_at = now(),
    sod_override_reason = nullif(p_override_reason, '')
  where id = p_id returning * into r;
  return r;
end $$;

create or replace function public.rpc_disburse_distribution(
  p_id uuid, p_proof_url text default null, p_signature_url text default null)
returns public.distributions language plpgsql
set search_path = '' as $$
declare r public.distributions%rowtype;
begin
  if not public.can_write() then
    raise exception 'Tidak berwenang' using errcode = 'insufficient_privilege';
  end if;
  update public.distributions set
    status = 'disbursed', disbursed_by = auth.uid(), disbursed_at = now(),
    proof_url = coalesce(p_proof_url, proof_url),
    recipient_signature_url = coalesce(p_signature_url, recipient_signature_url)
  where id = p_id and status = 'approved' returning * into r;
  if r.id is null then raise exception 'Penyaluran belum disetujui'; end if;
  return r;
end $$;

create or replace function public.rpc_reject_distribution(p_id uuid, p_reason text)
returns public.distributions language plpgsql
set search_path = '' as $$
declare r public.distributions%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_reason, '') = '' then raise exception 'Alasan penolakan wajib diisi'; end if;
  perform public.set_audit_reason(p_reason);
  update public.distributions set status = 'rejected', reject_reason = p_reason
    where id = p_id and status in ('requested','approved') returning * into r;
  if r.id is null then raise exception 'Penyaluran tidak dapat ditolak'; end if;
  return r;
end $$;

-- Duplicate donors are merged, never deleted: donations move to the survivor
-- and the loser keeps a pointer so old receipt lookups still resolve.
create or replace function public.rpc_merge_donors(p_source uuid, p_target uuid, p_reason text)
returns public.donors language plpgsql
set search_path = '' as $$
declare d public.donors%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang menggabungkan donatur' using errcode = 'insufficient_privilege';
  end if;
  if p_source = p_target then raise exception 'Donatur sumber dan tujuan sama'; end if;
  if coalesce(p_reason, '') = '' then raise exception 'Alasan penggabungan wajib diisi'; end if;

  perform public.set_audit_reason(p_reason);
  update public.donations set donor_id = p_target where donor_id = p_source;
  update public.donors set merged_into_id = p_target, deleted_at = now(), phone = null
    where id = p_source;
  select * into d from public.donors where id = p_target;
  return d;
end $$;

create or replace function public.rpc_lock_period(p_period text, p_note text default null)
returns public.period_locks language plpgsql
set search_path = '' as $$
declare l public.period_locks%rowtype;
begin
  if not public.has_min_role('finance') or public.current_role() = 'auditor' then
    raise exception 'Tidak berwenang mengunci periode' using errcode = 'insufficient_privilege';
  end if;
  insert into public.period_locks (period, locked_by, note)
  values (p_period, auth.uid(), p_note) returning * into l;
  return l;
end $$;
