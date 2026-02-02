/**
 * Provider Pipeline Tests (F020)
 *
 * Tests for:
 * 1. Provider interface returning list of candidates with normalized fields
 * 2. Pipeline calling providers in order and aggregating candidates
 * 3. Provider timeout handling (controlled failure, not unhandled exception)
 */

import { describe, it, expect, vi } from 'vitest';
import { runPipeline, runPipelineStrict } from './pipeline';
import { ProviderTimeoutError, ProviderFetchError } from './geonames/client';
import type {
  Provider,
  ProviderQuery,
  ProviderConfig,
  PipelineConfig,
} from './types';
import type { ProviderCandidate } from '../types/api';

// =============================================================================
// Mock Provider Factory
// =============================================================================

function createMockProvider(
  name: string,
  behavior:
    | { candidates: ProviderCandidate[]; usedFallback?: boolean }
    | { error: Error }
    | { timeout: true }
): Provider {
  return {
    name,
    search: vi.fn(async (_query: ProviderQuery, _config: ProviderConfig) => {
      if ('timeout' in behavior) {
        throw new ProviderTimeoutError();
      }
      if ('error' in behavior) {
        throw behavior.error;
      }
      return {
        candidates: behavior.candidates,
        usedFallback: behavior.usedFallback ?? false,
      };
    }),
  };
}

function createCandidate(overrides: Partial<ProviderCandidate> = {}): ProviderCandidate {
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

// =============================================================================
// PRD Step 1: Provider interface returns list of candidates
// =============================================================================

describe('F020 Step 1: Provider interface returns list of candidates', () => {
  it('provider returns candidates with all required fields', async () => {
    const candidate = createCandidate();
    const provider = createMockProvider('geonames', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: { geonames: { username: 'test' } },
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.candidates).toHaveLength(1);
    const [c] = result.candidates;
    if (!c) throw new Error('Expected candidate');

    // Verify all ProviderCandidate fields
    expect(c.providerId).toBe('123456');
    expect(c.lat).toBe(24.7136);
    expect(c.lon).toBe(46.6753);
    expect(c.countryIso2).toBe('SA');
    expect(c.countryName).toBe('Saudi Arabia');
    expect(c.admin1).toBe('Riyadh Region');
    expect(c.city).toBe('Riyadh');
    expect(c.featureClass).toBe('P');
    expect(c.featureCode).toBe('PPLA');
    expect(c.population).toBe(7676654);
  });

  it('provider returns empty array when no matches (not error)', async () => {
    const provider = createMockProvider('geonames', { candidates: [] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'XX', city: 'nonexistent', granularityHint: 'city' },
      config
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.hadError).toBe(false);
    expect(result.hadTimeout).toBe(false);
  });

  it('candidate can include optional bbox', async () => {
    const candidate = createCandidate({
      bbox: [-180, -90, 180, 90],
    });
    const provider = createMockProvider('geonames', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', granularityHint: 'country' },
      config
    );

    const [c] = result.candidates;
    expect(c?.bbox).toEqual([-180, -90, 180, 90]);
  });
});

// =============================================================================
// PRD Step 2: Pipeline calls providers in order and aggregates candidates
// =============================================================================

describe('F020 Step 2: Pipeline calls providers in order and aggregates candidates', () => {
  it('calls single provider and returns its candidates', async () => {
    const candidate = createCandidate();
    const provider = createMockProvider('geonames', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: { geonames: { username: 'test' } },
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.providersUsed).toEqual(['geonames']);
  });

  it('stops at first provider that returns results', async () => {
    const candidate1 = createCandidate({ providerId: '1' });
    const candidate2 = createCandidate({ providerId: '2' });

    const provider1 = createMockProvider('geonames', { candidates: [candidate1] });
    const provider2 = createMockProvider('nominatim', { candidates: [candidate2] });

    const config: PipelineConfig = {
      providers: [provider1, provider2],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(provider1.search).toHaveBeenCalledTimes(1);
    expect(provider2.search).not.toHaveBeenCalled();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.providerId).toBe('1');
    expect(result.providersUsed).toEqual(['geonames']);
  });

  it('falls back to second provider when first returns empty', async () => {
    const candidate2 = createCandidate({ providerId: '2' });

    const provider1 = createMockProvider('geonames', { candidates: [] });
    const provider2 = createMockProvider('nominatim', { candidates: [candidate2] });

    const config: PipelineConfig = {
      providers: [provider1, provider2],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'unknown', granularityHint: 'city' },
      config
    );

    expect(provider1.search).toHaveBeenCalledTimes(1);
    expect(provider2.search).toHaveBeenCalledTimes(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.providersUsed).toEqual(['nominatim']);
  });

  it('passes correct query to provider', async () => {
    const provider = createMockProvider('geonames', { candidates: [] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 7000,
      credentials: { geonames: { username: 'myuser' } },
    };

    const query: ProviderQuery = {
      city: 'riyadh',
      admin1: 'riyadh region',
      countryIso2: 'SA',
      granularityHint: 'city',
    };

    await runPipeline(query, config);

    expect(provider.search).toHaveBeenCalledWith(
      query,
      expect.objectContaining({
        timeout: 7000,
        credentials: { username: 'myuser' },
      })
    );
  });

  it('tracks usedFallback flag from provider', async () => {
    const candidate = createCandidate();
    const provider = createMockProvider('geonames', {
      candidates: [candidate],
      usedFallback: true,
    });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.usedFallback).toBe(true);
  });
});

// =============================================================================
// PRD Step 3: Provider timeout leads to controlled failure
// =============================================================================

describe('F020 Step 3: Provider timeout leads to controlled failure', () => {
  it('handles provider timeout without throwing', async () => {
    const provider = createMockProvider('geonames', { timeout: true });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    // Should not throw
    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.hadTimeout).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });

  it('continues to next provider after timeout', async () => {
    const candidate = createCandidate();
    const provider1 = createMockProvider('geonames', { timeout: true });
    const provider2 = createMockProvider('nominatim', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider1, provider2],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(provider1.search).toHaveBeenCalledTimes(1);
    expect(provider2.search).toHaveBeenCalledTimes(1);
    expect(result.hadTimeout).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.providersUsed).toEqual(['nominatim']);
  });

  it('handles ProviderFetchError without throwing', async () => {
    const provider = createMockProvider('geonames', {
      error: new ProviderFetchError('HTTP 500'),
    });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.hadError).toBe(true);
    expect(result.hadTimeout).toBe(false);
    expect(result.candidates).toHaveLength(0);
  });

  it('handles unknown errors without throwing', async () => {
    const provider = createMockProvider('geonames', {
      error: new Error('Network failure'),
    });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.hadError).toBe(true);
    expect(result.candidates).toHaveLength(0);
  });

  it('continues to next provider after fetch error', async () => {
    const candidate = createCandidate();
    const provider1 = createMockProvider('geonames', {
      error: new ProviderFetchError('HTTP 503'),
    });
    const provider2 = createMockProvider('nominatim', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider1, provider2],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.hadError).toBe(true);
    expect(result.candidates).toHaveLength(1);
    expect(result.providersUsed).toEqual(['nominatim']);
  });
});

// =============================================================================
// runPipelineStrict Tests
// =============================================================================

describe('runPipelineStrict', () => {
  it('returns success with candidates when provider succeeds', async () => {
    const candidate = createCandidate();
    const provider = createMockProvider('geonames', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipelineStrict(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.candidates).toHaveLength(1);
    }
  });

  it('returns success with empty candidates when no matches', async () => {
    const provider = createMockProvider('geonames', { candidates: [] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipelineStrict(
      { countryIso2: 'XX', city: 'nonexistent', granularityHint: 'city' },
      config
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.candidates).toHaveLength(0);
    }
  });

  it('returns failure with error details when all providers fail', async () => {
    const provider1 = createMockProvider('geonames', { timeout: true });
    const provider2 = createMockProvider('nominatim', {
      error: new ProviderFetchError('HTTP 500'),
    });

    const config: PipelineConfig = {
      providers: [provider1, provider2],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipelineStrict(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toEqual({
        provider: 'geonames',
        type: 'timeout',
        message: 'GeoNames request timed out',
      });
      expect(result.errors[1]).toEqual({
        provider: 'nominatim',
        type: 'error',
        message: 'HTTP 500',
      });
      expect(result.hadTimeout).toBe(true);
    }
  });

  it('returns success when later provider succeeds after earlier failure', async () => {
    const candidate = createCandidate();
    const provider1 = createMockProvider('geonames', { timeout: true });
    const provider2 = createMockProvider('nominatim', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider1, provider2],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipelineStrict(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.result.candidates).toHaveLength(1);
      expect(result.result.hadTimeout).toBe(true);
      expect(result.result.providersUsed).toEqual(['nominatim']);
    }
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Pipeline Edge Cases', () => {
  it('handles empty provider list', async () => {
    const config: PipelineConfig = {
      providers: [],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.candidates).toHaveLength(0);
    expect(result.providersUsed).toHaveLength(0);
    expect(result.hadError).toBe(false);
    expect(result.hadTimeout).toBe(false);
  });

  it('provides default empty credentials for unknown provider', async () => {
    const candidate = createCandidate();
    const provider = createMockProvider('unknown', { candidates: [candidate] });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(provider.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        credentials: {},
      })
    );
  });

  it('handles multiple candidates from single provider', async () => {
    const candidates = [
      createCandidate({ providerId: '1', city: 'Riyadh' }),
      createCandidate({ providerId: '2', city: 'Al Riyadh' }),
      createCandidate({ providerId: '3', city: 'Ar Riyad' }),
    ];
    const provider = createMockProvider('geonames', { candidates });

    const config: PipelineConfig = {
      providers: [provider],
      timeout: 5000,
      credentials: {},
    };

    const result = await runPipeline(
      { countryIso2: 'SA', city: 'riyadh', granularityHint: 'city' },
      config
    );

    expect(result.candidates).toHaveLength(3);
  });
});
