import { describe, it, expect } from 'vitest';
import {
  truncateProviderResponse,
  parseFlagsJson,
  serializeFlagsJson,
  rowToBbox,
  MAX_PROVIDER_RESPONSE_LENGTH,
  type GeocodeCacheRow,
  type GeocodeCacheInsert,
  type GeocodeEventRow,
  type GeocodeEventInsert,
  type EventStatus,
} from './schema';
import type { GeocodeFlags, GeoBbox } from '../types/api';

describe('truncateProviderResponse', () => {
  it('returns short strings unchanged', () => {
    const short = 'short response';
    expect(truncateProviderResponse(short)).toBe(short);
  });

  it('returns strings at max length unchanged', () => {
    const exact = 'x'.repeat(MAX_PROVIDER_RESPONSE_LENGTH);
    expect(truncateProviderResponse(exact)).toBe(exact);
  });

  it('truncates strings over max length with ellipsis', () => {
    const long = 'x'.repeat(MAX_PROVIDER_RESPONSE_LENGTH + 100);
    const result = truncateProviderResponse(long);
    expect(result.length).toBe(MAX_PROVIDER_RESPONSE_LENGTH);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles empty string', () => {
    expect(truncateProviderResponse('')).toBe('');
  });
});

describe('parseFlagsJson', () => {
  it('parses valid flags JSON', () => {
    const flags: GeocodeFlags = { ambiguous: true, multiArea: false };
    const json = JSON.stringify(flags);
    expect(parseFlagsJson(json)).toEqual(flags);
  });

  it('returns empty object for invalid JSON', () => {
    expect(parseFlagsJson('not valid json')).toEqual({});
  });

  it('returns empty object for empty string', () => {
    expect(parseFlagsJson('')).toEqual({});
  });

  it('parses empty flags object', () => {
    expect(parseFlagsJson('{}')).toEqual({});
  });

  it('parses all flag types', () => {
    const flags: GeocodeFlags = {
      ambiguous: true,
      multiArea: true,
      adminMismatch: true,
      providerFallback: true,
    };
    expect(parseFlagsJson(JSON.stringify(flags))).toEqual(flags);
  });
});

describe('serializeFlagsJson', () => {
  it('serializes empty flags', () => {
    expect(serializeFlagsJson({})).toBe('{}');
  });

  it('serializes flags with values', () => {
    const flags: GeocodeFlags = { ambiguous: true };
    const result = serializeFlagsJson(flags);
    expect(JSON.parse(result)).toEqual(flags);
  });

  it('roundtrips with parseFlagsJson', () => {
    const flags: GeocodeFlags = {
      ambiguous: true,
      multiArea: false,
      adminMismatch: true,
    };
    const serialized = serializeFlagsJson(flags);
    const parsed = parseFlagsJson(serialized);
    expect(parsed).toEqual(flags);
  });
});

describe('rowToBbox', () => {
  const baseRow: GeocodeCacheRow = {
    id: 1,
    input_raw: 'test',
    input_norm_key: 'SA||riyadh|',
    country_iso2: 'SA',
    country_name: 'Saudi Arabia',
    admin1: null,
    city: 'Riyadh',
    display_name: 'Riyadh, Saudi Arabia',
    granularity: 'city',
    point_lat: 24.7136,
    point_lon: 46.6753,
    bbox_west: null,
    bbox_south: null,
    bbox_east: null,
    bbox_north: null,
    confidence: 0.95,
    flags_json: '{}',
    provider: 'geonames',
    provider_id: '123456',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  it('returns undefined when all bbox values are null', () => {
    expect(rowToBbox(baseRow)).toBeUndefined();
  });

  it('returns undefined when some bbox values are null', () => {
    const row = { ...baseRow, bbox_west: 10, bbox_south: 20 };
    expect(rowToBbox(row)).toBeUndefined();
  });

  it('returns bbox array when all values present', () => {
    const row: GeocodeCacheRow = {
      ...baseRow,
      bbox_west: 34.0,
      bbox_south: 16.0,
      bbox_east: 56.0,
      bbox_north: 32.0,
    };
    const expected: GeoBbox = [34.0, 16.0, 56.0, 32.0];
    expect(rowToBbox(row)).toEqual(expected);
  });

  it('handles zero values correctly', () => {
    const row: GeocodeCacheRow = {
      ...baseRow,
      bbox_west: 0,
      bbox_south: 0,
      bbox_east: 0,
      bbox_north: 0,
    };
    expect(rowToBbox(row)).toEqual([0, 0, 0, 0]);
  });
});

describe('Type compatibility', () => {
  it('GeocodeCacheInsert can be assigned without id/timestamps', () => {
    const insert: GeocodeCacheInsert = {
      input_raw: 'Riyadh, Saudi Arabia',
      input_norm_key: 'SA||riyadh|',
      country_iso2: 'SA',
      country_name: 'Saudi Arabia',
      display_name: 'Riyadh, Saudi Arabia',
      granularity: 'city',
      confidence: 0.95,
      flags_json: '{}',
      provider: 'geonames',
    };
    expect(insert.input_norm_key).toBe('SA||riyadh|');
  });

  it('GeocodeCacheRow requires all fields', () => {
    const row: GeocodeCacheRow = {
      id: 1,
      input_raw: 'test',
      input_norm_key: 'SA||test|',
      country_iso2: 'SA',
      country_name: 'Saudi Arabia',
      admin1: null,
      city: 'test',
      display_name: 'test, Saudi Arabia',
      granularity: 'city',
      point_lat: 24.0,
      point_lon: 46.0,
      bbox_west: null,
      bbox_south: null,
      bbox_east: null,
      bbox_north: null,
      confidence: 0.9,
      flags_json: '{}',
      provider: 'geonames',
      provider_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    expect(row.id).toBe(1);
  });

  it('GeocodeEventInsert can be assigned without id/timestamp', () => {
    const insert: GeocodeEventInsert = {
      input_raw: 'Riyadh, Saudi Arabia',
      input_norm_key: 'SA||riyadh|',
      status: 'resolved',
      provider: 'geonames',
    };
    expect(insert.status).toBe('resolved');
  });

  it('EventStatus accepts all valid values', () => {
    const statuses: EventStatus[] = ['hit', 'miss', 'resolved', 'error', 'ambiguous'];
    statuses.forEach((status) => {
      const insert: GeocodeEventInsert = {
        input_raw: 'test',
        input_norm_key: 'SA||test|',
        status,
      };
      expect(insert.status).toBe(status);
    });
  });

  it('GeocodeEventRow requires all fields', () => {
    const row: GeocodeEventRow = {
      id: 1,
      input_raw: 'test',
      input_norm_key: 'SA||test|',
      status: 'hit',
      provider: null,
      provider_response: null,
      request_id: null,
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(row.id).toBe(1);
  });
});

describe('MAX_PROVIDER_RESPONSE_LENGTH', () => {
  it('is a reasonable size for truncation', () => {
    expect(MAX_PROVIDER_RESPONSE_LENGTH).toBeGreaterThan(100);
    expect(MAX_PROVIDER_RESPONSE_LENGTH).toBeLessThan(10000);
  });
});
