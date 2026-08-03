# PRD — Baitul Maal Information & Administration System (BMIS)

| Field            | Value            |
| ---------------- | ---------------- |
| Document version | 0.1 (Draft)      |
| Date             | 2026-08-03       |
| Owner            | Ismail Sunni     |
| Status           | For review       |
| Target release   | MVP in ~10 weeks |

---

## 1. Background & Problem Statement

Most small-to-medium Baitul Maal / LAZ (Lembaga Amil Zakat) units in Indonesia still run on WhatsApp groups, paper receipts, and a shared Google Sheet. This creates four recurring problems:

1. **Traceability.** A donor (_muzakki_) cannot be told where their zakat went, and the _amil_ cannot reconstruct it either.
2. **Fund segregation.** Zakat, infaq, sedekah, and wakaf have different sharia constraints on how they may be spent, but a single spreadsheet column does not enforce that.
3. **Reporting burden.** Monthly recaps for the board, the annual report, and BAZNAS/regulator submissions are rebuilt by hand each period.
4. **Access control.** Everyone with the sheet link can see everything — including donor NIK/phone numbers and beneficiary (_mustahik_) personal data.

BMIS is an internal web application that replaces the spreadsheet: it records collection (_penghimpunan_) and distribution (_penyaluran_), keeps per-fund balances correct, and gives the board a live dashboard — with role-based access enforced at the database layer.

## 2. Goals

| #   | Goal                                     | Success metric (3 months post-launch)                                      |
| --- | ---------------------------------------- | -------------------------------------------------------------------------- |
| G1  | Single source of truth for all donations | 100% of donations recorded in BMIS; spreadsheet retired                    |
| G2  | Correct per-fund balances at all times   | Balance report reconciles with bank statements with 0 unexplained variance |
| G3  | Cut monthly reporting effort             | Board recap produced in < 10 minutes (from ~1 day)                         |
| G4  | Protect personal data                    | No role can read data outside its scope; verified by RLS test suite        |
| G5  | Usable in the field                      | An _amil_ can record a cash donation on a phone in < 45 seconds            |

## 3. Non-Goals (explicitly out of MVP scope)

- Public-facing donation landing page or online payment gateway (Midtrans/Xendit) checkout.
- Donor self-service portal / donor login.
- Full double-entry general ledger or PSAK 109 statutory financial statements. BMIS produces the _source data_ for those, not the statements themselves.
- Mobile native app (the web app is mobile-responsive instead).
- Accounting software integration (Accurate, Zahir).
- Automated bank statement reconciliation via bank API.

## 4. Personas & Permission Levels

Five roles. Every role requires authentication — there is **no anonymous read anywhere**.

| Role          | Indonesian label           | Who         | Core capability                                                                                                                       |
| ------------- | -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `super_admin` | Ketua / Pengurus Inti      | 1–2 people  | Everything, plus user management, role assignment, master data, settings, hard delete                                                 |
| `finance`     | Bendahara                  | 1–3 people  | Verify/void donations, approve distributions, manage cash & bank accounts, close periods, full financial reports                      |
| `amil`        | Petugas / Amil lapangan    | 5–30 people | Create donors, record donations, register beneficiaries, submit distribution requests. Cannot verify their own entries, cannot delete |
| `auditor`     | Dewan Pengawas / Auditor   | 1–3 people  | Read-only across **all** modules including the audit log. Cannot mutate anything                                                      |
| `viewer`      | Relawan / Pengurus program | any         | Read-only on aggregate dashboard + own-program data only. **Cannot see donor or beneficiary PII**                                     |

### 4.1 Permission matrix

Legend: **C**reate · **R**ead · **U**pdate · **D**elete · **A**pprove · — none · `own` = rows they created

| Resource                        | super_admin | finance | amil                     | auditor | viewer             |
| ------------------------------- | ----------- | ------- | ------------------------ | ------- | ------------------ |
| Donors (muzakki)                | CRUD        | CRU     | CR + U`own`              | R       | —                  |
| Donor PII (NIK, phone, address) | R           | R       | R                        | R       | **masked**         |
| Donations                       | CRUD + A    | CRU + A | C + RU`own` (draft only) | R       | R (aggregate only) |
| Donation void / reversal        | ✓           | ✓       | —                        | —       | —                  |
| Beneficiaries (mustahik)        | CRUD        | R       | CR + U`own`              | R       | —                  |
| Distributions                   | CRUD + A    | CRU + A | C + R`own`               | R       | R (own program)    |
| Programs / campaigns            | CRUD        | RU      | R                        | R       | R                  |
| Cash & bank accounts            | CRUD        | CRU     | —                        | R       | —                  |
| Reports & exports               | ✓           | ✓       | limited (own recap)      | ✓       | aggregate only     |
| Users & roles                   | CRUD        | R       | —                        | R       | —                  |
| Master data (fund types, asnaf) | CRUD        | R       | R                        | R       | R                  |
| Audit log                       | R           | R       | —                        | R       | —                  |
| Settings                        | CRUD        | R       | —                        | R       | —                  |

### 4.2 Separation of duties (hard rule)

The user who **created** a donation or distribution must not be the user who **approves** it. Enforced by a database check (`created_by <> verified_by`), not only in the UI. `super_admin` may override, but the override is written to the audit log with a mandatory reason.

## 5. Domain Model

### 5.1 Fund types (`fund_types`)

Fund type drives _what the money may be spent on_. This is the sharia constraint the spreadsheet cannot enforce.

| Code                  | Name                                 | Spendable on                                    | Amil share allowed |
| --------------------- | ------------------------------------ | ----------------------------------------------- | ------------------ |
| `zakat_maal`          | Zakat Maal                           | 8 asnaf only                                    | up to 1/8 (12.5%)  |
| `zakat_fitrah`        | Zakat Fitrah                         | primarily fakir & miskin                        | limited            |
| `zakat_profesi`       | Zakat Penghasilan                    | 8 asnaf only                                    | up to 1/8          |
| `infaq_terikat`       | Infaq Terikat                        | designated program only                         | per akad           |
| `infaq_tidak_terikat` | Infaq Tidak Terikat                  | general benefit                                 | per policy         |
| `sedekah`             | Sedekah                              | general benefit                                 | per policy         |
| `wakaf_uang`          | Wakaf Uang                           | **principal preserved**, only yield distributed | nazhir fee only    |
| `fidyah`              | Fidyah                               | food for the poor                               | —                  |
| `kurban`              | Kurban                               | seasonal, in-kind                               | —                  |
| `dana_sosial`         | Dana Sosial Keagamaan Lainnya (DSKL) | per source terms                                | per policy         |
| `csr`                 | CSR / Corporate                      | per MoU                                         | per MoU            |

System rule: a distribution's `fund_type` must be compatible with the beneficiary's `asnaf` for zakat funds. Wakaf principal can never be selected as a distribution source.

### 5.2 Asnaf (the 8 categories of zakat recipients)

`fakir`, `miskin`, `amil`, `muallaf`, `riqab`, `gharimin`, `fisabilillah`, `ibnu_sabil`.

### 5.3 Core entities

```
profiles ──< donations >── donors
    │            │
    │            ├── fund_types
    │            ├── programs
    │            └── accounts (kas/bank)
    │
    └──< distributions >── beneficiaries ── asnaf
                 │
                 ├── fund_types
                 ├── programs
                 └── accounts
```

## 6. Database Schema (Supabase / Postgres)

All tables live in `public`, have `id uuid default gen_random_uuid()`, `created_at`, `updated_at`, `created_by uuid references profiles(id)`, and **RLS enabled**.

### 6.1 `profiles`

Mirrors `auth.users`, created by trigger on signup.

| Column      | Type             | Notes                                   |
| ----------- | ---------------- | --------------------------------------- |
| `id`        | uuid PK          | = `auth.users.id`                       |
| `full_name` | text             |                                         |
| `email`     | text             |                                         |
| `phone`     | text             |                                         |
| `role`      | `user_role` enum | default `viewer`                        |
| `branch_id` | uuid null        | optional multi-cabang support           |
| `is_active` | boolean          | soft disable without deleting auth user |

### 6.2 `donors` (muzakki / donatur)

| Column                        | Type        | Notes                                         |
| ----------------------------- | ----------- | --------------------------------------------- |
| `donor_code`                  | text unique | auto `DNR-000123`                             |
| `donor_type`                  | enum        | `individual` \| `organization` \| `anonymous` |
| `full_name`                   | text        | for anonymous → "Hamba Allah"                 |
| `nik`                         | text null   | encrypted-at-rest, masked for `viewer`        |
| `npwp`                        | text null   | needed for zakat tax-deduction letter (BSZ)   |
| `phone`, `email`              | text null   |                                               |
| `address`, `city`, `province` | text null   |                                               |
| `is_recurring`                | boolean     | donatur tetap                                 |
| `notes`                       | text        |                                               |
| `tags`                        | text[]      | e.g. `{alumni, karyawan_pt_x}`                |

Constraint: unique on `phone` where not null, to reduce duplicates. Soft delete via `deleted_at`.

### 6.3 `donations`

| Column                        | Type               | Notes                                                        |
| ----------------------------- | ------------------ | ------------------------------------------------------------ |
| `receipt_no`                  | text unique        | auto, format `KW/2026/08/0001`                               |
| `donor_id`                    | uuid null          | null only when `is_anonymous`                                |
| `fund_type_id`                | uuid               | required                                                     |
| `program_id`                  | uuid null          | required if fund type is `infaq_terikat`                     |
| `account_id`                  | uuid               | which cash/bank account received it                          |
| `amount`                      | numeric(15,2)      | `> 0`                                                        |
| `payment_method`              | enum               | `cash` \| `transfer` \| `qris` \| `ewallet` \| `in_kind`     |
| `payment_ref`                 | text null          | bank ref / QRIS trx id                                       |
| `in_kind_description`         | text null          | for goods donations                                          |
| `donated_at`                  | timestamptz        | actual date, may differ from entry date                      |
| `status`                      | enum               | `draft` \| `pending` \| `verified` \| `rejected` \| `voided` |
| `verified_by` / `verified_at` | uuid / timestamptz |                                                              |
| `void_reason`                 | text null          |                                                              |
| `proof_url`                   | text null          | Supabase Storage path                                        |
| `notes`                       | text               |                                                              |

Only `status = 'verified'` rows count toward balances and dashboard figures.

### 6.4 `beneficiaries` (mustahik)

`beneficiary_code`, `full_name`, `nik`, `asnaf` (enum), `phone`, `address`, `rt_rw`, `village`, `district`, `family_size`, `monthly_income`, `verification_status` (`unverified`/`survey_scheduled`/`verified`/`rejected`), `surveyed_by`, `survey_notes`, `documents` (jsonb of Storage paths), `is_active`.

### 6.5 `distributions` (penyaluran)

`ref_no`, `beneficiary_id` (null for collective/program distributions), `program_id`, `fund_type_id`, `account_id`, `amount`, `distribution_type` (`cash`/`goods`/`service`/`scholarship`), `distributed_at`, `status` (`requested`/`approved`/`disbursed`/`rejected`), `requested_by`, `approved_by`, `approved_at`, `proof_url`, `recipient_signature_url`, `notes`.

### 6.6 Supporting tables

- `programs` — `name`, `slug`, `description`, `fund_type_id`, `target_amount`, `start_date`, `end_date`, `status`, `pic_user_id`.
- `accounts` — `name`, `type` (`cash`/`bank`/`ewallet`), `bank_name`, `account_number`, `opening_balance`, `is_active`.
- `fund_types`, `asnaf_categories` — master data, seeded.
- `audit_log` — `table_name`, `record_id`, `action`, `actor_id`, `old_value` jsonb, `new_value` jsonb, `reason`, `ip`, `created_at`. Written by a generic `AFTER INSERT/UPDATE/DELETE` trigger on all mutable tables. Append-only: no UPDATE/DELETE policy exists for anyone.
- `settings` — key/value jsonb: org name, logo, receipt footer, fiscal year start, nisab value, amil share %.
- `period_locks` — `period` (YYYY-MM), `locked_by`, `locked_at`. Once locked, no inserts/updates with `donated_at` in that period except by `super_admin`.

## 7. Authentication & Authorization

### 7.1 Auth

- Supabase Auth, **email + password** as primary, plus **magic link** for occasional users.
- Google OAuth optional (many amil already have Gmail).
- Signup is **disabled publicly**. Users are invited by `super_admin` via `auth.admin.inviteUserByEmail`, which requires the service role — so this one action runs in a Supabase Edge Function, not the browser.
- MFA (TOTP) required for `super_admin` and `finance`.
- Session: 1 hour access token, refresh enabled, absolute logout after 12 hours idle.

### 7.2 Authorization — the critical part

Because this is a frontend-only application, the anon key ships to the browser and **must be assumed public**. Every access rule therefore lives in RLS, and the UI is only a convenience layer. Any rule that exists only in React is not a rule.

**Role delivery:** use a Supabase **Custom Access Token (Auth) Hook** to embed `user_role` as a JWT claim. RLS policies then read `auth.jwt() -> 'app_metadata' ->> 'user_role'` — no subquery to `profiles` on every row check, which matters for dashboard queries over tens of thousands of rows.

Helper functions:

```sql
create or replace function public.current_role()
returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'user_role', 'viewer');
$$;

create or replace function public.has_min_role(required text)
returns boolean language sql stable as $$
  select case public.current_role()
    when 'super_admin' then 5 when 'finance' then 4
    when 'auditor' then 3 when 'amil' then 2 else 1 end
  >= case required
    when 'super_admin' then 5 when 'finance' then 4
    when 'auditor' then 3 when 'amil' then 2 else 1 end;
$$;
```

Example policies on `donations`:

```sql
alter table donations enable row level security;

-- read: everyone authenticated, but viewer only sees non-PII via a view
create policy "read_donations" on donations for select
  to authenticated using (public.has_min_role('amil') or public.current_role() = 'auditor');

-- insert: amil and above, and only as their own draft
create policy "insert_donations" on donations for insert
  to authenticated with check (
    public.has_min_role('amil')
    and created_by = auth.uid()
    and status in ('draft','pending')
  );

-- update: amil may edit only their own unverified rows
create policy "update_own_draft" on donations for update
  to authenticated using (
    public.current_role() = 'amil'
    and created_by = auth.uid()
    and status in ('draft','pending')
  );

-- verify: finance and above only, and never your own entry
create policy "verify_donations" on donations for update
  to authenticated using (public.has_min_role('finance'))
  with check (verified_by <> created_by or public.current_role() = 'super_admin');

-- delete: nobody. Use void instead.
```

**PII masking for `viewer`:** `viewer` never queries base tables. It reads `donations_public_v` / `donors_masked_v` — security-invoker views that return `left(nik, 4) || '****'` and drop phone/address entirely. Base-table SELECT policies exclude `viewer`.

**Storage:** private buckets `donation-proofs`, `beneficiary-docs`, `distribution-proofs`. Storage RLS keyed on path prefix; signed URLs with 60-second TTL, generated on demand.

### 7.3 Required tests

A `pgTAP` (or plain SQL) suite that, for each of the 5 roles, asserts allowed and **denied** operations on every table. This suite runs in CI and is a release blocker. Target: ≥ 40 assertions.

## 8. Functional Requirements

### 8.1 Donation entry (F-01)

- Quick-entry form optimized for mobile: donor (searchable, with "create new inline"), amount with IDR thousand separators, fund type, payment method, date defaulting to today.
- Anonymous toggle → skips donor selection, records "Hamba Allah".
- Photo of proof/transfer slip via camera capture → Storage.
- On save: status `pending`, receipt number allocated, WhatsApp receipt text generated to clipboard (`wa.me` deep link, no API needed for MVP).
- Bulk import from CSV/XLSX for bank statement batches, with a preview-and-map step and duplicate detection on `payment_ref`.

### 8.2 Verification queue (F-02)

For `finance`: list of `pending` donations, side-by-side with proof image, one-click Verify / Reject with reason. Bulk verify for a matched bank batch.

### 8.3 Donor management (F-03)

- List with search (name/phone/code), filter by type, tag, city, recurring flag.
- Donor detail page: profile, lifetime total, donation history timeline, fund-type breakdown, last donation date, "at risk" flag if a recurring donor missed > 2 expected periods.
- Merge duplicates (super_admin/finance), preserving all donations and writing the merge to the audit log.
- Generate **Bukti Setor Zakat (BSZ)** PDF per donor per year for tax deduction.

### 8.4 Beneficiary management (F-04)

Registration, asnaf classification, survey workflow (`unverified` → `survey_scheduled` → `verified`), document upload, assistance history with a duplicate-aid warning if the same beneficiary received from the same program within N days (configurable).

### 8.5 Distribution (F-05)

Request → approve → disburse, with fund-type/asnaf compatibility validation and a **balance check** that blocks disbursement exceeding the available balance of that fund type. Proof photo and recipient signature capture at disbursement.

### 8.6 Programs (F-06)

CRUD, target vs collected progress, linked donations and distributions, per-program P&L view.

### 8.7 Reports & exports (F-07)

- Collection report by period / fund type / amil / payment method.
- Distribution report by period / fund type / asnaf / program.
- **Fund balance report** — opening, in, out, closing, per fund type. This is the report the board actually needs.
- Donor statement, top-donor list.
- All exportable to XLSX and print-friendly PDF, with the org letterhead from settings.

### 8.8 Audit log viewer (F-08)

Filter by actor, table, date, action. Diff view of `old_value` vs `new_value`.

### 8.9 User management (F-09)

Invite, assign role, deactivate, force password reset, view last login.

## 9. Dashboard (F-10)

Landing page after login. Content varies by role.

### 9.1 KPI cards (top row)

| Metric                 | Definition                                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Collection this month  | Σ verified donations, current month, vs previous month (Δ%)                                                                   |
| Collection YTD         | vs annual target from settings, with a progress bar                                                                           |
| Distributed this month | Σ disbursed distributions                                                                                                     |
| **ACR**                | Allocation to Collection Ratio = distributed ÷ collected (period). BAZNAS-style efficiency indicator; flag if < 70% or > 100% |
| Available balance      | total, expandable to per-fund-type breakdown                                                                                  |
| Active donors          | distinct donors with ≥ 1 donation in last 12 months; Δ vs prior period                                                        |
| Pending verification   | count + total value; clickable → verification queue                                                                           |

### 9.2 Charts

1. **Collection trend** — line/bar, last 12 months, stacked by fund type. Toggle month/quarter/year.
2. **Fund composition** — donut of collection by fund type, current period.
3. **Collection vs distribution** — grouped bars per month, shows whether funds are piling up undisbursed.
4. **Asnaf distribution** — horizontal bars, share of zakat disbursed to each of the 8 asnaf. Sharia-relevant, and regulators ask for it.
5. **Program progress** — top 5 active programs, collected vs target.
6. **Payment method mix** — small donut; tells you whether QRIS is worth pushing.
7. **Donor cohort / retention** — new vs returning donors per month.

### 9.3 Panels

- Recent activity feed (last 20 verified donations, live via Supabase Realtime).
- Top 10 donors this period (hidden from `viewer`).
- Programs nearing deadline with unmet targets.
- Alerts: pending verifications older than 3 days; fund type with negative projected balance; recurring donors at risk.

### 9.4 Filters

Global date range (this month / last month / this quarter / YTD / custom), fund type, program, branch. Filter state reflected in the URL so views are shareable.

### 9.5 Performance requirement

Dashboard aggregates are **never** computed by pulling rows into the browser. Each widget is backed by a Postgres view or `SECURITY INVOKER` RPC (e.g. `rpc_dashboard_summary(p_from date, p_to date)`) returning a single jsonb payload. Target: full dashboard interactive in **< 1.5 s** on a 3G connection with 100k donation rows. Materialized views refreshed by `pg_cron` every 15 minutes for the heaviest aggregates, with the refresh timestamp displayed.

### 9.6 Role variations

- `viewer` — KPI cards without rupiah-level donor detail, charts 1/2/4/5 only, no top-donor panel, no alerts.
- `amil` — additionally sees a personal panel: "my collection this month", "my pending entries".
- `auditor` — sees everything plus an audit-activity summary widget.

## 10. Technical Architecture

```
┌──────────────────────────────────────────────┐
│  Browser (SPA)                               │
│  React 18 + TypeScript + Vite                │
│  UI: shadcn/ui + Tailwind                    │
│  State/data: TanStack Query                  │
│  Forms: React Hook Form + Zod                │
│  Charts: Recharts                            │
│  Tables: TanStack Table                      │
│  Client: @supabase/supabase-js (anon key)    │
└───────────────────┬──────────────────────────┘
                    │ HTTPS (PostgREST / GoTrue / Storage / Realtime)
┌───────────────────▼──────────────────────────┐
│  Supabase                                    │
│  • Postgres + RLS ← the real security layer  │
│  • Auth + custom access token hook           │
│  • Storage (private buckets, signed URLs)    │
│  • Realtime (activity feed)                  │
│  • Edge Functions (only where unavoidable)   │
│  • pg_cron (matview refresh, recaps)         │
└──────────────────────────────────────────────┘
```

**Hosting:** Vercel/Netlify/Cloudflare Pages — static build, no server runtime.

**Where Edge Functions are genuinely required** (everything else stays client-side):

1. Inviting users / setting `app_metadata.user_role` — needs the service role key.
2. Emailing receipts and monthly recaps — needs an SMTP/Resend key.
3. (v2) Payment gateway webhook receiver.

**Localization:** Bahasa Indonesia UI copy, IDR formatting (`Rp 1.250.000`), Asia/Jakarta timezone, `date-fns` with `id` locale. Hijri date shown alongside Gregorian on receipts.

**Offline tolerance:** TanStack Query persistence + an outbox queue in IndexedDB, so an amil in a weak-signal area can queue entries and sync later. Conflicts resolved by server-side `payment_ref` dedup.

## 11. Non-Functional Requirements

| Category        | Requirement                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance     | Dashboard < 1.5 s; list views paginated at 50 rows, server-side sort/filter                                                                                                     |
| Availability    | 99.5% (Supabase-dependent)                                                                                                                                                      |
| Security        | RLS on 100% of tables; no service-role key in the client bundle — enforced by a CI grep; MFA for privileged roles; PII columns masked for `viewer`                              |
| Privacy         | Beneficiary and donor data qualify as personal data under UU PDP No. 27/2022. Data minimization, documented retention (7 years for financial records), export/erasure procedure |
| Auditability    | Every mutation logged, append-only, retained 7 years                                                                                                                            |
| Backup          | Supabase PITR; plus a weekly logical dump to external storage                                                                                                                   |
| Accessibility   | WCAG 2.1 AA; keyboard navigable; contrast checked                                                                                                                               |
| Browser support | Last 2 versions of Chrome/Safari/Firefox/Edge; Android Chrome and iOS Safari                                                                                                    |
| Mobile          | Responsive from 360 px; entry forms usable one-handed                                                                                                                           |
| Currency        | `numeric(15,2)`, never floats. Amounts stored in rupiah, not cents                                                                                                              |

## 12. Delivery Plan

| Sprint | Weeks | Deliverable                                                                                                            |
| ------ | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 0      | 1     | Supabase project, schema migrations, seed master data, RLS skeleton, auth + role hook, app shell with protected routes |
| 1      | 2–3   | Donors CRUD, donation entry, receipt numbering, Storage upload                                                         |
| 2      | 4–5   | Verification queue, accounts, fund balance logic, void/reversal                                                        |
| 3      | 6–7   | Beneficiaries, distributions with approval + balance guard                                                             |
| 4      | 8     | Dashboard: RPCs, KPI cards, charts, role variations                                                                    |
| 5      | 9     | Reports, XLSX/PDF export, BSZ generation, audit log viewer                                                             |
| 6      | 10    | RLS test suite, UAT with 3 real amil, data migration from spreadsheet, launch                                          |

**Definition of done per sprint:** feature works · RLS policies written and tested for all 5 roles · audit trigger attached · mobile layout verified · seeded demo data.

## 13. Risks

| Risk                                       | Impact                       | Mitigation                                                                                             |
| ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Mis-scoped RLS leaks donor/beneficiary PII | Severe — legal + trust       | Mandatory RLS test suite in CI; default-deny; `viewer` never touches base tables                       |
| Anon key treated as a secret               | Severe                       | Document explicitly; CI check for service-role key in bundle; security review before launch            |
| Amil resist leaving WhatsApp/spreadsheet   | High                         | Sub-45-second entry flow; WhatsApp receipt export keeps their habit intact; run parallel for one month |
| Fund segregation modeled wrongly           | High — sharia non-compliance | Review the fund-type and asnaf rules with the Dewan Pengawas Syariah **before** sprint 2               |
| Dashboard slows as data grows              | Medium                       | RPC-based aggregates + matviews from day one; load-test with 100k synthetic rows                       |
| Spreadsheet migration brings duplicates    | Medium                       | Dry-run import with a dedup report; require sign-off before commit                                     |

## 14. Open Questions

1. Is this a single Baitul Maal or multiple branches (_cabang_)? `branch_id` is stubbed but branch-scoped RLS is not specified.
2. Does the organization need PSAK 109-compliant statements, or is the fund balance report sufficient for now?
3. Is there an existing donor numbering scheme and receipt format to preserve?
4. Volume estimate — donations per month, and current historical row count to migrate?
5. Should wakaf be in MVP at all? Its principal/yield model is materially different and could be deferred to v2.
6. Does the annual BSZ letter need a specific regulator-mandated format?
7. Who signs off on distributions above a certain amount — is a two-tier approval threshold needed?

## 15. Future (v2+)

Public donation page with Midtrans/QRIS checkout · donor self-service portal · WhatsApp Business API for automated receipts and campaign broadcasts · recurring donation reminders · geospatial view of beneficiary distribution (a natural fit given the PostGIS availability in Supabase) · program impact metrics · Accurate/Zahir export · multi-branch consolidation.
