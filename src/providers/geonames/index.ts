/**
 * GeoNames Provider Module
 *
 * Re-exports the GeoNames API client for use in country resolution.
 */

export {
  searchCountryPCLI,
  searchAdmin1,
  searchCity,
  ProviderTimeoutError,
  ProviderFetchError,
  type GeoNamesConfig,
  type GeoNamesSearchResult,
} from './client';

export { GeoNamesProvider } from './provider';
