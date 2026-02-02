/**
 * Cache Key Orchestration Tests (F017)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCacheKey,
  generateCacheKeyAsync,
  ProviderTimeoutError,
  ProviderFetchError,
} from './index';

// Mock the GeoNames client for async tests
vi.mock('../providers/geonames/client', () => ({
  searchCountryPCLI: vi.fn(),
  ProviderTimeoutError: class ProviderTimeoutError extends Error {
    readonly provider = 'geonames' as const;
    constructor() {
      super('GeoNames request timed out');
      this.name = 'ProviderTimeoutError';
    }
  },
  ProviderFetchError: class ProviderFetchError extends Error {
    readonly provider = 'geonames' as const;
    constructor(message: string) {
      super(message);
      this.name = 'ProviderFetchError';
    }
  },
}));

import { searchCountryPCLI } from '../providers/geonames/client';
const mockSearchCountryPCLI = searchCountryPCLI as ReturnType<typeof vi.fn>;

describe('generateCacheKey (sync)', () => {
  describe('PRD Acceptance Criteria', () => {
    it("'Riyadh, Saudi Arabia' → 'SA||riyadh|'", () => {
      const result = generateCacheKey('Riyadh, Saudi Arabia');
      expect(result.key).toBe('SA||riyadh|');
      expect(result.countryIso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
      expect(result.countryUnresolved).toBe(false);
    });

    it("'Eastern Province, Saudi Arabia' → 'SA|eastern province||'", () => {
      const result = generateCacheKey('Eastern Province, Saudi Arabia');
      expect(result.key).toBe('SA|eastern province||');
      expect(result.countryIso2).toBe('SA');
      expect(result.parsed.admin1).toBe('Eastern Province');
      expect(result.parsed.city).toBeUndefined();
    });

    it("'Multiple Areas, Saudi Arabia' → 'SA|||multi'", () => {
      const result = generateCacheKey('Multiple Areas, Saudi Arabia');
      expect(result.key).toBe('SA|||multi');
      expect(result.countryIso2).toBe('SA');
      expect(result.parsed.isMultiArea).toBe(true);
    });
  });

  describe('Acceptance Fixtures (F002)', () => {
    it("ACC001: 'Riyadh, Riyadh Region, Saudi Arabia' → 'SA|riyadh region|riyadh|'", () => {
      const result = generateCacheKey('Riyadh, Riyadh Region, Saudi Arabia');
      expect(result.key).toBe('SA|riyadh region|riyadh|');
      expect(result.parsed.city).toBe('Riyadh');
      expect(result.parsed.admin1).toBe('Riyadh Region');
      expect(result.parsed.countryText).toBe('Saudi Arabia');
    });

    it("ACC003: 'Saudi Arabia' → 'SA|||'", () => {
      const result = generateCacheKey('Saudi Arabia');
      expect(result.key).toBe('SA|||');
      expect(result.parsed.granularityHint).toBe('country');
    });

    it("ACC005: 'Riyadh, KSA' → 'SA||riyadh|'", () => {
      const result = generateCacheKey('Riyadh, KSA');
      expect(result.key).toBe('SA||riyadh|');
      expect(result.countryIso2).toBe('SA');
    });

    it("ACC006: 'Dubai, United Arab Emirates' → 'AE||dubai|'", () => {
      const result = generateCacheKey('Dubai, United Arab Emirates');
      expect(result.key).toBe('AE||dubai|');
      expect(result.countryIso2).toBe('AE');
    });

    it("ACC007: '  Jeddah ,  Saudi Arabia  ' → 'SA||jeddah|'", () => {
      const result = generateCacheKey('  Jeddah ,  Saudi Arabia  ');
      expect(result.key).toBe('SA||jeddah|');
    });

    it("ACC008: 'RIYADH, SAUDI ARABIA' → 'SA||riyadh|'", () => {
      const result = generateCacheKey('RIYADH, SAUDI ARABIA');
      expect(result.key).toBe('SA||riyadh|');
    });
  });

  describe('Problematic Inputs', () => {
    describe('ISO2/ISO3/Abbreviations', () => {
      it("'Riyadh, SA' resolves ISO2", () => {
        const result = generateCacheKey('Riyadh, SA');
        expect(result.key).toBe('SA||riyadh|');
        expect(result.countryIso2).toBe('SA');
      });

      it("'Jeddah, SAU' resolves ISO3", () => {
        const result = generateCacheKey('Jeddah, SAU');
        expect(result.key).toBe('SA||jeddah|');
        expect(result.countryIso2).toBe('SA');
      });

      it("'Dubai, UAE' resolves abbreviation", () => {
        const result = generateCacheKey('Dubai, UAE');
        expect(result.key).toBe('AE||dubai|');
        expect(result.countryIso2).toBe('AE');
      });
    });

    describe('Diacritics', () => {
      it("'Riyāḍh, Saudi Arabia' normalizes diacritics", () => {
        const result = generateCacheKey('Riyāḍh, Saudi Arabia');
        expect(result.key).toBe('SA||riyadh|');
        // Parsed city preserves raw form
        expect(result.parsed.city).toBe('Riyāḍh');
      });
    });

    describe('Hyphenated Names', () => {
      it("'Al-Khobar, Eastern Province, Saudi Arabia' preserves hyphens", () => {
        const result = generateCacheKey(
          'Al-Khobar, Eastern Province, Saudi Arabia'
        );
        expect(result.key).toBe('SA|eastern province|al-khobar|');
        expect(result.parsed.city).toBe('Al-Khobar');
      });
    });

    describe('Extra Punctuation', () => {
      it("handles double commas: 'Riyadh,, Saudi Arabia'", () => {
        const result = generateCacheKey('Riyadh,, Saudi Arabia');
        expect(result.key).toBe('SA||riyadh|');
      });
    });
  });

  describe('Determinism', () => {
    it('equivalent inputs produce identical keys (case variations)', () => {
      const inputs = [
        'Riyadh, Saudi Arabia',
        'RIYADH, SAUDI ARABIA',
        'riyadh, saudi arabia',
        'RiYaDh, SaUdI ArAbIa',
      ];

      const keys = inputs.map((input) => generateCacheKey(input).key);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(1);
      expect(keys[0]).toBe('SA||riyadh|');
    });

    it('equivalent inputs produce identical keys (whitespace variations)', () => {
      const inputs = [
        'Riyadh, Saudi Arabia',
        '  Riyadh  ,  Saudi Arabia  ',
        'Riyadh ,Saudi Arabia',
        'Riyadh,Saudi Arabia',
      ];

      const keys = inputs.map((input) => generateCacheKey(input).key);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(1);
    });

    it('equivalent inputs produce identical keys (diacritics variations)', () => {
      const inputs = [
        'Riyadh, Saudi Arabia',
        'Riyādh, Saudi Arabia',
        'Riyāḍh, Saudi Arabia',
      ];

      const keys = inputs.map((input) => generateCacheKey(input).key);
      const uniqueKeys = new Set(keys);

      expect(uniqueKeys.size).toBe(1);
      expect(keys[0]).toBe('SA||riyadh|');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty input', () => {
      const result = generateCacheKey('');
      expect(result.key).toBe('__|||');
      expect(result.countryIso2).toBeNull();
      expect(result.countryUnresolved).toBe(true);
    });

    it('handles whitespace-only input', () => {
      const result = generateCacheKey('   ');
      expect(result.key).toBe('__|||');
      expect(result.countryUnresolved).toBe(true);
    });

    it('handles unresolved country with __ placeholder', () => {
      const result = generateCacheKey('Riyadh, UnknownCountry');
      expect(result.key).toBe('__||riyadh|');
      expect(result.countryIso2).toBeNull();
      expect(result.countryUnresolved).toBe(true);
      expect(result.resolvedOffline).toBe(true);
    });

    it('returns parsed location in result', () => {
      const result = generateCacheKey('Dammam, Eastern Province, Saudi Arabia');
      expect(result.parsed).toEqual({
        city: 'Dammam',
        admin1: 'Eastern Province',
        countryText: 'Saudi Arabia',
        isMultiArea: false,
        granularityHint: 'city',
      });
    });
  });

  describe('Multi-Area Handling', () => {
    it('handles case-insensitive multi-area', () => {
      const variations = [
        'Multiple Areas, Saudi Arabia',
        'multiple areas, Saudi Arabia',
        'MULTIPLE AREAS, Saudi Arabia',
      ];

      for (const input of variations) {
        const result = generateCacheKey(input);
        expect(result.key).toBe('SA|||multi');
        expect(result.parsed.isMultiArea).toBe(true);
      }
    });
  });
});

describe('generateCacheKeyAsync', () => {
  const defaultOptions = { geonamesUsername: 'testuser' };

  beforeEach(() => {
    mockSearchCountryPCLI.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Offline Resolution (no GeoNames call)', () => {
    it('resolves common country names offline', async () => {
      const result = await generateCacheKeyAsync(
        'Riyadh, Saudi Arabia',
        defaultOptions
      );

      expect(result.key).toBe('SA||riyadh|');
      expect(result.countryIso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
      expect(result.countryUnresolved).toBe(false);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves ISO codes offline', async () => {
      const result = await generateCacheKeyAsync('Dubai, AE', defaultOptions);

      expect(result.key).toBe('AE||dubai|');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves abbreviations offline', async () => {
      const result = await generateCacheKeyAsync('Jeddah, KSA', defaultOptions);

      expect(result.key).toBe('SA||jeddah|');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });
  });

  describe('GeoNames Fallback', () => {
    it('falls back to GeoNames for unknown country names', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 102358,
        name: 'Saudi Arabia',
        countryCode: 'SA',
        lat: 25,
        lng: 45,
      });

      const result = await generateCacheKeyAsync(
        'Riyadh, Arabia Saudita',
        defaultOptions
      );

      expect(result.key).toBe('SA||riyadh|');
      expect(result.countryIso2).toBe('SA');
      expect(result.resolvedOffline).toBe(false);
      expect(result.countryUnresolved).toBe(false);
      expect(mockSearchCountryPCLI).toHaveBeenCalledWith('Arabia Saudita', {
        username: 'testuser',
        timeout: undefined,
      });
    });

    it('handles GeoNames returning no match', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce(null);

      const result = await generateCacheKeyAsync(
        'Riyadh, TotallyFakeCountry',
        defaultOptions
      );

      expect(result.key).toBe('__||riyadh|');
      expect(result.countryIso2).toBeNull();
      expect(result.resolvedOffline).toBe(false);
      expect(result.countryUnresolved).toBe(true);
    });

    it('passes timeout option to GeoNames', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 102358,
        name: 'Saudi Arabia',
        countryCode: 'SA',
        lat: 25,
        lng: 45,
      });

      await generateCacheKeyAsync('Riyadh, Some Country', {
        geonamesUsername: 'testuser',
        timeout: 5000,
      });

      expect(mockSearchCountryPCLI).toHaveBeenCalledWith(
        'Some Country',
        expect.objectContaining({ timeout: 5000 })
      );
    });
  });

  describe('Error Propagation', () => {
    it('propagates ProviderTimeoutError', async () => {
      const timeoutError = new ProviderTimeoutError();
      mockSearchCountryPCLI.mockRejectedValueOnce(timeoutError);

      await expect(
        generateCacheKeyAsync('Riyadh, UnknownCountry', defaultOptions)
      ).rejects.toThrow(ProviderTimeoutError);
    });

    it('propagates ProviderFetchError', async () => {
      const fetchError = new ProviderFetchError('Network error');
      mockSearchCountryPCLI.mockRejectedValueOnce(fetchError);

      await expect(
        generateCacheKeyAsync('Riyadh, UnknownCountry', defaultOptions)
      ).rejects.toThrow(ProviderFetchError);
    });
  });

  describe('PRD Acceptance Criteria (async)', () => {
    it("'Riyadh, Saudi Arabia' → 'SA||riyadh|'", async () => {
      const result = await generateCacheKeyAsync(
        'Riyadh, Saudi Arabia',
        defaultOptions
      );
      expect(result.key).toBe('SA||riyadh|');
    });

    it("'Eastern Province, Saudi Arabia' → 'SA|eastern province||'", async () => {
      const result = await generateCacheKeyAsync(
        'Eastern Province, Saudi Arabia',
        defaultOptions
      );
      expect(result.key).toBe('SA|eastern province||');
    });

    it("'Multiple Areas, Saudi Arabia' → 'SA|||multi'", async () => {
      const result = await generateCacheKeyAsync(
        'Multiple Areas, Saudi Arabia',
        defaultOptions
      );
      expect(result.key).toBe('SA|||multi');
    });
  });

  describe('Empty Input Handling', () => {
    it('handles empty input', async () => {
      const result = await generateCacheKeyAsync('', defaultOptions);
      expect(result.key).toBe('__|||');
      expect(result.countryUnresolved).toBe(true);
      // Empty input should not call GeoNames
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });
  });
});

describe('CacheKeyResult structure', () => {
  it('contains all required fields', () => {
    const result = generateCacheKey('Riyadh, Saudi Arabia');

    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('parsed');
    expect(result).toHaveProperty('countryIso2');
    expect(result).toHaveProperty('resolvedOffline');
    expect(result).toHaveProperty('countryUnresolved');

    expect(typeof result.key).toBe('string');
    expect(typeof result.parsed).toBe('object');
    expect(typeof result.resolvedOffline).toBe('boolean');
    expect(typeof result.countryUnresolved).toBe('boolean');
  });

  it('parsed field matches ParsedLocation interface', () => {
    const result = generateCacheKey('Dammam, Eastern Province, Saudi Arabia');

    expect(result.parsed).toHaveProperty('granularityHint');
    expect(result.parsed).toHaveProperty('isMultiArea');
    expect(result.parsed.city).toBe('Dammam');
    expect(result.parsed.admin1).toBe('Eastern Province');
    expect(result.parsed.countryText).toBe('Saudi Arabia');
  });
});
