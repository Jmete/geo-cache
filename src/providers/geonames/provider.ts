/**
 * GeoNames Provider (F021)
 *
 * Implements city-level GeoNames search using populated place filters.
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

function mapGeoNamesCandidate(
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
  const city = result.name?.trim();
  const admin1 = result.adminName1?.trim();

  const candidate: ProviderCandidate = {
    providerId: String(result.geonameId),
    lat,
    lon,
    countryIso2,
    countryName,
  };

  if (admin1) {
    candidate.admin1 = admin1;
  }

  if (city) {
    candidate.city = city;
  }

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

export class GeoNamesProvider implements Provider {
  readonly name = 'geonames';

  async search(
    query: ProviderQuery,
    config: ProviderConfig
  ): Promise<ProviderSearchResult> {
    if (!query.city || query.granularityHint !== 'city') {
      return { candidates: [], usedFallback: false };
    }

    const geoNamesConfig = toGeoNamesConfig(config);
    const results = await searchCity(query.city, query.countryIso2, geoNamesConfig);
    const candidates = results
      .map((result) => mapGeoNamesCandidate(result, query.countryIso2))
      .filter((candidate): candidate is ProviderCandidate => candidate !== null);

    return { candidates, usedFallback: false };
  }
}
