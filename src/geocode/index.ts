import { buildCanonicalResult, buildDisplayName } from '../canonical';
import { generateCacheKeyAsync } from '../cache-key';
import { readGeocodeFromD1, upsertGeocodeToD1 } from '../cache/d1';
import { readGeocodeFromKv, writeGeocodeToKv } from '../cache/kv';
import { getCountryName } from '../country';
import { buildValidationFlags } from '../flags';
import {
  GeoNamesProvider,
  ProviderFetchError,
  ProviderTimeoutError,
  runPipelineStrict,
} from '../providers';
import type { Provider } from '../providers';
import { scoreCandidates } from '../scoring';
import { selectBestCandidate } from '../selection';
import type {
  CanonicalLocation,
  GeocodeFlags,
  GeocodeResponse,
  Granularity,
  ParsedLocation,
  ProviderCandidate,
} from '../types/api';
import type { Logger } from '../logging';

const PROVIDERS = [new GeoNamesProvider()];
const DEFAULT_PROVIDER_TIMEOUT_MS = 7000;
const LOW_CONFIDENCE_SCORE = 0.1;

export interface ResolveGeocodeDependencies {
  kv: KVNamespace;
  db: D1Database;
  geonamesUsername: string;
  timeoutMs?: number;
  providers?: Provider[];
  logger?: Logger;
}

function cleanToken(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function fallbackGranularity(parsed: ParsedLocation): Granularity {
  if (parsed.isMultiArea) return 'multi';
  if (parsed.granularityHint === 'city' && !parsed.city) {
    return parsed.admin1 ? 'region' : 'country';
  }
  if (parsed.granularityHint === 'region' && !parsed.admin1) {
    return 'country';
  }
  return parsed.granularityHint;
}

function buildFallbackCanonical(
  parsed: ParsedLocation,
  granularity: Granularity,
  countryIso2: string,
  countryName: string
): CanonicalLocation {
  const canonical: CanonicalLocation = {
    countryIso2,
    countryName,
    displayName: countryName,
  };

  if (granularity === 'city') {
    const city = cleanToken(parsed.city);
    const admin1 = cleanToken(parsed.admin1);
    if (admin1) {
      canonical.admin1 = admin1;
    }
    if (city) {
      canonical.city = city;
    }
    canonical.displayName = buildDisplayName({
      ...(city ? { city } : {}),
      ...(admin1 ? { admin1 } : {}),
      countryName,
    });
    return canonical;
  }

  if (granularity === 'region') {
    const admin1 = cleanToken(parsed.admin1);
    if (admin1) {
      canonical.admin1 = admin1;
      canonical.displayName = buildDisplayName({ admin1, countryName });
    }
    return canonical;
  }

  canonical.displayName = buildDisplayName({ countryName });
  return canonical;
}

function buildFallbackResponse(params: {
  text: string;
  key: string;
  parsed: ParsedLocation;
  countryIso2: string | null;
  provider: string;
  usedFallback: boolean;
}): GeocodeResponse {
  const { text, key, parsed, provider, usedFallback } = params;
  const [keyIso2] = key.split('|');
  const resolvedIso2 = (params.countryIso2 ?? keyIso2 ?? '__').toUpperCase();
  const countryName =
    cleanToken(getCountryName(resolvedIso2)) ??
    cleanToken(parsed.countryText) ??
    resolvedIso2;
  const granularity = fallbackGranularity(parsed);
  const canonical = buildFallbackCanonical(
    parsed,
    granularity,
    resolvedIso2,
    countryName
  );

  const flags: GeocodeFlags = {
    ambiguous: true,
  };

  if (parsed.isMultiArea || granularity === 'multi') {
    flags.multiArea = true;
  }

  if (usedFallback) {
    flags.providerFallback = true;
  }

  return {
    input: { raw: text },
    normalizedKey: key,
    canonical,
    granularity,
    confidence: LOW_CONFIDENCE_SCORE,
    flags,
    provider,
    cache: { hit: false },
  };
}

function buildProviderQuery(parsed: ParsedLocation, countryIso2: string) {
  const city = cleanToken(parsed.city);
  const admin1 = cleanToken(parsed.admin1);
  let granularity = parsed.granularityHint;

  if (granularity === 'city' && !city) {
    granularity = admin1 ? 'region' : 'country';
  }
  if (granularity === 'region' && !admin1) {
    granularity = 'country';
  }

  const query = {
    countryIso2,
    granularityHint: granularity,
  } as { countryIso2: string; granularityHint: Granularity; city?: string; admin1?: string };

  if (city) {
    query.city = city;
  }

  if (admin1) {
    query.admin1 = admin1;
  }

  return query;
}

function providerNameForResult(
  providerNames: string[],
  providers: Provider[]
): string {
  return providerNames[0] ?? providers[0]?.name ?? 'geonames';
}

function buildResponseFromCandidate(params: {
  text: string;
  key: string;
  parsed: ParsedLocation;
  candidate: ProviderCandidate;
  confidence: number;
  ambiguous: boolean;
  usedFallback: boolean;
  provider: string;
}): GeocodeResponse {
  const { text, key, parsed, candidate, confidence, ambiguous, usedFallback, provider } =
    params;

  const canonicalResult = buildCanonicalResult(parsed, candidate);
  const validationFlags = buildValidationFlags({
    parsed,
    bestCandidate: candidate,
    usedFallback,
  });

  const flags: GeocodeFlags = {
    ...canonicalResult.flags,
    ...validationFlags,
    ...(ambiguous ? { ambiguous: true } : {}),
  };

  const response: GeocodeResponse = {
    input: { raw: text },
    normalizedKey: key,
    canonical: canonicalResult.canonical,
    granularity: canonicalResult.granularity,
    confidence,
    flags,
    provider,
    cache: { hit: false },
    point: { lat: candidate.lat, lon: candidate.lon },
  };

  if (candidate.bbox) {
    response.bbox = candidate.bbox;
  }

  return response;
}

export async function resolveGeocode(
  text: string,
  deps: ResolveGeocodeDependencies
): Promise<GeocodeResponse> {
  const { kv, db, geonamesUsername, logger } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const providers = deps.providers ?? PROVIDERS;

  const cacheKey = await generateCacheKeyAsync(text, {
    geonamesUsername,
    timeout: timeoutMs,
  });

  const kvHit = await readGeocodeFromKv(kv, cacheKey.key);
  if (kvHit && kvHit.normalizedKey === cacheKey.key) {
    logger?.info('geocode.cache_hit', { cache: 'kv' });
    return kvHit;
  }

  const d1Hit = await readGeocodeFromD1(db, cacheKey.key);
  if (d1Hit && d1Hit.normalizedKey === cacheKey.key) {
    logger?.info('geocode.cache_hit', { cache: 'd1' });
    await writeGeocodeToKv(kv, cacheKey.key, d1Hit);
    return d1Hit;
  }

  const providerName = providerNameForResult([], providers);

  if (!cacheKey.countryIso2) {
    logger?.warn('geocode.fallback', {
      reason: 'country_unresolved',
      cache: 'none',
      provider: providerName,
    });
    const fallback = buildFallbackResponse({
      text,
      key: cacheKey.key,
      parsed: cacheKey.parsed,
      countryIso2: cacheKey.countryIso2,
      provider: providerName,
      usedFallback: false,
    });

    await Promise.all([
      upsertGeocodeToD1(db, fallback, null),
      writeGeocodeToKv(kv, cacheKey.key, fallback),
    ]);

    return fallback;
  }

  const query = buildProviderQuery(cacheKey.parsed, cacheKey.countryIso2);
  const providerStart = Date.now();
  const pipelineResult = await runPipelineStrict(query, {
    providers,
    timeout: timeoutMs,
    credentials: {
      geonames: { username: geonamesUsername },
    },
  });
  const providerDurationMs = Date.now() - providerStart;

  if (!pipelineResult.success) {
    const errorType = pipelineResult.hadTimeout ? 'timeout' : 'error';
    const provider =
      pipelineResult.errors[0]?.provider ?? providerNameForResult([], providers);
    logger?.error('geocode.provider_error', {
      category: pipelineResult.hadTimeout ? 'provider_timeout' : 'provider_error',
      cache: 'provider',
      provider,
      durationMs: providerDurationMs,
      errorType,
      errorCount: pipelineResult.errors.length,
    });
    if (pipelineResult.hadTimeout) {
      throw new ProviderTimeoutError();
    }
    const message = pipelineResult.errors[0]?.message ?? 'Provider error';
    throw new ProviderFetchError(message);
  }

  const {
    candidates,
    providersUsed,
    usedFallback,
    hadTimeout,
    hadError,
  } = pipelineResult.result;
  const resolvedProviderName = providerNameForResult(providersUsed, providers);
  logger?.info('geocode.provider_call', {
    cache: 'provider',
    provider: resolvedProviderName,
    durationMs: providerDurationMs,
    usedFallback,
    candidates: candidates.length,
    hadTimeout,
    hadError,
  });

  if (candidates.length === 0) {
    logger?.warn('geocode.fallback', {
      reason: 'no_candidates',
      cache: 'provider',
      provider: resolvedProviderName,
      usedFallback,
    });
    const fallback = buildFallbackResponse({
      text,
      key: cacheKey.key,
      parsed: cacheKey.parsed,
      countryIso2: cacheKey.countryIso2,
      provider: resolvedProviderName,
      usedFallback,
    });

    await Promise.all([
      upsertGeocodeToD1(db, fallback, null),
      writeGeocodeToKv(kv, cacheKey.key, fallback),
    ]);

    return fallback;
  }

  const scored = scoreCandidates(candidates, {
    countryIso2: cacheKey.countryIso2,
    admin1: cacheKey.parsed.admin1 ?? null,
    city: cacheKey.parsed.city ?? null,
    granularityHint: query.granularityHint,
  });

  const selection = selectBestCandidate(scored, cacheKey.countryIso2);
  if (!selection.best || selection.confidence === null) {
    logger?.warn('geocode.fallback', {
      reason: 'selection_failed',
      cache: 'provider',
      provider: resolvedProviderName,
      usedFallback,
    });
    const fallback = buildFallbackResponse({
      text,
      key: cacheKey.key,
      parsed: cacheKey.parsed,
      countryIso2: cacheKey.countryIso2,
      provider: resolvedProviderName,
      usedFallback,
    });

    await Promise.all([
      upsertGeocodeToD1(db, fallback, null),
      writeGeocodeToKv(kv, cacheKey.key, fallback),
    ]);

    return fallback;
  }

  const response = buildResponseFromCandidate({
    text,
    key: cacheKey.key,
    parsed: cacheKey.parsed,
    candidate: selection.best,
    confidence: selection.confidence,
    ambiguous: selection.ambiguous,
    usedFallback,
    provider: resolvedProviderName,
  });

  await Promise.all([
    upsertGeocodeToD1(db, response, selection.best.providerId),
    writeGeocodeToKv(kv, cacheKey.key, response),
  ]);

  return response;
}
