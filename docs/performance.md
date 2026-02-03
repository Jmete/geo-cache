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
Use `--pace-ms` if you are close to rate limits.

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

## Rate-limit friendly runs

If your rate limit is 50 requests per 10 seconds, add pacing:
```
API_KEY=your-key node scripts/perf-geocode.mjs \
  --url https://api.example.com/v1/geocode \
  --origin https://app.example.com \
  --text "Riyadh, Saudi Arabia" \
  --runs 50 \
  --warmup 1 \
  --concurrency 1 \
  --pace-ms 200
```

## Cold provider runs with multiple inputs

To avoid cache deletes, provide a file of unique inputs:
```
API_KEY=your-key node scripts/perf-geocode.mjs \
  --url https://api.example.com/v1/geocode \
  --origin https://app.example.com \
  --inputs-file inputs.txt \
  --runs 15 \
  --warmup 0 \
  --concurrency 1 \
  --pace-ms 200
```
Each non-empty line in the file is treated as one input; lines starting with `#`
are ignored.

## Results log (fill in)

| Date | Env | Scenario | Runs | p50 | p95 | p99 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-02-02 | production | KV | 50 | 95.2 | 102.5 | 109.8 | 49/50 ok; 1x 429 rate limit |
| 2026-02-03 | production | D1 | 15 | 331.3 | 419.7 | 419.7 | KV cleared each run; D1 hit confirmed |
| 2026-02-03 | production | provider | 15 | 320.7 | 1178.9 | 1178.9 | unique inputs file; cache misses |
