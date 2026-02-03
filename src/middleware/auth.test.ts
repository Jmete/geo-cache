import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from 'hono';
import app from '../index';
import type { Env } from '../env.d';
import { hashApiKey } from '../auth/api-keys';

const apiKey = 'test-api-key';
const apiSecret = 'test-hmac-secret';
const apiTier = 'basic';
let keyHash = '';

beforeAll(async () => {
  keyHash = await hashApiKey(apiKey, apiSecret);
});

function createMockKv(includeKey: boolean) {
  const store = new Map<string, string>();
  if (includeKey) {
    store.set(
      `api_key:${keyHash}`,
      JSON.stringify({ tier: apiTier, status: 'active' })
    );
  }
  return {
    get: async (key: string, _type?: 'text') => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as KVNamespace;
}

function createMockD1(records?: Map<string, { tier: string; status: string }>) {
  const rows = records ?? new Map<string, { tier: string; status: string }>();
  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => {
        if (sql.includes('SELECT') && sql.includes('api_keys')) {
          return {
            first: async <T>() => {
              const hash = bindings[0] as string;
              return (rows.get(hash) ?? null) as T | null;
            },
          };
        }
        return {
          run: async () => ({ success: true }),
        };
      },
    }),
  } as unknown as D1Database;

  return db;
}

function createEnv(kv: KVNamespace, db: D1Database): Env {
  return {
    ALLOWED_ORIGINS: 'https://allowed.example, https://other.example',
    API_KEY_HMAC_SECRET: apiSecret,
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
    DB: db,
    GEO_KV: kv,
  };
}

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

describe('authMiddleware', () => {
  it('allows /health without API key', async () => {
    const req = new Request('https://api.geocache.dev/health', { method: 'GET' });

    const res = await app.fetch(req, createEnv(createMockKv(false), createMockD1()), ctx);

    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      status?: string;
      uptimeMs?: number;
      timestamp?: string;
    };

    expect(payload.status).toBe('ok');
    expect(typeof payload.uptimeMs).toBe('number');
    expect(payload.uptimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof payload.timestamp).toBe('string');
    const timestamp = payload.timestamp ?? '';
    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
  });

  it('rejects /v1/geocode without API key', async () => {
    const req = new Request('https://api.geocache.dev/v1/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'Riyadh' }),
    });

    const res = await app.fetch(req, createEnv(createMockKv(false), createMockD1()), ctx);
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

    const res = await app.fetch(req, createEnv(createMockKv(false), createMockD1()), ctx);
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
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ text: '' }),
    });

    const res = await app.fetch(req, createEnv(createMockKv(true), createMockD1()), ctx);
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
