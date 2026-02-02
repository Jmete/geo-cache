/**
 * Canonical Location Builder Tests (F026)
 *
 * Validates granularity, canonical fields, displayName,
 * and multi-area flag behavior.
 */

import { describe, expect, it } from 'vitest';
import type { ParsedLocation, ProviderCandidate } from '../types/api';
import { buildCanonicalResult } from './index';

function buildParsed(
  overrides: Partial<ParsedLocation> = {}
): ParsedLocation {
  return {
    isMultiArea: false,
    granularityHint: 'city',
    ...overrides,
  };
}

function buildCandidate(
  overrides: Partial<ProviderCandidate> = {}
): ProviderCandidate {
  return {
    providerId: '100',
    lat: 24.7136,
    lon: 46.6753,
    countryIso2: 'SA',
    countryName: 'Saudi Arabia',
    admin1: 'Riyadh Region',
    city: 'Riyadh',
    featureClass: 'P',
    featureCode: 'PPLA',
    population: 1000000,
    ...overrides,
  };
}

describe('F026 Step 1: city vs region granularity', () => {
  it('sets granularity=city and includes city/admin1/country', () => {
    const parsed = buildParsed({ city: 'Riyadh', admin1: 'Riyadh Region' });
    const candidate = buildCandidate();
    const result = buildCanonicalResult(parsed, candidate);

    expect(result.granularity).toBe('city');
    expect(result.canonical.city).toBe('Riyadh');
    expect(result.canonical.admin1).toBe('Riyadh Region');
    expect(result.canonical.countryIso2).toBe('SA');
    expect(result.canonical.displayName).toBe(
      'Riyadh, Riyadh Region, Saudi Arabia'
    );
  });

  it('sets granularity=region and omits city', () => {
    const parsed = buildParsed({
      admin1: 'Najran Region',
      granularityHint: 'region',
    });
    const candidate = buildCandidate({ admin1: 'Najran Region' });
    delete candidate.city;
    const result = buildCanonicalResult(parsed, candidate);

    expect(result.granularity).toBe('region');
    expect(result.canonical.admin1).toBe('Najran Region');
    expect(result.canonical.city).toBeUndefined();
    expect(result.canonical.displayName).toBe('Najran Region, Saudi Arabia');
  });
});

describe('F026 Step 2: country vs multi granularity', () => {
  it('sets granularity=country with only country fields', () => {
    const parsed = buildParsed({ granularityHint: 'country' });
    const candidate = buildCandidate();
    const result = buildCanonicalResult(parsed, candidate);

    expect(result.granularity).toBe('country');
    expect(result.canonical.city).toBeUndefined();
    expect(result.canonical.admin1).toBeUndefined();
    expect(result.canonical.displayName).toBe('Saudi Arabia');
  });

  it('sets granularity=multi and flags.multiArea=true', () => {
    const parsed = buildParsed({
      isMultiArea: true,
      granularityHint: 'multi',
    });
    const candidate = buildCandidate();
    const result = buildCanonicalResult(parsed, candidate);

    expect(result.granularity).toBe('multi');
    expect(result.flags.multiArea).toBe(true);
    expect(result.canonical.city).toBeUndefined();
    expect(result.canonical.admin1).toBeUndefined();
    expect(result.canonical.displayName).toBe('Saudi Arabia');
  });
});

describe('F026 Step 3: displayName stability', () => {
  it('uses best available combination when admin1 is missing', () => {
    const parsed = buildParsed({ city: 'Riyadh' });
    const candidate = buildCandidate();
    delete candidate.admin1;
    const result = buildCanonicalResult(parsed, candidate);

    expect(result.canonical.displayName).toBe('Riyadh, Saudi Arabia');
  });
});
