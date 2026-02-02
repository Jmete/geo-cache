import type { GeocodeResponse } from '../types/api';
import type { GeocodeCacheInsert, GeocodeCacheRow } from '../db/schema';
import { parseFlagsJson, rowToBbox, serializeFlagsJson } from '../db/schema';

export function rowToGeocodeResponse(row: GeocodeCacheRow): GeocodeResponse {
  const point =
    row.point_lat !== null && row.point_lon !== null
      ? { lat: row.point_lat, lon: row.point_lon }
      : null;

  const bbox = rowToBbox(row);

  const canonical = {
    countryIso2: row.country_iso2,
    countryName: row.country_name,
    displayName: row.display_name,
    ...(row.admin1 !== null ? { admin1: row.admin1 } : {}),
    ...(row.city !== null ? { city: row.city } : {}),
  };

  return {
    input: { raw: row.input_raw },
    normalizedKey: row.input_norm_key,
    canonical,
    granularity: row.granularity,
    confidence: row.confidence,
    flags: parseFlagsJson(row.flags_json),
    provider: row.provider,
    cache: { hit: true },
    ...(point ? { point } : {}),
    ...(bbox ? { bbox } : {}),
  };
}

function toFiniteOrNull(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  return Number.isFinite(value) ? value : null;
}

export function geocodeResponseToInsert(
  response: GeocodeResponse,
  providerId?: string | null
): GeocodeCacheInsert {
  const bbox = response.bbox;
  const point = response.point;

  return {
    input_raw: response.input.raw,
    input_norm_key: response.normalizedKey,
    country_iso2: response.canonical.countryIso2,
    country_name: response.canonical.countryName,
    admin1: response.canonical.admin1 ?? null,
    city: response.canonical.city ?? null,
    display_name: response.canonical.displayName,
    granularity: response.granularity,
    point_lat: toFiniteOrNull(point?.lat),
    point_lon: toFiniteOrNull(point?.lon),
    bbox_west: toFiniteOrNull(bbox?.[0]),
    bbox_south: toFiniteOrNull(bbox?.[1]),
    bbox_east: toFiniteOrNull(bbox?.[2]),
    bbox_north: toFiniteOrNull(bbox?.[3]),
    confidence: response.confidence,
    flags_json: serializeFlagsJson(response.flags ?? {}),
    provider: response.provider,
    provider_id: providerId ?? null,
  };
}

export async function readGeocodeFromD1(
  db: D1Database,
  key: string
): Promise<GeocodeResponse | null> {
  const row = await db
    .prepare('SELECT * FROM geocode_cache WHERE input_norm_key = ? LIMIT 1')
    .bind(key)
    .first<GeocodeCacheRow>();

  if (!row) {
    return null;
  }

  return rowToGeocodeResponse(row);
}

export async function upsertGeocodeToD1(
  db: D1Database,
  response: GeocodeResponse,
  providerId?: string | null
): Promise<void> {
  const insert = geocodeResponseToInsert(response, providerId);

  const sql = `
    INSERT INTO geocode_cache (
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
      provider_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(input_norm_key) DO UPDATE SET
      input_raw = excluded.input_raw,
      country_iso2 = excluded.country_iso2,
      country_name = excluded.country_name,
      admin1 = excluded.admin1,
      city = excluded.city,
      display_name = excluded.display_name,
      granularity = excluded.granularity,
      point_lat = excluded.point_lat,
      point_lon = excluded.point_lon,
      bbox_west = excluded.bbox_west,
      bbox_south = excluded.bbox_south,
      bbox_east = excluded.bbox_east,
      bbox_north = excluded.bbox_north,
      confidence = excluded.confidence,
      flags_json = excluded.flags_json,
      provider = excluded.provider,
      provider_id = excluded.provider_id,
      updated_at = datetime('now')
  `;

  await db
    .prepare(sql)
    .bind(
      insert.input_raw,
      insert.input_norm_key,
      insert.country_iso2,
      insert.country_name,
      insert.admin1 ?? null,
      insert.city ?? null,
      insert.display_name,
      insert.granularity,
      insert.point_lat ?? null,
      insert.point_lon ?? null,
      insert.bbox_west ?? null,
      insert.bbox_south ?? null,
      insert.bbox_east ?? null,
      insert.bbox_north ?? null,
      insert.confidence,
      insert.flags_json,
      insert.provider,
      insert.provider_id ?? null
    )
    .run();
}
