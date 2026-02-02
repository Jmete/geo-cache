/**
 * Cloudflare Worker Environment Bindings
 *
 * These types define the bindings available in the Worker runtime.
 * They are configured in wrangler.toml and injected by Cloudflare.
 */

export interface Env {
  // =============================================================================
  // Rate Limiting
  // =============================================================================
  /** Worker rate limiter binding for per-API-key throttling */
  GEOCODE_RATE_LIMITER: RateLimit;

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

  /** Enable localhost/127.0.0.1 host allowlist for local dev only */
  ALLOW_LOCALHOST_HOSTS?: string;

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

export interface RateLimitResult {
  success: boolean;
  retryAfter?: number;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<RateLimitResult>;
}
