/**
 * GeoNames Provider Tests (F021)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeoNamesProvider } from './provider';
import { ProviderTimeoutError } from './client';

const mockFetch = vi.fn();

describe('GeoNamesProvider (city search)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds city query with populated places and fuzzy matching', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 108410,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Riyadh',
              lat: '24.7136',
              lng: '46.6753',
              fcl: 'P',
              fcode: 'PPLC',
              adminName1: 'Riyadh Region',
            },
          ],
        }),
    });

    const provider = new GeoNamesProvider();

    await provider.search(
      { city: 'Riyadh', countryIso2: 'SA', granularityHint: 'city' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('secure.geonames.org/searchJSON');
    expect(calledUrl).toContain('q=Riyadh');
    expect(calledUrl).toContain('country=SA');
    expect(calledUrl).toContain('featureClass=P');
    expect(calledUrl).toContain('fuzzy=0.8');
    expect(calledUrl).toContain('inclBbox=true');
    expect(calledUrl).toContain('maxRows=10');

    const fetchOptions = mockFetch.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(fetchOptions?.signal).toBeInstanceOf(AbortSignal);
  });

  it('falls back to relaxed city search when strict results are empty', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 1,
            geonames: [
              {
                geonameId: 108410,
                countryCode: 'SA',
                countryName: 'Saudi Arabia',
                name: 'Riyadh',
                lat: '24.7136',
                lng: '46.6753',
                fcl: 'P',
                fcode: 'PPLC',
                adminName1: 'Riyadh Region',
              },
            ],
          }),
      });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { city: 'Riyadh', countryIso2: 'SA', granularityHint: 'city' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const strictUrl = mockFetch.mock.calls[0]?.[0] as string;
    const fallbackUrl = mockFetch.mock.calls[1]?.[0] as string;
    expect(strictUrl).toContain('featureClass=P');
    expect(strictUrl).toContain('inclBbox=true');
    expect(fallbackUrl).not.toContain('featureClass=P');
    expect(fallbackUrl).toContain('fuzzy=1');
    expect(fallbackUrl).toContain('inclBbox=true');
    expect(result.usedFallback).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('retries with city alias when city name contains a city suffix', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 1,
            geonames: [
              {
                geonameId: 101628,
                countryCode: 'SA',
                countryName: 'Saudi Arabia',
                name: 'Tabuk',
                lat: '28.3998',
                lng: '36.5715',
                fcl: 'P',
                fcode: 'PPLA',
                adminName1: 'Tabuk',
              },
            ],
          }),
      });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { city: 'Tabuk City', countryIso2: 'SA', granularityHint: 'city' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const firstUrl = mockFetch.mock.calls[0]?.[0] as string;
    const secondUrl = mockFetch.mock.calls[1]?.[0] as string;
    const thirdUrl = mockFetch.mock.calls[2]?.[0] as string;
    expect(firstUrl).toContain('q=Tabuk+City');
    expect(secondUrl).toContain('q=Tabuk+City');
    expect(secondUrl).not.toContain('featureClass=P');
    expect(thirdUrl).toContain('q=Tabuk');
    expect(thirdUrl).toContain('featureClass=P');
    expect(result.usedFallback).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('maps GeoNames results to provider candidates with lat/lon and providerId', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 108410,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Riyadh',
              lat: '24.7136',
              lng: '46.6753',
              fcl: 'P',
              fcode: 'PPLC',
              population: 4205961,
              adminName1: 'Riyadh Region',
            },
          ],
        }),
    });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { city: 'Riyadh', countryIso2: 'SA', granularityHint: 'city' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    if (!candidate) {
      throw new Error('Expected candidate to be defined');
    }
    expect(candidate.providerId).toBe('108410');
    expect(candidate.lat).toBeCloseTo(24.7136);
    expect(candidate.lon).toBeCloseTo(46.6753);
    expect(candidate.countryIso2).toBe('SA');
    expect(candidate.countryName).toBe('Saudi Arabia');
    expect(candidate.city).toBe('Riyadh');
    expect(candidate.admin1).toBe('Riyadh Region');
    expect(candidate.featureClass).toBe('P');
    expect(candidate.featureCode).toBe('PPLC');
  });

  it('throws ProviderTimeoutError on abort', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const provider = new GeoNamesProvider();

    await expect(
      provider.search(
        { city: 'Riyadh', countryIso2: 'SA', granularityHint: 'city' },
        { timeout: 10, credentials: { username: 'testuser' } }
      )
    ).rejects.toThrow(ProviderTimeoutError);
  });
});

describe('GeoNamesProvider (region search)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds ADM1 query with feature class A and fuzzy matching', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 108662,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Riyadh Region',
              lat: '23.9',
              lng: '45.0',
              fcl: 'A',
              fcode: 'ADM1',
              adminName1: 'Riyadh Region',
            },
          ],
        }),
    });

    const provider = new GeoNamesProvider();

    await provider.search(
      { admin1: 'Riyadh Region', countryIso2: 'SA', granularityHint: 'region' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('secure.geonames.org/searchJSON');
    expect(calledUrl).toContain('q=Riyadh+Region');
    expect(calledUrl).toContain('country=SA');
    expect(calledUrl).toContain('featureClass=A');
    expect(calledUrl).toContain('featureCode=ADM1');
    expect(calledUrl).toContain('fuzzy=0.8');
    expect(calledUrl).toContain('inclBbox=true');
    expect(calledUrl).toContain('maxRows=10');
  });

  it('falls back to relaxed ADM1 search when strict results are empty', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 1,
            geonames: [
              {
                geonameId: 108662,
                countryCode: 'SA',
                countryName: 'Saudi Arabia',
                name: 'Riyadh Region',
                lat: '23.9',
                lng: '45.0',
                fcl: 'A',
                fcode: 'ADM2',
                adminName1: 'Riyadh Region',
              },
            ],
          }),
      });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { admin1: 'Riyadh Region', countryIso2: 'SA', granularityHint: 'region' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const strictUrl = mockFetch.mock.calls[0]?.[0] as string;
    const fallbackUrl = mockFetch.mock.calls[1]?.[0] as string;
    expect(strictUrl).toContain('featureCode=ADM1');
    expect(strictUrl).toContain('inclBbox=true');
    expect(fallbackUrl).not.toContain('featureCode=ADM1');
    expect(fallbackUrl).toContain('inclBbox=true');
    expect(result.usedFallback).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('maps ADM1 results to admin1 candidates without city', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 108662,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Riyadh Region',
              lat: '23.9',
              lng: '45.0',
              fcl: 'A',
              fcode: 'ADM1',
              adminName1: 'Riyadh Region',
            },
          ],
        }),
    });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { admin1: 'Riyadh Region', countryIso2: 'SA', granularityHint: 'region' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    if (!candidate) {
      throw new Error('Expected candidate to be defined');
    }
    expect(candidate.providerId).toBe('108662');
    expect(candidate.countryIso2).toBe('SA');
    expect(candidate.admin1).toBe('Riyadh Region');
    expect(candidate.city).toBeUndefined();
    expect(candidate.featureClass).toBe('A');
    expect(candidate.featureCode).toBe('ADM1');
  });
});

describe('GeoNamesProvider (country search)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds PCLI query for country lookups', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 0,
          geonames: [],
        }),
    });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { countryIso2: 'SA', granularityHint: 'country' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(result.candidates).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('secure.geonames.org/searchJSON');
    expect(calledUrl).toContain('q=Saudi+Arabia');
    expect(calledUrl).toContain('featureCode=PCLI');
    expect(calledUrl).toContain('inclBbox=true');
    expect(calledUrl).toContain('maxRows=1');
  });

  it('treats multi granularity as country lookup', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 102358,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Kingdom of Saudi Arabia',
              lat: '25',
              lng: '45',
              fcl: 'A',
              fcode: 'PCLI',
            },
          ],
        }),
    });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { countryIso2: 'SA', granularityHint: 'multi' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('secure.geonames.org/searchJSON');
    expect(calledUrl).toContain('q=Saudi+Arabia');
    expect(calledUrl).toContain('featureCode=PCLI');
    expect(calledUrl).toContain('inclBbox=true');
    expect(calledUrl).toContain('maxRows=1');
    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    if (!candidate) {
      throw new Error('Expected candidate to be defined');
    }
    expect(candidate.lat).toBeCloseTo(25);
    expect(candidate.lon).toBeCloseTo(45);
    expect(candidate.city).toBeUndefined();
    expect(candidate.admin1).toBeUndefined();
  });

  it('maps country results with bbox when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 102358,
              countryCode: 'SA',
              countryName: 'Saudi Arabia',
              name: 'Kingdom of Saudi Arabia',
              lat: '25',
              lng: '45',
              fcl: 'A',
              fcode: 'PCLI',
              bbox: {
                west: '34',
                south: '16',
                east: '56',
                north: '32',
              },
            },
          ],
        }),
    });

    const provider = new GeoNamesProvider();
    const result = await provider.search(
      { countryIso2: 'SA', granularityHint: 'country' },
      { timeout: 5000, credentials: { username: 'testuser' } }
    );

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    if (!candidate) {
      throw new Error('Expected candidate to be defined');
    }
    expect(candidate.providerId).toBe('102358');
    expect(candidate.lat).toBeCloseTo(25);
    expect(candidate.lon).toBeCloseTo(45);
    expect(candidate.countryIso2).toBe('SA');
    expect(candidate.countryName).toBe('Saudi Arabia');
    expect(candidate.featureClass).toBe('A');
    expect(candidate.featureCode).toBe('PCLI');
    expect(candidate.bbox).toEqual([34, 16, 56, 32]);
    expect(candidate.admin1).toBeUndefined();
    expect(candidate.city).toBeUndefined();
  });
});
