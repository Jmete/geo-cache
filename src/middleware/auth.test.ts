import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from 'hono';
import app from '../index';
import type { Env } from '../env.d';

const baseEnv: Env = {
  ALLOWED_ORIGINS: 'https://allowed.example, https://other.example',
  API_KEY: 'test-api-key',
  GEONAMES_USERNAME: 'test-geonames',
  GEOCODE_RATE_LIMITER: {
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

describe('authMiddleware', () => {
  it('allows /health without API key', async () => {
    const req = new Request('https://api.geocache.dev/health', { method: 'GET' });

    const res = await app.fetch(req, baseEnv, ctx);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('rejects /v1/geocode without API key', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'Riyadh' }),
    });

    const res = await app.fetch(req, baseEnv, ctx);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload).toEqual({
      error: {
        code: 'MISSING_API_KEY',
        message: 'Missing required header: x-api-key',
      },
    });
  });

  it('rejects /v1/geocode with invalid API key', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'wrong-key',
      },
      body: JSON.stringify({ text: 'Riyadh' }),
    });

    const res = await app.fetch(req, baseEnv, ctx);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload).toEqual({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
  });

  it('allows /v1/geocode with valid API key', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key',
      },
      body: JSON.stringify({ text: '' }),
    });

    const res = await app.fetch(req, baseEnv, ctx);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'TEXT_EMPTY',
        message: 'Field "text" cannot be empty',
      },
    });
  });
});
