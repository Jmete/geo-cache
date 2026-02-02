# Geo-Cache API (v1)

## Overview

- Endpoint: `POST /v1/geocode`
- Auth: `x-api-key` header required for all `/v1/*` routes
- Content-Type: `application/json`
- CORS: allowlist enforced by `ALLOWED_ORIGINS`

## Request

```
{
  "text": "Riyadh, Saudi Arabia"
}
```

Rules:
- `text` is required and must be 1-512 characters.
- Missing/empty/invalid JSON returns a 400 error with a standard error body.

## Response (success)

```
{
  "input": {
    "raw": "Riyadh, Saudi Arabia",
    "normalizedKey": "SA||riyadh|"
  },
  "canonical": {
    "countryIso2": "SA",
    "countryName": "Saudi Arabia",
    "admin1": "Riyadh Region",
    "city": "Riyadh",
    "displayName": "Riyadh, Riyadh Region, Saudi Arabia"
  },
  "granularity": "city",
  "point": { "lat": 24.6877, "lon": 46.7219 },
  "bbox": [46.5, 24.5, 47.1, 24.9],
  "confidence": 0.92,
  "flags": {
    "ambiguous": false,
    "adminMismatch": false,
    "providerFallback": false,
    "multiArea": false
  },
  "provider": "geonames",
  "cache": { "hit": false }
}
```

Notes:
- `point`/`bbox` can be omitted if not available.
- `confidence` is always clamped to `[0,1]`.
- `cache.hit=true` on KV/D1 cache hits.

## Response (error)

```
{
  "error": {
    "code": "MISSING_TEXT",
    "message": "text is required"
  }
}
```

Status codes include: 400, 401, 403, 405, 429, 500, 502. Retryable errors are 429 and 502.

## Next.js usage example

Server action (App Router):

```
'use server'

export async function geocode(text: string) {
  const res = await fetch(process.env.GEOCODE_URL ?? 'https://api.geocache.dev/v1/geocode', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.GEOCODE_API_KEY ?? ''
    },
    body: JSON.stringify({ text })
  })

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(`Geocode failed (${res.status}) ${JSON.stringify(errorBody)}`)
  }

  return res.json()
}
```

Route handler (App Router) alternative:

```
export async function POST(req: Request) {
  const { text } = await req.json()

  const res = await fetch('https://api.geocache.dev/v1/geocode', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.GEOCODE_API_KEY ?? ''
    },
    body: JSON.stringify({ text })
  })

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'content-type': 'application/json' }
  })
}
```

## Rendering rules by granularity

- `city`: render a city marker at `point`. Label using `canonical.displayName`.
- `region`: render a region marker at `point` (if available); label as `"Region, Country"`.
- `country`: render a country marker at `point` (country centroid when available).
- `multi`: render a country-level marker and show a "Multiple Areas" disclaimer; do not imply a specific city.

When `flags.ambiguous=true`, consider a lower-confidence UI treatment (lighter marker, tooltip, or explicit warning).

## Caching expectations

- The first successful resolution is persisted in D1 and written to KV.
- Subsequent calls with the same normalized input return the cached response deterministically.
- `cache.hit=true` indicates KV or D1 cached results.
