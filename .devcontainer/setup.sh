#!/usr/bin/env bash
# Runs once, when the Codespace/devcontainer is first created.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Enabling pnpm"
corepack enable 2>/dev/null || sudo corepack enable

echo "==> Installing dependencies"
pnpm install

echo "==> Creating .env (if it doesn't exist yet)"
if [ ! -f .env ]; then
  cp .env.example .env
  # Generate a real random session secret instead of the placeholder.
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  sed -i "s#^NEXTAUTH_SECRET=.*#NEXTAUTH_SECRET=\"$SECRET\"#" .env
  # Skip the login page for this preview Codespace. Codespaces ports
  # default to "Private" (only you, signed into GitHub, can open the
  # forwarded URL), which is what makes this safe here — do NOT copy
  # this setting anywhere with a public URL. If you ever make this
  # Codespace's port Public, set DISABLE_AUTH back to "false" in .env
  # and restart `pnpm dev`.
  sed -i 's#^DISABLE_AUTH=.*#DISABLE_AUTH="true"#' .env
fi

echo "==> Starting Postgres + Redis"
docker compose up -d postgres redis

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> Applying database migrations"
pnpm db:migrate:deploy

echo "==> Seeding the database (admin user + default pricing)"
pnpm db:seed || echo "(seed skipped — already seeded, or check ADMIN_EMAIL/ADMIN_PASSWORD in .env)"

echo "==> Setup complete. The app and worker will start automatically."
