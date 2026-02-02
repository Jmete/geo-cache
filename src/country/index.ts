/**
 * Country Resolution Module (F015)
 *
 * Resolves country text to ISO 3166-1 alpha-2 codes using offline mappings.
 * Supports ISO2, ISO3, full country names, and common abbreviations.
 *
 * Resolution Priority:
 * 1. Empty/undefined -> null
 * 2. Valid ISO2 (2 uppercase letters in ISO2_SET) -> return as-is
 * 3. Valid ISO3 (3 letters) -> map via ISO3_TO_ISO2
 * 4. Abbreviation match -> map via ABBREV_TO_ISO2
 * 5. Normalized name match -> map via NAME_TO_ISO2
 * 6. Not found -> null (F016 handles via GeoNames)
 */

import {
  ISO2_SET,
  ISO3_TO_ISO2,
  ABBREV_TO_ISO2,
  NAME_TO_ISO2,
  ISO2_TO_NAME,
  normalizeNameForLookup,
} from './mappings';

/**
 * Resolve country text to ISO 3166-1 alpha-2 code.
 *
 * @param countryText - Raw country text from parser (ISO2, ISO3, name, or abbreviation)
 * @returns ISO2 code (uppercase) or null if not resolvable offline
 *
 * @example
 * resolveCountryToIso2('SA')           // 'SA' (ISO2 pass-through)
 * resolveCountryToIso2('SAU')          // 'SA' (ISO3 to ISO2)
 * resolveCountryToIso2('KSA')          // 'SA' (abbreviation)
 * resolveCountryToIso2('Saudi Arabia') // 'SA' (name lookup)
 * resolveCountryToIso2('Unknown')      // null (not found)
 */
export function resolveCountryToIso2(
  countryText: string | undefined
): string | null {
  // Step 1: Handle empty/undefined
  if (!countryText) {
    return null;
  }

  const trimmed = countryText.trim();
  if (trimmed === '') {
    return null;
  }

  const upperCode = trimmed.toUpperCase();

  // Step 2: Check if already valid ISO2 (2 uppercase letters)
  if (upperCode.length === 2 && /^[A-Z]{2}$/.test(upperCode)) {
    if (ISO2_SET.has(upperCode)) {
      return upperCode;
    }
    // 2-letter code but not valid ISO2 - continue to other checks
  }

  // Step 3: Check ISO3 (3 uppercase letters)
  if (upperCode.length === 3 && /^[A-Z]{3}$/.test(upperCode)) {
    const iso2 = ISO3_TO_ISO2.get(upperCode);
    if (iso2) {
      return iso2;
    }
    // 3-letter code but not valid ISO3 - could be abbreviation like "KSA"
  }

  // Step 4: Check abbreviations (before name lookup for "KSA", "UAE", etc.)
  const abbrevResult = ABBREV_TO_ISO2.get(upperCode);
  if (abbrevResult) {
    return abbrevResult;
  }

  // Step 5: Normalize and check country names
  const normalizedName = normalizeNameForLookup(trimmed);
  const nameResult = NAME_TO_ISO2.get(normalizedName);
  if (nameResult) {
    return nameResult;
  }

  // Step 6: Not found -> return null for F016 fallback
  return null;
}

/**
 * Get the English country name for an ISO2 code.
 *
 * @param iso2 - ISO 3166-1 alpha-2 code
 * @returns English country name or undefined if not found
 *
 * @example
 * getCountryName('SA') // 'Saudi Arabia'
 * getCountryName('XX') // undefined
 */
export function getCountryName(iso2: string): string | undefined {
  return ISO2_TO_NAME.get(iso2.toUpperCase());
}

/**
 * Check if a string is a valid ISO 3166-1 alpha-2 code.
 *
 * @param code - Code to validate
 * @returns true if valid ISO2 code
 *
 * @example
 * isValidIso2('SA')  // true
 * isValidIso2('SAU') // false (3 letters)
 * isValidIso2('XX')  // false (not a country)
 */
export function isValidIso2(code: string): boolean {
  const upper = code.toUpperCase();
  return upper.length === 2 && /^[A-Z]{2}$/.test(upper) && ISO2_SET.has(upper);
}

// Re-export for convenience
export { ISO2_SET, ISO3_TO_ISO2, NAME_TO_ISO2, ABBREV_TO_ISO2, ISO2_TO_NAME };
