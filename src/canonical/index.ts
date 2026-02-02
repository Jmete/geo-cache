/**
 * Canonical Location Builder (F026)
 *
 * Computes granularity, canonical fields, and displayName deterministically
 * from parsed input and the selected provider candidate.
 */

import type {
  CanonicalLocation,
  GeocodeFlags,
  Granularity,
  ParsedLocation,
  ProviderCandidate,
} from '../types/api';

export interface CanonicalResult {
  canonical: CanonicalLocation;
  granularity: Granularity;
  flags: GeocodeFlags;
}

function hasValue(value: string | null | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

function cleanValue(value: string | null | undefined): string | undefined {
  return hasValue(value) ? value.trim() : undefined;
}

export function determineGranularity(
  parsed: ParsedLocation,
  candidate: ProviderCandidate
): Granularity {
  if (parsed.isMultiArea) {
    return 'multi';
  }

  const hasCity = hasValue(candidate.city);
  const hasAdmin1 = hasValue(candidate.admin1);

  switch (parsed.granularityHint) {
    case 'city':
      if (hasCity) return 'city';
      if (hasAdmin1) return 'region';
      return 'country';
    case 'region':
      if (hasAdmin1) return 'region';
      return 'country';
    case 'country':
      return 'country';
    case 'multi':
      return 'multi';
  }
}

export function buildDisplayName(parts: {
  city?: string;
  admin1?: string;
  countryName: string;
}): string {
  const pieces = [
    cleanValue(parts.city),
    cleanValue(parts.admin1),
    cleanValue(parts.countryName),
  ].filter((value): value is string => Boolean(value));

  return pieces.join(', ');
}

export function buildCanonicalResult(
  parsed: ParsedLocation,
  candidate: ProviderCandidate
): CanonicalResult {
  const granularity = determineGranularity(parsed, candidate);
  const flags: GeocodeFlags = {};

  if (parsed.isMultiArea || granularity === 'multi') {
    flags.multiArea = true;
  }

  const countryIso2 = candidate.countryIso2.toUpperCase();
  const countryName = cleanValue(candidate.countryName) ?? countryIso2;

  let admin1: string | undefined;
  let city: string | undefined;

  if (granularity === 'city') {
    city = cleanValue(candidate.city);
    admin1 = cleanValue(candidate.admin1);
  } else if (granularity === 'region') {
    admin1 = cleanValue(candidate.admin1);
  }

  const displayName = buildDisplayName({
    ...(city ? { city } : {}),
    ...(admin1 ? { admin1 } : {}),
    countryName,
  });

  const canonical: CanonicalLocation = {
    countryIso2,
    countryName,
    displayName,
  };

  if (admin1) {
    canonical.admin1 = admin1;
  }

  if (city) {
    canonical.city = city;
  }

  return { canonical, granularity, flags };
}
