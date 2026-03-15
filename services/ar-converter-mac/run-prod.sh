#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

load_env_file() {
  local env_file="$1"
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
  fi
}

load_env_file ".env"
load_env_file ".env.local"

API_BASE="${MENUVIUM_API_BASE:-}"
WORKER_TOKEN="${MENUVIUM_AR_CONVERTER_TOKEN:-}"
KIRI_API_KEY_VALUE="${KIRI_API_KEY:-}"
POLL_SECONDS="${MENUVIUM_AR_CONVERTER_POLL_SECONDS:-5}"

if [[ -z "${API_BASE}" ]]; then
  echo "Missing MENUVIUM_API_BASE" >&2
  exit 1
fi

if [[ -z "${WORKER_TOKEN}" ]]; then
  echo "Missing MENUVIUM_AR_CONVERTER_TOKEN" >&2
  exit 1
fi

if [[ -z "${KIRI_API_KEY_VALUE}" ]]; then
  echo "Missing KIRI_API_KEY" >&2
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "Missing required tool in PATH: npx" >&2
  exit 1
fi

if ! command -v usdextract >/dev/null 2>&1; then
  echo "Missing required tool in PATH: usdextract" >&2
  exit 1
fi

if command -v caffeinate >/dev/null 2>&1; then
  CAFFEINATE=(caffeinate -dimsu)
else
  CAFFEINATE=()
fi

swift build -c release

CMD=(
  .build/release/menuvium-ar-converter
  --api-base "${API_BASE}"
  --token "${WORKER_TOKEN}"
  --kiri-api-key "${KIRI_API_KEY_VALUE}"
  --poll-seconds "${POLL_SECONDS}"
)

if [[ ${#CAFFEINATE[@]} -gt 0 ]]; then
  exec "${CAFFEINATE[@]}" "${CMD[@]}"
fi

exec "${CMD[@]}"
