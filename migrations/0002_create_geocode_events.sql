-- Migration: Create geocode_events table
-- Stores minimal audit events for debugging and analytics

CREATE TABLE IF NOT EXISTS geocode_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Input reference
  input_raw TEXT NOT NULL,
  input_norm_key TEXT NOT NULL,

  -- Event details
  status TEXT NOT NULL CHECK (status IN ('hit', 'miss', 'resolved', 'error', 'ambiguous')),
  provider TEXT,
  provider_response TEXT,  -- Truncated to safe length by application

  -- Request metadata
  request_id TEXT,

  -- Timestamp
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for norm key lookups (debugging specific inputs)
CREATE INDEX IF NOT EXISTS idx_geocode_events_norm_key ON geocode_events(input_norm_key);

-- Index for status-based queries (error analysis)
CREATE INDEX IF NOT EXISTS idx_geocode_events_status ON geocode_events(status);

-- Index for time-based queries (recent events)
CREATE INDEX IF NOT EXISTS idx_geocode_events_created_at ON geocode_events(created_at);
