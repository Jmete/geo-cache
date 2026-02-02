/**
 * Candidate Selection Tests (F025)
 *
 * Validates deterministic tie-breaks, ambiguity handling,
 * and country mismatch rejection.
 */

import { describe, expect, it } from 'vitest';
import type { ScoredCandidate } from '../types/api';
import { selectBestCandidate } from './index';

function createCandidate(
  overrides: Partial<ScoredCandidate> = {}
): ScoredCandidate {
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
    score: 0.8,
    ...overrides,
  };
}

describe('F025 Step 1: ambiguity threshold handling', () => {
  it('marks ambiguous and reduces confidence when top two are within 0.05', () => {
    const result = selectBestCandidate(
      [
        createCandidate({ providerId: '200', score: 0.92, population: 500000 }),
        createCandidate({ providerId: '150', score: 0.88, population: 900000 }),
      ],
      'SA'
    );

    expect(result.ambiguous).toBe(true);
    expect(result.best?.providerId).toBe('200');
    expect(result.confidence).toBeCloseTo(0.9);
  });
});

describe('F025 Step 2: deterministic tie-break selection', () => {
  it('uses population before providerId for tie-breaks', () => {
    const result = selectBestCandidate(
      [
        createCandidate({ providerId: 'b', score: 0.8, population: 100 }),
        createCandidate({ providerId: 'a', score: 0.8, population: 1000 }),
      ],
      'SA'
    );

    expect(result.best?.providerId).toBe('a');
    expect(result.confidence).toBeCloseTo(0.8);
  });

  it('uses providerId when score and population are equal', () => {
    const result = selectBestCandidate(
      [
        createCandidate({ providerId: 'b', score: 0.8, population: 500 }),
        createCandidate({ providerId: 'a', score: 0.8, population: 500 }),
      ],
      'SA'
    );

    expect(result.best?.providerId).toBe('a');
  });
});

describe('F025 Step 3: country mismatch rejection', () => {
  it('filters out candidates with mismatched countryIso2', () => {
    const result = selectBestCandidate(
      [
        createCandidate({
          providerId: 'ae',
          countryIso2: 'AE',
          countryName: 'United Arab Emirates',
          score: 0.95,
        }),
        createCandidate({ providerId: 'sa', countryIso2: 'SA', score: 0.7 }),
      ],
      'SA'
    );

    expect(result.best?.countryIso2).toBe('SA');
  });

  it('returns null when all candidates are mismatched', () => {
    const result = selectBestCandidate(
      [
        createCandidate({
          providerId: 'ae',
          countryIso2: 'AE',
          countryName: 'United Arab Emirates',
        }),
      ],
      'SA'
    );

    expect(result.best).toBeNull();
    expect(result.sorted).toHaveLength(0);
    expect(result.ambiguous).toBe(false);
    expect(result.confidence).toBeNull();
  });
});
