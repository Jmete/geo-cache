import { describe, expect, it, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import type { ExecutionContext } from 'hono';
import type { Env } from '../env.d';
import type { GeocodeResponse } from '../types/api';
import app from '../index';
import { hashApiKey } from '../auth/api-keys';

const apiKey = 'test-api-key';
const apiSecret = 'test-hmac-secret';
let keyHash = '';

beforeAll(async () => {
  keyHash = await hashApiKey(apiKey, apiSecret);
});

function createMockKv(includeApiKey = false) {
  const store = new Map<string, string>();
  if (includeApiKey) {
    store.set(
      `api_key:${keyHash}`,
      JSON.stringify({ tier: 'basic', status: 'active' })
    );
  }
  const kv = {
    get: async (key: string, _type?: 'text') => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as unknown as KVNamespace;

  return { kv };
}

function createMockD1() {
  const db = {
    prepare: (sql: string) => ({
      bind: () => {
        if (sql.includes('SELECT') && sql.includes('api_keys')) {
          return {
            first: async <T>() => null as T | null,
          };
        }
        if (sql.includes('SELECT') && sql.includes('geocode_cache')) {
          return {
            first: async <T>() => null as T | null,
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

function createEnv(options?: {
  rateLimitSuccess?: boolean;
  includeApiKey?: boolean;
}): Env {
  const { kv } = createMockKv(options?.includeApiKey);
  const db = createMockD1();
  const limiterSuccess = options?.rateLimitSuccess ?? true;
  return {
    ALLOWED_ORIGINS: 'https://allowed.example, https://other.example',
    API_KEY_HMAC_SECRET: apiSecret,
    GEONAMES_USERNAME: 'test-geonames',
    GEOCODE_RATE_LIMITER_DEMO: {
      limit: async () => ({ success: true }),
    },
    GEOCODE_RATE_LIMITER_BASIC: {
      limit: async () => ({ success: limiterSuccess }),
    },
    GEOCODE_RATE_LIMITER_PRO: {
      limit: async () => ({ success: true }),
    },
    GEOCODE_RATE_LIMITER_SCALE: {
      limit: async () => ({ success: true }),
    },
    DB: db,
    GEO_KV: kv,
    LOG_GEOCODE_HITS: 'false',
  };
}

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

function createRequest(params: {
  origin?: string;
  apiKey?: string;
  body?: unknown;
}): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.origin) {
    headers.Origin = params.origin;
  }
  if (params.apiKey) {
    headers['x-api-key'] = params.apiKey;
  }

  return new Request('https://api.geocache.dev/v1/geocode', {
    method: 'POST',
    headers,
    body: JSON.stringify(params.body ?? { text: 'Riyadh, Saudi Arabia' }),
  });
}

describe('F040: security controls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 for missing API key from allowed origin', async () => {
    const env = createEnv();
    const req = createRequest({
      origin: 'https://allowed.example',
      body: { text: 'Riyadh' },
    });

    const res = await app.fetch(req, env, ctx);
    const payload = await res.json();

    expect(res.status).toBe(401);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://allowed.example'
    );
    expect(payload).toEqual({
      error: {
        code: 'MISSING_API_KEY',
        message: 'Missing required header: x-api-key',
      },
    });
  });

  it('rejects disallowed origin without CORS headers', async () => {
    const env = createEnv();
    const req = createRequest({
      origin: 'https://evil.example',
      body: { text: 'Riyadh' },
    });

    const res = await app.fetch(req, env, ctx);
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

  it('returns 429 and skips provider calls when rate limited', async () => {
    const env = createEnv({ rateLimitSuccess: false, includeApiKey: true });
    const req = createRequest({
      origin: 'https://allowed.example',
      apiKey,
      body: { text: 'Riyadh, Saudi Arabia' },
    });

    const res = await app.fetch(req, env, ctx);
    const payload = await res.json();

    expect(res.status).toBe(429);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://allowed.example'
    );
    expect(payload).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded. Please retry later.',
      },
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('allows allowed origin with valid API key', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 108410,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Riyadh',
              lat: '24.7136',
              lng: '46.6753',
              fcl: 'P',
              fcode: 'PPLC',
              adminName1: 'Riyadh Region',
            },
          ],
        }),
    } as Response);

    const env = createEnv({ includeApiKey: true });
    const req = createRequest({
      origin: 'https://allowed.example',
      apiKey,
      body: { text: 'Riyadh, Saudi Arabia' },
    });

    const res = await app.fetch(req, env, ctx);
    const payload = (await res.json()) as GeocodeResponse;

    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://allowed.example'
    );
    expect(payload.cache.hit).toBe(false);
    expect(payload.canonical.countryIso2).toBe('SA');
  });
});
