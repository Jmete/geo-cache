/**
 * GeoNames Client Tests (F016)
 *
 * Tests for the GeoNames API client with mocked fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  searchCountryPCLI,
  ProviderTimeoutError,
  ProviderFetchError,
} from './client';

// Mock the global fetch
const mockFetch = vi.fn();

describe('searchCountryPCLI', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful responses', () => {
    it('returns country result for valid query', async () => {
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
                population: 34218169,
              },
            ],
          }),
      });

      const result = await searchCountryPCLI('Arabia Saudita', {
        username: 'testuser',
      });

      expect(result).not.toBeNull();
      expect(result?.countryCode).toBe('SA');
      expect(result?.countryName).toBe('Saudi Arabia');
      expect(result?.geonameId).toBe(102358);
    });

    it('returns null when no results found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      });

      const result = await searchCountryPCLI('Unknown Country XYZ', {
        username: 'testuser',
      });

      expect(result).toBeNull();
    });

    it('returns null when geonames array is undefined', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
          }),
      });

      const result = await searchCountryPCLI('Test', { username: 'testuser' });

      expect(result).toBeNull();
    });
  });

  describe('F016 Step 1: correct API parameters', () => {
    it('constructs URL with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            totalResultsCount: 0,
            geonames: [],
          }),
      });

      await searchCountryPCLI('Test Query', {
        username: 'myusername',
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const calledUrl = mockFetch.mock.calls[0]?.[0] as string;
      expect(calledUrl).toBeDefined();
      expect(calledUrl).toContain('secure.geonames.org/searchJSON');
      expect(calledUrl).toContain('q=Test+Query');
      expect(calledUrl).toContain('featureCode=PCLI');
      expect(calledUrl).toContain('maxRows=1');
      expect(calledUrl).toContain('username=myusername');
    });
  });

  describe('F016 Step 3: timeout handling', () => {
    it('throws ProviderTimeoutError when abort signal fires', async () => {
      // Simulate AbortError being thrown by fetch
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(
        searchCountryPCLI('Test', { username: 'testuser', timeout: 100 })
      ).rejects.toThrow(ProviderTimeoutError);
    });

    it('ProviderTimeoutError has correct message', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      await expect(
        searchCountryPCLI('Test', { username: 'testuser' })
      ).rejects.toThrow('GeoNames request timed out');
    });

    it('passes AbortSignal to fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ totalResultsCount: 0, geonames: [] }),
      });

      await searchCountryPCLI('Test', { username: 'testuser', timeout: 5000 });

      expect(mockFetch).toHaveBeenCalledOnce();
      const fetchOptions = mockFetch.mock.calls[0]?.[1] as {
        signal?: AbortSignal;
      };
      expect(fetchOptions?.signal).toBeDefined();
      expect(fetchOptions?.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('error handling', () => {
    it('throws ProviderFetchError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      try {
        await searchCountryPCLI('Test', { username: 'testuser' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderFetchError);
        expect((error as Error).message).toBe('HTTP 500');
      }
    });

    it('throws ProviderFetchError on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      try {
        await searchCountryPCLI('Test', { username: 'testuser' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderFetchError);
        expect((error as Error).message).toBe('Network failure');
      }
    });

    it('wraps unknown errors in ProviderFetchError', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      try {
        await searchCountryPCLI('Test', { username: 'testuser' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderFetchError);
        expect((error as Error).message).toBe('Unknown fetch error');
      }
    });
  });

  describe('error class properties', () => {
    it('ProviderTimeoutError has provider property', () => {
      const error = new ProviderTimeoutError();
      expect(error.provider).toBe('geonames');
      expect(error.name).toBe('ProviderTimeoutError');
    });

    it('ProviderFetchError has provider property', () => {
      const error = new ProviderFetchError('Test message');
      expect(error.provider).toBe('geonames');
      expect(error.name).toBe('ProviderFetchError');
      expect(error.message).toBe('Test message');
    });
  });
});
