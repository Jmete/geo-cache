# geo-cache

Cloudflare Worker geocoding API backed by GeoNames with D1 + KV caching.

## Local development

1) Create a `.dev.vars` file (gitignored):
```
API_KEY=your-dev-key
GEONAMES_USERNAME=your-geonames-user
ALLOW_LOCALHOST_HOSTS=true
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
- In production, use `wrangler secret put API_KEY` and `wrangler secret put GEONAMES_USERNAME`.
