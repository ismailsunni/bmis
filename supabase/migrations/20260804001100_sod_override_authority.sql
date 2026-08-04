-- BMIS 011 — who may override separation of duties, enforced in the database.
--
-- The rule was only ever in the RPCs. The table constraint accepts any row that
-- carries a sod_override_reason without asking who set it, so a finance user
-- could bypass rpc_verify_donation entirely with a direct PostgREST update and
-- self-verify. With a public anon key that is reachable with curl, which makes
-- it a database problem rather than a UI one.
--
-- The override is now deliberately granted to ketua (super_admin) and bendahara
-- (finance), and refused to everyone else — checked on the table, so it holds
-- whether the caller goes through an RPC or straight at the API.

create or replace function public.guard_sod_override()
returns trigger language plpgsql
set search_path = '' as $$
declare
  v_creator  uuid;
  v_approver uuid;
  v_reason   text;
begin
  if tg_table_name = 'donations' then
    v_creator  := new.created_by;
    v_approver := new.verified_by;
  else
    v_creator  := new.requested_by;
    v_approver := new.approved_by;
  end if;
  v_reason := new.sod_override_reason;

  -- Nothing claimed: the table constraint already forbids self-approval.
  if coalesce(btrim(v_reason), '') = '' then
    return new;
  end if;

  -- A reason is only meaningful when this actually is a self-approval. Without
  -- this, a reason could be attached to ordinary rows and quietly disarm the
  -- constraint for a later update.
  if v_approver is null or v_approver is distinct from v_creator then
    raise exception 'Alasan penerobosan hanya berlaku bila penyetuju sama dengan pembuat entri'
      using errcode = 'check_violation';
  end if;

  if not (public.current_role() in ('super_admin', 'finance') or public.is_service_role()) then
    raise exception 'Hanya ketua atau bendahara yang boleh menerobos pemisahan tugas'
      using errcode = 'insufficient_privilege';
  end if;

  -- An audit trail is worth nothing if the reason can be a single character.
  if length(btrim(v_reason)) < 10 then
    raise exception 'Alasan penerobosan terlalu singkat, tuliskan alasan yang jelas'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger trg_donations_sod_override
  before insert or update on public.donations
  for each row execute function public.guard_sod_override();

create trigger trg_distributions_sod_override
  before insert or update on public.distributions
  for each row execute function public.guard_sod_override();

-- The RPCs previously refused a self-verifying bendahara outright. Now that the
-- table decides who may override, they only have to insist on the reason.
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

  if d.created_by = auth.uid() and coalesce(btrim(p_override_reason), '') = '' then
    raise exception 'Pemisahan tugas: pembuat entri tidak boleh memverifikasinya sendiri tanpa alasan tertulis'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.set_audit_reason(p_override_reason);
  update public.donations set
    status = 'verified', verified_by = auth.uid(), verified_at = now(),
    sod_override_reason = case when d.created_by = auth.uid()
                               then nullif(btrim(p_override_reason), '') end
  where id = p_id returning * into d;
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

  if r.requested_by = auth.uid() and coalesce(btrim(p_override_reason), '') = '' then
    raise exception 'Pemisahan tugas: pengaju tidak boleh menyetujui pengajuannya sendiri tanpa alasan tertulis'
      using errcode = 'insufficient_privilege';
  end if;

  perform public.set_audit_reason(p_override_reason);
  update public.distributions set
    status = 'approved', approved_by = auth.uid(), approved_at = now(),
    sod_override_reason = case when r.requested_by = auth.uid()
                               then nullif(btrim(p_override_reason), '') end
  where id = p_id returning * into r;
  return r;
end $$;
