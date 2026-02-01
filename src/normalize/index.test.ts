/**
 * Tests for Deterministic Normalization Module (F005)
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeToken,
  tokensEqual,
  generateNormalizedKey,
  parseNormalizedKey,
  isValidNormalizedKey,
  compareCandidates,
  sortCandidatesDeterministically,
  isAmbiguousResult,
  AMBIGUITY_THRESHOLD,
  type TieBreakCandidate,
} from './index';

describe('normalizeToken', () => {
  describe('case folding', () => {
    it('converts uppercase to lowercase', () => {
      expect(normalizeToken('RIYADH')).toBe('riyadh');
      expect(normalizeToken('SAUDI ARABIA')).toBe('saudi arabia');
    });

    it('converts mixed case to lowercase', () => {
      expect(normalizeToken('RiYaDh')).toBe('riyadh');
      expect(normalizeToken('Al Madinah')).toBe('al madinah');
    });
  });

  describe('diacritics removal', () => {
    it('removes Arabic transliteration diacritics', () => {
      expect(normalizeToken('Riyāḍh')).toBe('riyadh');
    });

    it('removes common accents', () => {
      expect(normalizeToken('café')).toBe('cafe');
      expect(normalizeToken('naïve')).toBe('naive');
      expect(normalizeToken('São Paulo')).toBe('sao paulo');
    });

    it('handles multiple diacritics', () => {
      // Apostrophes are preserved as they are meaningful in names
      expect(normalizeToken('Ḥā\'il')).toBe("ha'il");
    });
  });

  describe('whitespace normalization', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeToken('  Riyadh  ')).toBe('riyadh');
      expect(normalizeToken('\t Jeddah \n')).toBe('jeddah');
    });

    it('collapses multiple internal spaces', () => {
      expect(normalizeToken('Saudi    Arabia')).toBe('saudi arabia');
      expect(normalizeToken('Eastern   Province')).toBe('eastern province');
    });

    it('handles tabs and other whitespace', () => {
      expect(normalizeToken('Riyadh\tRegion')).toBe('riyadh region');
    });
  });

  describe('punctuation trimming', () => {
    it('removes leading punctuation', () => {
      expect(normalizeToken('.Riyadh')).toBe('riyadh');
      expect(normalizeToken('...Riyadh')).toBe('riyadh');
    });

    it('removes trailing punctuation', () => {
      expect(normalizeToken('Riyadh.')).toBe('riyadh');
      expect(normalizeToken('Riyadh...')).toBe('riyadh');
    });

    it('preserves internal punctuation like hyphens', () => {
      expect(normalizeToken('Al-Khobar')).toBe('al-khobar');
      expect(normalizeToken('Al-Madinah Al-Munawwarah')).toBe('al-madinah al-munawwarah');
    });

    it('preserves apostrophes in names', () => {
      expect(normalizeToken("Ha'il")).toBe("ha'il");
    });
  });

  describe('empty/null handling', () => {
    it('returns empty string for null', () => {
      expect(normalizeToken(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(normalizeToken(undefined)).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(normalizeToken('')).toBe('');
    });

    it('returns empty string for whitespace-only', () => {
      expect(normalizeToken('   ')).toBe('');
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const input = 'Riyadh, Saudi Arabia';
      const result1 = normalizeToken(input);
      const result2 = normalizeToken(input);
      const result3 = normalizeToken(input);
      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('produces identical output for inputs differing only in casing', () => {
      expect(normalizeToken('riyadh')).toBe(normalizeToken('RIYADH'));
      expect(normalizeToken('Riyadh')).toBe(normalizeToken('rIYADH'));
    });

    it('produces identical output for inputs differing only in whitespace', () => {
      expect(normalizeToken('Riyadh')).toBe(normalizeToken('  Riyadh  '));
      expect(normalizeToken('Saudi Arabia')).toBe(normalizeToken('Saudi   Arabia'));
    });

    it('produces identical output for inputs differing only in diacritics', () => {
      expect(normalizeToken('Riyadh')).toBe(normalizeToken('Riyāḍh'));
    });

    it('produces identical output for inputs differing only in punctuation', () => {
      expect(normalizeToken('Riyadh')).toBe(normalizeToken('Riyadh.'));
      expect(normalizeToken('Riyadh')).toBe(normalizeToken('.Riyadh'));
    });
  });
});

describe('tokensEqual', () => {
  it('returns true for equivalent tokens after normalization', () => {
    expect(tokensEqual('RIYADH', 'riyadh')).toBe(true);
    expect(tokensEqual('Riyāḍh', 'Riyadh')).toBe(true);
    expect(tokensEqual('  Riyadh  ', 'Riyadh')).toBe(true);
  });

  it('returns false for different tokens', () => {
    expect(tokensEqual('Riyadh', 'Jeddah')).toBe(false);
    expect(tokensEqual('Saudi Arabia', 'Egypt')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(tokensEqual(null, null)).toBe(true);
    expect(tokensEqual(undefined, undefined)).toBe(true);
    expect(tokensEqual(null, '')).toBe(true);
    expect(tokensEqual('Riyadh', null)).toBe(false);
  });
});

describe('generateNormalizedKey', () => {
  describe('key format', () => {
    it('generates city+region+country key', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: 'Riyadh Region',
        city: 'Riyadh',
      });
      expect(key).toBe('SA|riyadh region|riyadh|');
    });

    it('generates region+country key', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: 'Eastern Province',
      });
      expect(key).toBe('SA|eastern province||');
    });

    it('generates country-only key', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
      });
      expect(key).toBe('SA|||');
    });

    it('generates multi-area key', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        isMultiArea: true,
      });
      expect(key).toBe('SA|||multi');
    });

    it('generates city-only key (no admin1)', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'Riyadh',
      });
      expect(key).toBe('SA||riyadh|');
    });
  });

  describe('acceptance fixtures from F002', () => {
    it('ACC001: Riyadh, Riyadh Region, Saudi Arabia', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: 'Riyadh Region',
        city: 'Riyadh',
      });
      expect(key).toBe('SA|riyadh region|riyadh|');
    });

    it('ACC002: Eastern Province, Saudi Arabia', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: 'Eastern Province',
      });
      expect(key).toBe('SA|eastern province||');
    });

    it('ACC003: Saudi Arabia', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
      });
      expect(key).toBe('SA|||');
    });

    it('ACC004: Multiple Areas, Saudi Arabia', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        isMultiArea: true,
      });
      expect(key).toBe('SA|||multi');
    });

    it('ACC005: Riyadh, KSA (city only)', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'Riyadh',
      });
      expect(key).toBe('SA||riyadh|');
    });

    it('ACC006: Dubai, United Arab Emirates', () => {
      const key = generateNormalizedKey({
        countryIso2: 'AE',
        city: 'Dubai',
      });
      expect(key).toBe('AE||dubai|');
    });

    it('ACC007: Whitespace normalization (Jeddah)', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: '  Jeddah  ',
      });
      expect(key).toBe('SA||jeddah|');
    });

    it('ACC008: Case normalization (RIYADH)', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'RIYADH',
      });
      expect(key).toBe('SA||riyadh|');
    });
  });

  describe('determinism', () => {
    it('produces identical keys for identical inputs', () => {
      const params = {
        countryIso2: 'SA',
        admin1: 'Riyadh Region',
        city: 'Riyadh',
      };
      const key1 = generateNormalizedKey(params);
      const key2 = generateNormalizedKey(params);
      const key3 = generateNormalizedKey(params);
      expect(key1).toBe(key2);
      expect(key2).toBe(key3);
    });

    it('produces identical keys for inputs differing in casing', () => {
      const key1 = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'RIYADH',
      });
      const key2 = generateNormalizedKey({
        countryIso2: 'sa', // lowercase country will be uppercased
        city: 'riyadh',
      });
      expect(key1).toBe(key2);
    });

    it('produces identical keys for inputs differing in whitespace', () => {
      const key1 = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'Riyadh',
      });
      const key2 = generateNormalizedKey({
        countryIso2: 'SA',
        city: '  Riyadh  ',
      });
      expect(key1).toBe(key2);
    });

    it('produces identical keys for inputs differing in diacritics', () => {
      const key1 = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'Riyadh',
      });
      const key2 = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'Riyāḍh',
      });
      expect(key1).toBe(key2);
    });
  });

  describe('edge cases', () => {
    it('handles null admin1/city', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: null,
        city: null,
      });
      expect(key).toBe('SA|||');
    });

    it('handles undefined admin1/city', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: undefined,
        city: undefined,
      });
      expect(key).toBe('SA|||');
    });

    it('handles hyphenated names', () => {
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: 'Al-Khobar',
        admin1: 'Eastern Province',
      });
      expect(key).toBe('SA|eastern province|al-khobar|');
    });

    it('country ISO2 is always uppercase', () => {
      const key = generateNormalizedKey({
        countryIso2: 'sa',
        city: 'Riyadh',
      });
      expect(key).toBe('SA||riyadh|');
    });
  });
});

describe('parseNormalizedKey', () => {
  it('parses city+region+country key', () => {
    const parsed = parseNormalizedKey('SA|riyadh region|riyadh|');
    expect(parsed).toEqual({
      countryIso2: 'SA',
      admin1: 'riyadh region',
      city: 'riyadh',
      isMultiArea: false,
    });
  });

  it('parses region+country key', () => {
    const parsed = parseNormalizedKey('SA|eastern province||');
    expect(parsed).toEqual({
      countryIso2: 'SA',
      admin1: 'eastern province',
      city: undefined,
      isMultiArea: false,
    });
  });

  it('parses country-only key', () => {
    const parsed = parseNormalizedKey('SA|||');
    expect(parsed).toEqual({
      countryIso2: 'SA',
      admin1: undefined,
      city: undefined,
      isMultiArea: false,
    });
  });

  it('parses multi-area key', () => {
    const parsed = parseNormalizedKey('SA|||multi');
    expect(parsed).toEqual({
      countryIso2: 'SA',
      admin1: undefined,
      city: undefined,
      isMultiArea: true,
    });
  });

  it('round-trips through generate and parse', () => {
    const original = {
      countryIso2: 'SA',
      admin1: 'Riyadh Region',
      city: 'Riyadh',
      isMultiArea: false,
    };
    const key = generateNormalizedKey(original);
    const parsed = parseNormalizedKey(key);

    // Note: parsed values are normalized (lowercase)
    expect(parsed.countryIso2).toBe('SA');
    expect(parsed.admin1).toBe('riyadh region');
    expect(parsed.city).toBe('riyadh');
    expect(parsed.isMultiArea).toBe(false);
  });
});

describe('isValidNormalizedKey', () => {
  it('returns true for valid keys', () => {
    expect(isValidNormalizedKey('SA|riyadh region|riyadh|')).toBe(true);
    expect(isValidNormalizedKey('SA|eastern province||')).toBe(true);
    expect(isValidNormalizedKey('SA|||')).toBe(true);
    expect(isValidNormalizedKey('SA|||multi')).toBe(true);
    expect(isValidNormalizedKey('AE||dubai|')).toBe(true);
  });

  it('returns false for invalid country code', () => {
    expect(isValidNormalizedKey('S|riyadh||')).toBe(false); // Too short
    expect(isValidNormalizedKey('SAU|riyadh||')).toBe(false); // Too long
    expect(isValidNormalizedKey('sa|riyadh||')).toBe(false); // Lowercase
    expect(isValidNormalizedKey('12|riyadh||')).toBe(false); // Numbers
  });

  it('returns false for wrong number of parts', () => {
    expect(isValidNormalizedKey('SA|riyadh|')).toBe(false); // 3 parts
    expect(isValidNormalizedKey('SA|riyadh||extra|')).toBe(false); // 5 parts
    expect(isValidNormalizedKey('SA')).toBe(false); // 1 part
  });

  it('returns false for invalid multi flag', () => {
    expect(isValidNormalizedKey('SA|||invalid')).toBe(false);
    expect(isValidNormalizedKey('SA|||MULTI')).toBe(false); // uppercase
  });
});

describe('Tie-break rules', () => {
  describe('compareCandidates', () => {
    it('prefers higher score', () => {
      const a: TieBreakCandidate = { score: 0.9, population: 100, providerId: '1' };
      const b: TieBreakCandidate = { score: 0.8, population: 100, providerId: '1' };
      expect(compareCandidates(a, b)).toBeLessThan(0); // a comes first
    });

    it('prefers higher population when scores equal', () => {
      const a: TieBreakCandidate = { score: 0.9, population: 1000000, providerId: '1' };
      const b: TieBreakCandidate = { score: 0.9, population: 500000, providerId: '1' };
      expect(compareCandidates(a, b)).toBeLessThan(0); // a comes first
    });

    it('prefers lower providerId when score and population equal', () => {
      const a: TieBreakCandidate = { score: 0.9, population: 100, providerId: '100' };
      const b: TieBreakCandidate = { score: 0.9, population: 100, providerId: '200' };
      expect(compareCandidates(a, b)).toBeLessThan(0); // a comes first (100 < 200)
    });

    it('handles undefined population', () => {
      const a: TieBreakCandidate = { score: 0.9, providerId: '1' };
      const b: TieBreakCandidate = { score: 0.9, population: 100, providerId: '1' };
      expect(compareCandidates(a, b)).toBeGreaterThan(0); // b comes first (has population)
    });

    it('returns 0 for identical candidates', () => {
      const a: TieBreakCandidate = { score: 0.9, population: 100, providerId: '1' };
      const b: TieBreakCandidate = { score: 0.9, population: 100, providerId: '1' };
      expect(compareCandidates(a, b)).toBe(0);
    });
  });

  describe('sortCandidatesDeterministically', () => {
    it('sorts by score descending', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.7, providerId: '1' },
        { score: 0.9, providerId: '2' },
        { score: 0.8, providerId: '3' },
      ];
      const sorted = sortCandidatesDeterministically(candidates);
      expect(sorted.map((c) => c.score)).toEqual([0.9, 0.8, 0.7]);
    });

    it('uses population as secondary sort', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.9, population: 100, providerId: '1' },
        { score: 0.9, population: 1000, providerId: '2' },
        { score: 0.9, population: 500, providerId: '3' },
      ];
      const sorted = sortCandidatesDeterministically(candidates);
      expect(sorted.map((c) => c.population)).toEqual([1000, 500, 100]);
    });

    it('uses providerId as tertiary sort', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.9, population: 100, providerId: '300' },
        { score: 0.9, population: 100, providerId: '100' },
        { score: 0.9, population: 100, providerId: '200' },
      ];
      const sorted = sortCandidatesDeterministically(candidates);
      expect(sorted.map((c) => c.providerId)).toEqual(['100', '200', '300']);
    });

    it('does not mutate original array', () => {
      const original: TieBreakCandidate[] = [
        { score: 0.7, providerId: '1' },
        { score: 0.9, providerId: '2' },
      ];
      const originalCopy = [...original];
      sortCandidatesDeterministically(original);
      expect(original).toEqual(originalCopy);
    });

    it('produces deterministic results across multiple sorts', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.85, population: 500000, providerId: '12345' },
        { score: 0.85, population: 500000, providerId: '12346' },
        { score: 0.85, population: 600000, providerId: '99999' },
        { score: 0.90, population: 100000, providerId: '00001' },
      ];

      const sorted1 = sortCandidatesDeterministically(candidates);
      const sorted2 = sortCandidatesDeterministically(candidates);
      const sorted3 = sortCandidatesDeterministically(candidates);

      expect(sorted1).toEqual(sorted2);
      expect(sorted2).toEqual(sorted3);

      // Verify order is correct
      expect(sorted1[0]?.providerId).toBe('00001'); // Highest score
      expect(sorted1[1]?.providerId).toBe('99999'); // Same score, higher population
      expect(sorted1[2]?.providerId).toBe('12345'); // Same score+pop, lower providerId
      expect(sorted1[3]?.providerId).toBe('12346');
    });
  });

  describe('isAmbiguousResult', () => {
    it('returns false for single candidate', () => {
      expect(isAmbiguousResult([{ score: 0.9, providerId: '1' }])).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(isAmbiguousResult([])).toBe(false);
    });

    it('returns true when top 2 scores are within threshold', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.90, providerId: '1' },
        { score: 0.87, providerId: '2' }, // Within 0.05
      ];
      expect(isAmbiguousResult(candidates)).toBe(true);
    });

    it('returns true when scores are exactly at threshold', () => {
      // Use values that don't have floating point precision issues
      const candidates: TieBreakCandidate[] = [
        { score: 0.95, providerId: '1' },
        { score: 0.90, providerId: '2' }, // Exactly 0.05 difference
      ];
      expect(isAmbiguousResult(candidates)).toBe(true);
    });

    it('returns false when scores exceed threshold', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.90, providerId: '1' },
        { score: 0.84, providerId: '2' }, // 0.06 difference
      ];
      expect(isAmbiguousResult(candidates)).toBe(false);
    });

    it('only considers first two candidates', () => {
      const candidates: TieBreakCandidate[] = [
        { score: 0.90, providerId: '1' },
        { score: 0.80, providerId: '2' },
        { score: 0.88, providerId: '3' }, // Close to first but third
      ];
      expect(isAmbiguousResult(candidates)).toBe(false);
    });
  });

  describe('AMBIGUITY_THRESHOLD constant', () => {
    it('is 0.05', () => {
      expect(AMBIGUITY_THRESHOLD).toBe(0.05);
    });
  });
});
