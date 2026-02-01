/**
 * Geo-Cache API v1 Type Definitions
 *
 * API Versioning Rules:
 * - v1 is stable: additive changes allowed (new optional fields)
 * - Breaking changes require /v2 endpoint
 * - Clients should ignore unknown fields for forward compatibility
 */

// =============================================================================
// Request Types
// =============================================================================

/**
 * POST /v1/geocode request body
 */
export interface GeocodeRequest {
  /** LLM-generated location string to geocode (1-512 chars, required) */
  text: string;
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Geographic point with WGS84 coordinates
 */
export interface GeoPoint {
  /** Latitude in decimal degrees (-90 to 90) */
  lat: number;
  /** Longitude in decimal degrees (-180 to 180) */
  lon: number;
}

/**
 * Bounding box in [west, south, east, north] order (WGS84)
 */
export type GeoBbox = [west: number, south: number, east: number, north: number];

/**
 * Granularity of the geocoding result
 */
export type Granularity = 'city' | 'region' | 'country' | 'multi';

/**
 * Canonical location fields extracted/validated from the geocoding result
 */
export interface CanonicalLocation {
  /** ISO 3166-1 alpha-2 country code (e.g., "SA") */
  countryIso2: string;
  /** Country name in English */
  countryName: string;
  /** Admin level 1 region name (state/province), if resolved */
  admin1?: string;
  /** City/locality name, if resolved */
  city?: string;
  /** Human-readable display name (e.g., "Riyadh, Riyadh Region, Saudi Arabia") */
  displayName: string;
}

/**
 * Flags indicating special conditions or quality signals
 */
export interface GeocodeFlags {
  /** True if top 2 candidates scored within 0.05 threshold */
  ambiguous?: boolean;
  /** True if input contains "Multiple Areas" pattern */
  multiArea?: boolean;
  /** True if best candidate admin1 differs significantly from input admin1 */
  adminMismatch?: boolean;
  /** True if strict query failed and relaxed query was used */
  providerFallback?: boolean;
}

/**
 * Cache status information
 */
export interface CacheInfo {
  /** True if result was served from cache (KV or D1) */
  hit: boolean;
}

/**
 * Successful geocoding response
 */
export interface GeocodeResponse {
  /** Echo of the original input */
  input: {
    /** Raw input text as received */
    raw: string;
  };
  /** Normalized cache key (format: <countryIso2>|<admin1_norm>|<city_norm>|<multi_flag>) */
  normalizedKey: string;
  /** Canonical location data */
  canonical: CanonicalLocation;
  /** Result granularity level */
  granularity: Granularity;
  /** Representative point (centroid for regions/countries) */
  point?: GeoPoint;
  /** Bounding box when available [west, south, east, north] */
  bbox?: GeoBbox;
  /** Confidence score 0-1 (1 = highest confidence) */
  confidence: number;
  /** Quality/condition flags */
  flags: GeocodeFlags;
  /** Provider that resolved this location */
  provider: string;
  /** Cache status */
  cache: CacheInfo;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Standard error response structure
 * Used for all non-2xx responses (except OPTIONS preflight)
 */
export interface ErrorResponse {
  error: {
    /** Machine-readable error code */
    code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error details (optional) */
    details?: Record<string, unknown>;
  };
}

/**
 * HTTP status code mappings:
 * - 400: invalid input (missing/empty text, malformed JSON, text too long)
 * - 401: missing or invalid API key
 * - 403: origin not allowed (CORS)
 * - 405: wrong HTTP method
 * - 429: rate limited (retryable)
 * - 500: internal error
 * - 502: provider failure (retryable)
 *
 * Retryable errors: 429, 502
 * Non-retryable errors: 400, 401, 403, 405, 500
 */
export type HttpErrorCode = 400 | 401 | 403 | 405 | 429 | 500 | 502;

// =============================================================================
// Internal Types (for implementation use)
// =============================================================================

/**
 * Parsed location tokens from input text
 */
export interface ParsedLocation {
  /** Parsed city token (normalized) */
  city?: string;
  /** Parsed admin1/region token (normalized) */
  admin1?: string;
  /** Parsed country text (before ISO resolution) */
  countryText?: string;
  /** True if input contains multi-area pattern */
  isMultiArea: boolean;
  /** Hint for query granularity */
  granularityHint: Granularity;
}

/**
 * Provider candidate result
 */
export interface ProviderCandidate {
  /** Provider-specific ID (e.g., GeoNameId) */
  providerId: string;
  /** Candidate latitude */
  lat: number;
  /** Candidate longitude */
  lon: number;
  /** ISO2 country code */
  countryIso2: string;
  /** Country name */
  countryName: string;
  /** Admin1 region name */
  admin1?: string;
  /** City/locality name */
  city?: string;
  /** GeoNames feature class (A, P, etc.) */
  featureClass?: string;
  /** GeoNames feature code (PPL, ADM1, PCLI, etc.) */
  featureCode?: string;
  /** Population (for importance ranking) */
  population?: number;
  /** Bounding box if available */
  bbox?: GeoBbox;
}

/**
 * Scored candidate with computed metrics
 */
export interface ScoredCandidate extends ProviderCandidate {
  /** Computed score 0-1 */
  score: number;
}
