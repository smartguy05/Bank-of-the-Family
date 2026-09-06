#!/bin/sh
# Builds (if needed), migrates a dedicated e2e database and starts the API serving the web build.
set -e
cd "$(dirname "$0")/.."
export DATABASE_URL="${DATABASE_URL_E2E:-postgres://botf:botf@127.0.0.1:5432/botf_e2e}"
ADMIN_URL="$(echo "$DATABASE_URL" | sed 's#/[^/]*$#/postgres#')"
DB_NAME="$(echo "$DATABASE_URL" | sed 's#.*/##')"
if command -v psql >/dev/null 2>&1; then
  psql "$ADMIN_URL" -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || psql "$ADMIN_URL" -c "CREATE DATABASE $DB_NAME"
fi
[ -f apps/web/dist/index.html ] || pnpm --filter @botf/web build
[ -f apps/api/dist/server.js ] || pnpm --filter @botf/api build
pnpm --filter @botf/api db:migrate
exec env NODE_ENV=development LOG_LEVEL=warn DEV_LOGIN_ENABLED=true SCHEDULER_ENABLED=false \
  AUTH_RATE_LIMIT_MAX=1000 \
  PORT=3100 APP_URL=http://127.0.0.1:3100 WEB_DIST_DIR="$(pwd)/apps/web/dist" \
  SESSION_SECRET=e2e-session-secret-e2e-session-secret-0000 \
  node apps/api/dist/server.js
