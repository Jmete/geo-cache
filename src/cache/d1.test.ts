/**
 * D1 cache lookup tests (F019)
 */

import { describe, expect, it } from 'vitest';
import type { GeocodeCacheRow } from '../db/schema';
import { readGeocodeFromD1, rowToGeocodeResponse } from './d1';

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
