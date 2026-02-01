/**
 * Cloudflare Worker Environment Bindings
 *
 * These types define the bindings available in the Worker runtime.
 * They are configured in wrangler.toml and injected by Cloudflare.
 */

export interface Env {
  // =============================================================================
  // D1 Database
  // =============================================================================
  /** D1 database binding for geocode cache and events */
  DB: D1Database;

  // =============================================================================
  // KV Namespace
  // =============================================================================
  /** KV namespace for hot cache (30-day TTL) */
  GEO_KV: KVNamespace;

  // =============================================================================
  // Environment Variables
  // =============================================================================
  /** Comma-separated list of allowed CORS origins */
  ALLOWED_ORIGINS: string;

  // =============================================================================
  // Secrets (set via wrangler secret put)
  // =============================================================================
  /** GeoNames API username */
  GEONAMES_USERNAME: string;

  /** API key for authenticating requests */
  API_KEY: string;
}

/**
 * Cloudflare Worker execution context
 */
export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
