# Operational Runbook

This runbook covers runtime configuration, migrations, rate limiting, and
troubleshooting for the geo-cache Worker.

## Configuration checklist

Bindings (wrangler.toml):
- D1: `DB`
- KV: `GEO_KV`
- Rate limiter: `GEOCODE_RATE_LIMITER`

Vars (wrangler.toml):
- `ALLOWED_ORIGINS` (comma-separated list, no spaces)
- `ALLOW_LOCALHOST_HOSTS` (optional, dev only)
- `LOG_GEOCODE_HITS` (optional)

Secrets (wrangler secret put):
- `GEONAMES_USERNAME`
- `API_KEY`

## Secrets and variables

Set secrets (per environment):
```
wrangler secret put GEONAMES_USERNAME
wrangler secret put API_KEY
```

Set vars in `wrangler.toml` (or env-specific files):
```
[vars]
ALLOWED_ORIGINS = "https://app.example.com,https://www.app.example.com"
# ALLOW_LOCALHOST_HOSTS = "true"  # dev only
# LOG_GEOCODE_HITS = "true"        # optional
```

## D1 migrations

Local migrations:
```
npm run d1:migrate
```

Remote migrations:
```
npm run d1:migrate:staging
npm run d1:migrate:production
```

Verify tables:
```
wrangler d1 execute geo-cache-db --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

## Rate limiting

The Worker enforces rate limiting for `POST /v1/geocode` using the
`GEOCODE_RATE_LIMITER` binding. Configure limits per environment in
`wrangler.toml`:
```
[[ratelimits]]
name = "GEOCODE_RATE_LIMITER"
namespace_id = "1001"

[ratelimits.simple]
limit = 60
period = 60
```

When rate limited, the API returns HTTP 429 with
`{ error: { code: "RATE_LIMITED" } }`.
Adjust thresholds based on GeoNames quotas and expected traffic.

If you also configure a Cloudflare WAF rate limiting rule, ensure it uses
`x-api-key` as the key and (when possible) returns the standard 429 JSON
body to preserve API contract consistency.

## Logs and events

Structured logs (use `wrangler tail`) include:
- `request.start` / `request.complete` with `requestId`, `status`, `durationMs`
- `request.error` with categories: `auth`, `cors`, `validation`,
  `method_not_allowed`, `rate_limit`, `internal`
- `geocode.cache_hit` with `cache: kv|d1`
- `geocode.provider_call` and `geocode.provider_error`
- `geocode.fallback` for country-unresolved or relaxed-provider cases
- `geocode.event_error` if D1 event recording fails

Event logging (`geocode_events` table):
- Statuses: `hit`, `miss`, `resolved`, `ambiguous`, `error`
- Hit events are recorded only when `LOG_GEOCODE_HITS=true`
- `provider_response` is truncated to 2048 characters

## Troubleshooting

- 401 MISSING_API_KEY / INVALID_API_KEY:
  - Verify `API_KEY` secret is set and clients send `x-api-key`.
- 403 ORIGIN_NOT_ALLOWED:
  - Confirm the Origin is in `ALLOWED_ORIGINS` and has no extra spaces.
- 429 RATE_LIMITED:
  - Check rate limit configuration and adjust thresholds if needed.
- 502 PROVIDER_TIMEOUT / PROVIDER_ERROR:
  - Verify `GEONAMES_USERNAME` and GeoNames availability.
  - Check logs for `geocode.provider_error` and timeout category.
- D1 errors:
  - Re-run migrations and confirm tables exist.
- Cache discrepancies:
  - Confirm KV/D1 bindings are present and D1 rows exist for the key.
