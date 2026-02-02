/**
 * Location String Parser (F013)
 *
 * Parses comma-separated location strings into structured components.
 * Handles multi-area detection and determines granularity hints.
 *
 * Parsing Rules:
 * - Split by commas, trim whitespace, filter empty tokens
 * - Detect "Multiple Areas" pattern (case-insensitive)
 * - 3 tokens: city, admin1, country
 * - 2 tokens: region keywords → admin1+country, else city+country
 * - 1 token: country only
 */

import type { ParsedLocation, Granularity } from '../types/api';
import { resolveCountryToIso2 } from '../country';

/**
 * Pattern to detect "multiple areas" indicator (case-insensitive)
 */
const MULTI_AREA_PATTERN = /^\s*multiple\s+areas?\s*$/i;

/**
 * Keywords indicating a token is an admin1/region (not a city)
 * Used for 2-token disambiguation
 */
const REGION_KEYWORDS = [
  'region',
  'province',
  'governorate',
  'emirate',
  'district',
  'prefecture',
  'state',
  'oblast',
  'county',
];

/**
 * Check if a token looks like a region/admin1 name based on keywords.
 *
 * @param token - Token to check
 * @returns true if token contains region keywords
 */
function isRegionToken(token: string): boolean {
  const lower = token.toLowerCase();
  return REGION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
 * Check if a token matches the multi-area pattern.
 *
 * @param token - Token to check
 * @returns true if token is "Multiple Areas" (case-insensitive)
 */
function isMultiAreaToken(token: string): boolean {
  return MULTI_AREA_PATTERN.test(token);
}

/**
 * Check if a token resolves to a known country ISO2.
 *
 * @param token - Token to check
 * @returns true if token resolves to a country ISO2 offline
 */
function isCountryToken(token: string): boolean {
  return resolveCountryToIso2(token) !== null;
}

/**
 * Split input text by commas and clean up tokens.
 * Handles double commas, extra whitespace, etc.
 *
 * @param text - Raw input text
 * @returns Array of cleaned, non-empty tokens
 */
function splitAndCleanTokens(text: string): string[] {
  return text
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Determine granularity hint based on parsed components.
 *
 * @param hasCity - Whether city was parsed
 * @param hasAdmin1 - Whether admin1 was parsed
 * @param isMultiArea - Whether multi-area was detected
 * @returns Granularity hint
 */
function determineGranularity(
  hasCity: boolean,
  hasAdmin1: boolean,
  isMultiArea: boolean
): Granularity {
  if (isMultiArea) return 'multi';
  if (hasCity) return 'city';
  if (hasAdmin1) return 'region';
  return 'country';
}

/**
 * Parse a location string into structured components.
 *
 * @param text - Raw location string (e.g., "Riyadh, Riyadh Region, Saudi Arabia")
 * @returns Parsed location with city, admin1, countryText, isMultiArea, granularityHint
 *
 * @example
 * parseLocation("Riyadh, Riyadh Region, Saudi Arabia")
 * // { city: "Riyadh", admin1: "Riyadh Region", countryText: "Saudi Arabia",
 * //   isMultiArea: false, granularityHint: "city" }
 *
 * parseLocation("Najran Region, Saudi Arabia")
 * // { admin1: "Najran Region", countryText: "Saudi Arabia",
 * //   isMultiArea: false, granularityHint: "region" }
 *
 * parseLocation("Multiple Areas, Saudi Arabia")
 * // { countryText: "Saudi Arabia", isMultiArea: true, granularityHint: "multi" }
 */
export function parseLocation(text: string): ParsedLocation {
  const tokens = splitAndCleanTokens(text);

  // Empty input or all-whitespace
  if (tokens.length === 0) {
    return {
      isMultiArea: false,
      granularityHint: 'country',
    };
  }

  // Check for multi-area pattern in any token (typically first)
  const multiAreaIdx = tokens.findIndex(isMultiAreaToken);
  const isMultiArea = multiAreaIdx !== -1;

  // If multi-area detected, remove that token and extract country
  if (isMultiArea) {
    const filteredTokens = tokens.filter((_, i) => i !== multiAreaIdx);
    const countryText = filteredTokens[filteredTokens.length - 1];

    // Only include countryText if it exists
    if (countryText) {
      return {
        countryText,
        isMultiArea: true,
        granularityHint: 'multi',
      };
    }
    return {
      isMultiArea: true,
      granularityHint: 'multi',
    };
  }

  // Handle by token count - we know tokens.length >= 1 here
  const [first, second, ...rest] = tokens;

  // First token is guaranteed to exist
  if (!first) {
    return {
      isMultiArea: false,
      granularityHint: 'country',
    };
  }

  // Single token = country only
  if (!second) {
    return {
      countryText: first,
      isMultiArea: false,
      granularityHint: 'country',
    };
  }

  // Two tokens = city+country or region+country
  if (rest.length === 0) {
    const firstIsCountry = isCountryToken(first);
    const secondIsCountry = isCountryToken(second);

    if (firstIsCountry && !secondIsCountry) {
      return {
        countryText: first,
        isMultiArea: false,
        granularityHint: 'country',
      };
    }

    if (isRegionToken(first)) {
      return {
        admin1: first,
        countryText: second,
        isMultiArea: false,
        granularityHint: 'region',
      };
    }
    return {
      city: first,
      countryText: second,
      isMultiArea: false,
      granularityHint: 'city',
    };
  }

  // 3+ tokens: city, admin1 (middle), country (last)
  const countryText = rest[rest.length - 1] ?? second;
  const admin1Parts = [second, ...rest.slice(0, -1)];
  const admin1 = admin1Parts.join(', ');

  return {
    city: first,
    admin1,
    countryText,
    isMultiArea: false,
    granularityHint: determineGranularity(true, admin1.length > 0, false),
  };
}
