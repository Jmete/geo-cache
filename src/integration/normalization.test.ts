/**
 * Token Normalization Integration Tests (F014)
 *
 * Validates that token normalization utilities integrate correctly with
 * the parser for cache key generation. Ensures raw input is preserved
 * while normalized keys are generated for caching.
 */

import { describe, it, expect } from 'vitest';
import { parseLocation } from '../parser';
import { normalizeToken, generateNormalizedKey, isValidNormalizedKey } from '../normalize';

describe('F014: Token Normalization Integration', () => {
  describe('raw input preservation with normalized key generation', () => {
    it('preserves diacritics in raw, normalizes in key', () => {
      const parsed = parseLocation('Riyāḍh, Saudi Arabia');
      expect(parsed.city).toBe('Riyāḍh'); // raw preserved
      expect(normalizeToken(parsed.city)).toBe('riyadh'); // normalized for key
    });

    it('preserves punctuation in raw, normalizes in key', () => {
      const parsed = parseLocation('Riyadh., Saudi Arabia');
      expect(parsed.city).toBe('Riyadh.'); // raw preserved with trailing dot
      expect(normalizeToken(parsed.city)).toBe('riyadh'); // dot stripped
    });

    it('preserves case in raw, normalizes in key', () => {
      const parsed = parseLocation('RIYADH, SAUDI ARABIA');
      expect(parsed.city).toBe('RIYADH'); // raw preserved uppercase
      expect(normalizeToken(parsed.city)).toBe('riyadh'); // lowercased
    });

    it('trims whitespace in raw tokens, normalizes in key', () => {
      const parsed = parseLocation('  Jeddah  ,  Saudi Arabia  ');
      // Parser trims each token
      expect(parsed.city).toBe('Jeddah');
      expect(parsed.countryText).toBe('Saudi Arabia');
      expect(normalizeToken(parsed.city)).toBe('jeddah');
    });

    it('multi-area input generates correct normalized key', () => {
      const parsed = parseLocation('Multiple Areas, Saudi Arabia');
      expect(parsed.isMultiArea).toBe(true);
      expect(parsed.countryText).toBe('Saudi Arabia');

      const key = generateNormalizedKey({
        countryIso2: 'SA',
        isMultiArea: parsed.isMultiArea,
      });
      expect(key).toBe('SA|||multi');
    });
  });

  describe('end-to-end flow with acceptance fixtures', () => {
    it('ACC001: Riyadh, Riyadh Region, Saudi Arabia', () => {
      const parsed = parseLocation('Riyadh, Riyadh Region, Saudi Arabia');
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: parsed.admin1,
        city: parsed.city,
      });

      expect(key).toBe('SA|riyadh region|riyadh|');
      expect(isValidNormalizedKey(key)).toBe(true);
    });

    it('ACC007: whitespace handling (Jeddah)', () => {
      const parsed = parseLocation('  Jeddah ,  Saudi Arabia  ');
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: parsed.city,
      });

      expect(key).toBe('SA||jeddah|');
      expect(isValidNormalizedKey(key)).toBe(true);
    });

    it('PROB008: diacritics (Riyāḍh)', () => {
      const parsed = parseLocation('Riyāḍh, Saudi Arabia');
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: parsed.city,
      });

      expect(key).toBe('SA||riyadh|');
      expect(isValidNormalizedKey(key)).toBe(true);
    });

    it('PROB012: hyphenated city (Al-Khobar)', () => {
      const parsed = parseLocation('Al-Khobar, Eastern Province, Saudi Arabia');
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: parsed.admin1,
        city: parsed.city,
      });

      expect(key).toBe('SA|eastern province|al-khobar|');
      expect(isValidNormalizedKey(key)).toBe(true);
    });

    it('region-only input (Eastern Province)', () => {
      const parsed = parseLocation('Eastern Province, Saudi Arabia');
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: parsed.admin1,
      });

      expect(key).toBe('SA|eastern province||');
      expect(isValidNormalizedKey(key)).toBe(true);
    });

    it('country-only input', () => {
      const parsed = parseLocation('Saudi Arabia');
      expect(parsed.granularityHint).toBe('country');

      const key = generateNormalizedKey({
        countryIso2: 'SA',
      });

      expect(key).toBe('SA|||');
      expect(isValidNormalizedKey(key)).toBe(true);
    });
  });

  describe('stability and consistency', () => {
    it('equivalent inputs produce identical keys (case variation)', () => {
      const inputs = ['Riyadh, Saudi Arabia', 'RIYADH, Saudi Arabia', 'riyadh, Saudi Arabia'];
      const keys = inputs.map((input) => {
        const parsed = parseLocation(input);
        return generateNormalizedKey({
          countryIso2: 'SA',
          city: parsed.city,
        });
      });

      expect(keys[0]).toBe(keys[1]);
      expect(keys[1]).toBe(keys[2]);
      expect(keys[0]).toBe('SA||riyadh|');
    });

    it('equivalent inputs produce identical keys (whitespace variation)', () => {
      const inputs = [
        'Jeddah, Saudi Arabia',
        '  Jeddah  , Saudi Arabia',
        'Jeddah ,  Saudi Arabia  ',
      ];
      const keys = inputs.map((input) => {
        const parsed = parseLocation(input);
        return generateNormalizedKey({
          countryIso2: 'SA',
          city: parsed.city,
        });
      });

      expect(keys[0]).toBe(keys[1]);
      expect(keys[1]).toBe(keys[2]);
    });

    it('equivalent inputs produce identical keys (diacritics variation)', () => {
      const inputs = ['Riyadh, Saudi Arabia', 'Riyāḍh, Saudi Arabia'];
      const keys = inputs.map((input) => {
        const parsed = parseLocation(input);
        return generateNormalizedKey({
          countryIso2: 'SA',
          city: parsed.city,
        });
      });

      expect(keys[0]).toBe(keys[1]);
      expect(keys[0]).toBe('SA||riyadh|');
    });

    it('equivalent inputs produce identical keys (punctuation variation)', () => {
      const inputs = ['Riyadh, Saudi Arabia', 'Riyadh., Saudi Arabia', '.Riyadh, Saudi Arabia'];
      const keys = inputs.map((input) => {
        const parsed = parseLocation(input);
        return generateNormalizedKey({
          countryIso2: 'SA',
          city: parsed.city,
        });
      });

      expect(keys[0]).toBe(keys[1]);
      expect(keys[1]).toBe(keys[2]);
    });

    it('normalizeToken is idempotent', () => {
      const inputs = ['Riyāḍh', 'Al-Khobar', '  Jeddah  ', 'RIYADH.'];

      for (const input of inputs) {
        const once = normalizeToken(input);
        const twice = normalizeToken(once);
        expect(twice).toBe(once);
      }
    });
  });

  describe('character preservation', () => {
    it('preserves alphanumerics', () => {
      expect(normalizeToken('Area51')).toBe('area51');
      expect(normalizeToken('District7')).toBe('district7');
    });

    it('preserves hyphens', () => {
      expect(normalizeToken('Al-Khobar')).toBe('al-khobar');
      expect(normalizeToken('Al-Madinah')).toBe('al-madinah');
    });

    it('preserves apostrophes', () => {
      expect(normalizeToken("Ha'il")).toBe("ha'il");
      expect(normalizeToken("O'Brien")).toBe("o'brien");
    });

    it('hyphens preserved in full flow', () => {
      const parsed = parseLocation('Al-Khobar, Eastern Province, Saudi Arabia');
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        admin1: parsed.admin1,
        city: parsed.city,
      });

      expect(key).toContain('al-khobar');
    });

    it('apostrophes preserved in full flow', () => {
      const parsed = parseLocation("Ha'il, Saudi Arabia");
      const key = generateNormalizedKey({
        countryIso2: 'SA',
        city: parsed.city,
      });

      expect(key).toContain("ha'il");
    });
  });
});
