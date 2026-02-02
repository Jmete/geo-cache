import type { GeocodeResponse } from '../types/api';
import type { GeocodeCacheRow } from '../db/schema';
import { parseFlagsJson, rowToBbox } from '../db/schema';

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
