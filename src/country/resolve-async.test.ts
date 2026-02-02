/**
 * Async Country Resolution Tests (F016)
 *
 * Tests for country resolution with GeoNames fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveCountryToIso2Async,
  ProviderTimeoutError,
  ProviderFetchError,
} from './resolve-async';
import * as geonamesClient from '../providers/geonames/client';

// Mock the GeoNames client
vi.mock('../providers/geonames/client', async (importOriginal) => {
  const actual = await importOriginal<typeof geonamesClient>();
  return {
    ...actual,
    searchCountryPCLI: vi.fn(),
  };
});

const mockSearchCountryPCLI = vi.mocked(geonamesClient.searchCountryPCLI);

describe('resolveCountryToIso2Async', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('offline resolution (fast path)', () => {
    it('resolves SA for "Saudi Arabia" without GeoNames call', async () => {
      const result = await resolveCountryToIso2Async('Saudi Arabia', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
      expect(result.ambiguous).toBeUndefined();
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves SA for "SA" (ISO2) without GeoNames call', async () => {
      const result = await resolveCountryToIso2Async('SA', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves SA for "SAU" (ISO3) without GeoNames call', async () => {
      const result = await resolveCountryToIso2Async('SAU', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves SA for "KSA" (abbreviation) without GeoNames call', async () => {
      const result = await resolveCountryToIso2Async('KSA', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves AE for "United Arab Emirates" without GeoNames call', async () => {
      const result = await resolveCountryToIso2Async('United Arab Emirates', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('AE');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('resolves AE for "UAE" without GeoNames call', async () => {
      const result = await resolveCountryToIso2Async('UAE', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('AE');
      expect(result.resolvedOffline).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });
  });

  describe('F016 Step 1: GeoNames fallback', () => {
    it('calls GeoNames when offline mapping fails', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 102358,
        countryCode: 'SA',
        countryName: 'Saudi Arabia',
        name: 'Kingdom of Saudi Arabia',
        lat: '25',
        lng: '45',
        fcl: 'A',
        fcode: 'PCLI',
      });

      const result = await resolveCountryToIso2Async('Arabia Saudita', {
        geonamesUsername: 'test',
      });

      expect(mockSearchCountryPCLI).toHaveBeenCalledWith('Arabia Saudita', {
        username: 'test',
        timeout: undefined,
      });
      expect(result.iso2).toBe('SA');
      expect(result.resolvedOffline).toBe(false);
      expect(result.ambiguous).toBeUndefined();
    });

    it('passes custom timeout to GeoNames', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 102358,
        countryCode: 'SA',
        countryName: 'Saudi Arabia',
        name: 'Kingdom of Saudi Arabia',
        lat: '25',
        lng: '45',
        fcl: 'A',
        fcode: 'PCLI',
      });

      await resolveCountryToIso2Async('Arabia Saudita', {
        geonamesUsername: 'test',
        timeout: 5000,
      });

      expect(mockSearchCountryPCLI).toHaveBeenCalledWith('Arabia Saudita', {
        username: 'test',
        timeout: 5000,
      });
    });

    it('trims input before calling GeoNames', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce(null);

      await resolveCountryToIso2Async('  Some Country  ', {
        geonamesUsername: 'test',
      });

      expect(mockSearchCountryPCLI).toHaveBeenCalledWith(
        'Some Country',
        expect.any(Object)
      );
    });

    it('resolves alternative country names via GeoNames', async () => {
      // "Deutschland" -> "Germany" -> DE
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 2921044,
        countryCode: 'DE',
        countryName: 'Germany',
        name: 'Federal Republic of Germany',
        lat: '51',
        lng: '9',
        fcl: 'A',
        fcode: 'PCLI',
      });

      const result = await resolveCountryToIso2Async('Deutschland', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('DE');
      expect(result.resolvedOffline).toBe(false);
    });
  });

  describe('F016 Step 2: no match handling', () => {
    it('returns ambiguous flag when GeoNames returns no results', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce(null);

      const result = await resolveCountryToIso2Async('Unknown Country XYZ', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBeNull();
      expect(result.resolvedOffline).toBe(false);
      expect(result.ambiguous).toBe(true);
    });

    it('returns ambiguous flag for empty input', async () => {
      const result = await resolveCountryToIso2Async('', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBeNull();
      expect(result.resolvedOffline).toBe(true);
      expect(result.ambiguous).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('returns ambiguous flag for whitespace-only input', async () => {
      const result = await resolveCountryToIso2Async('   ', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBeNull();
      expect(result.resolvedOffline).toBe(true);
      expect(result.ambiguous).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('returns ambiguous flag for undefined input', async () => {
      const result = await resolveCountryToIso2Async(undefined, {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBeNull();
      expect(result.resolvedOffline).toBe(true);
      expect(result.ambiguous).toBe(true);
      expect(mockSearchCountryPCLI).not.toHaveBeenCalled();
    });

    it('returns ambiguous flag when GeoNames returns invalid ISO2', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 12345,
        countryCode: 'XX', // Invalid ISO2
        countryName: 'Unknown',
        name: 'Unknown',
        lat: '0',
        lng: '0',
        fcl: 'A',
        fcode: 'PCLI',
      });

      const result = await resolveCountryToIso2Async('Some Country', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBeNull();
      expect(result.resolvedOffline).toBe(false);
      expect(result.ambiguous).toBe(true);
    });
  });

  describe('F016 Step 3: timeout handling', () => {
    it('throws ProviderTimeoutError on timeout', async () => {
      mockSearchCountryPCLI.mockRejectedValueOnce(
        new geonamesClient.ProviderTimeoutError()
      );

      await expect(
        resolveCountryToIso2Async('Test Country', { geonamesUsername: 'test' })
      ).rejects.toThrow(ProviderTimeoutError);
    });

    it('throws ProviderFetchError on network error', async () => {
      mockSearchCountryPCLI.mockRejectedValueOnce(
        new geonamesClient.ProviderFetchError('Network failure')
      );

      await expect(
        resolveCountryToIso2Async('Test Country', { geonamesUsername: 'test' })
      ).rejects.toThrow(ProviderFetchError);
    });

    it('error has provider property for 502 handling', async () => {
      const timeoutError = new geonamesClient.ProviderTimeoutError();
      mockSearchCountryPCLI.mockRejectedValueOnce(timeoutError);

      try {
        await resolveCountryToIso2Async('Test Country', {
          geonamesUsername: 'test',
        });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderTimeoutError);
        expect((error as ProviderTimeoutError).provider).toBe('geonames');
      }
    });
  });

  describe('acceptance fixtures', () => {
    it('offline: "Riyadh, KSA" country part resolves to SA', async () => {
      const result = await resolveCountryToIso2Async('KSA', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('SA');
      expect(result.resolvedOffline).toBe(true);
    });

    it('offline: "Dubai, United Arab Emirates" country part resolves to AE', async () => {
      const result = await resolveCountryToIso2Async('United Arab Emirates', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('AE');
      expect(result.resolvedOffline).toBe(true);
    });

    it('fallback: Spanish country name "Estados Unidos" resolves via GeoNames', async () => {
      mockSearchCountryPCLI.mockResolvedValueOnce({
        geonameId: 6252001,
        countryCode: 'US',
        countryName: 'United States',
        name: 'United States of America',
        lat: '39.76',
        lng: '-98.5',
        fcl: 'A',
        fcode: 'PCLI',
      });

      const result = await resolveCountryToIso2Async('Estados Unidos', {
        geonamesUsername: 'test',
      });

      expect(result.iso2).toBe('US');
      expect(result.resolvedOffline).toBe(false);
    });
  });
});
