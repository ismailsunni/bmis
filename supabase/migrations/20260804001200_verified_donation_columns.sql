-- BMIS 012 — what may still be corrected once a donation leaves the queue.
--
-- donations_update_finance carries no status clause, so a bendahara can update a
-- verified row through PostgREST: amount, fund type, donor, date. That row is
-- already in fund_balance(), in the refreshed matviews, in a closed period's
-- report and on a receipt the donor is holding, so silently moving it desyncs
-- every one of those from the money in the bank.
--
-- Voiding and re-entering is the honest correction for those fields, and the UI
-- offers nothing else. But a mistyped bank reference or a missing photo does not
-- touch a single figure, and forcing a void there destroys a correct donation to
-- fix a comment — worse for the audit trail than the edit it replaces.
--
-- So the split is per column, not per role: annotations stay open, anything a
-- balance or a receipt depends on freezes. On the table, because a rule that
-- only an RPC or a React component enforces is not enforced.

create or replace function public.guard_donation_immutable_after_queue()
returns trigger language plpgsql
set search_path = '' as $$
declare
  -- Annotations, plus the columns the state-transition RPCs must still write:
  -- voiding a verified donation is how a real correction is made, so the guard
  -- cannot stand in its way.
  v_editable text[] := array[
    'notes', 'payment_ref', 'proof_url', 'updated_at',
    'status', 'verified_by', 'verified_at', 'reject_reason',
    'void_reason', 'voided_by', 'voided_at', 'sod_override_reason'
  ];
  v_frozen text;
begin
  -- Still in the queue: donations_update_own and the UI both allow a full edit.
  if old.status in ('draft', 'pending') then
    return new;
  end if;

  select string_agg(o.key, ', ' order by o.key) into v_frozen
  from jsonb_each_text(to_jsonb(old)) o
  where not (o.key = any(v_editable))
    and o.value is distinct from (to_jsonb(new) ->> o.key);

  if v_frozen is not null then
    raise exception
      'Donasi % berstatus % — kolom % tidak dapat diubah lagi. Batalkan donasi lalu catat ulang.',
      old.receipt_no, old.status, v_frozen
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

comment on function public.guard_donation_immutable_after_queue() is
  'Freezes the balance- and receipt-bearing columns of a donation once it is no '
  'longer draft or pending. Notes, payment reference and proof stay editable; '
  'corrections to anything else go through void and re-entry.';

create trigger trg_donations_immutable_after_queue
  before update on public.donations
  for each row execute function public.guard_donation_immutable_after_queue();
