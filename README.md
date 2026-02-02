# geo-cache

Cloudflare Worker geocoding API backed by GeoNames with D1 + KV caching.

Docs:
- `docs/api.md` - v1 API usage, response fields, and Next.js examples
- `docs/runbook.md` - operational setup, migrations, rate limiting, troubleshooting

## Local development

1) Create a `.dev.vars` file (gitignored):
```
API_KEY=your-dev-key
GEONAMES_USERNAME=your-geonames-user
ALLOW_LOCALHOST_HOSTS=true
LOG_GEOCODE_HITS=true
```

2) Start the worker:
```
wrangler dev
```

3) Call the API:
```
./scripts/dev-geocode.sh --localhost "Riyadh, Saudi Arabia"
```

Notes:
- `ALLOW_LOCALHOST_HOSTS` should only be set for local dev.
- `LOG_GEOCODE_HITS` is optional. When true, cache-hit events are recorded in D1.
- In production, use `wrangler secret put API_KEY` and `wrangler secret put GEONAMES_USERNAME`.
