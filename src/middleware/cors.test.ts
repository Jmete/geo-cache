import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from 'hono';
import app from '../index';
import type { Env } from '../env.d';

const baseEnv: Env = {
  ALLOWED_ORIGINS: 'https://allowed.example, https://other.example',
  API_KEY_HMAC_SECRET: 'test-hmac-secret',
  GEONAMES_USERNAME: 'test-geonames',
  GEOCODE_RATE_LIMITER_DEMO: {
    limit: async () => ({ success: true }),
  },
  GEOCODE_RATE_LIMITER_BASIC: {
    limit: async () => ({ success: true }),
  },
  GEOCODE_RATE_LIMITER_PRO: {
    limit: async () => ({ success: true }),
  },
  GEOCODE_RATE_LIMITER_SCALE: {
    limit: async () => ({ success: true }),
  },
  DB: {} as D1Database,
  GEO_KV: {} as KVNamespace,
};

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

describe('corsMiddleware', () => {
  it('allows preflight for allowed origin', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://allowed.example',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const res = await app.fetch(req, baseEnv, ctx);

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET,POST,OPTIONS');
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('content-type,x-api-key');
  });

  it('rejects preflight for disallowed origin', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    });

    const res = await app.fetch(req, baseEnv, ctx);

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('sets CORS headers for allowed origin on normal requests', async () => {
    const req = new Request('https://api.geocache.dev/health', {
      method: 'GET',
      headers: {
        Origin: 'https://allowed.example',
      },
    });

    const res = await app.fetch(req, baseEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://allowed.example');
  });

  it('rejects disallowed origin without CORS headers', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'Riyadh' }),
    });

    const res = await app.fetch(req, baseEnv, ctx);
    const payload = await res.json();

    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(payload).toEqual({
      error: {
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Origin not allowed',
      },
    });
  });

  it('skips CORS headers when Origin is missing', async () => {
    const req = new Request('https://api.geocache.dev/health', {
      method: 'GET',
    });

    const res = await app.fetch(req, baseEnv, ctx);

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
