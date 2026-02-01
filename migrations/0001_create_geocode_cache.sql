-- Migration: Create geocode_cache table
-- Stores cached geocoding results with deterministic key lookup

CREATE TABLE IF NOT EXISTS geocode_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Input fields
  input_raw TEXT NOT NULL,
  input_norm_key TEXT NOT NULL UNIQUE,

  -- Canonical location fields
  country_iso2 TEXT NOT NULL,
  country_name TEXT NOT NULL,
  admin1 TEXT,
  city TEXT,
  display_name TEXT NOT NULL,

  -- Geographic data
  granularity TEXT NOT NULL CHECK (granularity IN ('city', 'region', 'country', 'multi')),
  point_lat REAL,
  point_lon REAL,
  bbox_west REAL,
  bbox_south REAL,
  bbox_east REAL,
  bbox_north REAL,

  -- Scoring and metadata
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  flags_json TEXT NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL,
  provider_id TEXT,

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for country-based queries (e.g., analytics, bulk operations)
CREATE INDEX IF NOT EXISTS idx_geocode_cache_country_iso2 ON geocode_cache(country_iso2);

-- Index for faster timestamp-based queries
CREATE INDEX IF NOT EXISTS idx_geocode_cache_updated_at ON geocode_cache(updated_at);
