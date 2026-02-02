/**
 * Provider Abstraction Types (F020)
 *
 * Defines the provider interface and query types for geocoding providers.
 * Supports GeoNames first with easy addition of future providers.
 */

import type { Granularity, ProviderCandidate } from '../types/api';

// =============================================================================
// Provider Query Types
// =============================================================================

/**
 * Query parameters for provider search
 */
export interface ProviderQuery {
  /** City/locality name to search (normalized) */
  city?: string;
  /** Admin1 region name to search (normalized) */
  admin1?: string;
  /** ISO2 country code to constrain search */
  countryIso2: string;
  /** Hint for which granularity to target */
  granularityHint: Granularity;
}

/**
 * Configuration passed to providers
 */
export interface ProviderConfig {
  /** Timeout for provider requests in milliseconds */
  timeout: number;
  /** Provider-specific credentials/settings */
  credentials: Record<string, string>;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * Result from a provider search operation
 */
export interface ProviderSearchResult {
  /** List of candidate locations */
  candidates: ProviderCandidate[];
  /** Whether this was a fallback/relaxed query */
  usedFallback: boolean;
}

/**
 * Provider interface for geocoding services.
 *
 * Implementations must:
 * - Return an empty array (not throw) when no matches exist
 * - Throw ProviderTimeoutError on timeout
 * - Throw ProviderFetchError on network/HTTP errors
 * - Return candidates with all required ProviderCandidate fields populated
 */
export interface Provider {
  /** Unique provider name (e.g., 'geonames', 'nominatim') */
  readonly name: string;

  /**
   * Search for location candidates matching the query.
   *
   * @param query - Search parameters
   * @param config - Provider configuration
   * @returns Search result with candidates and metadata
   * @throws {ProviderTimeoutError} When request exceeds timeout
   * @throws {ProviderFetchError} When request fails (network/HTTP error)
   */
  search(query: ProviderQuery, config: ProviderConfig): Promise<ProviderSearchResult>;
}

// =============================================================================
// Pipeline Types
// =============================================================================

/**
 * Configuration for the provider pipeline
 */
export interface PipelineConfig {
  /** Ordered list of providers to try */
  providers: Provider[];
  /** Timeout per provider in milliseconds */
  timeout: number;
  /** Credentials for providers (keyed by provider name) */
  credentials: Record<string, Record<string, string>>;
}

/**
 * Result from the provider pipeline
 */
export interface PipelineResult {
  /** Aggregated candidates from all successful providers */
  candidates: ProviderCandidate[];
  /** Name of the provider(s) that returned results */
  providersUsed: string[];
  /** Whether any provider timed out */
  hadTimeout: boolean;
  /** Whether any provider returned an error (non-timeout) */
  hadError: boolean;
  /** Whether a fallback/relaxed query was used */
  usedFallback: boolean;
}

/**
 * Error details for pipeline failures
 */
export interface PipelineError {
  /** Provider that failed */
  provider: string;
  /** Error type: 'timeout' or 'error' */
  type: 'timeout' | 'error';
  /** Error message */
  message: string;
}
