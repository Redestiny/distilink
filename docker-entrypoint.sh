#!/bin/sh
set -eu

APP_PORT="${PORT:-3000}"
APP_HEALTH_URL="http://127.0.0.1:${APP_PORT}/api/health"
APP_CRON_URL="http://127.0.0.1:${APP_PORT}/api/cron/init"
APP_PID=""

cleanup() {
  if [ -n "${APP_PID}" ] && kill -0 "${APP_PID}" 2>/dev/null; then
    kill -TERM "${APP_PID}" 2>/dev/null || true
    wait "${APP_PID}" 2>/dev/null || true
  fi
}

trap cleanup INT TERM

mkdir -p /app/data
chown -R nextjs:nextjs /app/data

echo "[Entrypoint] Running database migrations"
gosu nextjs:nextjs node /app/scripts/migrate.mjs

echo "[Entrypoint] Starting application server"
gosu nextjs:nextjs node /app/server.js &
APP_PID=$!

attempts=60
until wget --no-verbose --tries=1 --spider "${APP_HEALTH_URL}" >/dev/null 2>&1; do
  if ! kill -0 "${APP_PID}" 2>/dev/null; then
    wait "${APP_PID}"
    exit $?
  fi

  attempts=$((attempts - 1))
  if [ "${attempts}" -le 0 ]; then
    echo "[Entrypoint] Application did not become healthy in time"
    cleanup
    exit 1
  fi

  sleep 2
done

echo "[Entrypoint] Initializing cron jobs"
if ! wget --no-verbose --tries=1 -O - "${APP_CRON_URL}" >/dev/null 2>&1; then
  echo "[Entrypoint] Failed to initialize cron jobs"
  cleanup
  exit 1
fi

wait "${APP_PID}"
