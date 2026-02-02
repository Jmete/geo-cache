/**
 * Candidate Scoring Tests (F024)
 *
 * Validates country/admin/city similarity, feature type match influence,
 * and confidence clamping behavior.
 */

import { describe, it, expect } from 'vitest';
import type { ProviderCandidate } from '../types/api';
import { scoreCandidate, type ScoringContext } from './index';

function createCandidate(
  overrides: Partial<ProviderCandidate> = {}
): ProviderCandidate {
  return {
    providerId: '123456',
    lat: 24.7136,
    lon: 46.6753,
    countryIso2: 'SA',
    countryName: 'Saudi Arabia',
    admin1: 'Riyadh Region',
    city: 'Riyadh',
    featureClass: 'P',
    featureCode: 'PPLA',
    population: 7676654,
    ...overrides,
  };
}

const baseContext: ScoringContext = {
  countryIso2: 'SA',
  admin1: 'Riyadh Region',
  city: 'Riyadh',
  granularityHint: 'city',
};

describe('F024 Step 1: country match scoring', () => {
  it('gives higher scores to matching country candidates', () => {
    const match = scoreCandidate(createCandidate(), baseContext);
    const mismatch = scoreCandidate(
      createCandidate({ countryIso2: 'AE', countryName: 'United Arab Emirates' }),
      baseContext
    );

    expect(match.score).toBeGreaterThan(mismatch.score);
  });
});

describe('F024 Step 2: admin/city similarity scoring', () => {
  it('scores closer admin1/city matches higher than mismatches', () => {
    const exact = scoreCandidate(createCandidate(), baseContext);
    const mismatch = scoreCandidate(
      createCandidate({
        city: 'Jeddah',
        admin1: 'Makkah Region',
        featureCode: 'PPLA',
      }),
      baseContext
    );

    expect(exact.score).toBeGreaterThan(mismatch.score);
  });
});

describe('F024 Step 3: confidence clamping and weak matches', () => {
  it('clamps confidence to 0..1 and lowers weak matches', () => {
    const strong = scoreCandidate(createCandidate(), baseContext);
    const weak = scoreCandidate(
      createCandidate({
        countryIso2: 'AE',
        countryName: 'United Arab Emirates',
        city: 'Dubai',
        admin1: 'Dubai',
        population: 1,
        featureClass: 'A',
        featureCode: 'ADM1',
      }),
      baseContext
    );

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThanOrEqual(0);
    expect(strong.score).toBeLessThanOrEqual(1);
    expect(weak.score).toBeGreaterThanOrEqual(0);
    expect(weak.score).toBeLessThanOrEqual(1);
  });
});
