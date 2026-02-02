/**
 * GeoNames Provider (F021/F022)
 *
 * Implements city-level and ADM1 region-level GeoNames search.
 */

import type {
  Provider,
  ProviderConfig,
  ProviderQuery,
  ProviderSearchResult,
} from '../types';
import type { ProviderCandidate } from '../../types/api';
import {
  ProviderFetchError,
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

  return candidate;
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

export class GeoNamesProvider implements Provider {
  readonly name = 'geonames';

  async search(
    query: ProviderQuery,
    config: ProviderConfig
  ): Promise<ProviderSearchResult> {
    const geoNamesConfig = toGeoNamesConfig(config);
    if (query.granularityHint === 'city' && query.city) {
      const results = await searchCity(
        query.city,
        query.countryIso2,
        geoNamesConfig
      );
      const candidates = results
        .map((result) => mapCityCandidate(result, query.countryIso2))
        .filter((candidate): candidate is ProviderCandidate => candidate !== null);
      return { candidates, usedFallback: false };
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
      return { candidates, usedFallback: false };
    }

    return { candidates: [], usedFallback: false };
  }
}
