/**
 * Async Country Resolution with GeoNames Fallback (F016)
 *
 * Extends offline country resolution by falling back to GeoNames PCLI search
 * when the offline mapping fails to find a match.
 *
 * Resolution Flow:
 * 1. Try offline resolution (fast, no network)
 * 2. If offline fails and input is non-empty, call GeoNames PCLI search
 * 3. Return result with metadata (resolvedOffline, ambiguous flags)
 *
 * Error Handling:
 * - Timeout: throws ProviderTimeoutError (caller returns 502)
 * - Network/HTTP error: throws ProviderFetchError (caller returns 502)
 * - No match: returns { iso2: null, ambiguous: true } (caller returns 200 with low confidence)
 */

import { resolveCountryToIso2, isValidIso2 } from './index';
import {
  searchCountryPCLI,
  ProviderTimeoutError,
  ProviderFetchError,
} from '../providers/geonames/client';

// =============================================================================
// Types
// =============================================================================

export interface ResolveCountryAsyncOptions {
  geonamesUsername: string;
  timeout?: number;
}

export interface ResolveCountryResult {
  /** ISO 3166-1 alpha-2 code, or null if not resolvable */
  iso2: string | null;
  /** True if resolved via offline mapping (no network call made) */
  resolvedOffline: boolean;
  /** True if resolution failed - indicates low confidence result */
  ambiguous?: boolean;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Resolve country text to ISO2 code with GeoNames fallback.
 *
 * @param countryText - Raw country text from parser
 * @param options - Configuration including GeoNames username
 * @returns Resolution result with metadata
 * @throws {ProviderTimeoutError} When GeoNames request times out
 * @throws {ProviderFetchError} When GeoNames request fails
 *
 * @example
 * // Offline resolution (fast path)
 * const result = await resolveCountryToIso2Async('Saudi Arabia', { geonamesUsername: 'demo' });
 * // { iso2: 'SA', resolvedOffline: true }
 *
 * @example
 * // GeoNames fallback
 * const result = await resolveCountryToIso2Async('Arabia Saudita', { geonamesUsername: 'demo' });
 * // { iso2: 'SA', resolvedOffline: false }
 *
 * @example
 * // No match
 * const result = await resolveCountryToIso2Async('Unknown XYZ', { geonamesUsername: 'demo' });
 * // { iso2: null, resolvedOffline: false, ambiguous: true }
 */
export async function resolveCountryToIso2Async(
  countryText: string | undefined,
  options: ResolveCountryAsyncOptions
): Promise<ResolveCountryResult> {
  // Step 1: Try offline resolution first (fast path)
  const offlineResult = resolveCountryToIso2(countryText);

  if (offlineResult !== null) {
    return {
      iso2: offlineResult,
      resolvedOffline: true,
    };
  }

  // Step 2: Handle empty/undefined input - no fallback needed
  if (!countryText || countryText.trim() === '') {
    return {
      iso2: null,
      resolvedOffline: true,
      ambiguous: true,
    };
  }

  // Step 3: Call GeoNames PCLI search
  const geonamesConfig =
    options.timeout !== undefined
      ? { username: options.geonamesUsername, timeout: options.timeout }
      : { username: options.geonamesUsername };
  const geonamesResult = await searchCountryPCLI(
    countryText.trim(),
    geonamesConfig
  );

  // Step 4: No match from GeoNames
  if (!geonamesResult) {
    return {
      iso2: null,
      resolvedOffline: false,
      ambiguous: true,
    };
  }

  // Step 5: Validate and return ISO2
  const iso2 = geonamesResult.countryCode;
  if (isValidIso2(iso2)) {
    return {
      iso2,
      resolvedOffline: false,
    };
  }

  // Unexpected: GeoNames returned invalid ISO2 code
  return {
    iso2: null,
    resolvedOffline: false,
    ambiguous: true,
  };
}

// Re-export error types for upstream handling
export { ProviderTimeoutError, ProviderFetchError };
