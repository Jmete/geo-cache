import { describe, it, expect } from 'vitest';
import {
  ADMIN_MISMATCH_THRESHOLD,
  buildValidationFlags,
  isAdminMismatch,
} from './index';
import type { ParsedLocation, ProviderCandidate } from '../types/api';

function baseCandidate(overrides: Partial<ProviderCandidate> = {}): ProviderCandidate {
  return {
    providerId: '1',
    lat: 0,
    lon: 0,
    countryIso2: 'SA',
    countryName: 'Saudi Arabia',
    ...overrides,
  };
}

describe('isAdminMismatch', () => {
  it('returns true when similarity is below the threshold', () => {
    const result = isAdminMismatch(
      'Riyadh Region',
      'Eastern Province',
      ADMIN_MISMATCH_THRESHOLD
    );
    expect(result).toBe(true);
  });

  it('returns false when similarity meets the threshold', () => {
    const result = isAdminMismatch(
      'Riyadh Region',
      'Riyadh Region',
      ADMIN_MISMATCH_THRESHOLD
    );
    expect(result).toBe(false);
  });

  it('returns false when input admin1 is missing', () => {
    const result = isAdminMismatch(null, 'Riyadh Region', ADMIN_MISMATCH_THRESHOLD);
    expect(result).toBe(false);
  });
});

describe('buildValidationFlags', () => {
  const parsedWithAdmin: ParsedLocation = {
    admin1: 'Riyadh Region',
    countryText: 'Saudi Arabia',
    isMultiArea: false,
    granularityHint: 'region',
  };

  it('sets adminMismatch when candidate admin1 is dissimilar', () => {
    const flags = buildValidationFlags({
      parsed: parsedWithAdmin,
      bestCandidate: baseCandidate({ admin1: 'Eastern Province' }),
      usedFallback: false,
    });

    expect(flags.adminMismatch).toBe(true);
    expect(flags.providerFallback).toBeUndefined();
  });

  it('does not set adminMismatch when candidate admin1 matches', () => {
    const flags = buildValidationFlags({
      parsed: parsedWithAdmin,
      bestCandidate: baseCandidate({ admin1: 'Riyadh Region' }),
      usedFallback: false,
    });

    expect(flags.adminMismatch).toBeUndefined();
  });

  it('does not set adminMismatch when input admin1 is absent', () => {
    const parsed: ParsedLocation = {
      city: 'Riyadh',
      countryText: 'Saudi Arabia',
      isMultiArea: false,
      granularityHint: 'city',
    };

    const flags = buildValidationFlags({
      parsed,
      bestCandidate: baseCandidate({ admin1: 'Riyadh Region' }),
      usedFallback: false,
    });

    expect(flags.adminMismatch).toBeUndefined();
  });

  it('sets providerFallback when fallback results were used', () => {
    const flags = buildValidationFlags({
      parsed: parsedWithAdmin,
      bestCandidate: baseCandidate({ admin1: 'Riyadh Region' }),
      usedFallback: true,
    });

    expect(flags.providerFallback).toBe(true);
  });
});
