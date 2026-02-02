/**
 * D1 Database Schema Types
 *
 * These types mirror the SQL schema defined in migrations/
 * and provide type safety for D1 operations.
 */

import type { GeoBbox, GeocodeFlags, Granularity } from '../types/api';

// =============================================================================
// geocode_cache Table
// =============================================================================

/**
 * Row type for geocode_cache table (as stored in D1)
 */
export interface GeocodeCacheRow {
  id: number;

  // Input fields
  input_raw: string;
  input_norm_key: string;

  // Canonical location fields
  country_iso2: string;
  country_name: string;
  admin1: string | null;
  city: string | null;
  display_name: string;

  // Geographic data
  granularity: Granularity;
  point_lat: number | null;
  point_lon: number | null;
  bbox_west: number | null;
  bbox_south: number | null;
  bbox_east: number | null;
  bbox_north: number | null;

  // Scoring and metadata
  confidence: number;
  flags_json: string; // JSON-encoded GeocodeFlags
  provider: string;
  provider_id: string | null;

  // Timestamps (ISO 8601 strings from SQLite datetime())
  created_at: string;
  updated_at: string;
}

/**
 * Insert type for geocode_cache (excludes auto-generated fields)
 */
export interface GeocodeCacheInsert {
  input_raw: string;
  input_norm_key: string;
  country_iso2: string;
  country_name: string;
  admin1?: string | null;
  city?: string | null;
  display_name: string;
  granularity: Granularity;
  point_lat?: number | null;
  point_lon?: number | null;
  bbox_west?: number | null;
  bbox_south?: number | null;
  bbox_east?: number | null;
  bbox_north?: number | null;
  confidence: number;
  flags_json: string;
  provider: string;
  provider_id?: string | null;
}

// =============================================================================
// geocode_events Table
// =============================================================================

/**
 * Event status for audit logging
 */
export type EventStatus = 'hit' | 'miss' | 'resolved' | 'error' | 'ambiguous';

/**
 * Row type for geocode_events table (as stored in D1)
 */
export interface GeocodeEventRow {
  id: number;
  input_raw: string;
  input_norm_key: string;
  status: EventStatus;
  provider: string | null;
  provider_response: string | null; // Truncated JSON
  request_id: string | null;
  created_at: string;
}

/**
 * Insert type for geocode_events (excludes auto-generated fields)
 */
export interface GeocodeEventInsert {
  input_raw: string;
  input_norm_key: string;
  status: EventStatus;
  provider?: string | null;
  provider_response?: string | null;
  request_id?: string | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Maximum length for truncated provider_response in events table
 */
export const MAX_PROVIDER_RESPONSE_LENGTH = 2048;

/**
 * Truncate provider response to safe length for storage
 */
export function truncateProviderResponse(response: string): string {
  if (response.length <= MAX_PROVIDER_RESPONSE_LENGTH) {
    return response;
  }
  return response.slice(0, MAX_PROVIDER_RESPONSE_LENGTH - 3) + '...';
}

/**
 * Parse flags JSON from database row
 */
export function parseFlagsJson(flagsJson: string): GeocodeFlags {
  try {
    return JSON.parse(flagsJson) as GeocodeFlags;
  } catch {
    return {};
  }
}

/**
 * Serialize flags to JSON for database storage
 */
export function serializeFlagsJson(flags: GeocodeFlags): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(flags).sort()) {
    const value = (flags as Record<string, unknown>)[key];
    if (value !== undefined) {
      sorted[key] = value;
    }
  }
  return JSON.stringify(sorted);
}

/**
 * Parse bbox from individual columns to array format
 */
export function rowToBbox(row: GeocodeCacheRow): GeoBbox | undefined {
  if (
    row.bbox_west !== null &&
    row.bbox_south !== null &&
    row.bbox_east !== null &&
    row.bbox_north !== null
  ) {
    return [row.bbox_west, row.bbox_south, row.bbox_east, row.bbox_north];
  }
  return undefined;
}
