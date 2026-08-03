# BMIS — Sistem Informasi Baitul Maal

Internal web application for a Baitul Maal / LAZ: records collection
(*penghimpunan*) and distribution (*penyaluran*), keeps per-fund balances
correct, and gives the board a live dashboard — with access enforced in the
database rather than in the UI.

Specification: [`PRD-baitul-maal-admin.md`](PRD-baitul-maal-admin.md).
Working notes for future contributors: [`CLAUDE.md`](CLAUDE.md).

## Stack

React 18 + TypeScript + Vite · Tailwind · TanStack Query & Table · Recharts ·
Supabase (Postgres + RLS, Auth, Storage, Realtime, pg_cron, Edge Functions).

There is no application server. The browser talks to PostgREST directly with
the anon key, which is **public by design** — every access rule lives in RLS.

## Getting started

```bash
npm install
cp .env.example .env          # fill in your Supabase URL and anon key

supabase start                # local Postgres + Auth + Storage
supabase db reset             # apply migrations + seed master data
npm run dev
```

Create the first `super_admin` by inserting a user through Supabase Studio and
setting `profiles.role`; from then on, users are invited from the Pengguna
screen (which calls the `invite-user` Edge Function).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:watch` | Vitest watch mode |
| `npm run db:reset` | Re-apply migrations and seed |
| `npm run db:test` | **RLS test suite (release blocker)** |
| `npm run check:no-service-key` | Fails if a service-role key reaches `src/` or `dist/` |

Run one unit test file: `npx vitest run src/lib/format.test.ts`

## Security model

The anon key is in the bundle and must be assumed public, so:

- Every table has RLS enabled and is default-deny.
- Roles are delivered as a JWT claim (`app_metadata.user_role`) by a custom
  access token hook, so no policy joins `profiles` per row.
- Separation of duties (`created_by <> verified_by`) is a table constraint. A
  `super_admin` may override it only by recording a reason, which lands in the
  audit log and on the row.
- `viewer` has no SELECT on any base table; it reads masked views and an
  aggregate-only dashboard RPC.
- Donations are never deleted — they are voided. `audit_log` has no write
  policy for any role.
- The service-role key exists only in Edge Function secrets, and CI greps for
  it.

`supabase/tests/rls_test.sql` asserts all of the above for each of the five
roles — 63 assertions covering both allowed and denied operations. It must pass
before release.

## Layout

```
src/
  auth/         session, JWT role, route guards, UI capability map
  components/   shell, UI primitives, shared filters
  features/     one directory per module (donations, donors, …)
  lib/          supabase client, queries, formatting, storage, export
supabase/
  migrations/   schema → audit/numbering → balances/RPC → views → RLS → storage
  functions/    invite-user (needs the service role)
  tests/        pgTAP RLS suite
```

## Known gaps against the PRD

- Offline outbox: TanStack Query is configured `offlineFirst` with a 24h cache,
  but the IndexedDB write queue is not implemented — entries made offline are
  not yet replayed.
- Emailed receipts and monthly recaps (the second Edge Function) are not built;
  the WhatsApp receipt path is.
- Branch-scoped RLS is not written. `branch_id` exists on the tables but no
  policy reads it, pending PRD open question 1.
- Donor merge takes UUIDs rather than a picker.
