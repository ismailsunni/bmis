-- BMIS RLS test suite — release blocker (PRD 7.3).
-- For each of the five roles this asserts both what is allowed and, more
-- importantly, what is denied. Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select plan(117);

-- ------------------------------------------------------------------ fixtures
create schema if not exists tests;
-- assertions run while impersonating anon/authenticated, so the helpers below
-- have to be reachable from those roles
grant usage on schema tests to public;

create or replace function tests.login(p_uid uuid, p_role text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_uid, 'role', 'authenticated',
    'app_metadata', json_build_object('user_role', p_role))::text, true);
  execute 'set local role authenticated';
end $$;

create or replace function tests.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  -- an empty claim *set*, not an empty string: '' is not valid JSON, and
  -- auth.uid() casts this GUC, so '' would make the cast itself throw
  perform set_config('request.jwt.claims', '{}', true);
end $$;

create or replace function tests.mkuser(p_email text, p_role public.user_role)
returns uuid language plpgsql as $$
declare uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  values (uid, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', p_email, now(), now());
  -- profiles are created inactive by the signup trigger; admitting them is
  -- what an invitation does, so the fixture does it explicitly
  update public.profiles
     set role = p_role, full_name = p_email, is_active = true
   where id = uid;
  return uid;
end $$;

-- roles under test
create temp table who (label text primary key, id uuid);
insert into who values
  ('super', tests.mkuser('super@bmis.test', 'super_admin')),
  ('fin',   tests.mkuser('finance@bmis.test', 'finance')),
  ('amil1', tests.mkuser('amil1@bmis.test', 'amil')),
  ('amil2', tests.mkuser('amil2@bmis.test', 'amil')),
  ('audit', tests.mkuser('auditor@bmis.test', 'auditor')),
  ('view',  tests.mkuser('viewer@bmis.test', 'viewer'));

create or replace function tests.uid(p text) returns uuid language sql stable as
  $$ select id from who where label = p $$;

create temp table ref (k text primary key, v uuid);
insert into ref
  select 'zakat', id from public.fund_types where code = 'zakat_maal';
insert into ref
  select 'wakaf', id from public.fund_types where code = 'wakaf_uang';
insert into ref
  select 'terikat', id from public.fund_types where code = 'infaq_terikat';
insert into ref
  select 'sedekah', id from public.fund_types where code = 'sedekah';
insert into ref values ('acct', gen_random_uuid());
insert into public.accounts (id, name, type) select v, 'Kas Uji', 'cash' from ref where k = 'acct';

create or replace function tests.ref(p text) returns uuid language sql stable as
  $$ select v from ref where k = p $$;
grant select on who, ref to public;

-- a donor and a verified donation created by amil1, verified by finance
insert into public.donors (id, full_name, nik, phone, created_by)
values ('11111111-1111-1111-1111-111111111111', 'Donatur Uji', '3201234567890001',
        '081200000001', tests.uid('amil1'));

insert into public.donations (id, donor_id, fund_type_id, account_id, amount,
                              payment_method, status, created_by, verified_by, verified_at)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111',
        tests.ref('zakat'), tests.ref('acct'), 1000000, 'cash', 'verified',
        tests.uid('amil1'), tests.uid('fin'), now());

insert into public.beneficiaries (id, full_name, asnaf, verification_status, created_by)
values ('33333333-3333-3333-3333-333333333333', 'Mustahik Uji', 'fakir', 'verified',
        tests.uid('amil1'));

-- ============================================================ 1. RLS coverage
select ok(
  (select bool_and(rowsecurity) from pg_tables
   where schemaname = 'public'
     and tablename in ('profiles','donors','donations','beneficiaries','distributions',
                       'programs','accounts','fund_types','asnaf_categories','settings',
                       'period_locks','audit_log','branches','doc_counters')),
  'RLS is enabled on every application table');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'donations' and cmd = 'DELETE'),
  0, 'no role may DELETE a donation — voiding is the only reversal');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'audit_log'
     and cmd in ('INSERT','UPDATE','DELETE','ALL')),
  0, 'audit_log is append-only: no write policy exists for any role');

-- =============================================================== 2. anon role
-- The anon key is public by definition, so the unauthenticated role must reach
-- nothing at all — not an empty result set, an outright denial.
set local role anon;
select throws_ok($$ select 1 from public.donations $$, null, null,
  'anon cannot read donations');
select throws_ok($$ select 1 from public.donors $$, null, null,
  'anon cannot read donors');
select throws_ok($$ select 1 from public.profiles $$, null, null,
  'anon cannot read profiles');
select throws_ok(
  $$ insert into public.donors (full_name) values ('anon') $$,
  null, null, 'anon cannot insert a donor');
reset role;

-- ================================================================= 3. viewer
select tests.login(tests.uid('view'), 'viewer');

select is_empty($$ select 1 from public.donations $$,
  'viewer cannot read the donations base table');
select is_empty($$ select 1 from public.donors $$,
  'viewer cannot read the donors base table');
select is_empty($$ select 1 from public.beneficiaries $$,
  'viewer cannot read beneficiaries');
select isnt_empty($$ select 1 from public.donations_public_v $$,
  'viewer can read the aggregate donations view');
select is(
  (select nik_masked from public.donors_masked_v
   where id = '11111111-1111-1111-1111-111111111111'),
  null, 'viewer never receives a NIK, not even masked');
select ok(
  (select full_name from public.donors_masked_v
   where id = '11111111-1111-1111-1111-111111111111') not like '%Uji%',
  'viewer sees an abbreviated donor name only');
select throws_ok(
  $$ insert into public.donations (fund_type_id, account_id, amount, payment_method,
       is_anonymous, created_by)
     select tests.ref('zakat'), tests.ref('acct'), 1, 'cash', true, tests.uid('view') $$,
  '42501', null, 'viewer cannot create a donation');
select is_empty($$ select 1 from public.audit_log $$, 'viewer cannot read the audit log');
select isnt_empty($$ select 1 from public.fund_types $$, 'viewer can read master data');
select tests.logout();

-- ================================================================= 4. auditor
select tests.login(tests.uid('audit'), 'auditor');

select isnt_empty($$ select 1 from public.donations $$, 'auditor reads all donations');
select isnt_empty($$ select 1 from public.donors $$,    'auditor reads all donors');
select isnt_empty($$ select 1 from public.audit_log $$, 'auditor reads the audit log');
select throws_ok(
  $$ insert into public.donors (full_name, created_by)
     select 'Baru', tests.uid('audit') $$,
  '42501', null, 'auditor cannot create a donor');
-- With no UPDATE policy the statement is not an error, it simply matches
-- nothing. Asserting the row is unchanged is the assertion that matters.
update public.donations set notes = 'diubah auditor'
  where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select notes from public.donations where id = '22222222-2222-2222-2222-222222222222'),
  null, 'an auditor UPDATE reaches no rows');
select throws_ok(
  $$ select public.rpc_verify_donation('22222222-2222-2222-2222-222222222222') $$,
  null, null, 'auditor cannot verify a donation');
delete from public.audit_log;
select isnt_empty($$ select 1 from public.audit_log $$,
  'an auditor DELETE cannot remove audit rows');
select tests.logout();

-- ==================================================================== 5. amil
select tests.login(tests.uid('amil1'), 'amil');

select isnt_empty($$ select 1 from public.donations
                     where id = '22222222-2222-2222-2222-222222222222' $$,
  'amil reads the donation they created');
select lives_ok(
  $$ insert into public.donations (id, fund_type_id, account_id, amount, payment_method,
       is_anonymous, status, created_by)
     select '44444444-4444-4444-4444-444444444444', tests.ref('sedekah'),
            tests.ref('acct'), 250000, 'cash', true, 'pending', tests.uid('amil1') $$,
  'amil can record a pending donation');
select isnt(
  (select receipt_no from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  null, 'receipt number is allocated automatically');
select matches(
  (select receipt_no from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  '^KW/\d{4}/\d{2}/\d{4}$', 'receipt number follows KW/YYYY/MM/NNNN');
select throws_ok(
  $$ insert into public.donations (fund_type_id, account_id, amount, payment_method,
       is_anonymous, status, created_by)
     select tests.ref('sedekah'), tests.ref('acct'), 1, 'cash', true, 'verified',
            tests.uid('amil1') $$,
  null, null, 'amil cannot insert a donation already marked verified');
select throws_ok(
  $$ insert into public.donations (fund_type_id, account_id, amount, payment_method,
       is_anonymous, status, created_by)
     select tests.ref('sedekah'), tests.ref('acct'), 1, 'cash', true, 'pending',
            tests.uid('amil2') $$,
  '42501', null, 'amil cannot attribute an entry to another user');
-- correcting a mis-keyed amount before verification is the point of
-- donations_update_own; the UI's pencil is built on this policy
update public.donations set amount = 275000, notes = 'nominal dikoreksi'
  where id = '44444444-4444-4444-4444-444444444444';
select is(
  (select amount from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  275000::numeric, 'amil can correct their own donation while it is pending');
select throws_ok(
  $$ update public.donations set created_by = tests.uid('amil2')
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '42501', null, 'amil cannot hand their own entry to someone else');
update public.donations set amount = 99
  where id = '22222222-2222-2222-2222-222222222222';
select is(
  (select amount from public.donations where id = '22222222-2222-2222-2222-222222222222'),
  1000000::numeric, 'amil cannot edit a donation once it is verified');
select throws_ok(
  $$ select public.rpc_verify_donation('44444444-4444-4444-4444-444444444444') $$,
  null, null, 'amil cannot verify anything');
select is_empty($$ select 1 from public.audit_log $$, 'amil cannot read the audit log');
select throws_ok(
  $$ update public.profiles set role = 'super_admin' where id = tests.uid('amil1') $$,
  null, null, 'amil cannot escalate their own role');
select is_empty(
  $$ select 1 from public.profiles where id = tests.uid('fin') $$,
  'amil cannot read other user profiles');
select tests.logout();

-- amil2 must not see amil1's entries
select tests.login(tests.uid('amil2'), 'amil');
select is_empty($$ select 1 from public.donations
                   where id = '22222222-2222-2222-2222-222222222222' $$,
  'amil sees only their own donations');
-- silently matches no rows: donations_update_own is scoped to created_by. The
-- assertion is made below as finance, since amil2 cannot read the row either and
-- would only be comparing one null to another.
update public.donations set amount = 1
  where id = '44444444-4444-4444-4444-444444444444';
select tests.logout();

-- ================================================================= 6. finance
select tests.login(tests.uid('fin'), 'finance');

select isnt_empty($$ select 1 from public.donations $$, 'finance reads all donations');
select is(
  (select amount from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  275000::numeric, 'amil cannot edit another amil''s pending donation');
update public.donations set notes = 'dikoreksi bendahara'
  where id = '44444444-4444-4444-4444-444444444444';
select is(
  (select notes from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  'dikoreksi bendahara', 'finance can correct a pending donation entered by an amil');
select lives_ok(
  $$ select public.rpc_verify_donation('44444444-4444-4444-4444-444444444444') $$,
  'finance can verify a donation created by an amil');
select is(
  (select status::text from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  'verified', 'verification sets the status');
select is(
  (select verified_by from public.donations where id = '44444444-4444-4444-4444-444444444444'),
  tests.uid('fin'), 'verification records the verifier');
-- once verified the figures are in fund_balance() and on an issued receipt, so
-- guard_donation_immutable_after_queue() freezes them for every role. The
-- annotations stay open: forcing a void to fix a bank reference would destroy a
-- correct donation to correct a comment.
select throws_ok(
  $$ update public.donations set amount = 1
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, 'finance cannot change the amount of a verified donation');
select throws_ok(
  $$ update public.donations set fund_type_id = tests.ref('zakat')
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, 'finance cannot move a verified donation to another fund');
select throws_ok(
  $$ update public.donations set donated_at = now() - interval '90 days'
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, 'finance cannot backdate a verified donation into another period');
select lives_ok(
  $$ update public.donations set payment_ref = 'TRX-99', notes = 'referensi dilengkapi'
     where id = '44444444-4444-4444-4444-444444444444' $$,
  'finance can still annotate a verified donation');
select is(
  (select payment_ref from public.donations
   where id = '44444444-4444-4444-4444-444444444444'),
  'TRX-99', 'the annotation is stored');
delete from public.donations where id = '44444444-4444-4444-4444-444444444444';
select isnt_empty(
  $$ select 1 from public.donations where id = '44444444-4444-4444-4444-444444444444' $$,
  'finance cannot delete a donation');
select lives_ok(
  $$ select public.rpc_void_donation('44444444-4444-4444-4444-444444444444', 'salah input') $$,
  'finance can void a verified donation');
select is(
  (select reason from public.audit_log
   -- ordered by id, not created_at: every row in one transaction shares the
   -- same now()
   where record_id = '44444444-4444-4444-4444-444444444444'
   order by id desc limit 1),
  'salah input', 'the void reason reaches the audit log');
select throws_ok(
  $$ select public.rpc_void_donation('22222222-2222-2222-2222-222222222222', '') $$,
  null, null, 'voiding without a reason is refused');
select throws_ok(
  $$ update public.profiles set role = 'super_admin' where id = tests.uid('fin') $$,
  null, null, 'finance cannot change roles');
select tests.logout();

-- separation of duties: the creator may not verify their own entry
select tests.login(tests.uid('fin'), 'finance');
insert into public.donations (id, fund_type_id, account_id, amount, payment_method,
                              is_anonymous, status, created_by)
select '55555555-5555-5555-5555-555555555555', tests.ref('sedekah'), tests.ref('acct'),
       500000, 'cash', true, 'pending', tests.uid('fin');
select throws_ok(
  $$ select public.rpc_verify_donation('55555555-5555-5555-5555-555555555555') $$,
  '42501', null, 'finance cannot silently verify a donation they created themselves');
select throws_ok(
  $$ update public.donations
       set status = 'verified', verified_by = tests.uid('fin'), verified_at = now()
     where id = '55555555-5555-5555-5555-555555555555' $$,
  '23514', null, 'the separation-of-duties rule is a table constraint, not just UI');

-- ketua and bendahara may both override, but only by saying why
select lives_ok(
  $$ select public.rpc_verify_donation('55555555-5555-5555-5555-555555555555',
       'bendahara menerima tunai langsung di kegiatan') $$,
  'finance may override separation of duties with a stated reason');
select is(
  (select sod_override_reason from public.donations
   where id = '55555555-5555-5555-5555-555555555555'),
  'bendahara menerima tunai langsung di kegiatan',
  'the reason is stored on the donation, not only in the log');

-- a reason attached to a normal approval would disarm the constraint later
select throws_ok(
  $$ update public.donations set sod_override_reason = 'alasan yang panjang cukup'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  '23514', null, 'an override reason is refused unless approver and creator match');
select tests.logout();

-- super_admin may override the rule, but only by recording why
select tests.login(tests.uid('super'), 'super_admin');
insert into public.donations (id, fund_type_id, account_id, amount, payment_method,
                              is_anonymous, status, created_by)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', tests.ref('sedekah'), tests.ref('acct'),
       750000, 'cash', true, 'pending', tests.uid('super');
select throws_ok(
  $$ select public.rpc_verify_donation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') $$,
  null, null, 'even super_admin cannot self-verify without stating a reason');
select lives_ok(
  $$ select public.rpc_verify_donation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                                       'entri langsung oleh ketua saat kegiatan') $$,
  'super_admin may override separation of duties with a stated reason');
select is(
  (select sod_override_reason from public.donations
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'entri langsung oleh ketua saat kegiatan',
  'the override reason is stored on the donation itself');
-- separation of duties has an escape hatch for a ketua; a verified figure has
-- none. It is in the balances and on a receipt already given to the donor.
select throws_ok(
  $$ update public.donations set amount = 1
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  '23514', null, 'not even super_admin can change a verified amount');
select lives_ok(
  $$ update public.donations set notes = 'catatan ditambah ketua'
     where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'super_admin can annotate a verified donation');
select tests.logout();

-- ============================================== 7. sharia / fund-type guards
select tests.login(tests.uid('amil1'), 'amil');

select throws_ok(
  $$ insert into public.distributions (fund_type_id, account_id, amount, beneficiary_id,
       requested_by, created_by)
     select tests.ref('wakaf'), tests.ref('acct'), 1000,
            '33333333-3333-3333-3333-333333333333', tests.uid('amil1'), tests.uid('amil1') $$,
  '23514', null, 'wakaf principal can never be a distribution source');

select throws_ok(
  $$ insert into public.donations (fund_type_id, account_id, amount, payment_method,
       is_anonymous, status, created_by)
     select tests.ref('terikat'), tests.ref('acct'), 1000, 'cash', true, 'pending',
            tests.uid('amil1') $$,
  '23514', null, 'infaq terikat requires a program');

-- zakat may not reach a non-asnaf recipient of that fund type
insert into public.beneficiaries (id, full_name, asnaf, verification_status, created_by)
values ('66666666-6666-6666-6666-666666666666', 'Musafir Uji', 'ibnu_sabil', 'verified',
        tests.uid('amil1'));
select throws_ok(
  $$ insert into public.distributions (fund_type_id, account_id, amount, beneficiary_id,
       requested_by, created_by)
     select (select id from public.fund_types where code = 'zakat_fitrah'),
            tests.ref('acct'), 1000, '66666666-6666-6666-6666-666666666666',
            tests.uid('amil1'), tests.uid('amil1') $$,
  '23514', null, 'zakat fitrah cannot be given outside its permitted asnaf');

-- unverified mustahik cannot receive zakat
insert into public.beneficiaries (id, full_name, asnaf, verification_status, created_by)
values ('77777777-7777-7777-7777-777777777777', 'Belum Survei', 'fakir', 'unverified',
        tests.uid('amil1'));
select throws_ok(
  $$ insert into public.distributions (fund_type_id, account_id, amount, beneficiary_id,
       requested_by, created_by)
     select tests.ref('zakat'), tests.ref('acct'), 1000,
            '77777777-7777-7777-7777-777777777777', tests.uid('amil1'), tests.uid('amil1') $$,
  '23514', null, 'an unverified mustahik cannot receive zakat');

select lives_ok(
  $$ insert into public.distributions (id, fund_type_id, account_id, amount, beneficiary_id,
       requested_by, created_by)
     select '88888888-8888-8888-8888-888888888888', tests.ref('zakat'), tests.ref('acct'),
            400000, '33333333-3333-3333-3333-333333333333',
            tests.uid('amil1'), tests.uid('amil1') $$,
  'amil can request a valid zakat distribution');
select tests.logout();

-- ============================================================ 8. balance guard
select tests.login(tests.uid('fin'), 'finance');
select is(public.fund_balance(tests.ref('zakat')), 1000000::numeric,
  'fund balance counts only verified donations');
select lives_ok(
  $$ select public.rpc_approve_distribution('88888888-8888-8888-8888-888888888888') $$,
  'finance approves a distribution within the available balance');
select is(public.fund_balance(tests.ref('zakat')), 600000::numeric,
  'an approved distribution is committed against the balance immediately');

select tests.logout();

-- requested by an amil so that the approval is blocked by the balance, not by
-- the separation-of-duties rule
select tests.login(tests.uid('amil1'), 'amil');
insert into public.distributions (id, fund_type_id, account_id, amount, beneficiary_id,
                                  requested_by, created_by)
select '99999999-9999-9999-9999-999999999999', tests.ref('zakat'), tests.ref('acct'),
       5000000, '33333333-3333-3333-3333-333333333333', tests.uid('amil1'), tests.uid('amil1');
select tests.logout();

select tests.login(tests.uid('fin'), 'finance');
select throws_ok(
  $$ select public.rpc_approve_distribution('99999999-9999-9999-9999-999999999999') $$,
  '23514', null, 'a distribution exceeding the fund balance is blocked');
select tests.logout();

-- ============================================ 9b. editing a donor
-- The donor editor is built directly on this policy, so it is worth pinning.
select tests.login(tests.uid('amil1'), 'amil');
update public.donors set city = 'Yogyakarta'
 where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select city from public.donors where id = '11111111-1111-1111-1111-111111111111'),
  'Yogyakarta', 'an amil can edit a donor they created');
select tests.logout();

select tests.login(tests.uid('amil2'), 'amil');
update public.donors set city = 'Diubah amil lain'
 where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select city from public.donors where id = '11111111-1111-1111-1111-111111111111'),
  'Yogyakarta', 'an amil cannot edit a donor somebody else created');
select tests.logout();

select tests.login(tests.uid('fin'), 'finance');
update public.donors set city = 'Sleman'
 where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select city from public.donors where id = '11111111-1111-1111-1111-111111111111'),
  'Sleman', 'finance can edit any donor');
select tests.logout();

select tests.login(tests.uid('audit'), 'auditor');
update public.donors set city = 'Diubah auditor'
 where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select city from public.donors where id = '11111111-1111-1111-1111-111111111111'),
  'Sleman', 'an auditor cannot edit a donor');
select tests.logout();

-- ============================== 10b. authority to override separation of duties
-- The rule used to live only in the RPCs, so a finance user could bypass them
-- with a direct update and self-verify. It is now enforced on the table, which
-- is what makes the role list below actually mean something.
select tests.login(tests.uid('amil1'), 'amil');
insert into public.donations (id, fund_type_id, account_id, amount, payment_method,
                              is_anonymous, status, created_by)
select 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', tests.ref('sedekah'), tests.ref('acct'),
       125000, 'cash', true, 'pending', tests.uid('amil1');
-- an amil has no update path to verified_by at all, with or without a reason
select throws_ok(
  $$ update public.donations
       set status = 'verified', verified_by = tests.uid('amil1'), verified_at = now(),
           sod_override_reason = 'saya sendiri saja yang bertugas hari ini'
     where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' $$,
  null, null, 'an amil cannot override separation of duties');
select tests.logout();

select tests.login(tests.uid('audit'), 'auditor');
update public.donations
   set sod_override_reason = 'auditor mencoba menerobos aturan ini'
 where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
select is(
  (select sod_override_reason from public.donations
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null, 'an auditor cannot record an override reason');
select tests.logout();

select tests.login(tests.uid('fin'), 'finance');
-- verifying somebody else's entry is the normal path: no reason, and none stored
select lives_ok(
  $$ select public.rpc_verify_donation('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') $$,
  'verifying another user entry needs no reason at all');
select is(
  (select sod_override_reason from public.donations
   where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  null, 'a normal verification records no override reason');

-- the reason requirements apply only where the override actually applies
insert into public.donations (id, fund_type_id, account_id, amount, payment_method,
                              is_anonymous, status, created_by)
select 'cccccccc-cccc-cccc-cccc-cccccccccccc', tests.ref('sedekah'), tests.ref('acct'),
       90000, 'cash', true, 'pending', tests.uid('fin');
select throws_ok(
  $$ select public.rpc_verify_donation('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ya') $$,
  '23514', null, 'a one-word override reason is refused as worthless for an audit trail');
select lives_ok(
  $$ select public.rpc_verify_donation('cccccccc-cccc-cccc-cccc-cccccccccccc',
       'bendahara bertugas sendiri pada kegiatan Jumat') $$,
  'bendahara may override with a reason that actually explains it');
select tests.logout();

-- ============================================================ 9. period locks
select tests.login(tests.uid('fin'), 'finance');
select lives_ok(
  $$ select public.rpc_lock_period(to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM'),
                                   'tutup buku uji') $$,
  'finance can lock a period');
select throws_ok(
  $$ insert into public.donations (fund_type_id, account_id, amount, payment_method,
       is_anonymous, status, created_by)
     select tests.ref('sedekah'), tests.ref('acct'), 100, 'cash', true, 'pending',
            tests.uid('fin') $$,
  '23514', null, 'no entries may be posted into a locked period');
select tests.logout();

select tests.login(tests.uid('super'), 'super_admin');
select lives_ok(
  $$ insert into public.donations (fund_type_id, account_id, amount, payment_method,
       is_anonymous, status, created_by)
     select tests.ref('sedekah'), tests.ref('acct'), 100, 'cash', true, 'pending',
            tests.uid('super') $$,
  'super_admin may still post into a locked period');
select tests.logout();

-- ========================================================== 10. transfer codes
select tests.login(tests.uid('view'), 'viewer');
select isnt_empty($$ select 1 from public.donation_codes_v $$,
  'every role can resolve a published transfer code, viewer included');
select is(
  (select kind from public.donation_codes_v where code = '101'),
  'fund_type', 'a code naming a fund type resolves to that fund type');
select is(
  (select name from public.donation_codes_v where code = '153'),
  'Sedekah Bantu Petani', 'a code naming a programme resolves to that programme');
select is_empty(
  $$ select 1 from public.donation_codes_v group by code having count(*) > 1 $$,
  'no code resolves to two destinations');
select tests.logout();

select tests.login(tests.uid('super'), 'super_admin');
select throws_ok(
  $$ insert into public.programs (name, slug, code)
     values ('Bentrok', 'bentrok', '101') $$,
  '23505', null, 'a programme cannot claim a code already used by a fund type');
select throws_ok(
  $$ insert into public.programs (name, slug, code)
     values ('Salah bentuk', 'salah-bentuk', '15') $$,
  '23514', null, 'a transfer code must be exactly three digits');
select tests.logout();

-- ================================================= 11. membership gate ('none')
-- Google sign-in lets anyone with a Google account reach the auth endpoint, so
-- an account that exists but has not been admitted must reach nothing at all.
select is(public.role_rank('none'), 0, 'an unadmitted account ranks below viewer');
select ok(public.role_rank('viewer') > public.role_rank('none'),
  'viewer still outranks an unadmitted account');

-- the hook is what assigns 'none': an inactive profile gets it, an active one does not
select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', tests.uid('view'), 'claims', '{}'::jsonb))
    -> 'claims' -> 'app_metadata' ->> 'user_role',
  'viewer', 'an admitted account receives its real role in the token');

update public.profiles set is_active = false where id = tests.uid('view');
select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', tests.uid('view'), 'claims', '{}'::jsonb))
    -> 'claims' -> 'app_metadata' ->> 'user_role',
  'none', 'a deactivated account is downgraded to none in the token');
update public.profiles set is_active = true where id = tests.uid('view');

select is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', gen_random_uuid(), 'claims', '{}'::jsonb))
    -> 'claims' -> 'app_metadata' ->> 'user_role',
  'none', 'an auth user with no profile row is none, not viewer');

select tests.login(tests.uid('view'), 'none');
select is_empty($$ select 1 from public.fund_types $$,
  'an unadmitted account cannot read master data');
select is_empty($$ select 1 from public.programs $$,
  'an unadmitted account cannot read programmes');
select is_empty($$ select 1 from public.settings $$,
  'an unadmitted account cannot read organisation settings');
select is_empty($$ select 1 from public.donors_masked_v $$,
  'an unadmitted account cannot read even masked donor names');
select is_empty($$ select 1 from public.donations_public_v $$,
  'an unadmitted account cannot read verified donation amounts');
select is_empty($$ select 1 from public.donation_codes_v $$,
  'an unadmitted account cannot read the transfer codes');
select throws_ok(
  $$ select public.rpc_dashboard_summary(current_date - 30, current_date) $$,
  '42501', null, 'an unadmitted account is refused the dashboard outright');
select is_empty(
  $$ select 1 from public.rpc_fund_balance_report(
       (current_date - 30)::date, current_date::date) $$,
  'an unadmitted account gets no fund balances');
select tests.logout();

-- ====================================================== 12. dashboard & reports
-- These RPCs were shipped untested and a plain ambiguous-column error took the
-- whole dashboard down for every role. Calling them per role is the point:
-- a compile error inside plpgsql only surfaces on execution.
select tests.login(tests.uid('view'), 'viewer');
select lives_ok(
  $$ select public.rpc_dashboard_summary(current_date - 30, current_date) $$,
  'viewer can load the dashboard');
select ok(
  (public.rpc_dashboard_summary(current_date - 30, current_date)) ? 'kpi',
  'the dashboard payload carries its KPI block');
select ok(
  not ((public.rpc_dashboard_summary(current_date - 30, current_date)) ? 'top_donors'),
  'viewer is never given the top-donor list');
select tests.logout();

select tests.login(tests.uid('amil1'), 'amil');
select lives_ok(
  $$ select public.rpc_dashboard_summary(current_date - 30, current_date) $$,
  'amil can load the dashboard');
select ok(
  (public.rpc_dashboard_summary(current_date - 30, current_date)) ? 'mine',
  'amil additionally gets their own collection panel');
select tests.logout();

select tests.login(tests.uid('audit'), 'auditor');
select lives_ok(
  $$ select public.rpc_dashboard_summary(current_date - 30, current_date) $$,
  'auditor can load the dashboard');
select ok(
  (public.rpc_dashboard_summary(current_date - 30, current_date)) ? 'audit_summary',
  'auditor additionally gets the audit activity summary');
select tests.logout();

select tests.login(tests.uid('fin'), 'finance');
select lives_ok(
  $$ select public.rpc_dashboard_summary(current_date - 30, current_date) $$,
  'finance can load the dashboard');
select ok(
  (public.rpc_dashboard_summary(current_date - 30, current_date))
    -> 'kpi' ? 'available_balance',
  'the KPI block reports an available balance');
select isnt_empty(
  $$ select 1 from public.rpc_fund_balance_report(
       (current_date - 30)::date, current_date::date) $$,
  'the fund balance report returns a row per fund type');
select lives_ok(
  $$ select public.rpc_donor_statement('11111111-1111-1111-1111-111111111111') $$,
  'a donor statement can be produced');
select tests.logout();

-- ============================================================= 13. audit trail
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'donations' and record_id = '22222222-2222-2222-2222-222222222222'),
  1, 'every donation mutation is written to the audit log');
select ok(
  (select actor_role is not null from public.audit_log
   where table_name = 'donations' order by created_at desc limit 1),
  'the audit log records the acting role');

select * from finish();
rollback;
