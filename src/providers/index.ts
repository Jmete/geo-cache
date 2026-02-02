/**
 * Providers Module
 *
 * Exports provider abstraction types, pipeline, and provider implementations.
 */

// Types
export type {
  Provider,
  ProviderQuery,
  ProviderConfig,
  ProviderSearchResult,
  PipelineConfig,
  PipelineResult,
  PipelineError,
} from './types';

// Pipeline
export { runPipeline, runPipelineStrict, getProviderConfig } from './pipeline';

// GeoNames provider (errors and client)
export {
  ProviderTimeoutError,
  ProviderFetchError,
  searchCountryPCLI,
  type GeoNamesConfig,
  type GeoNamesSearchResult,
} from './geonames';
