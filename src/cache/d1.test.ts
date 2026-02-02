/**
 * D1 cache lookup tests (F019)
 */

import { describe, expect, it } from 'vitest';
import type { GeocodeCacheRow } from '../db/schema';
import type { GeocodeResponse } from '../types/api';
import {
  geocodeResponseToInsert,
  readGeocodeFromD1,
  rowToGeocodeResponse,
  upsertGeocodeToD1,
} from './d1';

function createMockD1(rowsByKey: Map<string, GeocodeCacheRow>): D1Database {
  return {
    prepare: () => ({
      bind: (key: string) => ({
        first: async <T>() => {
          return (rowsByKey.get(key) ?? null) as T | null;
        },
      }),
    }),
  } as unknown as D1Database;
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
    flags: { ambiguous: false, multiArea: false },
    provider: 'geonames',
    cache: { hit: false },
    ...overrides,
  };
}

function createUpsertMock() {
  const captured: { sql: string; bindings: unknown[]; runCount: number } = {
    sql: '',
    bindings: [],
    runCount: 0,
  };

  const db = {
    prepare: (sql: string) => {
      captured.sql = sql;
      return {
        bind: (...bindings: unknown[]) => {
          captured.bindings = bindings;
          return {
            run: async () => {
              captured.runCount += 1;
              return { success: true };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, captured };
}

describe('F019 D1 lookup', () => {
  it('returns mapped response with cache.hit=true on D1 hit', async () => {
    const row = buildRow();
    const db = createMockD1(new Map([[row.input_norm_key, row]]));

    const response = await readGeocodeFromD1(db, row.input_norm_key);

    expect(response).not.toBeNull();
    if (!response) throw new Error('Expected cached response');

    expect(response.cache.hit).toBe(true);
    expect(response.normalizedKey).toBe(row.input_norm_key);
    expect(response.input.raw).toBe(row.input_raw);
    expect(response.canonical).toEqual({
      countryIso2: row.country_iso2,
      countryName: row.country_name,
      admin1: row.admin1,
      city: row.city,
      displayName: row.display_name,
    });
    expect(response.point).toEqual({ lat: row.point_lat, lon: row.point_lon });
    expect(response.bbox).toEqual([
      row.bbox_west,
      row.bbox_south,
      row.bbox_east,
      row.bbox_north,
    ]);
    expect(response.flags).toEqual({ ambiguous: false, multiArea: false });
  });

  it('returns null when no D1 row is found', async () => {
    const db = createMockD1(new Map());

    const response = await readGeocodeFromD1(db, 'missing');

    expect(response).toBeNull();
  });

  it('maps null optional fields safely', () => {
    const row = buildRow({
      admin1: null,
      city: null,
      point_lat: null,
      point_lon: null,
      bbox_west: null,
      bbox_south: null,
      bbox_east: null,
      bbox_north: null,
      flags_json: '{bad json',
    });

    const response = rowToGeocodeResponse(row);

    expect(response.canonical.admin1).toBeUndefined();
    expect(response.canonical.city).toBeUndefined();
    expect(response.point).toBeUndefined();
    expect(response.bbox).toBeUndefined();
    expect(response.flags).toEqual({});
  });
});

describe('F029 D1 upsert', () => {
  it('maps response to insert payload with stable flags JSON', () => {
    const response = buildResponse({
      flags: {
        providerFallback: true,
        ambiguous: true,
        adminMismatch: true,
      },
    });

    const insert = geocodeResponseToInsert(response, '123');

    expect(insert.input_norm_key).toBe(response.normalizedKey);
    expect(insert.country_iso2).toBe(response.canonical.countryIso2);
    expect(insert.city).toBe(response.canonical.city);
    expect(insert.provider_id).toBe('123');
    expect(insert.flags_json).toBe(
      '{"adminMismatch":true,"ambiguous":true,"providerFallback":true}'
    );
  });

  it('upserts with null-safe columns and updates timestamps', async () => {
    const base = buildResponse({
      canonical: {
        countryIso2: 'SA',
        countryName: 'Saudi Arabia',
        displayName: 'Saudi Arabia',
      },
      granularity: 'country',
      flags: {},
    });
    const response: GeocodeResponse = { ...base };
    delete response.point;
    delete response.bbox;

    const { db, captured } = createUpsertMock();

    await upsertGeocodeToD1(db, response, null);

    expect(captured.runCount).toBe(1);
    expect(captured.sql).toContain('INSERT INTO geocode_cache');
    expect(captured.sql).toContain('ON CONFLICT(input_norm_key) DO UPDATE');
    expect(captured.sql).toContain('updated_at = datetime');

    expect(captured.bindings).toEqual([
      response.input.raw,
      response.normalizedKey,
      response.canonical.countryIso2,
      response.canonical.countryName,
      null,
      null,
      response.canonical.displayName,
      response.granularity,
      null,
      null,
      null,
      null,
      null,
      null,
      response.confidence,
      '{}',
      response.provider,
      null,
    ]);
  });
});
