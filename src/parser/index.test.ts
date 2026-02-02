/**
 * Location Parser Tests (F013)
 *
 * Tests for comma-separated token parsing and multi-area detection.
 */

import { describe, expect, it } from 'vitest';
import { parseLocation } from './index';

describe('parseLocation', () => {
  describe('F013 Step 1: city+region+country parsing', () => {
    it('parses "Riyadh, Riyadh Region, Saudi Arabia" correctly', () => {
      const result = parseLocation('Riyadh, Riyadh Region, Saudi Arabia');

      expect(result.city).toBe('Riyadh');
      expect(result.admin1).toBe('Riyadh Region');
      expect(result.countryText).toBe('Saudi Arabia');
      expect(result.isMultiArea).toBe(false);
      expect(result.granularityHint).toBe('city');
    });

    it('parses various city+region+country inputs', () => {
      const inputs = [
        {
          input: 'Jeddah, Makkah Region, Saudi Arabia',
          city: 'Jeddah',
          admin1: 'Makkah Region',
          country: 'Saudi Arabia',
        },
        {
          input: 'Dammam, Eastern Province, Saudi Arabia',
          city: 'Dammam',
          admin1: 'Eastern Province',
          country: 'Saudi Arabia',
        },
        {
          input: 'Dubai, Dubai, United Arab Emirates',
          city: 'Dubai',
          admin1: 'Dubai',
          country: 'United Arab Emirates',
        },
        {
          input: 'Cairo, Cairo Governorate, Egypt',
          city: 'Cairo',
          admin1: 'Cairo Governorate',
          country: 'Egypt',
        },
      ];

      for (const { input, city, admin1, country } of inputs) {
        const result = parseLocation(input);
        expect(result.city, `city for "${input}"`).toBe(city);
        expect(result.admin1, `admin1 for "${input}"`).toBe(admin1);
        expect(result.countryText, `countryText for "${input}"`).toBe(country);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('city');
      }
    });
  });

  describe('F013 Step 2: region+country parsing', () => {
    it('parses "Najran Region, Saudi Arabia" correctly', () => {
      const result = parseLocation('Najran Region, Saudi Arabia');

      expect(result.city).toBeUndefined();
      expect(result.admin1).toBe('Najran Region');
      expect(result.countryText).toBe('Saudi Arabia');
      expect(result.isMultiArea).toBe(false);
      expect(result.granularityHint).toBe('region');
    });

    it('parses various region+country inputs', () => {
      const inputs = [
        { input: 'Eastern Province, Saudi Arabia', admin1: 'Eastern Province', country: 'Saudi Arabia' },
        { input: 'Asir Region, Saudi Arabia', admin1: 'Asir Region', country: 'Saudi Arabia' },
        { input: 'Jazan Region, Saudi Arabia', admin1: 'Jazan Region', country: 'Saudi Arabia' },
        { input: 'Al Bahah Region, Saudi Arabia', admin1: 'Al Bahah Region', country: 'Saudi Arabia' },
      ];

      for (const { input, admin1, country } of inputs) {
        const result = parseLocation(input);
        expect(result.city, `city for "${input}"`).toBeUndefined();
        expect(result.admin1, `admin1 for "${input}"`).toBe(admin1);
        expect(result.countryText, `countryText for "${input}"`).toBe(country);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('region');
      }
    });

    it('detects region keywords case-insensitively', () => {
      const inputs = [
        'EASTERN PROVINCE, Saudi Arabia',
        'eastern province, Saudi Arabia',
        'Eastern REGION, Saudi Arabia',
      ];

      for (const input of inputs) {
        const result = parseLocation(input);
        expect(result.city, `should not have city for "${input}"`).toBeUndefined();
        expect(result.admin1, `should have admin1 for "${input}"`).toBeTruthy();
        expect(result.granularityHint).toBe('region');
      }
    });
  });

  describe('F013 Step 3: multi-area detection', () => {
    it('parses "Multiple Areas, Saudi Arabia" correctly', () => {
      const result = parseLocation('Multiple Areas, Saudi Arabia');

      expect(result.city).toBeUndefined();
      expect(result.admin1).toBeUndefined();
      expect(result.countryText).toBe('Saudi Arabia');
      expect(result.isMultiArea).toBe(true);
      expect(result.granularityHint).toBe('multi');
    });

    it('detects multi-area case-insensitively', () => {
      const inputs = [
        { input: 'multiple areas, United Arab Emirates', country: 'United Arab Emirates' },
        { input: 'MULTIPLE AREAS, Egypt', country: 'Egypt' },
        { input: 'Multiple Area, Jordan', country: 'Jordan' },
        { input: '  Multiple  Areas  , Qatar', country: 'Qatar' },
      ];

      for (const { input, country } of inputs) {
        const result = parseLocation(input);
        expect(result.isMultiArea, `isMultiArea for "${input}"`).toBe(true);
        expect(result.countryText, `countryText for "${input}"`).toBe(country);
        expect(result.granularityHint).toBe('multi');
      }
    });
  });

  describe('city+country parsing (2 tokens, no region keyword)', () => {
    it('parses city+country inputs', () => {
      const inputs = [
        { input: 'Riyadh, KSA', city: 'Riyadh', country: 'KSA' },
        { input: 'Riyadh, SA', city: 'Riyadh', country: 'SA' },
        { input: 'Jeddah, SAU', city: 'Jeddah', country: 'SAU' },
        { input: 'Dubai, UAE', city: 'Dubai', country: 'UAE' },
      ];

      for (const { input, city, country } of inputs) {
        const result = parseLocation(input);
        expect(result.city, `city for "${input}"`).toBe(city);
        expect(result.admin1, `admin1 for "${input}"`).toBeUndefined();
        expect(result.countryText, `countryText for "${input}"`).toBe(country);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('city');
      }
    });
  });

  describe('country-only parsing (1 token)', () => {
    it('parses country-only inputs', () => {
      const inputs = ['Saudi Arabia', 'United Arab Emirates', 'Egypt', 'Jordan'];

      for (const input of inputs) {
        const result = parseLocation(input);
        expect(result.city, `city for "${input}"`).toBeUndefined();
        expect(result.admin1, `admin1 for "${input}"`).toBeUndefined();
        expect(result.countryText, `countryText for "${input}"`).toBe(input);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('country');
      }
    });

    it('parses formal country names', () => {
      const result = parseLocation('The Kingdom of Saudi Arabia');
      expect(result.countryText).toBe('The Kingdom of Saudi Arabia');
      expect(result.granularityHint).toBe('country');
    });
  });

  describe('edge cases: punctuation and whitespace', () => {
    it('handles double commas', () => {
      const result = parseLocation('Riyadh,, Riyadh Region,, Saudi Arabia');
      expect(result.city).toBe('Riyadh');
      expect(result.admin1).toBe('Riyadh Region');
      expect(result.countryText).toBe('Saudi Arabia');
    });

    it('handles extra whitespace', () => {
      const result = parseLocation('  Riyadh ,  Saudi Arabia  ');
      expect(result.city).toBe('Riyadh');
      expect(result.countryText).toBe('Saudi Arabia');
    });

    it('handles empty input', () => {
      const result = parseLocation('');
      expect(result.countryText).toBeUndefined();
      expect(result.isMultiArea).toBe(false);
      expect(result.granularityHint).toBe('country');
    });

    it('handles whitespace-only input', () => {
      const result = parseLocation('   ');
      expect(result.countryText).toBeUndefined();
      expect(result.isMultiArea).toBe(false);
    });

    it('handles input with only commas', () => {
      const result = parseLocation(',,,,');
      expect(result.countryText).toBeUndefined();
      expect(result.isMultiArea).toBe(false);
    });
  });

  describe('edge cases: special characters', () => {
    it('preserves diacritics in tokens', () => {
      const result = parseLocation('Riyāḍh, Saudi Arabia');
      expect(result.city).toBe('Riyāḍh');
      expect(result.countryText).toBe('Saudi Arabia');
    });

    it('preserves hyphens in tokens', () => {
      const result = parseLocation('Al-Khobar, Eastern Province, Saudi Arabia');
      expect(result.city).toBe('Al-Khobar');
      expect(result.admin1).toBe('Eastern Province');
    });

    it('handles all uppercase', () => {
      const result = parseLocation('RIYADH, SAUDI ARABIA');
      expect(result.city).toBe('RIYADH');
      expect(result.countryText).toBe('SAUDI ARABIA');
    });
  });

  describe('fixtures from location-strings.json', () => {
    // City+Region+Country (CRC)
    const crcFixtures = [
      { id: 'CRC001', input: 'Riyadh, Riyadh Region, Saudi Arabia', city: 'Riyadh', admin1: 'Riyadh Region', country: 'Saudi Arabia' },
      { id: 'CRC002', input: 'Jeddah, Makkah Region, Saudi Arabia', city: 'Jeddah', admin1: 'Makkah Region', country: 'Saudi Arabia' },
      { id: 'CRC008', input: 'Dubai, Dubai, United Arab Emirates', city: 'Dubai', admin1: 'Dubai', country: 'United Arab Emirates' },
    ];

    for (const fixture of crcFixtures) {
      it(`parses fixture ${fixture.id}: "${fixture.input}"`, () => {
        const result = parseLocation(fixture.input);
        expect(result.city).toBe(fixture.city);
        expect(result.admin1).toBe(fixture.admin1);
        expect(result.countryText).toBe(fixture.country);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('city');
      });
    }

    // Region+Country (RC)
    const rcFixtures = [
      { id: 'RC001', input: 'Najran Region, Saudi Arabia', admin1: 'Najran Region', country: 'Saudi Arabia' },
      { id: 'RC002', input: 'Eastern Province, Saudi Arabia', admin1: 'Eastern Province', country: 'Saudi Arabia' },
    ];

    for (const fixture of rcFixtures) {
      it(`parses fixture ${fixture.id}: "${fixture.input}"`, () => {
        const result = parseLocation(fixture.input);
        expect(result.city).toBeUndefined();
        expect(result.admin1).toBe(fixture.admin1);
        expect(result.countryText).toBe(fixture.country);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('region');
      });
    }

    // Country-only (CO)
    const coFixtures = [
      { id: 'CO001', input: 'Saudi Arabia', country: 'Saudi Arabia' },
      { id: 'CO002', input: 'United Arab Emirates', country: 'United Arab Emirates' },
    ];

    for (const fixture of coFixtures) {
      it(`parses fixture ${fixture.id}: "${fixture.input}"`, () => {
        const result = parseLocation(fixture.input);
        expect(result.city).toBeUndefined();
        expect(result.admin1).toBeUndefined();
        expect(result.countryText).toBe(fixture.country);
        expect(result.isMultiArea).toBe(false);
        expect(result.granularityHint).toBe('country');
      });
    }

    // Multi-area (MA)
    const maFixtures = [
      { id: 'MA001', input: 'Multiple Areas, Saudi Arabia', country: 'Saudi Arabia' },
      { id: 'MA002', input: 'multiple areas, United Arab Emirates', country: 'United Arab Emirates' },
      { id: 'MA003', input: 'MULTIPLE AREAS, Egypt', country: 'Egypt' },
    ];

    for (const fixture of maFixtures) {
      it(`parses fixture ${fixture.id}: "${fixture.input}"`, () => {
        const result = parseLocation(fixture.input);
        expect(result.city).toBeUndefined();
        expect(result.admin1).toBeUndefined();
        expect(result.countryText).toBe(fixture.country);
        expect(result.isMultiArea).toBe(true);
        expect(result.granularityHint).toBe('multi');
      });
    }

    // Problematic fixtures
    it('parses PROB006: double commas', () => {
      const result = parseLocation('Riyadh,, Riyadh Region,, Saudi Arabia');
      expect(result.city).toBe('Riyadh');
      expect(result.admin1).toBe('Riyadh Region');
      expect(result.countryText).toBe('Saudi Arabia');
    });

    it('parses PROB007: extra whitespace', () => {
      const result = parseLocation('  Riyadh ,  Saudi Arabia  ');
      expect(result.city).toBe('Riyadh');
      expect(result.countryText).toBe('Saudi Arabia');
    });

    it('parses PROB012: hyphenated city', () => {
      const result = parseLocation('Al-Khobar, Eastern Province, Saudi Arabia');
      expect(result.city).toBe('Al-Khobar');
      expect(result.admin1).toBe('Eastern Province');
      expect(result.countryText).toBe('Saudi Arabia');
    });
  });
});
