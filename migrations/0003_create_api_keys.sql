CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK (tier IN ('demo', 'basic', 'pro', 'scale')),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  label TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tier_status
  ON api_keys(tier, status);
