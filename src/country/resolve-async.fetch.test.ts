/**
 * Country Resolution with GeoNames Fetch Tests (F036)
 *
 * Ensures async country resolution uses offline mapping when possible and
 * falls back to GeoNames PCLI via mocked fetch when needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCountryToIso2Async, ProviderTimeoutError } from './resolve-async';

const mockFetch = vi.fn();

describe('resolveCountryToIso2Async (fetch-backed)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves ISO2 input without network calls', async () => {
    const result = await resolveCountryToIso2Async('US', {
      geonamesUsername: 'test',
    });

    expect(result.iso2).toBe('US');
    expect(result.resolvedOffline).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resolves ISO3 input without network calls', async () => {
    const result = await resolveCountryToIso2Async('USA', {
      geonamesUsername: 'test',
    });

    expect(result.iso2).toBe('US');
    expect(result.resolvedOffline).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('falls back to GeoNames PCLI via fetch when offline mapping fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          totalResultsCount: 1,
          geonames: [
            {
              geonameId: 6251999,
              countryCode: 'CA',
              countryName: 'Canada',
              name: 'Canada',
              lat: '56.13',
              lng: '-106.35',
              fcl: 'A',
              fcode: 'PCLI',
            },
          ],
        }),
    });

    const result = await resolveCountryToIso2Async('Atlantis', {
      geonamesUsername: 'test',
    });

    expect(result.iso2).toBe('CA');
    expect(result.resolvedOffline).toBe(false);
    expect(mockFetch).toHaveBeenCalledOnce();
    const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain('q=Atlantis');
    expect(calledUrl).toContain('featureCode=PCLI');
  });

  it('throws ProviderTimeoutError when GeoNames fetch aborts', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(
      resolveCountryToIso2Async('Atlantis', {
        geonamesUsername: 'test',
        timeout: 5,
      })
    ).rejects.toThrow(ProviderTimeoutError);
  });
});
