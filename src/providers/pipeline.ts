/**
 * Provider Pipeline (F020)
 *
 * Orchestrates geocoding provider calls with:
 * - Sequential provider execution with fallback
 * - Candidate aggregation from multiple providers
 * - Controlled error handling (no unhandled exceptions)
 * - Timeout enforcement per provider
 */

import { ProviderTimeoutError, ProviderFetchError } from './geonames/client';
import type {
  Provider,
  ProviderQuery,
  ProviderConfig,
  PipelineConfig,
  PipelineResult,
  PipelineError,
} from './types';
import type { ProviderCandidate } from '../types/api';

// =============================================================================
// Pipeline Implementation
// =============================================================================

/**
 * Run the provider pipeline to geocode a location.
 *
 * Calls providers in order until one returns results. Aggregates candidates
 * from successful providers. Handles timeouts and errors gracefully without
 * throwing unhandled exceptions.
 *
 * @param query - Search parameters
 * @param config - Pipeline configuration
 * @returns Pipeline result with candidates and metadata
 *
 * @example
 * const result = await runPipeline(
 *   { city: 'riyadh', countryIso2: 'SA', granularityHint: 'city' },
 *   { providers: [geonamesProvider], timeout: 7000, credentials: { geonames: { username: 'demo' } } }
 * );
 */
export async function runPipeline(
  query: ProviderQuery,
  config: PipelineConfig
): Promise<PipelineResult> {
  const { providers, timeout, credentials } = config;

  const allCandidates: ProviderCandidate[] = [];
  const providersUsed: string[] = [];
  const errors: PipelineError[] = [];
  let usedFallback = false;

  // Try each provider in order
  for (const provider of providers) {
    const providerCreds = credentials[provider.name] ?? {};
    const providerConfig: ProviderConfig = {
      timeout,
      credentials: providerCreds,
    };

    try {
      const result = await provider.search(query, providerConfig);

      if (result.candidates.length > 0) {
        allCandidates.push(...result.candidates);
        providersUsed.push(provider.name);
        if (result.usedFallback) {
          usedFallback = true;
        }
      }

      // If we got results from this provider, we can stop
      // (later providers are fallbacks)
      if (result.candidates.length > 0) {
        break;
      }
    } catch (error) {
      // Handle provider errors without throwing
      if (error instanceof ProviderTimeoutError) {
        errors.push({
          provider: provider.name,
          type: 'timeout',
          message: error.message,
        });
      } else if (error instanceof ProviderFetchError) {
        errors.push({
          provider: provider.name,
          type: 'error',
          message: error.message,
        });
      } else {
        // Unknown error - wrap it
        errors.push({
          provider: provider.name,
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      // Continue to next provider on error
    }
  }

  return {
    candidates: allCandidates,
    providersUsed,
    hadTimeout: errors.some((e) => e.type === 'timeout'),
    hadError: errors.some((e) => e.type === 'error'),
    usedFallback,
  };
}

/**
 * Run pipeline with strict mode - returns error result if all providers fail.
 *
 * Unlike runPipeline, this function returns a discriminated result type
 * that explicitly indicates whether the pipeline succeeded or failed.
 *
 * @param query - Search parameters
 * @param config - Pipeline configuration
 * @returns Either success result with candidates or error result with details
 */
export async function runPipelineStrict(
  query: ProviderQuery,
  config: PipelineConfig
): Promise<
  | { success: true; result: PipelineResult }
  | { success: false; errors: PipelineError[]; hadTimeout: boolean }
> {
  const { providers, timeout, credentials } = config;

  const allCandidates: ProviderCandidate[] = [];
  const providersUsed: string[] = [];
  const errors: PipelineError[] = [];
  let usedFallback = false;

  for (const provider of providers) {
    const providerCreds = credentials[provider.name] ?? {};
    const providerConfig: ProviderConfig = {
      timeout,
      credentials: providerCreds,
    };

    try {
      const result = await provider.search(query, providerConfig);

      if (result.candidates.length > 0) {
        allCandidates.push(...result.candidates);
        providersUsed.push(provider.name);
        if (result.usedFallback) {
          usedFallback = true;
        }
        break;
      }
    } catch (error) {
      if (error instanceof ProviderTimeoutError) {
        errors.push({
          provider: provider.name,
          type: 'timeout',
          message: error.message,
        });
      } else if (error instanceof ProviderFetchError) {
        errors.push({
          provider: provider.name,
          type: 'error',
          message: error.message,
        });
      } else {
        errors.push({
          provider: provider.name,
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // If we got candidates, return success
  if (allCandidates.length > 0) {
    return {
      success: true,
      result: {
        candidates: allCandidates,
        providersUsed,
        hadTimeout: errors.some((e) => e.type === 'timeout'),
        hadError: errors.some((e) => e.type === 'error'),
        usedFallback,
      },
    };
  }

  // If no candidates but also no errors, providers returned empty results
  if (errors.length === 0) {
    return {
      success: true,
      result: {
        candidates: [],
        providersUsed: [],
        hadTimeout: false,
        hadError: false,
        usedFallback: false,
      },
    };
  }

  // All providers failed
  return {
    success: false,
    errors,
    hadTimeout: errors.some((e) => e.type === 'timeout'),
  };
}

/**
 * Create a provider config from pipeline config for a specific provider.
 *
 * Helper function for provider implementations to extract their config.
 */
export function getProviderConfig(
  provider: Provider,
  pipelineConfig: PipelineConfig
): ProviderConfig {
  return {
    timeout: pipelineConfig.timeout,
    credentials: pipelineConfig.credentials[provider.name] ?? {},
  };
}
