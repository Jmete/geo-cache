import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionContext } from 'hono';
import type { GeocodeCacheRow } from '../db/schema';
import type { Env } from '../env.d';
import type { GeocodeResponse } from '../types/api';
import app from '../index';

function createMockKv(initial?: Map<string, string>) {
  const store = initial ?? new Map<string, string>();
  const captured = {
    puts: [] as Array<{ key: string; value: string }>,
  };

  const kv = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
      captured.puts.push({ key, value });
    },
  } as unknown as KVNamespace;

  return { kv, store, captured };
}

function createMockD1(initial?: Map<string, GeocodeCacheRow>) {
  const rows = initial ?? new Map<string, GeocodeCacheRow>();
  const captured = {
    selectCount: 0,
    insertCount: 0,
    eventCount: 0,
  };
  let idCounter = rows.size;
  const timestamp = '2026-02-02 00:00:00';

  const db = {
    prepare: (sql: string) => {
      return {
        bind: (...bindings: unknown[]) => {
          if (sql.includes('SELECT') && sql.includes('geocode_cache')) {
            return {
              first: async <T>() => {
                captured.selectCount += 1;
                const key = bindings[0] as string;
                return (rows.get(key) ?? null) as T | null;
              },
            };
          }

          if (sql.includes('INSERT INTO geocode_cache')) {
            return {
              run: async () => {
                captured.insertCount += 1;
                const [
                  input_raw,
                  input_norm_key,
                  country_iso2,
                  country_name,
                  admin1,
                  city,
                  display_name,
                  granularity,
                  point_lat,
                  point_lon,
                  bbox_west,
                  bbox_south,
                  bbox_east,
                  bbox_north,
                  confidence,
                  flags_json,
                  provider,
                  provider_id,
                ] = bindings;

                const key = input_norm_key as string;
                const existing = rows.get(key);
                const row: GeocodeCacheRow = {
                  id: existing?.id ?? (idCounter += 1),
                  input_raw: input_raw as string,
                  input_norm_key: key,
                  country_iso2: country_iso2 as string,
                  country_name: country_name as string,
                  admin1: (admin1 as string | null) ?? null,
                  city: (city as string | null) ?? null,
                  display_name: display_name as string,
                  granularity: granularity as GeocodeCacheRow['granularity'],
                  point_lat: (point_lat as number | null) ?? null,
                  point_lon: (point_lon as number | null) ?? null,
                  bbox_west: (bbox_west as number | null) ?? null,
                  bbox_south: (bbox_south as number | null) ?? null,
                  bbox_east: (bbox_east as number | null) ?? null,
                  bbox_north: (bbox_north as number | null) ?? null,
                  confidence: confidence as number,
                  flags_json: flags_json as string,
                  provider: provider as string,
                  provider_id: (provider_id as string | null) ?? null,
                  created_at: existing?.created_at ?? timestamp,
                  updated_at: timestamp,
                };

                rows.set(key, row);
                return { success: true };
              },
            };
          }

          if (sql.includes('INSERT INTO geocode_events')) {
            return {
              run: async () => {
                captured.eventCount += 1;
                return { success: true };
              },
            };
          }

          return {
            run: async () => ({ success: true }),
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, rows, captured };
}

function createEnv(kv: KVNamespace, db: D1Database): Env {
  return {
    ALLOWED_ORIGINS: 'https://allowed.example, https://other.example',
    API_KEY: 'test-api-key',
    GEONAMES_USERNAME: 'test-geonames',
    GEOCODE_RATE_LIMITER: {
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

function createRequest(text: string): Request {
  return new Request('https://api.geocache.dev/v1/geocode', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': 'test-api-key',
    },
    body: JSON.stringify({ text }),
  });
}

describe('F038: /v1/geocode cache integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns provider result, then KV hit, then D1 hit when KV is cleared', async () => {
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

    const { kv, store: kvStore } = createMockKv();
    const { db, captured: d1Captured } = createMockD1();
    const env = createEnv(kv, db);

    const firstResponse = await app.fetch(
      createRequest('Riyadh, Saudi Arabia'),
      env,
      ctx
    );
    const firstPayload = (await firstResponse.json()) as GeocodeResponse;

    expect(firstResponse.status).toBe(200);
    expect(firstPayload.cache.hit).toBe(false);

    const expectedCachedPayload: GeocodeResponse = {
      ...firstPayload,
      cache: { hit: true },
    };

    const secondResponse = await app.fetch(
      createRequest('Riyadh, Saudi Arabia'),
      env,
      ctx
    );
    const secondPayload = (await secondResponse.json()) as GeocodeResponse;

    expect(secondResponse.status).toBe(200);
    expect(secondPayload).toEqual(expectedCachedPayload);
    expect(d1Captured.selectCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    kvStore.clear();

    const thirdResponse = await app.fetch(
      createRequest('Riyadh, Saudi Arabia'),
      env,
      ctx
    );
    const thirdPayload = (await thirdResponse.json()) as GeocodeResponse;

    expect(thirdResponse.status).toBe(200);
    expect(thirdPayload).toEqual(expectedCachedPayload);
    expect(d1Captured.selectCount).toBe(2);
    expect(kvStore.has(firstPayload.normalizedKey)).toBe(true);
  });
});
