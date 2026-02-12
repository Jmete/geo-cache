/**
 * GeoNames API Client (F016)
 *
 * Provides a typed interface to the GeoNames API with timeout support.
 * Used for country-level (PCLI) lookups when offline resolution fails.
 */

const GEONAMES_BASE_URL = 'https://secure.geonames.org/searchJSON';
const DEFAULT_TIMEOUT_MS = 7000;
const DEFAULT_CITY_MAX_ROWS = 10;
const DEFAULT_CITY_FUZZY = 0.8;
const DEFAULT_ADMIN1_MAX_ROWS = 10;
const DEFAULT_ADMIN1_FUZZY = 0.8;
const DEFAULT_COUNTRY_MAX_ROWS = 5;
const DEFAULT_COUNTRY_FEATURE_CODES = [
  'PCLI',
  'PCLD',
  'PCLF',
  'PCLS',
  'PCLIX',
  'TERR',
] as const;

// =============================================================================
// Types
// =============================================================================

export interface GeoNamesConfig {
  username: string;
  timeout?: number;
}

export interface GeoNamesSearchResult {
  geonameId: number;
  countryCode: string;
  countryName: string;
  name: string;
  lat: string;
  lng: string;
  fcl: string;
  fcode: string;
  population?: number;
  adminName1?: string;
  adminCode1?: string;
  bbox?: {
    west?: string | number;
    south?: string | number;
    east?: string | number;
    north?: string | number;
  };
}

interface GeoNamesResponse {
  totalResultsCount: number;
  geonames?: GeoNamesSearchResult[];
}

type GeoNamesParamValue = string | string[];
type GeoNamesParams = Record<string, GeoNamesParamValue>;

export interface GeoNamesCountrySearchOptions {
  expectedCountryIso2?: string;
  featureCodes?: readonly string[];
}

function buildGeoNamesUrl(params: GeoNamesParams, username: string): string {
  const url = new URL(GEONAMES_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        url.searchParams.append(key, entry);
      }
    } else {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set('username', username);

  return url.toString();
}

function parseGeoNamesResults(data: unknown): GeoNamesSearchResult[] {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const results = (data as GeoNamesResponse).geonames;
  return Array.isArray(results) ? results : [];
}

async function fetchGeoNames(
  params: GeoNamesParams,
  config: GeoNamesConfig
): Promise<GeoNamesSearchResult[]> {
  const { username, timeout = DEFAULT_TIMEOUT_MS } = config;
  const url = buildGeoNamesUrl({ inclBbox: 'true', ...params }, username);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ProviderFetchError(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as GeoNamesResponse;
    return parseGeoNamesResults(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderTimeoutError();
    }

    if (
      error instanceof ProviderTimeoutError ||
      error instanceof ProviderFetchError
    ) {
      throw error;
    }

    throw new ProviderFetchError(
      error instanceof Error ? error.message : 'Unknown fetch error'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// =============================================================================
// Error Classes
// =============================================================================

/**
 * Thrown when a GeoNames request times out.
 * Upstream should return HTTP 502 with providerTimeoutError().
 */
export class ProviderTimeoutError extends Error {
  readonly provider = 'geonames' as const;

  constructor() {
    super('GeoNames request timed out');
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * Thrown when a GeoNames request fails (network error or non-2xx response).
 * Upstream should return HTTP 502 with providerError().
 */
export class ProviderFetchError extends Error {
  readonly provider = 'geonames' as const;

  constructor(message: string) {
    super(message);
    this.name = 'ProviderFetchError';
  }
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Search for a country by name using GeoNames PCLI feature code.
 *
 * @param query - Country name or text to search
 * @param config - GeoNames API configuration
 * @returns Matching country result or null if not found
 * @throws {ProviderTimeoutError} When request exceeds timeout
 * @throws {ProviderFetchError} When request fails (network/HTTP error)
 *
 * @example
 * const result = await searchCountryPCLI('Arabia Saudita', { username: 'demo' });
 * // result?.countryCode === 'SA'
 */
export async function searchCountryPCLI(
  query: string,
  config: GeoNamesConfig,
  options: GeoNamesCountrySearchOptions = {}
): Promise<GeoNamesSearchResult | null> {
  const expectedCountryIso2 = options.expectedCountryIso2?.trim().toUpperCase();
  const featureCodes =
    options.featureCodes && options.featureCodes.length > 0
      ? options.featureCodes
      : DEFAULT_COUNTRY_FEATURE_CODES;

  const params: GeoNamesParams = {
    q: query,
    featureCode: [...featureCodes],
    maxRows: String(DEFAULT_COUNTRY_MAX_ROWS),
  };

  if (expectedCountryIso2) {
    params.country = expectedCountryIso2;
  }

  const results = await fetchGeoNames(
    params,
    config
  );

  if (results.length === 0) {
    return null;
  }

  if (!expectedCountryIso2) {
    return results[0] ?? null;
  }

  return (
    results.find(
      (result) => result.countryCode?.trim().toUpperCase() === expectedCountryIso2
    ) ??
    results[0] ??
    null
  );
}

export interface GeoNamesCitySearchOptions {
  maxRows?: number;
  fuzzy?: number;
  featureClass?: string | null;
}

/**
 * Search for a populated place (city-level) using GeoNames.
 */
export async function searchCity(
  city: string,
  countryIso2: string,
  config: GeoNamesConfig,
  options: GeoNamesCitySearchOptions = {}
): Promise<GeoNamesSearchResult[]> {
  const {
    maxRows = DEFAULT_CITY_MAX_ROWS,
    fuzzy = DEFAULT_CITY_FUZZY,
    featureClass = 'P',
  } = options;

  const params: GeoNamesParams = {
    q: city,
    country: countryIso2,
    maxRows: String(maxRows),
    fuzzy: String(fuzzy),
  };

  if (featureClass) {
    params.featureClass = featureClass;
  }

  return fetchGeoNames(params, config);
}

export interface GeoNamesAdmin1SearchOptions {
  maxRows?: number;
  fuzzy?: number;
  featureClass?: string | null;
  featureCode?: string | null;
}

/**
 * Search for an ADM1 region using GeoNames.
 */
export async function searchAdmin1(
  admin1: string,
  countryIso2: string,
  config: GeoNamesConfig,
  options: GeoNamesAdmin1SearchOptions = {}
): Promise<GeoNamesSearchResult[]> {
  const {
    maxRows = DEFAULT_ADMIN1_MAX_ROWS,
    fuzzy = DEFAULT_ADMIN1_FUZZY,
    featureClass = 'A',
    featureCode = 'ADM1',
  } = options;

  const params: GeoNamesParams = {
    q: admin1,
    country: countryIso2,
    maxRows: String(maxRows),
    fuzzy: String(fuzzy),
  };

  if (featureClass) {
    params.featureClass = featureClass;
  }
  if (featureCode) {
    params.featureCode = featureCode;
  }

  return fetchGeoNames(params, config);
}
