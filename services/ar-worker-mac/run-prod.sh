#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

API_BASE="${MENUVIUM_API_BASE:-}"
WORKER_TOKEN="${MENUVIUM_WORKER_TOKEN:-}"
QUALITY="${MENUVIUM_AR_QUALITY:-high}"
CROP="${MENUVIUM_AR_CROP:-}"
WHITE_BG="${MENUVIUM_AR_WHITE_BG:-0}"
PREFLIGHT="${MENUVIUM_AR_PREFLIGHT:-1}"
FRAME_STRIDE="${MENUVIUM_AR_FRAME_STRIDE:-1}"
PLACEHOLDER_FALLBACK="${MENUVIUM_AR_PLACEHOLDER_FALLBACK:-1}"

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

PLACEHOLDER_FALLBACK_LABEL="on"
PLACEHOLDER_FALLBACK_NORM=$(printf '%s' "${PLACEHOLDER_FALLBACK}" | tr '[:upper:]' '[:lower:]')
case "${PLACEHOLDER_FALLBACK_NORM}" in
  0|false|no|off)
    PLACEHOLDER_FALLBACK_LABEL="off"
    ;;
esac

if [[ "${PLACEHOLDER_FALLBACK_LABEL}" == "on" ]]; then
  if ! command -v usdzip >/dev/null 2>&1; then
    echo "Missing required tool in PATH: usdzip (needed for placeholder fallback)" >&2
    exit 1
  fi
fi

echo "Building worker (release)..."
swift build -c release

echo "Tip: close this terminal to stop the worker."

WHITE_BG_LABEL="off"
WHITE_BG_NORM=$(printf '%s' "${WHITE_BG}" | tr '[:upper:]' '[:lower:]')
case "${WHITE_BG_NORM}" in
  1|true|yes|on)
    WHITE_BG_LABEL="on"
    ;;
esac

PREFLIGHT_LABEL="on"
PREFLIGHT_NORM=$(printf '%s' "${PREFLIGHT}" | tr '[:upper:]' '[:lower:]')
case "${PREFLIGHT_NORM}" in
  0|false|no|off)
    PREFLIGHT_LABEL="off"
    ;;
esac

CMD=(.build/release/menuvium-ar-worker --api-base "${API_BASE}" --token "${WORKER_TOKEN}" --quality "${QUALITY}" --frame-stride "${FRAME_STRIDE}")

if [[ -n "${CROP}" ]]; then
  CMD+=(--crop "${CROP}")
fi
if [[ "${WHITE_BG_LABEL}" == "on" ]]; then
  CMD+=(--white-bg)
fi
if [[ "${PREFLIGHT_LABEL}" == "off" ]]; then
  CMD+=(--skip-preflight)
fi
if [[ "${PLACEHOLDER_FALLBACK_LABEL}" == "off" ]]; then
  CMD+=(--no-placeholder-fallback)
fi

if [[ -n "${CROP}" ]]; then
  echo "Starting worker (quality: ${QUALITY}, crop: ${CROP}, frame-stride: ${FRAME_STRIDE}, white-bg: ${WHITE_BG_LABEL}, preflight: ${PREFLIGHT_LABEL}, placeholder-fallback: ${PLACEHOLDER_FALLBACK_LABEL})..."
else
  echo "Starting worker (quality: ${QUALITY}, frame-stride: ${FRAME_STRIDE}, white-bg: ${WHITE_BG_LABEL}, preflight: ${PREFLIGHT_LABEL}, placeholder-fallback: ${PLACEHOLDER_FALLBACK_LABEL})..."
fi

exec caffeinate -dimsu -- "${CMD[@]}"
