import { describe, it, expect } from 'vitest';
import type {
  GeocodeRequest,
  GeocodeResponse,
  ErrorResponse,
  GeoPoint,
  GeoBbox,
  Granularity,
  GeocodeFlags,
} from './api.js';

describe('API Types', () => {
  describe('GeocodeRequest', () => {
    it('accepts valid request shape', () => {
      const request: GeocodeRequest = {
        text: 'Riyadh, Saudi Arabia',
      };
      expect(request.text).toBe('Riyadh, Saudi Arabia');
    });
  });

  describe('GeocodeResponse', () => {
    it('accepts valid response with all fields', () => {
      const response: GeocodeResponse = {
        input: { raw: 'Riyadh, Saudi Arabia' },
        normalizedKey: 'SA||riyadh|',
        canonical: {
          countryIso2: 'SA',
          countryName: 'Saudi Arabia',
          city: 'Riyadh',
          displayName: 'Riyadh, Saudi Arabia',
        },
        granularity: 'city',
        point: { lat: 24.7136, lon: 46.6753 },
        confidence: 0.95,
        flags: {},
        provider: 'geonames',
        cache: { hit: false },
      };

      expect(response.canonical.countryIso2).toBe('SA');
      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });

    it('accepts response with optional bbox', () => {
      const response: GeocodeResponse = {
        input: { raw: 'Saudi Arabia' },
        normalizedKey: 'SA|||',
        canonical: {
          countryIso2: 'SA',
          countryName: 'Saudi Arabia',
          displayName: 'Saudi Arabia',
        },
        granularity: 'country',
        point: { lat: 23.8859, lon: 45.0792 },
        bbox: [34.4957, 16.3479, 55.6667, 32.1543] as GeoBbox,
        confidence: 0.9,
        flags: {},
        provider: 'geonames',
        cache: { hit: true },
      };

      expect(response.bbox).toHaveLength(4);
      expect(response.granularity).toBe('country');
    });
  });

  describe('ErrorResponse', () => {
    it('accepts valid error shape', () => {
      const error: ErrorResponse = {
        error: {
          code: 'INVALID_INPUT',
          message: 'Text field is required',
        },
      };
      expect(error.error.code).toBe('INVALID_INPUT');
    });

    it('accepts error with details', () => {
      const error: ErrorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: { field: 'text', reason: 'too_long' },
        },
      };
      expect(error.error.details).toBeDefined();
    });
  });

  describe('Granularity', () => {
    it('includes all expected granularity levels', () => {
      const granularities: Granularity[] = ['city', 'region', 'country', 'multi'];
      expect(granularities).toHaveLength(4);
    });
  });

  describe('GeoPoint', () => {
    it('accepts valid coordinates', () => {
      const point: GeoPoint = { lat: 24.7136, lon: 46.6753 };
      expect(point.lat).toBeGreaterThanOrEqual(-90);
      expect(point.lat).toBeLessThanOrEqual(90);
      expect(point.lon).toBeGreaterThanOrEqual(-180);
      expect(point.lon).toBeLessThanOrEqual(180);
    });
  });

  describe('GeoBbox', () => {
    it('accepts [west, south, east, north] tuple', () => {
      const bbox: GeoBbox = [34.4957, 16.3479, 55.6667, 32.1543];
      const [west, south, east, north] = bbox;
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
    });
  });

  describe('GeocodeFlags', () => {
    it('accepts empty flags object', () => {
      const flags: GeocodeFlags = {};
      expect(flags.ambiguous).toBeUndefined();
    });

    it('accepts all optional flags', () => {
      const flags: GeocodeFlags = {
        ambiguous: true,
        multiArea: false,
        adminMismatch: true,
        providerFallback: false,
      };
      expect(flags.ambiguous).toBe(true);
    });
  });
});
