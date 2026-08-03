# BMIS — Sistem Informasi Baitul Maal

Internal web application for a Baitul Maal / LAZ: records collection
(_penghimpunan_) and distribution (_penyaluran_), keeps per-fund balances
correct, and gives the board a live dashboard — with access enforced in the
database rather than in the UI.

Specification: [`PRD-baitul-maal-admin.md`](PRD-baitul-maal-admin.md).
**Operator guide (Bahasa Indonesia): [`docs/ALUR-KERJA.md`](docs/ALUR-KERJA.md)**, also
served in the app under **Bantuan** —
the end-to-end workflow for amil and bendahara: recording a donation, anonymous
QRIS, transfer codes, verification, distribution, the monthly close, and locking
a period. The app imports that same file with `?raw`, so there is one copy and
the page cannot drift from the document.
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

| Command                        | Purpose                                               |
| ------------------------------ | ----------------------------------------------------- |
| `npm run dev`                  | Vite dev server                                       |
| `npm run build`                | Typecheck + production build                          |
| `npm run typecheck`            | Types only                                            |
| `npm run lint`                 | ESLint                                                |
| `npm test`                     | Unit tests (Vitest)                                   |
| `npm run test:watch`           | Vitest watch mode                                     |
| `npm run db:reset`             | Re-apply migrations and seed                          |
| `npm run db:test`              | **RLS test suite (release blocker)**                  |
| `npm run check:no-service-key` | Fails if a service-role key reaches `src/` or `dist/` |

Run one unit test file: `npx vitest run src/lib/format.test.ts`

### About `npm run db:test`

`supabase test db` runs the pgTAP suite against the **local** Supabase stack on
your machine, never against the hosted project. So `supabase start` has to be
running, and the suite only guards what you have locally:

```bash
supabase start        # local Postgres + Auth + Storage in Docker
supabase db reset     # migrations + seed into the local database
npm run db:test       # the 93 assertions
```

Until that runs on your machine, the suite is documentation rather than a gate —
nothing stops a `supabase db push` that breaks a policy. Doing a local
`db reset` + `db test` before every push is what turns it into a real release
gate.

## Deployment

Pushes to `main` run the service-role guard, a Prettier check, typecheck, lint
and unit tests,
then build and publish to GitHub Pages
(`.github/workflows/deploy.yml`). Pull requests run the checks without
deploying.

Two repository secrets are required, under **Settings → Secrets and variables →
Actions**:

| Secret                   | Value            |
| ------------------------ | ---------------- |
| `VITE_SUPABASE_URL`      | your project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon key     |

The anon key is public by design — RLS is the security boundary — but it lives
in secrets so it is masked in build logs and can be rotated without a commit.
Without them the deployed app renders a configuration notice rather than a
blank page.

The `invite-user` Edge Function needs two secrets of its own
(`supabase secrets set`): `ALLOWED_ORIGIN` is the scheme and host the app is
served from, for CORS; `APP_URL` is the full app URL including any base path,
used as the invitation redirect. They are separate because a CORS origin may not
contain a path.

Also set **Settings → Pages → Source** to _GitHub Actions_, and add the Pages
URL to Supabase **Auth → URL Configuration** as the site URL and a redirect
URL, or magic links and invitations will bounce.

Pages serves from `/<repo>/`, so the build takes its base path from the repo
name and ships `index.html` as `404.html` to let the SPA resolve deep links.

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
roles — 93 assertions covering both allowed and denied operations. It must pass
before release.

## Sign-in and membership

Password, magic link and **Google** are all enabled.

**Google requires GoTrue signup to be enabled**, which is counter-intuitive:
with signup disabled, GoTrue treats an unlinked Google identity as a signup and
rejects it even when an account with that email already exists, so linking can
never happen. That is safe here only because access does not follow from having
an account. The signup trigger creates every profile `is_active = false`,
an inactive or missing profile resolves to the role `none`, which ranks below
`viewer` and is denied by every policy — so a Google account that signs itself up
reads nothing at all, not even masked donor names or aggregate totals, and lands
on a "waiting for activation" screen.

Admitting someone is therefore an explicit act: invite them from the Pengguna
screen (which sets `is_active`), or flip it there for a user created by hand in
the Supabase dashboard.

To enable Google: **Authentication → Sign In / Providers → Google**, with the
client ID and secret from a Google Cloud OAuth client whose authorised redirect
URI is `https://<project-ref>.supabase.co/auth/v1/callback`.

Every provider and magic-link redirect lands on the app's own
`/auth/callback` route, which must be in **Authentication → URL Configuration →
Redirect URLs**. That route sits outside the route guards deliberately: the
session is read out of the URL asynchronously, so a guard evaluating first would
navigate away and discard the authorisation code, leaving the user back at the
login form with nothing to explain it.

## Transfer codes

Donors are asked to append a published 3-digit code to the transfer amount, so
`Rp100.153` means Rp 100.000 intended for code 153. That code is the only
attribution signal a bank mutation carries, so it is modelled as data:
`fund_types.transfer_code` for codes naming a fund type (101 Zakat Maal, 112
Fidyah) and `programs.code` for the twelve naming a programme, with
`donation_codes_v` as the single lookup and uniqueness enforced across both
tables.

The entry form suggests the destination as the amil types an amount, and the
bank importer attributes each row on its own code, falling back to an
operator-chosen fund type. An amount with no recognised code stays general
sedekah — it is never guessed at.

The seeded programmes, BSI account and organisation name come from the Baitul
Maal Muhajirin poster; edit that block of `supabase/seed.sql` for another
institution.

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

- **MFA cannot be switched on.** MFA — multi-factor authentication — means a
  second proof of identity beyond the password: a rotating 6-digit code from an
  authenticator app such as Google Authenticator. PRD §7.1 requires it for
  `super_admin` and `finance`, the roles that verify money and assign roles.
  Supabase provides the enroll/challenge/verify APIs and `config.toml` enables
  TOTP locally, but the app has no enrollment screen, so nobody can register a
  device. The largest outstanding gap.
- **Reopening a locked period has no UI.** Locking does; unlocking needs SQL.
- Offline outbox: TanStack Query is configured `offlineFirst` with a 24h cache,
  but the IndexedDB write queue is not implemented — entries made offline are
  not yet replayed.
- Emailed receipts and monthly recaps (the second Edge Function) are not built;
  the WhatsApp receipt path is.
- Branch-scoped RLS is not written. `branch_id` exists on the tables but no
  policy reads it, pending PRD open question 1.
- Donor merge takes UUIDs rather than a picker.
