CREATE TABLE IF NOT EXISTS realtime_beta_accounts (
  slot INTEGER PRIMARY KEY CHECK (slot BETWEEN 1 AND 5),
  device_id TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  state_iv TEXT NOT NULL,
  state_ciphertext TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES push_subscriptions(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_realtime_beta_enabled
  ON realtime_beta_accounts(enabled, slot);
