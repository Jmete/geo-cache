# Performance Targets and Validation

This document defines baseline performance targets for the geo-cache Worker
and provides a repeatable validation workflow. Update targets and record
results for each environment (local, staging, production).

## Baseline targets (p95)

These are initial targets for Cloudflare Workers. Adjust after real-world
measurements in your environment.

| Scenario | Target (p95) | Notes |
| --- | --- | --- |
| KV cache hit | <= 50 ms | Fast path for interactive map usage. |
| D1 cache hit | <= 150 ms | Allows stable reads under moderate load. |
| Provider call | <= 1500 ms | GeoNames latency varies; bound by 7s timeout. |

## Validation workflow

### 1) Start the Worker

Local:
```
wrangler dev
```

Staging/Production: deploy and note the endpoint URL.

### 2) Run performance checks

Run the benchmark script (requires an API key):
```
API_KEY=your-key node scripts/perf-geocode.mjs \
  --url https://api.example.com/v1/geocode \
  --origin https://app.example.com \
  --text "Riyadh, Saudi Arabia" \
  --runs 50 \
  --warmup 1 \
  --concurrency 1
```

The script prints p50/p95/p99, cache hit counts, and the normalized key.

### 3) KV hit validation

1) Run once to warm caches.
2) Re-run the script and confirm `cache.hit=true` for most responses.
3) Record the p95 in the results log below.

### 4) D1 hit validation

1) Run once to populate D1.
2) Delete the KV entry using the normalized key from the script output:
```
wrangler kv:key delete --namespace-id <KV_NAMESPACE_ID> "<normalizedKey>" --remote
```
3) Re-run the script; use `wrangler tail` to confirm `geocode.cache_hit` with
   `cache: d1`.
4) Record the p95 in the results log below.

### 5) Provider call validation

1) Ensure both KV and D1 are clear for the input:
```
wrangler d1 execute <DB_NAME> --remote \
  --command="DELETE FROM geocode_cache WHERE input_norm_key='<normalizedKey>';"
```
2) Run the script again and confirm `cache.hit=false` and a
   `geocode.provider_call` log entry.
3) Record the p95. Confirm requests are bounded by the GeoNames timeout (7s).

## Results log (fill in)

| Date | Env | Scenario | Runs | p50 | p95 | p99 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | local | KV | 50 | | | | |
| YYYY-MM-DD | local | D1 | 50 | | | | |
| YYYY-MM-DD | local | provider | 50 | | | | |
