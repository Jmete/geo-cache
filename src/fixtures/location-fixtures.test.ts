import { describe, it, expect } from 'vitest';
import fixturesData from '../../fixtures/location-strings.json';
import { parseLocation } from '../parser';
import { resolveCountryToIso2 } from '../country';
import { generateNormalizedKey, isValidNormalizedKey } from '../normalize';

type FixtureEntry = {
  id: string;
  input: string;
  expected: {
    city: string | null;
    admin1: string | null;
    countryText: string | null;
    countryIso2: string | null;
    isMultiArea: boolean;
    granularity: 'city' | 'region' | 'country' | 'multi';
  };
};

type AcceptanceFixture = {
  id: string;
  input: string;
  expectedNormKey: string;
};

const fixtures = fixturesData.fixtures as FixtureEntry[];
const acceptanceFixtures = fixturesData.acceptance_fixtures as AcceptanceFixture[];

function normalizeExpected(value: string | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : value;
}

describe('F035: location fixtures', () => {
  it('parses fixtures with expected fields', () => {
    for (const fixture of fixtures) {
      const parsed = parseLocation(fixture.input);
      const expected = fixture.expected;

      expect(parsed.city, fixture.id).toBe(normalizeExpected(expected.city));
      expect(parsed.admin1, fixture.id).toBe(normalizeExpected(expected.admin1));
      expect(parsed.countryText, fixture.id).toBe(normalizeExpected(expected.countryText));
      expect(parsed.isMultiArea, fixture.id).toBe(expected.isMultiArea);
      expect(parsed.granularityHint, fixture.id).toBe(expected.granularity);

      if (expected.countryIso2) {
        const resolved = resolveCountryToIso2(parsed.countryText);
        expect(resolved, fixture.id).toBe(expected.countryIso2);
      }
    }
  });

  it('generates normalized keys for acceptance fixtures', () => {
    for (const fixture of acceptanceFixtures) {
      const parsed = parseLocation(fixture.input);
      const countryIso2 = resolveCountryToIso2(parsed.countryText);

      if (!countryIso2) {
        throw new Error(`[${fixture.id}] failed to resolve country ISO2`);
      }

      const key = generateNormalizedKey({
        countryIso2,
        admin1: parsed.admin1,
        city: parsed.city,
        isMultiArea: parsed.isMultiArea,
      });

      expect(key, fixture.id).toBe(fixture.expectedNormKey);
      expect(isValidNormalizedKey(key), fixture.id).toBe(true);
    }
  });
});
