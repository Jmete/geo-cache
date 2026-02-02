#!/usr/bin/env bash
set -euo pipefail

text="Riyadh, Saudi Arabia"
host_header="${HOST_HEADER:-api.geocache.dev}"
port="${PORT:-8787}"
url="${URL:-http://127.0.0.1:${port}/v1/geocode}"

while [ $# -gt 0 ]; do
  case "$1" in
    --host)
      host_header="${2:-}"
      shift 2
      ;;
    --localhost)
      host_header="localhost"
      shift 1
      ;;
    --url)
      url="${2:-}"
      shift 2
      ;;
    --port)
      port="${2:-}"
      url="http://127.0.0.1:${port}/v1/geocode"
      shift 2
      ;;
    --help|-h)
      echo "Usage: ./scripts/dev-geocode.sh [text] [--host HOST] [--localhost] [--url URL] [--port PORT]" >&2
      exit 0
      ;;
    *)
      text="$1"
      shift 1
      ;;
  esac
done

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

payload=$(node -e 'const text = process.argv[1] ?? ""; console.log(JSON.stringify({ text }));' "$text")

response=$(curl -sS -X POST "$url" \
  -H "Host: ${host_header}" \
  -H "content-type: application/json" \
  -H "x-api-key: ${API_KEY}" \
  -d "$payload" || true)

node -e '
const input = process.argv[1] ?? "";
try {
  const parsed = JSON.parse(input);
  console.log(JSON.stringify(parsed, null, 2));
} catch {
  process.stdout.write(input);
}
' "$response"
