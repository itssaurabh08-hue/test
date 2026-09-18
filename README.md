# WhatsApp Bulk Messaging Platform

An internal web application for sending WhatsApp template messages to
uploaded contact lists **exclusively through the official Meta WhatsApp
Cloud API** (Graph API). No WhatsApp BSP (WATI, Interakt, AiSensy, Gupshup,
Twilio, 360dialog, etc.) is used, and there is no browser-automation or
unofficial-API fallback.

> **Build status:** this project is being built in phases (see
> `docs/BUILD_PHASES.md` once added). Phase 1 — project scaffold, database
> schema, and authentication — is complete. Later phases add contact
> import, the Meta integration, campaign sending, webhooks, and reporting.
> This section is updated as each phase lands; do not assume a feature
> exists just because it's named in this document without checking the
> phase status.

## What it does

- Imports contacts from CSV/XLSX, validates and normalises phone numbers,
  and de-duplicates them.
- Lets you pick an approved Meta message template, map spreadsheet columns
  to template variables, and preview personalised messages before sending.
- Sends bulk campaigns through the Meta Cloud API via a background queue
  (BullMQ + Redis), never inline in a single HTTP request.
- Tracks per-message status (queued/sent/delivered/read/failed) using Meta's
  webhook callbacks, idempotently.
- Maintains an opt-out/suppression list that is enforced on every campaign.
- Provides a dashboard, campaign history, and CSV export of results.

## Architecture

- **Frontend/backend:** Next.js (App Router) + TypeScript + React + Tailwind
  CSS, using Route Handlers under `app/api/*` for the API surface.
- **Database:** PostgreSQL via Prisma ORM (`prisma/schema.prisma`).
- **Queue:** Redis + BullMQ for bulk sending, rate limiting, and retries
  (`lib/queue/`).
- **Meta integration:** isolated service layer in `lib/meta/` — the Graph
  API version is a single configuration point (`META_GRAPH_API_VERSION`),
  never hardcoded per-call.
- **Auth:** email/password with bcrypt-hashed passwords and a signed,
  httpOnly JWT session cookie (see `lib/auth/`). No third-party auth
  provider is required for this internal tool.

## Local installation

### Prerequisites

- Node.js 22.x (see `.nvmrc`/`package.json engines` — this repo was built
  and tested against Node 22.22)
- pnpm 10.x (`corepack enable` or `npm i -g pnpm`)
- PostgreSQL 16 and Redis 7 — either via the provided `docker-compose.yml`,
  or local installs (both work; this repo was developed against native
  installs where Docker-in-Docker wasn't available)

### Steps

```bash
pnpm install

cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL, NEXTAUTH_SECRET (openssl rand -base64 32),
# ADMIN_EMAIL/ADMIN_PASSWORD, and your Meta credentials (see docs/META_SETUP.md).
# Leave WHATSAPP_MOCK_MODE=true until you have a live WABA connected.

# Start Postgres + Redis
docker compose up -d postgres redis
# — or, if Docker isn't available in your environment —
# sudo service postgresql start && sudo service redis-server start

pnpm db:migrate      # applies prisma/migrations and generates the client
pnpm db:seed         # creates the admin user from ADMIN_EMAIL/ADMIN_PASSWORD

pnpm dev             # http://localhost:3000
```

In a second terminal, once the queue/worker (Phase 6) is implemented:

```bash
pnpm worker          # runs the BullMQ worker that actually sends messages
```

### Environment variables

See `.env.example` for the full list with descriptions. Never commit a
real `.env` file. Meta credentials (`META_ACCESS_TOKEN`, `META_APP_SECRET`,
etc.) are read only on the server and are never sent to the browser.

### Development / mock mode

Set `WHATSAPP_MOCK_MODE=true` (the default in `.env.example`) to develop
without a live WhatsApp Business Account. No requests are made to Meta;
sends are simulated through the same queue/worker code path. The UI shows
a persistent "DEVELOPMENT / MOCK MODE" banner whenever this is on. Turn it
off only when real `META_*` credentials are configured.

## Documentation

- `docs/META_SETUP.md` — step-by-step Meta Developer / WhatsApp Business
  Account / webhook setup guide.

## Security considerations

- All dashboard routes and API routes require an authenticated session
  (enforced in `lib/auth/dal.ts`, with an optimistic redirect in
  `proxy.ts`).
- Meta credentials, database credentials, and Redis credentials are
  server-only environment variables and are never bundled into client code.
- Uploaded files are validated and size-limited before parsing.
- Audit logging (`lib/audit.ts`) records who did what, but never logs
  access tokens, app secrets, or passwords.
