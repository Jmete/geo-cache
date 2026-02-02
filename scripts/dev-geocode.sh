#!/usr/bin/env bash
set -euo pipefail

text=${1:-Riyadh, Saudi Arabia}

if [ -f .dev.vars ]; then
  set -a
  # shellcheck disable=SC1091
  source .dev.vars
  set +a
fi

if [ -z "${API_KEY:-}" ]; then
  echo "API_KEY is not set. Add it to .dev.vars or export it before running." >&2
  exit 1
fi

host_header=${HOST_HEADER:-api.geocache.dev}
port=${PORT:-8787}
url=${URL:-http://127.0.0.1:${port}/v1/geocode}

payload=$(node -e 'const text = process.argv[1] ?? ""; console.log(JSON.stringify({ text }));' "$text")

curl -sS -X POST "$url" \
  -H "Host: ${host_header}" \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "$payload"
