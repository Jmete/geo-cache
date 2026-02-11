/**
 * GeoNames Provider (F021/F022/F023)
 *
 * Implements city-level, ADM1 region-level, and country-level GeoNames search.
 */

import type {
  Provider,
  ProviderConfig,
  ProviderQuery,
  ProviderSearchResult,
} from '../types';
import type { GeoBbox, ProviderCandidate } from '../../types/api';
import { getCountryName } from '../../country';
import {
  ProviderFetchError,
  searchCountryPCLI,
  searchAdmin1,
  searchCity,
  type GeoNamesConfig,
  type GeoNamesSearchResult,
} from './client';

function toGeoNamesConfig(config: ProviderConfig): GeoNamesConfig {
  const username = config.credentials.username;
  if (!username) {
    throw new ProviderFetchError('Missing GeoNames username');
  }

  return {
    username,
    timeout: config.timeout,
  };
}

function mapBaseCandidate(
  result: GeoNamesSearchResult,
  fallbackCountryIso2: string
): ProviderCandidate | null {
  const lat = Number(result.lat);
  const lon = Number(result.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  if (typeof result.geonameId !== 'number') {
    return null;
  }

  const countryIso2 = (result.countryCode?.trim() || fallbackCountryIso2).toUpperCase();
  const countryName = result.countryName?.trim() || countryIso2;

  const candidate: ProviderCandidate = {
    providerId: String(result.geonameId),
    lat,
    lon,
    countryIso2,
    countryName,
  };

  if (result.fcl) {
    candidate.featureClass = result.fcl;
  }

  if (result.fcode) {
    candidate.featureCode = result.fcode;
  }

  if (typeof result.population === 'number') {
    candidate.population = result.population;
  }

  const bbox = parseGeoNamesBbox(result.bbox);
  if (bbox) {
    candidate.bbox = bbox;
  }

  return candidate;
}

function parseGeoNamesBbox(
  bbox: GeoNamesSearchResult['bbox']
): GeoBbox | undefined {
  if (!bbox) {
    return undefined;
  }

  const west = Number(bbox.west);
  const south = Number(bbox.south);
  const east = Number(bbox.east);
  const north = Number(bbox.north);

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return undefined;
  }

  return [west, south, east, north];
}

function mapCityCandidate(
  result: GeoNamesSearchResult,
  fallbackCountryIso2: string
): ProviderCandidate | null {
  const candidate = mapBaseCandidate(result, fallbackCountryIso2);
  if (!candidate) {
    return null;
  }

  const city = result.name?.trim();
  const admin1 = result.adminName1?.trim();

  if (admin1) {
    candidate.admin1 = admin1;
  }

  if (city) {
    candidate.city = city;
  }

  return candidate;
}

function mapAdmin1Candidate(
  result: GeoNamesSearchResult,
  fallbackCountryIso2: string
): ProviderCandidate | null {
  const candidate = mapBaseCandidate(result, fallbackCountryIso2);
  if (!candidate) {
    return null;
  }

  const admin1 = result.adminName1?.trim() || result.name?.trim();
  if (admin1) {
    candidate.admin1 = admin1;
  }

  return candidate;
}

function mapCountryCandidate(
  result: GeoNamesSearchResult,
  fallbackCountryIso2: string
): ProviderCandidate | null {
  return mapBaseCandidate(result, fallbackCountryIso2);
}

function buildCityQueryVariants(city: string): string[] {
  const trimmed = city.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);

  const withoutCitySuffix = trimmed.replace(/\s+city$/i, '').trim();
  if (withoutCitySuffix) {
    variants.add(withoutCitySuffix);
  }

  const withoutCityPrefix = trimmed.replace(/^city\s+of\s+/i, '').trim();
  if (withoutCityPrefix) {
    variants.add(withoutCityPrefix);
  }

  return Array.from(variants);
}

export class GeoNamesProvider implements Provider {
  readonly name = 'geonames';

  async search(
    query: ProviderQuery,
    config: ProviderConfig
  ): Promise<ProviderSearchResult> {
    const geoNamesConfig = toGeoNamesConfig(config);
    if (query.granularityHint === 'city' && query.city) {
      const cityVariants = buildCityQueryVariants(query.city);

      for (const [index, cityVariant] of cityVariants.entries()) {
        const isAliasVariant = index > 0;

        const results = await searchCity(
          cityVariant,
          query.countryIso2,
          geoNamesConfig
        );
        const candidates = results
          .map((result) => mapCityCandidate(result, query.countryIso2))
          .filter((candidate): candidate is ProviderCandidate => candidate !== null);

        if (candidates.length > 0) {
          return { candidates, usedFallback: isAliasVariant };
        }

        const fallbackResults = await searchCity(
          cityVariant,
          query.countryIso2,
          geoNamesConfig,
          { featureClass: null, fuzzy: 1 }
        );
        const fallbackCandidates = fallbackResults
          .map((result) => mapCityCandidate(result, query.countryIso2))
          .filter((candidate): candidate is ProviderCandidate => candidate !== null);

        if (fallbackCandidates.length > 0) {
          return { candidates: fallbackCandidates, usedFallback: true };
        }
      }

      if (query.admin1) {
        const regionResults = await searchAdmin1(
          query.admin1,
          query.countryIso2,
          geoNamesConfig
        );
        const regionCandidates = regionResults
          .map((result) => mapAdmin1Candidate(result, query.countryIso2))
          .filter((candidate): candidate is ProviderCandidate => candidate !== null);

        if (regionCandidates.length > 0) {
          return { candidates: regionCandidates, usedFallback: true };
        }

        const fallbackRegionResults = await searchAdmin1(
          query.admin1,
          query.countryIso2,
          geoNamesConfig,
          { featureCode: null }
        );
        const fallbackRegionCandidates = fallbackRegionResults
          .map((result) => mapAdmin1Candidate(result, query.countryIso2))
          .filter((candidate): candidate is ProviderCandidate => candidate !== null);

        if (fallbackRegionCandidates.length > 0) {
          return { candidates: fallbackRegionCandidates, usedFallback: true };
        }
      }

      return { candidates: [], usedFallback: false };
    }

    if (query.granularityHint === 'region' && query.admin1) {
      const results = await searchAdmin1(
        query.admin1,
        query.countryIso2,
        geoNamesConfig
      );
      const candidates = results
        .map((result) => mapAdmin1Candidate(result, query.countryIso2))
        .filter((candidate): candidate is ProviderCandidate => candidate !== null);

      if (candidates.length > 0) {
        return { candidates, usedFallback: false };
      }

      const fallbackResults = await searchAdmin1(
        query.admin1,
        query.countryIso2,
        geoNamesConfig,
        { featureCode: null }
      );
      const fallbackCandidates = fallbackResults
        .map((result) => mapAdmin1Candidate(result, query.countryIso2))
        .filter((candidate): candidate is ProviderCandidate => candidate !== null);

      if (fallbackCandidates.length > 0) {
        return { candidates: fallbackCandidates, usedFallback: true };
      }

      return { candidates: [], usedFallback: false };
    }

    if (query.granularityHint === 'country' || query.granularityHint === 'multi') {
      const countryQuery =
        getCountryName(query.countryIso2) ?? query.countryIso2;
      const result = await searchCountryPCLI(countryQuery, geoNamesConfig);
      if (!result) {
        return { candidates: [], usedFallback: false };
      }

      const candidate = mapCountryCandidate(result, query.countryIso2);
      return candidate
        ? { candidates: [candidate], usedFallback: false }
        : { candidates: [], usedFallback: false };
    }

    return { candidates: [], usedFallback: false };
  }
}
