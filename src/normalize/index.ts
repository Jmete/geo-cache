/**
 * Deterministic Text Normalization Module (F005)
 *
 * Provides stable, repeatable normalization for geocoding cache keys.
 * Ensures identical inputs produce identical normalized outputs across
 * all calls and deployments.
 *
 * Normalization Rules:
 * 1. Case folding: Convert to lowercase
 * 2. Diacritics removal: NFD decomposition + strip combining marks
 * 3. Punctuation trimming: Remove leading/trailing punctuation
 * 4. Whitespace normalization: Collapse multiple spaces, trim
 * 5. Hyphen normalization: Preserve hyphens (meaningful in names)
 *
 * Cache Key Format:
 * `<countryIso2>|<admin1_norm>|<city_norm>|<multi_flag>`
 *
 * Tie-Break Rules (for candidate selection when scores match):
 * 1. Higher score wins
 * 2. If scores within threshold (0.05): higher population/importance wins
 * 3. If still tied: lower providerId wins (alphabetic/numeric sort)
 * This ensures deterministic selection across repeated queries.
 */

/**
 * Unicode combining diacritical marks range (U+0300 to U+036F)
 * Used to strip accents after NFD decomposition
 */
const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;

/**
 * Leading/trailing punctuation (preserves internal punctuation like hyphens)
 */
const LEADING_PUNCTUATION_REGEX = /^[^\p{L}\p{N}]+/u;
const TRAILING_PUNCTUATION_REGEX = /[^\p{L}\p{N}]+$/u;

/**
 * Multiple whitespace characters (spaces, tabs, etc.)
 */
const MULTIPLE_WHITESPACE_REGEX = /\s+/g;

/**
 * Normalize a single token (city, admin1, or country text) for cache key use.
 *
 * @param token - Raw input token
 * @returns Normalized token, or empty string if input is nullish/empty
 *
 * @example
 * normalizeToken("Riyāḍh") // "riyadh"
 * normalizeToken("  Al-Khobar  ") // "al-khobar"
 * normalizeToken("RIYADH") // "riyadh"
 * normalizeToken("Riyadh Region") // "riyadh region"
 */
export function normalizeToken(token: string | null | undefined): string {
  if (!token) {
    return '';
  }

  let result = token;

  // Step 1: NFD decomposition to separate base chars from combining marks
  result = result.normalize('NFD');

  // Step 2: Remove combining diacritical marks (accents)
  result = result.replace(COMBINING_MARKS_REGEX, '');

  // Step 3: Convert to lowercase (case folding)
  result = result.toLowerCase();

  // Step 4: Normalize whitespace (collapse multiple spaces/tabs to single space)
  result = result.replace(MULTIPLE_WHITESPACE_REGEX, ' ');

  // Step 5: Trim leading/trailing whitespace
  result = result.trim();

  // Step 6: Remove leading punctuation (but preserve internal like hyphens)
  result = result.replace(LEADING_PUNCTUATION_REGEX, '');

  // Step 7: Remove trailing punctuation
  result = result.replace(TRAILING_PUNCTUATION_REGEX, '');

  return result;
}

/**
 * Check if normalized tokens are equivalent.
 * Useful for comparing user input against stored normalized values.
 *
 * @param a - First token (raw or normalized)
 * @param b - Second token (raw or normalized)
 * @returns true if tokens normalize to the same value
 */
export function tokensEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return normalizeToken(a) === normalizeToken(b);
}

/**
 * Parameters for generating a normalized cache key
 */
export interface NormalizedKeyParams {
  /** ISO 3166-1 alpha-2 country code (already resolved) */
  countryIso2: string;
  /** Admin1/region name (optional) */
  admin1?: string | null | undefined;
  /** City name (optional) */
  city?: string | null | undefined;
  /** Whether this is a multi-area input */
  isMultiArea?: boolean;
}

/**
 * Generate a deterministic normalized cache key.
 *
 * Format: `<countryIso2>|<admin1_norm>|<city_norm>|<multi_flag>`
 *
 * - countryIso2: Uppercase 2-letter code (e.g., "SA")
 * - admin1_norm: Normalized admin1 or empty string
 * - city_norm: Normalized city or empty string
 * - multi_flag: "multi" if isMultiArea, empty string otherwise
 *
 * @param params - Key generation parameters
 * @returns Deterministic normalized key string
 *
 * @example
 * generateNormalizedKey({ countryIso2: 'SA', city: 'Riyadh', admin1: 'Riyadh Region' })
 * // "SA|riyadh region|riyadh|"
 *
 * generateNormalizedKey({ countryIso2: 'SA', admin1: 'Eastern Province' })
 * // "SA|eastern province||"
 *
 * generateNormalizedKey({ countryIso2: 'SA', isMultiArea: true })
 * // "SA|||multi"
 */
export function generateNormalizedKey(params: NormalizedKeyParams): string {
  const { countryIso2, admin1, city, isMultiArea } = params;

  // Country ISO2 is always uppercase (already resolved)
  const countryPart = countryIso2.toUpperCase();

  // Normalize admin1 and city tokens
  const admin1Part = normalizeToken(admin1);
  const cityPart = normalizeToken(city);

  // Multi-area flag
  const multiPart = isMultiArea ? 'multi' : '';

  return `${countryPart}|${admin1Part}|${cityPart}|${multiPart}`;
}

/**
 * Parse a normalized key back into its components.
 * Useful for debugging and validation.
 *
 * @param key - Normalized key string
 * @returns Parsed components
 */
export function parseNormalizedKey(key: string): NormalizedKeyParams {
  const parts = key.split('|');

  return {
    countryIso2: parts[0] || '',
    admin1: parts[1] || undefined,
    city: parts[2] || undefined,
    isMultiArea: parts[3] === 'multi',
  };
}

/**
 * Validate that a normalized key is well-formed.
 *
 * @param key - Key to validate
 * @returns true if key has correct format
 */
export function isValidNormalizedKey(key: string): boolean {
  const parts = key.split('|');

  // Must have exactly 4 parts
  if (parts.length !== 4) {
    return false;
  }

  // Country ISO2 must be 2 uppercase letters
  const countryPart = parts[0] ?? '';
  if (!/^[A-Z]{2}$/.test(countryPart)) {
    return false;
  }

  // Multi flag must be empty or "multi"
  const multiPart = parts[3] ?? '';
  if (multiPart !== '' && multiPart !== 'multi') {
    return false;
  }

  return true;
}

/**
 * Tie-break rules for deterministic candidate selection.
 *
 * When two candidates have scores within the ambiguity threshold (0.05),
 * these rules determine which candidate wins:
 *
 * 1. Higher score wins (primary sort)
 * 2. Higher population/importance wins (secondary sort)
 * 3. Lower providerId wins (tertiary sort for absolute determinism)
 *
 * This interface documents the expected shape for tie-breaking.
 */
export interface TieBreakCandidate {
  score: number;
  population?: number;
  providerId: string;
}

/**
 * Compare two candidates for deterministic ordering.
 * Returns negative if a should come first, positive if b should come first.
 *
 * @param a - First candidate
 * @param b - Second candidate
 * @returns Comparison result for sorting
 */
export function compareCandidates(
  a: TieBreakCandidate,
  b: TieBreakCandidate
): number {
  // Rule 1: Higher score wins
  if (a.score !== b.score) {
    return b.score - a.score; // Descending
  }

  // Rule 2: Higher population wins
  const popA = a.population ?? 0;
  const popB = b.population ?? 0;
  if (popA !== popB) {
    return popB - popA; // Descending
  }

  // Rule 3: Lower providerId wins (lexicographic ascending)
  return a.providerId.localeCompare(b.providerId);
}

/**
 * Sort candidates deterministically using tie-break rules.
 * The first candidate in the result is the "best" candidate.
 *
 * @param candidates - Array of candidates to sort
 * @returns New array sorted by tie-break rules
 */
export function sortCandidatesDeterministically<T extends TieBreakCandidate>(
  candidates: T[]
): T[] {
  return [...candidates].sort(compareCandidates);
}

/**
 * Ambiguity threshold for candidate scoring.
 * If top two candidates are within this threshold, result is marked ambiguous.
 */
export const AMBIGUITY_THRESHOLD = 0.05;

/**
 * Check if the top two candidates are ambiguous (scores too close).
 *
 * @param sortedCandidates - Candidates already sorted by tie-break rules
 * @returns true if ambiguous
 */
export function isAmbiguousResult(sortedCandidates: TieBreakCandidate[]): boolean {
  if (sortedCandidates.length < 2) {
    return false;
  }

  const first = sortedCandidates[0];
  const second = sortedCandidates[1];

  // TypeScript guard - already checked length >= 2
  if (!first || !second) {
    return false;
  }

  return Math.abs(first.score - second.score) <= AMBIGUITY_THRESHOLD;
}
