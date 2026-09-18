# WhatsApp Bulk Messaging Platform

An internal web application for sending WhatsApp template messages to
uploaded contact lists **exclusively through the official Meta WhatsApp
Cloud API** (Graph API). There is no WhatsApp BSP (WATI, Interakt,
AiSensy, Gupshup, Twilio, 360dialog, etc.), no browser automation, and no
unofficial-API fallback anywhere in this codebase.

## What it does

- Imports contacts from CSV/XLSX, detects headers, previews rows, and
  lets you map columns to Name/Phone/Email.
- Normalises and validates Indian phone numbers (configurable default
  country), rejects invalid/blank numbers, and de-duplicates within a
  file and against the existing contact database — without ever
  blindly prepending a country code.
- Syncs approved message templates from your WhatsApp Business Account
  and lets you map each `{{n}}` variable (body, header, and dynamic
  button parameters) to a spreadsheet column, a contact field, or a
  static value.
- Shows a personalised preview per recipient before sending, and refuses
  to queue a campaign while any recipient has a missing required
  variable.
- Sends bulk campaigns through the Meta Cloud API via a background
  queue (BullMQ + Redis) — never inline in a single HTTP request —
  with configurable rate limiting and concurrency, and
  exponential-backoff retry that only retries transient errors.
- Tracks per-message status (queued → sent → delivered → read, or
  failed) via Meta's webhook callbacks, processed idempotently.
- Maintains a suppression/opt-out list (auto-populated from inbound
  STOP/UNSUBSCRIBE/OPT OUT/REMOVE/CANCEL replies, or managed manually)
  that's enforced automatically on every campaign and can only be
  reversed through an explicit admin action.
- Provides a dashboard with delivery/read/failure rates and charts,
  full campaign history with a filterable/searchable recipient table,
  and CSV export for both campaign results and the contact list.
- Ships a development/mock mode that simulates the entire send-and-status
  lifecycle without calling Meta at all, clearly marked in the UI.

## Architecture

- **Frontend/backend:** Next.js 16 (App Router) + TypeScript + React 19 +
  Tailwind CSS v4, with hand-built shadcn/ui-style primitives
  (`components/ui/`). API surface lives under `app/api/*` as Route
  Handlers.
- **Database:** PostgreSQL via Prisma ORM. Schema: `prisma/schema.prisma`
  — `User`, `Contact`, `Template`, `Campaign`, `CampaignRecipient`,
  `Message` (one row per send *attempt*, for retry history),
  `Suppression`, `WebhookEvent` (idempotency), `PricingRate`, `AuditLog`.
- **Queue:** Redis + BullMQ. `lib/queue/worker.ts` is a **standalone
  process** (`pnpm worker`) — it is the only code in this app that
  actually calls Meta's send API (or simulates it in mock mode).
- **Meta integration:** isolated in `lib/meta/` — `metaClient.ts` (the
  one place the Graph API version and auth header are applied),
  `metaTemplates.ts`, `metaMessages.ts` (+ the pure `templatePayload.ts`
  payload generator), `metaWebhooks.ts` (+ the pure
  `webhookParsing.ts`). `META_GRAPH_API_VERSION` is the single
  configuration point for the API version — see `lib/env.ts`.
- **Auth:** email/password, bcrypt-hashed, signed httpOnly JWT session
  cookies (`jose`) — no third-party auth provider needed for this
  internal tool. `proxy.ts` does an optimistic redirect; every page,
  server action, and route handler re-checks the session via
  `lib/auth/dal.ts`.
- **Architecture note on `server-only`:** most business-logic modules
  (`lib/db`, `lib/env`, `lib/meta/*`, `lib/campaigns/*`,
  `lib/templates/*`, `lib/contacts/*`, `lib/queue/*`, `lib/audit.ts`)
  deliberately do **not** import the `server-only` package, because the
  BullMQ worker is a plain Node process (run via `tsx`, not Next's
  bundler) and `server-only` throws unconditionally outside that
  bundler. The safety net is structural instead: no `"use client"`
  component in this app imports any of those modules — only the pure,
  non-secret exports (`lib/validation/phone.ts`,
  `lib/contacts/{parse,validate,columnMapping}.ts`, the pure parts of
  `lib/meta/templatePayload.ts` / `lib/meta/webhookParsing.ts`,
  `lib/templates/variableMapping.ts`, `lib/campaigns/preview.ts`) ever
  reach a client bundle. `lib/auth/session.ts` and `lib/auth/dal.ts` keep
  the `server-only` guard, since they're Next-only (`next/headers`,
  `next/navigation`) and the worker never imports them.

## Local installation

### Prerequisites

- **Node.js 22.x** (see `.nvmrc`; developed and tested against 22.22).
- **pnpm 10.x** (`corepack enable`, or `npm i -g pnpm`).
- **PostgreSQL 16** and **Redis 7** — either via `docker-compose.yml`,
  or local installs. (This repo was developed in a sandbox without
  Docker-in-Docker access, so both native installs and Docker were
  exercised — either works.)

### Steps

```bash
pnpm install

cp .env.example .env
# Edit .env — see "Environment variables" below.

# Start Postgres + Redis
docker compose up -d postgres redis
# — or, if Docker isn't available —
# sudo service postgresql start && sudo service redis-server start

pnpm db:migrate      # applies prisma/migrations and generates the client
pnpm db:seed         # creates the admin user from ADMIN_EMAIL/ADMIN_PASSWORD
                      # and seeds placeholder IN pricing rates

pnpm dev             # http://localhost:3000
```

In a **second terminal**, run the worker — nothing is actually sent
without this running:

```bash
pnpm worker
```

### PostgreSQL setup

Any PostgreSQL 16+ instance works. Set `DATABASE_URL` in `.env` to a
standard connection string:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/whatsapp_bulk?schema=public"
```

`docker-compose.yml` provisions a local `postgres` user/password/db
matching the `.env.example` default. For a hosted database (Neon,
Supabase, RDS, etc.), just point `DATABASE_URL` at it — Prisma migrations
work the same way.

### Redis setup

Any Redis 7+ instance works, including hosted options (Upstash, Redis
Cloud, ElastiCache). Set `REDIS_URL` accordingly:

```
REDIS_URL="redis://HOST:6379"
```

The queue worker and the Next.js app both connect to the same Redis
instance.

### Prisma setup

```bash
pnpm db:generate        # regenerate the Prisma client after a schema change
pnpm db:migrate         # create + apply a new migration (dev)
pnpm db:migrate:deploy  # apply existing migrations only (CI/production)
pnpm db:studio          # browse the database
```

### Meta Developer / WhatsApp Business Account / webhook / template setup

See **[docs/META_SETUP.md](docs/META_SETUP.md)** for the full step-by-step
guide, including phone number configuration, webhook configuration, and
template creation.

### Environment variables

See `.env.example` for the complete list with inline descriptions.
Highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL`, `REDIS_URL` | Infra connections |
| `NEXTAUTH_SECRET` | Session-signing secret — generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used only by `pnpm db:seed` to create the first user |
| `META_ACCESS_TOKEN`, `META_WABA_ID`, `META_PHONE_NUMBER_ID`, `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` | Meta credentials — server-only, never sent to the browser |
| `META_GRAPH_API_VERSION` | Single configuration point for the Graph API version |
| `WHATSAPP_MOCK_MODE` | `true` to simulate sends without calling Meta (see below) |
| `MAX_MESSAGES_PER_SECOND`, `MAX_CONCURRENT_JOBS`, `RETRY_ATTEMPTS` | Queue rate-limiting and retry configuration |
| `MAX_UPLOAD_FILE_SIZE_MB` | Contact import file size limit |
| `DEFAULT_COUNTRY_CODE` | Default country for phone normalisation (default `IN`) |

Never commit a real `.env` file (`.gitignore` already excludes it, with
an explicit exception for `.env.example`).

### Development / mock mode

`WHATSAPP_MOCK_MODE=true` (the `.env.example` default) simulates the
entire send lifecycle — queued → sent → delivered → read, occasionally
failed — through the exact same queue/worker/status-processing code path
real webhooks use, without ever calling Meta. The UI shows a persistent
**"DEVELOPMENT / MOCK MODE"** banner whenever it's on. Turn it off only
once real `META_*` credentials are configured (see docs/META_SETUP.md).

## Local testing

```bash
pnpm test        # vitest — pure-function unit tests + Postgres/Redis
                  # integration tests (needs docker compose up -d, or
                  # local Postgres/Redis running)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
pnpm build        # production build (also type-checks)
```

The test suite includes a Meta API mock (`WHATSAPP_MOCK_MODE`, used by
`lib/meta/metaMessages.ts` / `metaTemplates.ts`) — this mock exists for
local development and automated testing only and is never used when
`WHATSAPP_MOCK_MODE` is unset or `false`.

For manual/UI testing, run `pnpm dev` and `pnpm worker` together, log in
with the seeded admin account, and work through: import a CSV → sync
templates (mock mode ships two illustrative sample templates) → create a
campaign → start it → watch the campaign detail page update live.

## Production deployment

The app is a standard Next.js app plus one extra long-running process
(the worker), so it's portable across most hosts:

- **Vercel** (or similar) for the Next.js app itself. Set all the
  `.env.example` variables as project environment variables. Run
  `pnpm db:migrate:deploy` as part of your deploy step (or manually
  against the production database before the first deploy).
- **Neon / Supabase / RDS** (or any managed Postgres) for the database.
- **Upstash / Redis Cloud** (or any managed Redis) for the queue.
- **The worker process** (`pnpm worker`, i.e. `node` running
  `lib/queue/worker.ts` via `tsx` or a compiled equivalent) needs to run
  continuously somewhere with network access to both Postgres and Redis
  — a small VPS, a container service (Fly.io, Render, ECS, etc.), or a
  background worker product. It is **not** a Vercel serverless function;
  it's a long-lived process that holds open BullMQ connections.
- Point the Meta App's webhook callback URL at
  `https://<your-domain>/api/webhooks/meta/whatsapp`.

The architecture is portable to a single VPS too: run `docker compose up
-d postgres redis`, then `pnpm build && pnpm start` and `pnpm worker` as
two long-running processes (e.g. under `pm2` or `systemd`).

## Troubleshooting

- **"Invalid environment configuration" on startup** — `lib/env.ts`
  validates every required env var at first use and lists exactly which
  ones are missing/invalid; check `.env` against `.env.example`.
- **Campaign stuck at "RUNNING" with recipients stuck "QUEUED"** — the
  worker (`pnpm worker`) isn't running, or can't reach Redis
  (`REDIS_URL`). The Next.js app only *creates* jobs; only the worker
  process sends them.
- **Webhook events never arrive / status stays at "SENT" forever in a
  live (non-mock) setup** — confirm the callback URL in the Meta App
  Dashboard is reachable over HTTPS from the public internet (a local
  dev server needs a tunnel), that `META_VERIFY_TOKEN` matches on both
  sides, and that the webhook is subscribed to the `messages` field.
- **"Invalid signature" in the webhook route's logs** — `META_APP_SECRET`
  doesn't match the app the webhook is configured on.
- **Templates page is empty after clicking "Sync from Meta"** — either
  no templates are `APPROVED` yet in WhatsApp Manager, or
  `META_WABA_ID`/`META_ACCESS_TOKEN` are wrong/missing (the sync error
  message surfaces the underlying Meta API error).
- **A message fails immediately with a "PERMANENT" error** — check the
  recipient's error message on the campaign detail page; common causes
  are the template being edited/paused since the campaign was created,
  or the recipient's number being invalid/unreachable. Permanent errors
  are deliberately not retried — see `lib/meta/errorClassification.ts`.

## Security considerations

- Every dashboard page, server action, and API route requires an
  authenticated session, checked in `lib/auth/dal.ts` (with an
  optimistic redirect in `proxy.ts` for UX only — the real check is
  always server-side and re-run per request).
- Meta credentials, database credentials, and Redis credentials are
  server-only environment variables, validated centrally in `lib/env.ts`,
  and are never bundled into client-side JavaScript.
- Uploaded contact files are size-limited (`MAX_UPLOAD_FILE_SIZE_MB`) and
  row-limited, and every row is re-validated server-side on commit
  (never trusting client-computed validity).
- The Meta webhook route verifies `X-Hub-Signature-256` (HMAC-SHA256
  against `META_APP_SECRET`) against the *raw* request body before
  parsing or processing anything.
- Webhook and mock-mode status processing is idempotent via a unique
  `WebhookEvent.dedupeKey`, so a redelivered webhook can't double-count
  campaign statistics.
- Passwords are hashed with bcrypt (12 rounds); sessions are signed JWTs
  in httpOnly, `secure` (in production), `sameSite=lax` cookies.
- Login is rate-limited per email (Redis-backed, `lib/auth/loginRateLimit.ts`)
  — 8 failed attempts locks that email out for 15 minutes, logged as an
  audit event.
- Audit logging (`lib/audit.ts`) records who did what (logins, imports,
  campaign lifecycle actions, opt-outs, pricing changes, template
  syncs) but never logs access tokens, app secrets, or passwords.
- Suppressed/opted-out contacts are excluded from every campaign
  automatically at creation time, and can only become eligible again
  through an explicit admin "Remove from list" action
  (`/settings/suppression`).

### Known issue: the `xlsx` dependency (action required before production)

The npm-published `xlsx` package (used in `lib/contacts/parse.ts` to parse
uploaded `.xlsx` files) is pinned at `0.18.5`, which has two published
high-severity CVEs — prototype pollution
([CVE-2023-30533](https://nvd.nist.gov/vuln/detail/CVE-2023-30533)) and a
ReDoS ([CVE-2024-22363](https://nvd.nist.gov/vuln/detail/CVE-2024-22363))
— triggerable by a crafted `.xlsx` file. SheetJS (the maintainer) has
fixed both, but **only publishes patched builds (0.20.x+) via their own
CDN, not the npm registry**, so `pnpm update` alone will not fix this.

This was **not fixed in this codebase** because the sandbox this project
was built in has `cdn.sheetjs.com` blocked by its network egress policy
(confirmed via a direct request, which returned a 403 from the proxy).
Before deploying with real (non-mock) import traffic, run this yourself
in an environment with normal network access:

```bash
mkdir -p vendor
curl -L -o vendor/xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
pnpm remove xlsx
pnpm add ./vendor/xlsx-0.20.3.tgz
```

(Vendoring the tarball into the repo, per SheetJS's own recommendation,
avoids depending on the CDN being reachable at install time in CI/prod.)
Re-run `pnpm test` and manually re-test the CSV/XLSX import flow after
upgrading, since 0.20.x has had minor API changes since 0.18.x.

Until this is applied, treat `.xlsx` import as available only to trusted,
authenticated internal users (which the auth model here already
enforces) and not as safe for untrusted/public file uploads.
