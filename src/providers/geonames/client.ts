/**
 * GeoNames API Client (F016)
 *
 * Provides a typed interface to the GeoNames API with timeout support.
 * Used for country-level (PCLI) lookups when offline resolution fails.
 */

const GEONAMES_BASE_URL = 'https://secure.geonames.org/searchJSON';
const DEFAULT_TIMEOUT_MS = 7000;

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
}

interface GeoNamesResponse {
  totalResultsCount: number;
  geonames: GeoNamesSearchResult[];
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
  config: GeoNamesConfig
): Promise<GeoNamesSearchResult | null> {
  const { username, timeout = DEFAULT_TIMEOUT_MS } = config;

  const url = new URL(GEONAMES_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('featureCode', 'PCLI');
  url.searchParams.set('maxRows', '1');
  url.searchParams.set('username', username);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ProviderFetchError(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as GeoNamesResponse;

    // GeoNames returns empty array when no matches
    if (!data.geonames || data.geonames.length === 0) {
      return null;
    }

    return data.geonames[0] ?? null;
  } catch (error) {
    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ProviderTimeoutError();
    }

    // Re-throw our custom errors
    if (
      error instanceof ProviderTimeoutError ||
      error instanceof ProviderFetchError
    ) {
      throw error;
    }

    // Wrap unknown errors
    throw new ProviderFetchError(
      error instanceof Error ? error.message : 'Unknown fetch error'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
