import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from 'hono';
import app from './index';
import type { Env } from './env.d';
import { hashApiKey } from './auth/api-keys';

const apiKey = 'test-api-key';
const apiSecret = 'test-hmac-secret';
let keyHash = '';

beforeAll(async () => {
  keyHash = await hashApiKey(apiKey, apiSecret);
});

function createMockKv() {
  const store = new Map<string, string>();
  store.set(
    `api_key:${keyHash}`,
    JSON.stringify({ tier: 'basic', status: 'active' })
  );
  return {
    get: async (key: string, _type?: 'text') => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as KVNamespace;
}

function createEnv(): Env {
  return {
    ALLOWED_ORIGINS: 'https://allowed.example, https://other.example',
    API_KEY_HMAC_SECRET: apiSecret,
    GEONAMES_USERNAME: 'test-geonames',
    GEOCODE_RATE_LIMITER: {
      limit: async () => ({ success: true }),
    },
    DB: {} as D1Database,
    GEO_KV: createMockKv(),
  };
}

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

describe('geocode request validation', () => {
  it('returns 400 for invalid JSON', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: '{"text":',
    });

    const res = await app.fetch(req, createEnv(), ctx);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      },
    });
  });

  it('returns 400 for empty text', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ text: '' }),
    });

    const res = await app.fetch(req, createEnv(), ctx);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'TEXT_EMPTY',
        message: 'Field "text" cannot be empty',
      },
    });
  });

  it('returns 400 for overly long text', async () => {
    const longText = 'a'.repeat(513);
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ text: longText }),
    });

    const res = await app.fetch(req, createEnv(), ctx);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'TEXT_TOO_LONG',
        message: 'Field "text" exceeds maximum length of 512 characters',
        details: {
          maxLength: 512,
        },
      },
    });
  });

  it('returns 405 for wrong method', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
      },
    });

    const res = await app.fetch(req, createEnv(), ctx);
    const payload = await res.json();

    expect(res.status).toBe(405);
    expect(payload).toEqual({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed. Allowed methods: POST',
        details: {
          allowed: ['POST'],
        },
      },
    });
  });
});
