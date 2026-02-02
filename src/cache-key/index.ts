/**
 * Cache Key Orchestration Module (F017)
 *
 * Integrates parser, country resolver, and normalizer to produce
 * deterministic cache keys from raw location text.
 *
 * Cache Key Format: `<countryIso2>|<admin1_norm>|<city_norm>|<multi_flag>`
 *
 * Pipeline:
 * 1. parseLocation(text) → ParsedLocation
 * 2. resolveCountryToIso2[Async](countryText) → countryIso2
 * 3. generateNormalizedKey({ countryIso2, admin1, city, isMultiArea }) → key
 */

import type { ParsedLocation } from '../types/api';
import { parseLocation } from '../parser';
import { resolveCountryToIso2 } from '../country';
import {
  resolveCountryToIso2Async,
  type ResolveCountryAsyncOptions,
  ProviderTimeoutError,
  ProviderFetchError,
} from '../country/resolve-async';
import { generateNormalizedKey } from '../normalize';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of cache key generation
 */
export interface CacheKeyResult {
  /** Normalized cache key in format: <countryIso2>|<admin1_norm>|<city_norm>|<multi_flag> */
  key: string;
  /** Parsed location components from the input text */
  parsed: ParsedLocation;
  /** Resolved ISO 3166-1 alpha-2 country code, or null if unresolved */
  countryIso2: string | null;
  /** True if country was resolved offline (no network call) */
  resolvedOffline: boolean;
  /** True if country lookup failed (unresolvable) */
  countryUnresolved: boolean;
}

/**
 * Options for async cache key generation
 */
export interface GenerateCacheKeyAsyncOptions {
  /** GeoNames username for fallback country resolution */
  geonamesUsername: string;
  /** Timeout in milliseconds for GeoNames requests */
  timeout?: number;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * Placeholder for unresolved country in cache key
 */
const UNRESOLVED_COUNTRY_PLACEHOLDER = '__';

// =============================================================================
// Sync Functions
// =============================================================================

/**
 * Generate a cache key synchronously using offline country resolution only.
 *
 * Use this when:
 * - You need a fast, no-network operation
 * - The input is expected to have standard country names/codes
 * - GeoNames fallback is not needed or desired
 *
 * @param text - Raw location text (e.g., "Riyadh, Saudi Arabia")
 * @returns Cache key result with parsed components and resolution metadata
 *
 * @example
 * const result = generateCacheKey('Riyadh, Saudi Arabia');
 * // {
 * //   key: 'SA||riyadh|',
 * //   parsed: { city: 'Riyadh', countryText: 'Saudi Arabia', ... },
 * //   countryIso2: 'SA',
 * //   resolvedOffline: true,
 * //   countryUnresolved: false
 * // }
 *
 * @example
 * const result = generateCacheKey('Riyadh, Unknown Country');
 * // {
 * //   key: '__||riyadh|',
 * //   countryIso2: null,
 * //   resolvedOffline: true,
 * //   countryUnresolved: true
 * // }
 */
export function generateCacheKey(text: string): CacheKeyResult {
  // Step 1: Parse the location text
  const parsed = parseLocation(text);

  // Step 2: Resolve country to ISO2 (offline only)
  const countryIso2 = resolveCountryToIso2(parsed.countryText);
  const countryUnresolved = countryIso2 === null;

  // Step 3: Generate normalized key
  const key = generateNormalizedKey({
    countryIso2: countryIso2 ?? UNRESOLVED_COUNTRY_PLACEHOLDER,
    admin1: parsed.admin1,
    city: parsed.city,
    isMultiArea: parsed.isMultiArea,
  });

  return {
    key,
    parsed,
    countryIso2,
    resolvedOffline: true,
    countryUnresolved,
  };
}

// =============================================================================
// Async Functions
// =============================================================================

/**
 * Generate a cache key asynchronously with GeoNames fallback for country resolution.
 *
 * Use this when:
 * - You need to handle non-standard country names
 * - GeoNames fallback is acceptable for better coverage
 * - Network latency is acceptable
 *
 * @param text - Raw location text (e.g., "Riyadh, Arabia Saudita")
 * @param options - Configuration including GeoNames username
 * @returns Cache key result with parsed components and resolution metadata
 * @throws {ProviderTimeoutError} When GeoNames request times out (should become HTTP 502)
 * @throws {ProviderFetchError} When GeoNames request fails (should become HTTP 502)
 *
 * @example
 * const result = await generateCacheKeyAsync('Riyadh, Saudi Arabia', {
 *   geonamesUsername: 'demo'
 * });
 * // {
 * //   key: 'SA||riyadh|',
 * //   countryIso2: 'SA',
 * //   resolvedOffline: true,  // Common names resolve offline
 * //   countryUnresolved: false
 * // }
 *
 * @example
 * const result = await generateCacheKeyAsync('Riyadh, Arabia Saudita', {
 *   geonamesUsername: 'demo'
 * });
 * // {
 * //   key: 'SA||riyadh|',
 * //   countryIso2: 'SA',
 * //   resolvedOffline: false,  // GeoNames resolved it
 * //   countryUnresolved: false
 * // }
 */
export async function generateCacheKeyAsync(
  text: string,
  options: GenerateCacheKeyAsyncOptions
): Promise<CacheKeyResult> {
  // Step 1: Parse the location text
  const parsed = parseLocation(text);

  // Step 2: Resolve country to ISO2 with GeoNames fallback
  const resolveOptions: ResolveCountryAsyncOptions =
    options.timeout !== undefined
      ? { geonamesUsername: options.geonamesUsername, timeout: options.timeout }
      : { geonamesUsername: options.geonamesUsername };

  const countryResult = await resolveCountryToIso2Async(
    parsed.countryText,
    resolveOptions
  );

  const countryIso2 = countryResult.iso2;
  const countryUnresolved = countryIso2 === null;

  // Step 3: Generate normalized key
  const key = generateNormalizedKey({
    countryIso2: countryIso2 ?? UNRESOLVED_COUNTRY_PLACEHOLDER,
    admin1: parsed.admin1,
    city: parsed.city,
    isMultiArea: parsed.isMultiArea,
  });

  return {
    key,
    parsed,
    countryIso2,
    resolvedOffline: countryResult.resolvedOffline,
    countryUnresolved,
  };
}

// =============================================================================
// Re-exports
// =============================================================================

export { ProviderTimeoutError, ProviderFetchError };
