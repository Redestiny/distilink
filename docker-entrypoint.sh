#!/bin/sh
set -eu

mkdir -p /app/data
chown -R nextjs:nextjs /app/data

su-exec nextjs:nextjs node /app/scripts/migrate.mjs
exec dumb-init su-exec nextjs:nextjs node /app/server.js
