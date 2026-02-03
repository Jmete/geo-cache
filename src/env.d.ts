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
  /** Worker rate limiter binding for demo tier */
  GEOCODE_RATE_LIMITER_DEMO: RateLimit;
  /** Worker rate limiter binding for basic tier */
  GEOCODE_RATE_LIMITER_BASIC: RateLimit;
  /** Worker rate limiter binding for pro tier */
  GEOCODE_RATE_LIMITER_PRO: RateLimit;
  /** Worker rate limiter binding for scale tier */
  GEOCODE_RATE_LIMITER_SCALE: RateLimit;

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

  /** Log cache hit events to D1 when true */
  LOG_GEOCODE_HITS?: string;

  // =============================================================================
  // Secrets (set via wrangler secret put)
  // =============================================================================
  /** GeoNames API username */
  GEONAMES_USERNAME: string;

  /** HMAC secret used to hash API keys for lookup */
  API_KEY_HMAC_SECRET: string;
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
