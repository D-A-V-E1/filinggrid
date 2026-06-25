#!/bin/sh
set -e
# Run Alembic migrations before serving traffic (idempotent).
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Running alembic upgrade head..."
  alembic upgrade head || echo "[entrypoint] WARN: migration failed - check DATABASE_URL"
fi
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
