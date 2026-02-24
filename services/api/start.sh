#!/usr/bin/env sh

wait_for_db() {
  if [ -z "${DATABASE_URL:-}" ]; then
    return 0
  fi

  python - <<'PY'
import os
import time
import psycopg2

dsn = os.environ.get("DATABASE_URL")
if not dsn:
    raise SystemExit(0)

for attempt in range(1, 31):
    try:
        conn = psycopg2.connect(dsn)
        conn.close()
        print("Database connection ready.")
        raise SystemExit(0)
    except Exception as e:
        if attempt == 30:
            print(f"Database not ready after {attempt} attempts: {e}")
            raise
        time.sleep(1)
PY
}

wait_for_db

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "Running database migrations..."
  alembic upgrade head || {
    MIGRATION_EXIT=$?
    echo "Warning: Migrations exited with code $MIGRATION_EXIT"
    if [ -z "${DATABASE_URL:-}" ]; then
      echo "DATABASE_URL not configured - skipping migrations (optional)"
    else
      echo "DATABASE_URL is set but migrations failed. Check configuration."
      exit $MIGRATION_EXIT
    fi
  }
fi

if [ "${UVICORN_RELOAD:-0}" = "1" ]; then
  exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app
fi

exec uvicorn main:app --host 0.0.0.0 --port 8000
