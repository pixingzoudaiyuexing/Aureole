CREATE TABLE IF NOT EXISTS auth_sessions (
  session_id_hash TEXT PRIMARY KEY,
  encrypted_upstream_token TEXT NOT NULL,
  encryption_nonce TEXT NOT NULL,
  encryption_key_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  family_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions(family_id);

CREATE TABLE IF NOT EXISTS auth_families (
  family_id TEXT PRIMARY KEY,
  intent_epoch INTEGER NOT NULL DEFAULT 0,
  current_session_id_hash TEXT
);
