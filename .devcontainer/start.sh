#!/usr/bin/env bash
# Runs every time the Codespace/devcontainer starts (including right after
# setup.sh on first creation, and again whenever you resume it later).
cd "$(dirname "$0")/.."

echo "==> Starting Postgres + Redis"
docker compose up -d postgres redis >/tmp/docker-compose.log 2>&1

# Don't double-start the app/worker if they're already running (e.g. VS
# Code reattaching without a full container restart).
if ! pgrep -f "next dev" >/dev/null 2>&1; then
  echo "==> Starting the app (logs: /tmp/dev.log)"
  nohup pnpm dev >/tmp/dev.log 2>&1 &
fi

if ! pgrep -f "lib/queue/worker.ts" >/dev/null 2>&1; then
  echo "==> Starting the message worker (logs: /tmp/worker.log)"
  nohup pnpm worker >/tmp/worker.log 2>&1 &
fi

echo "==> Ready. Once it's up, Codespaces will prompt to open port 3000 in your browser."
echo "    (Or open the 'Ports' tab next to the Terminal panel and click the globe icon on 3000.)"
