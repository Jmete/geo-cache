/**
 * GeoNames Provider Module
 *
 * Re-exports the GeoNames API client for use in country resolution.
 */

export {
  searchCountryPCLI,
  ProviderTimeoutError,
  ProviderFetchError,
  type GeoNamesConfig,
  type GeoNamesSearchResult,
} from './client';
