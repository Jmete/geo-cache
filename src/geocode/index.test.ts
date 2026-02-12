import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeocodeCacheRow } from '../db/schema';
import type { GeocodeResponse } from '../types/api';
import { resolveGeocode } from './index';

function createMockKv(initial?: Map<string, string>) {
  const store = initial ?? new Map<string, string>();
  const captured: { lastPut?: { key: string; value: string } } = {};

  const kv = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
      captured.lastPut = { key, value };
    },
  } as unknown as KVNamespace;

  return { kv, store, captured };
}

function createMockD1(rowsByKey: Map<string, GeocodeCacheRow>) {
  const captured = {
    selectCount: 0,
    insertCount: 0,
    lastInsertBindings: [] as unknown[],
  };

  const db = {
    prepare: (sql: string) => {
      return {
        bind: (...bindings: unknown[]) => {
          if (sql.includes('SELECT')) {
            return {
              first: async <T>() => {
                captured.selectCount += 1;
                const key = bindings[0] as string;
                return (rowsByKey.get(key) ?? null) as T | null;
              },
            };
          }
          return {
            run: async () => {
              captured.insertCount += 1;
              captured.lastInsertBindings = bindings;
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, captured };
}

function buildRow(overrides: Partial<GeocodeCacheRow> = {}): GeocodeCacheRow {
  return {
    id: 1,
    input_raw: 'Riyadh, Saudi Arabia',
    input_norm_key: 'SA||riyadh|',
    country_iso2: 'SA',
    country_name: 'Saudi Arabia',
    admin1: 'Riyadh Region',
    city: 'Riyadh',
    display_name: 'Riyadh, Riyadh Region, Saudi Arabia',
    granularity: 'city',
    point_lat: 24.7136,
    point_lon: 46.6753,
    bbox_west: 46.5,
    bbox_south: 24.6,
    bbox_east: 46.9,
    bbox_north: 24.9,
    confidence: 0.92,
    flags_json: '{"ambiguous":false,"multiArea":false}',
    provider: 'geonames',
    provider_id: '123',
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

describe('resolveGeocode', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns KV cached response without hitting D1', async () => {
    const cached: GeocodeResponse = {
      input: { raw: 'Riyadh, Saudi Arabia' },
      normalizedKey: 'SA||riyadh|',
      canonical: {
        countryIso2: 'SA',
        countryName: 'Saudi Arabia',
        city: 'Riyadh',
        admin1: 'Riyadh Region',
        displayName: 'Riyadh, Riyadh Region, Saudi Arabia',
      },
      granularity: 'city',
      point: { lat: 24.7136, lon: 46.6753 },
      confidence: 0.92,
      flags: { ambiguous: false, multiArea: false },
      provider: 'geonames',
      cache: { hit: true },
    };
    const { kv } = createMockKv(
      new Map([[cached.normalizedKey, JSON.stringify(cached)]])
    );
    const { db, captured } = createMockD1(new Map());

    const response = await resolveGeocode('Riyadh, Saudi Arabia', {
      kv,
      db,
      geonamesUsername: 'test',
    });

    expect(response).toEqual(cached);
    expect(captured.selectCount).toBe(0);
  });

  it('returns D1 cached response and warms KV', async () => {
    const row = buildRow();
    const { kv, captured: kvCaptured } = createMockKv();
    const { db, captured: d1Captured } = createMockD1(
      new Map([[row.input_norm_key, row]])
    );

    const response = await resolveGeocode('Riyadh, Saudi Arabia', {
      kv,
      db,
      geonamesUsername: 'test',
    });

    expect(response.cache.hit).toBe(true);
    expect(response.normalizedKey).toBe(row.input_norm_key);
    expect(d1Captured.selectCount).toBe(1);
    expect(kvCaptured.lastPut?.key).toBe(row.input_norm_key);
    expect(kvCaptured.lastPut?.value).toContain('"cache":{"hit":true}');
  });

  it('runs provider pipeline on cache miss and persists response', async () => {
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

    const { kv, captured: kvCaptured } = createMockKv();
    const { db, captured: d1Captured } = createMockD1(new Map());

    const response = await resolveGeocode('Riyadh, Saudi Arabia', {
      kv,
      db,
      geonamesUsername: 'test',
    });

    expect(response.cache.hit).toBe(false);
    expect(response.canonical.countryIso2).toBe('SA');
    expect(response.point).toEqual({ lat: 24.7136, lon: 46.6753 });
    expect(response.provider).toBe('geonames');
    expect(response.confidence).toBeGreaterThanOrEqual(0);
    expect(response.confidence).toBeLessThanOrEqual(1);
    expect(d1Captured.insertCount).toBe(2);
    expect(kvCaptured.lastPut?.key).toBe(response.normalizedKey);
  });

  it('resolves single-token dependent territory queries (Hong Kong)', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 1819730,
              countryCode: 'HK',
              countryName: 'Hong Kong',
              name: 'Hong Kong',
              lat: '22.2783',
              lng: '114.1747',
              fcl: 'A',
              fcode: 'PCLD',
            },
          ],
        }),
    } as Response);

    const { kv } = createMockKv();
    const { db } = createMockD1(new Map());

    const response = await resolveGeocode('Hong Kong', {
      kv,
      db,
      geonamesUsername: 'test',
    });

    expect(response.cache.hit).toBe(false);
    expect(response.granularity).toBe('country');
    expect(response.canonical.countryIso2).toBe('HK');
    expect(response.canonical.countryName).toBe('Hong Kong');
    expect(response.point).toEqual({ lat: 22.2783, lon: 114.1747 });
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('country=HK');
    expect(calledUrl).toContain('featureCode=PCLD');
  });

  it('resolves city queries that include a trailing city suffix', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 1,
            geonames: [
              {
                geonameId: 101628,
                countryCode: 'SA',
                countryName: 'Saudi Arabia',
                name: 'Tabuk',
                lat: '28.3998',
                lng: '36.5715',
                fcl: 'P',
                fcode: 'PPLA',
                adminName1: 'Tabuk',
              },
            ],
          }),
      } as Response);

    const { kv } = createMockKv();
    const { db } = createMockD1(new Map());

    const response = await resolveGeocode(
      'Tabuk City, Tabuk, Saudi Arabia',
      {
        kv,
        db,
        geonamesUsername: 'test',
      }
    );

    expect(response.point).toEqual({ lat: 28.3998, lon: 36.5715 });
    expect(response.flags.providerFallback).toBe(true);
    expect(response.flags.ambiguous).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const thirdUrl = fetchMock.mock.calls[2]?.[0] as string;
    expect(thirdUrl).toContain('q=Tabuk');
  });

  it('falls back to region-level result when city candidate is missing', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 1,
            geonames: [
              {
                geonameId: 108662,
                countryCode: 'SA',
                countryName: 'Saudi Arabia',
                name: 'Tabuk',
                lat: '28.3979',
                lng: '36.5662',
                fcl: 'A',
                fcode: 'ADM1',
                adminName1: 'Tabuk',
              },
            ],
          }),
      } as Response);

    const { kv } = createMockKv();
    const { db } = createMockD1(new Map());

    const response = await resolveGeocode(
      'Nonexistent City, Tabuk, Saudi Arabia',
      {
        kv,
        db,
        geonamesUsername: 'test',
      }
    );

    expect(response.granularity).toBe('region');
    expect(response.canonical.admin1).toBe('Tabuk');
    expect(response.canonical.city).toBeUndefined();
    expect(response.point).toEqual({ lat: 28.3979, lon: 36.5662 });
    expect(response.flags.providerFallback).toBe(true);
    expect(response.flags.ambiguous).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(5);
    const fifthUrl = fetchMock.mock.calls[4]?.[0] as string;
    expect(fifthUrl).toContain('q=Tabuk');
    expect(fifthUrl).toContain('featureCode=ADM1');
  });

  it('returns low-confidence response when provider yields no candidates', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response);

    const { kv } = createMockKv();
    const { db, captured: d1Captured } = createMockD1(new Map());

    const response = await resolveGeocode('Riyadh, Saudi Arabia', {
      kv,
      db,
      geonamesUsername: 'test',
    });

    expect(response.cache.hit).toBe(false);
    expect(response.flags.ambiguous).toBe(true);
    expect(response.confidence).toBeLessThan(0.2);
    expect(d1Captured.insertCount).toBe(2);
  });

  it('retries Saudi region lookups with Al prefix before low-confidence fallback', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 1,
            geonames: [
              {
                geonameId: 109578,
                countryCode: 'SA',
                countryName: 'Saudi Arabia',
                name: 'Al Bahah',
                lat: '20.0129',
                lng: '41.4677',
                fcl: 'A',
                fcode: 'ADM1',
                adminName1: 'Al Bahah Region',
              },
            ],
          }),
      } as Response);

    const { kv } = createMockKv();
    const { db } = createMockD1(new Map());

    const response = await resolveGeocode('Baha Region, Saudi Arabia', {
      kv,
      db,
      geonamesUsername: 'test',
    });

    expect(response.cache.hit).toBe(false);
    expect(response.flags.ambiguous).toBeFalsy();
    expect(response.confidence).toBeGreaterThan(0.2);
    expect(response.point).toEqual({ lat: 20.0129, lon: 41.4677 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    const thirdUrl = new URL(fetchMock.mock.calls[2]?.[0] as string);
    expect(firstUrl.searchParams.get('q')).toBe('Baha Region');
    expect(thirdUrl.searchParams.get('q')).toBe('Al Baha Region');
  });
});
