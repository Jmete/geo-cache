# Live Smoke Tests

Use this runbook to execute the live GeoNames smoke tests (PRD F039) and
capture golden outputs for regression comparison.

## Prerequisites

- A deployed Worker endpoint (production or staging).
- A valid API key for the environment.
- An allowed Origin (optional, only needed if you want CORS headers).

## Run the smoke test

1) Set environment variables:
```
export GEOCODE_URL="https://api.geocache.dev/v1/geocode"
export API_KEY="<your-api-key>"
# Optional
export GEOCODE_ORIGIN="https://app.example.com"
```

2) Run the script:
```
node scripts/smoke-geocode.mjs \
  --inputs-file fixtures/smoke-inputs.txt \
  --out fixtures/smoke-outputs-YYYYMMDD.json
```

3) Review the output JSON:
- Ensure at least 15 inputs ran and responses look reasonable.
- Verify at least 3 ambiguous cases were flagged.
- Commit the output file as a golden baseline (provider data can change over
  time, so note the run date).

## Notes

- Default output path is `fixtures/smoke-outputs-YYYYMMDD.json`.
- Use `--pace-ms` to slow down requests if rate limiting is triggered.
- Use `--origin` if you want to validate CORS headers in the response.
