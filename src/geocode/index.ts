import { buildCanonicalResult, buildDisplayName } from '../canonical';
import { generateCacheKeyAsync } from '../cache-key';
import { readGeocodeFromD1, upsertGeocodeToD1 } from '../cache/d1';
import { readGeocodeFromKv, writeGeocodeToKv } from '../cache/kv';
import { getCountryName } from '../country';
import type { EventStatus } from '../db/schema';
import type { GeocodeEventPayload } from '../events';
import { recordGeocodeEvent } from '../events';
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
const SAUDI_ARABIA_ISO2 = 'SA';
const SAUDI_AL_PREFIX_PATTERN = /^al[\s-]+/i;

export interface ResolveGeocodeDependencies {
  kv: KVNamespace;
  db: D1Database;
  geonamesUsername: string;
  timeoutMs?: number;
  providers?: Provider[];
  logger?: Logger;
  requestId?: string;
  logHitEvents?: boolean;
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

function buildSaudiAlRetryParsed(
  parsed: ParsedLocation,
  countryIso2: string
): ParsedLocation | null {
  if (countryIso2.toUpperCase() !== SAUDI_ARABIA_ISO2) {
    return null;
  }

  const admin1 = cleanToken(parsed.admin1);
  if (!admin1 || SAUDI_AL_PREFIX_PATTERN.test(admin1)) {
    return null;
  }

  return {
    ...parsed,
    admin1: `Al ${admin1}`,
  };
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

async function recordEventSafely(
  db: D1Database,
  logger: Logger | undefined,
  payload: GeocodeEventPayload
): Promise<void> {
  try {
    await recordGeocodeEvent(db, payload);
  } catch (error) {
    logger?.warn('geocode.event_error', {
      status: payload.status,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}

interface PersistResolvedParams {
  db: D1Database;
  kv: KVNamespace;
  logger: Logger | undefined;
  text: string;
  normalizedKey: string;
  requestId: string | null;
  response: GeocodeResponse;
  provider: string;
  providerId: string;
  candidates: number;
  usedFallback: boolean;
  hadTimeout: boolean;
  hadError: boolean;
  retryStrategy?: string;
}

async function persistResolvedResponse(
  params: PersistResolvedParams
): Promise<void> {
  const {
    db,
    kv,
    logger,
    text,
    normalizedKey,
    requestId,
    response,
    provider,
    providerId,
    candidates,
    usedFallback,
    hadTimeout,
    hadError,
    retryStrategy,
  } = params;
  const eventStatus: EventStatus =
    response.flags?.ambiguous ? 'ambiguous' : 'resolved';

  await Promise.all([
    upsertGeocodeToD1(db, response, providerId),
    writeGeocodeToKv(kv, normalizedKey, response),
    recordEventSafely(db, logger, {
      inputRaw: text,
      normalizedKey,
      status: eventStatus,
      provider,
      providerResponse: {
        candidates,
        usedFallback,
        hadTimeout,
        hadError,
        ambiguous: response.flags?.ambiguous ?? false,
        ...(retryStrategy ? { retryStrategy } : {}),
      },
      requestId,
    }),
  ]);
}

interface SaudiRetryResult {
  response: GeocodeResponse;
  providerId: string;
  provider: string;
  candidates: number;
  usedFallback: boolean;
  hadTimeout: boolean;
  hadError: boolean;
}

async function trySaudiAlRetry(params: {
  text: string;
  key: string;
  parsed: ParsedLocation;
  countryIso2: string;
  providers: Provider[];
  geonamesUsername: string;
  timeoutMs: number;
  logger: Logger | undefined;
}): Promise<SaudiRetryResult | null> {
  const { text, key, parsed, countryIso2, providers, geonamesUsername, timeoutMs, logger } =
    params;
  const retryParsed = buildSaudiAlRetryParsed(parsed, countryIso2);
  if (!retryParsed) {
    return null;
  }

  const retryQuery = buildProviderQuery(retryParsed, countryIso2);
  logger?.info('geocode.retry', {
    strategy: 'saudi_al_prefix',
    originalAdmin1: parsed.admin1 ?? null,
    retryAdmin1: retryParsed.admin1 ?? null,
  });
  const retryStart = Date.now();
  const retryResult = await runPipelineStrict(retryQuery, {
    providers,
    timeout: timeoutMs,
    credentials: {
      geonames: { username: geonamesUsername },
    },
  });
  const retryDurationMs = Date.now() - retryStart;

  if (!retryResult.success) {
    logger?.warn('geocode.retry_failed', {
      strategy: 'saudi_al_prefix',
      cache: 'provider',
      durationMs: retryDurationMs,
      hadTimeout: retryResult.hadTimeout,
      errorCount: retryResult.errors.length,
    });
    return null;
  }

  const {
    candidates,
    providersUsed,
    usedFallback,
    hadTimeout,
    hadError,
  } = retryResult.result;
  if (candidates.length === 0) {
    logger?.info('geocode.retry_no_candidates', {
      strategy: 'saudi_al_prefix',
      cache: 'provider',
      durationMs: retryDurationMs,
      usedFallback,
      hadTimeout,
      hadError,
    });
    return null;
  }

  const scored = scoreCandidates(candidates, {
    countryIso2,
    admin1: retryParsed.admin1 ?? null,
    city: retryParsed.city ?? null,
    granularityHint: retryQuery.granularityHint,
  });
  const selection = selectBestCandidate(scored, countryIso2);
  if (!selection.best || selection.confidence === null) {
    logger?.info('geocode.retry_selection_failed', {
      strategy: 'saudi_al_prefix',
      cache: 'provider',
      durationMs: retryDurationMs,
      candidates: candidates.length,
    });
    return null;
  }

  const provider = providerNameForResult(providersUsed, providers);
  const response = buildResponseFromCandidate({
    text,
    key,
    parsed: retryParsed,
    candidate: selection.best,
    confidence: selection.confidence,
    ambiguous: selection.ambiguous,
    usedFallback,
    provider,
  });

  logger?.info('geocode.retry_success', {
    strategy: 'saudi_al_prefix',
    cache: 'provider',
    durationMs: retryDurationMs,
    provider,
    candidates: candidates.length,
    usedFallback,
    hadTimeout,
    hadError,
  });

  return {
    response,
    providerId: selection.best.providerId,
    provider,
    candidates: candidates.length,
    usedFallback,
    hadTimeout,
    hadError,
  };
}

export async function resolveGeocode(
  text: string,
  deps: ResolveGeocodeDependencies
): Promise<GeocodeResponse> {
  const { kv, db, geonamesUsername, logger } = deps;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const providers = deps.providers ?? PROVIDERS;
  const requestId = deps.requestId ?? null;
  const logHitEvents = deps.logHitEvents ?? false;

  const cacheKey = await generateCacheKeyAsync(text, {
    geonamesUsername,
    timeout: timeoutMs,
  });

  const kvHit = await readGeocodeFromKv(kv, cacheKey.key);
  if (kvHit && kvHit.normalizedKey === cacheKey.key) {
    logger?.info('geocode.cache_hit', { cache: 'kv' });
    if (logHitEvents) {
      await recordEventSafely(db, logger, {
        inputRaw: text,
        normalizedKey: cacheKey.key,
        status: 'hit',
        provider: kvHit.provider,
        providerResponse: { cache: 'kv' },
        requestId,
      });
    }
    return kvHit;
  }

  const d1Hit = await readGeocodeFromD1(db, cacheKey.key);
  if (d1Hit && d1Hit.normalizedKey === cacheKey.key) {
    logger?.info('geocode.cache_hit', { cache: 'd1' });
    await Promise.all([
      writeGeocodeToKv(kv, cacheKey.key, d1Hit),
      logHitEvents
        ? recordEventSafely(db, logger, {
            inputRaw: text,
            normalizedKey: cacheKey.key,
            status: 'hit',
            provider: d1Hit.provider,
            providerResponse: { cache: 'd1' },
            requestId,
          })
        : Promise.resolve(),
    ]);
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
      recordEventSafely(db, logger, {
        inputRaw: text,
        normalizedKey: cacheKey.key,
        status: 'ambiguous',
        provider: providerName,
        providerResponse: { reason: 'country_unresolved' },
        requestId,
      }),
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
    await recordEventSafely(db, logger, {
      inputRaw: text,
      normalizedKey: cacheKey.key,
      status: 'error',
      provider,
      providerResponse: {
        errors: pipelineResult.errors,
        hadTimeout: pipelineResult.hadTimeout,
      },
      requestId,
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
    const retryResult = await trySaudiAlRetry({
      text,
      key: cacheKey.key,
      parsed: cacheKey.parsed,
      countryIso2: cacheKey.countryIso2,
      providers,
      geonamesUsername,
      timeoutMs,
      logger,
    });
    if (retryResult) {
      await persistResolvedResponse({
        db,
        kv,
        logger,
        text,
        normalizedKey: cacheKey.key,
        requestId,
        response: retryResult.response,
        provider: retryResult.provider,
        providerId: retryResult.providerId,
        candidates: retryResult.candidates,
        usedFallback: retryResult.usedFallback,
        hadTimeout: retryResult.hadTimeout,
        hadError: retryResult.hadError,
        retryStrategy: 'saudi_al_prefix',
      });
      return retryResult.response;
    }

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
      recordEventSafely(db, logger, {
        inputRaw: text,
        normalizedKey: cacheKey.key,
        status: 'ambiguous',
        provider: resolvedProviderName,
        providerResponse: { reason: 'no_candidates', usedFallback },
        requestId,
      }),
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
    const retryResult = await trySaudiAlRetry({
      text,
      key: cacheKey.key,
      parsed: cacheKey.parsed,
      countryIso2: cacheKey.countryIso2,
      providers,
      geonamesUsername,
      timeoutMs,
      logger,
    });
    if (retryResult) {
      await persistResolvedResponse({
        db,
        kv,
        logger,
        text,
        normalizedKey: cacheKey.key,
        requestId,
        response: retryResult.response,
        provider: retryResult.provider,
        providerId: retryResult.providerId,
        candidates: retryResult.candidates,
        usedFallback: retryResult.usedFallback,
        hadTimeout: retryResult.hadTimeout,
        hadError: retryResult.hadError,
        retryStrategy: 'saudi_al_prefix',
      });
      return retryResult.response;
    }

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
      recordEventSafely(db, logger, {
        inputRaw: text,
        normalizedKey: cacheKey.key,
        status: 'ambiguous',
        provider: resolvedProviderName,
        providerResponse: { reason: 'selection_failed', usedFallback },
        requestId,
      }),
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

  await persistResolvedResponse({
    db,
    kv,
    logger,
    text,
    normalizedKey: cacheKey.key,
    requestId,
    response,
    provider: resolvedProviderName,
    providerId: selection.best.providerId,
    candidates: candidates.length,
    usedFallback,
    hadTimeout,
    hadError,
  });

  return response;
}
