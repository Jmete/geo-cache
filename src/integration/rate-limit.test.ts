import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from 'hono';
import type { Env } from '../env.d';
import app from '../index';
import { hashApiKey } from '../auth/api-keys';

const apiSecret = 'test-hmac-secret';
const demoKey = 'demo-key';
const scaleKey = 'scale-key';
const revokedKey = 'revoked-key';
const invalidKey = 'invalid-key';
let demoHash = '';
let scaleHash = '';
let revokedHash = '';

beforeAll(async () => {
  demoHash = await hashApiKey(demoKey, apiSecret);
  scaleHash = await hashApiKey(scaleKey, apiSecret);
  revokedHash = await hashApiKey(revokedKey, apiSecret);
});

function createMockKv() {
  const store = new Map<string, string>([
    [`api_key:${demoHash}`, JSON.stringify({ tier: 'demo', status: 'active' })],
    [`api_key:${scaleHash}`, JSON.stringify({ tier: 'scale', status: 'active' })],
  ]);

  return {
    get: async (key: string, _type?: 'text') => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as KVNamespace;
}

function createMockD1() {
  const records = new Map<string, { tier: string; status: string }>([
    [revokedHash, { tier: 'basic', status: 'revoked' }],
  ]);

  const db = {
    prepare: (sql: string) => ({
      bind: (...bindings: unknown[]) => {
        if (sql.includes('SELECT') && sql.includes('api_keys')) {
          return {
            first: async <T>() => {
              const hash = bindings[0] as string;
              return (records.get(hash) ?? null) as T | null;
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

function createEnv(limiters: {
  demoSuccess: boolean;
  scaleSuccess: boolean;
}): Env {
  const calls = {
    demo: 0,
    basic: 0,
    pro: 0,
    scale: 0,
  };

  const env: Env = {
    ALLOWED_ORIGINS: 'https://allowed.example',
    API_KEY_HMAC_SECRET: apiSecret,
    GEONAMES_USERNAME: 'test-geonames',
    GEOCODE_RATE_LIMITER_DEMO: {
      limit: async () => {
        calls.demo += 1;
        return { success: limiters.demoSuccess };
      },
    },
    GEOCODE_RATE_LIMITER_BASIC: {
      limit: async () => {
        calls.basic += 1;
        return { success: true };
      },
    },
    GEOCODE_RATE_LIMITER_PRO: {
      limit: async () => {
        calls.pro += 1;
        return { success: true };
      },
    },
    GEOCODE_RATE_LIMITER_SCALE: {
      limit: async () => {
        calls.scale += 1;
        return { success: limiters.scaleSuccess };
      },
    },
    DB: createMockD1(),
    GEO_KV: createMockKv(),
  };

  return Object.assign(env, { __calls: calls });
}

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

function createRequest(key: string): Request {
  return new Request('https://api.geocache.dev/v1/geocode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify({ text: '' }),
  });
}

describe('F049: tiered rate limiting', () => {
  it('uses demo limiter and returns 429 when demo tier is limited', async () => {
    const env = createEnv({ demoSuccess: false, scaleSuccess: true }) as Env & {
      __calls: Record<string, number>;
    };

    const res = await app.fetch(createRequest(demoKey), env, ctx);
    const payload = await res.json();

    expect(res.status).toBe(429);
    expect(payload).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please retry later.',
      },
    });
    expect(env.__calls.demo).toBe(1);
    expect(env.__calls.scale).toBe(0);
  });

  it('uses scale limiter when key tier is scale', async () => {
    const env = createEnv({ demoSuccess: true, scaleSuccess: true }) as Env & {
      __calls: Record<string, number>;
    };

    const res = await app.fetch(createRequest(scaleKey), env, ctx);
    const payload = await res.json();

    expect(res.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: 'TEXT_EMPTY',
        message: 'Field "text" cannot be empty',
      },
    });
    expect(env.__calls.scale).toBe(1);
    expect(env.__calls.demo).toBe(0);
  });

  it('returns 401 for revoked keys', async () => {
    const env = createEnv({ demoSuccess: true, scaleSuccess: true }) as Env & {
      __calls: Record<string, number>;
    };

    const res = await app.fetch(createRequest(revokedKey), env, ctx);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload).toEqual({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
    expect(env.__calls.demo).toBe(0);
    expect(env.__calls.scale).toBe(0);
  });

  it('returns 401 for invalid keys', async () => {
    const env = createEnv({ demoSuccess: true, scaleSuccess: true }) as Env & {
      __calls: Record<string, number>;
    };

    const res = await app.fetch(createRequest(invalidKey), env, ctx);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(payload).toEqual({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      },
    });
    expect(env.__calls.demo).toBe(0);
    expect(env.__calls.scale).toBe(0);
  });
});
