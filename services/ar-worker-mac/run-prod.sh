#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

API_BASE="${MENUVIUM_API_BASE:-}"
WORKER_TOKEN="${MENUVIUM_WORKER_TOKEN:-}"
QUALITY="${MENUVIUM_AR_QUALITY:-high}"
CROP="${MENUVIUM_AR_CROP:-}"

if [[ -z "${API_BASE}" || -z "${WORKER_TOKEN}" ]]; then
  cat >&2 <<'EOF'
Missing configuration.

Set:
  - MENUVIUM_API_BASE (recommended: https://api.menuvium.com)
  - MENUVIUM_WORKER_TOKEN (same value as Railway API env var AR_WORKER_TOKEN)

Example:
  export MENUVIUM_API_BASE="https://api.menuvium.com"
  export MENUVIUM_WORKER_TOKEN="..."
  ./run-prod.sh
EOF
  exit 1
fi

for tool in ffmpeg npx usdextract swift; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Missing required tool in PATH: $tool" >&2
    exit 1
  fi
done

echo "Building worker (release)..."
swift build -c release

if [[ -n "${CROP}" ]]; then
  echo "Starting worker (quality: ${QUALITY}, crop: ${CROP})..."
else
  echo "Starting worker (quality: ${QUALITY})..."
fi
echo "Tip: close this terminal to stop the worker."
crop_args=()
if [[ -n "${CROP}" ]]; then
  crop_args=(--crop "${CROP}")
fi
exec caffeinate -dimsu -- .build/release/menuvium-ar-worker --api-base "${API_BASE}" --token "${WORKER_TOKEN}" --quality "${QUALITY}" "${crop_args[@]}"
