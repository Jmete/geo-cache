/**
 * KV hot-cache tests (F018)
 */

import { describe, expect, it } from 'vitest';
import type { GeocodeResponse } from '../types/api';
import {
  KV_CACHE_TTL_SECONDS,
  readGeocodeFromKv,
  serializeGeocodeResponse,
  stableJsonStringify,
  withCacheHit,
  writeGeocodeToKv,
} from './kv';

type PutOptions = Parameters<KVNamespace['put']>[2];

function createMockKv() {
  const store = new Map<string, string>();
  let lastPut: { key: string; value: string; options?: PutOptions } | null = null;

  const kv = {
    get: async (key: string, type?: 'text') => {
      if (type && type !== 'text') {
        throw new Error(`Unsupported type: ${type}`);
      }
      return store.get(key) ?? null;
    },
    getWithMetadata: async (key: string, type?: 'text') => {
      if (type && type !== 'text') {
        throw new Error(`Unsupported type: ${type}`);
      }
      return {
        value: store.get(key) ?? null,
        metadata: null,
      };
    },
    put: async (key: string, value: string, options?: PutOptions) => {
      store.set(key, value);
      lastPut = { key, value, options };
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: '' }),
  } as unknown as KVNamespace;

  return {
    kv,
    getLastPut: () => lastPut,
    setRaw: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function buildResponse(overrides: Partial<GeocodeResponse> = {}): GeocodeResponse {
  return {
    input: { raw: 'Riyadh, Saudi Arabia' },
    normalizedKey: 'SA||riyadh|',
    canonical: {
      countryIso2: 'SA',
      countryName: 'Saudi Arabia',
      admin1: 'Riyadh Region',
      city: 'Riyadh',
      displayName: 'Riyadh, Riyadh Region, Saudi Arabia',
    },
    granularity: 'city',
    point: { lat: 24.7136, lon: 46.6753 },
    bbox: [46.5, 24.6, 46.9, 24.9],
    confidence: 0.92,
    flags: {},
    provider: 'geonames',
    cache: { hit: false },
    ...overrides,
  };
}

describe('F018 deterministic serialization', () => {
  it('serializes identical responses deterministically regardless of key order', () => {
    const responseA = buildResponse({ cache: { hit: true } });
    const responseB: GeocodeResponse = {
      provider: 'geonames',
      cache: { hit: true },
      flags: {},
      confidence: 0.92,
      bbox: [46.5, 24.6, 46.9, 24.9],
      point: { lon: 46.6753, lat: 24.7136 },
      granularity: 'city',
      canonical: {
        displayName: 'Riyadh, Riyadh Region, Saudi Arabia',
        city: 'Riyadh',
        admin1: 'Riyadh Region',
        countryName: 'Saudi Arabia',
        countryIso2: 'SA',
      },
      normalizedKey: 'SA||riyadh|',
      input: { raw: 'Riyadh, Saudi Arabia' },
    };

    expect(stableJsonStringify(responseA)).toBe(stableJsonStringify(responseB));
  });
});

describe('F018 KV hot-cache behavior', () => {
  it('writes payload with 30-day TTL and forces cache.hit=true', async () => {
    const { kv, getLastPut } = createMockKv();
    const response = buildResponse({ cache: { hit: false } });

    await writeGeocodeToKv(kv, 'SA||riyadh|', response);

    const lastPut = getLastPut();
    expect(lastPut).not.toBeNull();
    expect(lastPut?.options?.expirationTtl).toBe(KV_CACHE_TTL_SECONDS);

    const stored = JSON.parse(lastPut?.value ?? '{}') as GeocodeResponse;
    expect(stored.cache.hit).toBe(true);
  });

  it('returns cached response matching the stored payload', async () => {
    const { kv, getLastPut } = createMockKv();
    const response = buildResponse({ cache: { hit: true } });

    await writeGeocodeToKv(kv, 'SA||riyadh|', response);

    const cached = await readGeocodeFromKv(kv, 'SA||riyadh|');
    const lastPut = getLastPut();

    expect(cached).not.toBeNull();
    if (!cached || !lastPut) throw new Error('Expected cached payload');

    expect(serializeGeocodeResponse(cached)).toBe(lastPut.value);
  });

  it('returns null on cache miss or invalid cached JSON', async () => {
    const { kv, setRaw } = createMockKv();

    const miss = await readGeocodeFromKv(kv, 'missing');
    expect(miss).toBeNull();

    setRaw('invalid', '{bad json');
    const invalid = await readGeocodeFromKv(kv, 'invalid');
    expect(invalid).toBeNull();
  });

  it('cache hit payload matches stored serialization', async () => {
    const { kv, getLastPut } = createMockKv();
    const response = buildResponse({ cache: { hit: false } });

    await writeGeocodeToKv(kv, 'SA||riyadh|', response);

    const cached = await readGeocodeFromKv(kv, 'SA||riyadh|');
    const lastPut = getLastPut();

    expect(cached).not.toBeNull();
    if (!cached || !lastPut) throw new Error('Expected cached payload');

    const normalized = serializeGeocodeResponse(withCacheHit(cached, true));
    expect(normalized).toBe(lastPut.value);
  });
});
