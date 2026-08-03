# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Vite dev server
npm run build            # tsc -b && vite build
npm run typecheck        # types only
npm run lint             # ESLint
npm test                 # Vitest
npx vitest run src/lib/format.test.ts   # a single test file
npm run db:reset         # supabase db reset — migrations + seed
npm run db:test          # supabase test db — the RLS suite (release blocker)
npm run check:no-service-key            # fails if a service-role key reaches src/ or dist/
```

`supabase start` must be running for the `db:*` commands. Migrations apply in filename order; the numbering is deliberate (schema → audit/numbering → balances/RPC → views → RLS → storage), so a new migration that adds a table must also add its RLS policies.

The PRD (`PRD-baitul-maal-admin.md`) remains the spec of record; `README.md` lists what is still unbuilt against it.

## What is being built

BMIS — an internal web app for an Indonesian Baitul Maal / LAZ (zakat institution) replacing a shared spreadsheet. It records *penghimpunan* (collection) and *penyaluran* (distribution), keeps per-fund balances correct, and serves a role-scoped dashboard.

## Architecture

Frontend-only SPA against Supabase — **there is no application server**.

- React 18 + TypeScript + Vite; Tailwind with hand-rolled primitives in `src/components/ui` (no shadcn CLI dependency); TanStack Query; Recharts; `date-fns` with the `id` locale.
- Supabase: Postgres + RLS, Auth (custom access token hook), Storage (private buckets), Realtime, pg_cron, Edge Functions.
- Static hosting (Vercel/Netlify/Cloudflare Pages).

Edge Functions exist **only** where the service-role key or an SMTP key is unavoidable: user invitation / `app_metadata.user_role` assignment, and receipt/recap emails. Everything else goes directly from the browser to PostgREST.

## Non-negotiable invariants

These are the rules that distinguish correct code from code that merely runs.

1. **Security lives in RLS, never in React.** The anon key ships to the browser and is public. Any access rule enforced only in the UI is not a rule. Every table has RLS enabled and default-deny.
2. **Never put the service-role key in client code.** CI greps the bundle for it.
3. **Roles come from the JWT**, not a `profiles` subquery: policies read `auth.jwt() -> 'app_metadata' ->> 'user_role'` via `public.current_role()` / `public.has_min_role(text)`. Adding a per-row lookup to `profiles` in a policy is a performance regression on dashboard queries.
4. **Separation of duties is a DB check**, not UI logic: `created_by <> verified_by` on donations and distributions. `super_admin` may override only with an audited reason.
5. **`viewer` never queries base tables.** It reads masked views (`donations_public_v`, `donors_masked_v`) and the dashboard RPC; base-table SELECT policies exclude it entirely. See the departures note below for why those two views are definer-rights.
6. **Nothing is hard-deleted.** Donations are *voided*, records are soft-deleted via `deleted_at`. `audit_log` is append-only — no UPDATE/DELETE policy exists for any role.
7. **Only `status = 'verified'` donations count** toward balances, dashboard figures, and reports.
8. **Money is `numeric(15,2)` in rupiah** (not cents, never floats).
9. **Dashboard aggregates never pull rows into the browser.** `rpc_dashboard_summary(p_from, p_to)` returns the whole dashboard as one jsonb payload; the heaviest rollups are matviews refreshed by pg_cron every 15 minutes.

### Two deliberate departures from a literal reading of the PRD

- **The dashboard RPC is `SECURITY DEFINER`, not invoker** (PRD §9.5 says invoker). It has to be: `viewer` has no SELECT on any base table, so an invoker-rights function would return zeros for exactly the role that is supposed to see the aggregate dashboard. The function is aggregate-only and gates every donor-identifying section on `current_role()`. Same reasoning for `donors_masked_v` / `donations_public_v`, which are definer views.
- **Separation of duties needs an escape hatch that is still a constraint.** A plain `check (verified_by <> created_by)` cannot express "super_admin may override with a reason", so the constraint reads `… or sod_override_reason is not null` and the reason is written to both the row and the audit log.

### Postgres gotchas already paid for

- A function with a `SET` clause (`set search_path = ''`) runs in its own GUC nesting level, so **every setting it changes is rolled back when it returns**. `set_audit_reason()` therefore has no `SET` clause — adding one silently breaks every audit reason.
- `fund_balance()` and `next_counter()` are `SECURITY DEFINER` because an amil's RLS view of `donations` is only their own rows; an invoker-rights balance would be wrong precisely inside the guard that needs it.
- Index expressions must be `IMMUTABLE` — `date_trunc('month', timestamptz)` is not.
- In a single test transaction every row shares the same `now()`, so order audit assertions by `id`, never `created_at`.
- A PL/pgSQL variable that shares a name with a column in scope raises `42702` **at execution time, not creation time** — `create function` accepts it happily. `rpc_dashboard_summary` shipped broken this way and took down the dashboard for every role. Qualify column references inside subqueries, and make sure every RPC is actually *called* by the test suite; asserting a policy exists proves nothing about the function that reads it.

## Domain rules that are easy to get wrong

- **Fund type governs spendability.** Zakat funds (`zakat_maal`, `zakat_fitrah`, `zakat_profesi`) may only be distributed to the 8 asnaf; a distribution's `fund_type` must be compatible with the beneficiary's `asnaf`.
- **Wakaf principal is never a distribution source** — only its yield is distributable.
- `program_id` is required when the fund type is `infaq_terikat`.
- Disbursement is blocked if it exceeds the available balance *of that fund type*.
- **Transfer codes are the attribution signal on a bank mutation.** Donors append a published 3-digit code to the amount (`Rp100.153` = Rp 100.000 for code 153). A code lives on `fund_types.transfer_code` when it names a fund type (101, 112) or on `programs.code` when it names a programme, and `donation_codes_v` is the single lookup. Codes are unique *across both tables* — a trigger enforces the half a constraint cannot. An amount with no recognised code is general sedekah, never a guess.
- `period_locks` freeze a `YYYY-MM` period: no inserts/updates with `donated_at` in it except by `super_admin`.
- Roles, in rank order: `super_admin` > `finance` > `auditor` > `amil` > `viewer`. The permission matrix in PRD §4.1 is authoritative.

## Frontend conventions

- UI copy is **Bahasa Indonesia**; IDR formatted `Rp 1.250.000`; timezone Asia/Jakarta; Hijri date alongside Gregorian on receipts.
- Generated identifiers: donors `DNR-000123`, donation receipts `KW/2026/08/0001`.
- All tables carry `id uuid default gen_random_uuid()`, `created_at`, `updated_at`, `created_by`, and an audit trigger.
- Mobile-first: layouts work from 360 px; the donation entry flow targets under 45 seconds one-handed. Touch targets are 44 px (`Button size="md"`).
- `src/auth/permissions.ts` decides what to *render*; it is never authorization. Note `canWrite()` is not a rank comparison — `auditor` outranks `amil` for reads but must never write, and the same asymmetry exists in SQL as `public.can_write()`.
- State transitions go through RPCs (`rpc_verify_donation`, `rpc_approve_distribution`, …), not raw table updates, so timestamps, actor and audit reason are set atomically.
- Chart colours come from `src/features/dashboard/palette.ts` — a fixed, CVD-validated slot order that is never cycled. A seventh category folds into "Lainnya". Every chart ships a table view; three light-mode slots fall under 3:1 contrast, so identity must not rest on the fill alone.

## Definition of done (per PRD §12)

Feature works · RLS policies written **and tested for all 5 roles** · audit trigger attached · mobile layout verified · seeded demo data. The pgTAP RLS suite in `supabase/tests/rls_test.sql` — currently 80 assertions covering allowed *and denied* operations for all five roles plus anon — is a release blocker. Extend it in the same migration that adds a policy.

## Open questions still unresolved

Multi-branch scope (`branch_id` is stubbed, branch-scoped RLS unspecified), PSAK 109 requirement, existing donor/receipt numbering to preserve, data volume, whether wakaf is in MVP, BSZ letter format, two-tier approval threshold. Don't invent answers — see PRD §14 and ask.
