-- API keys entered through the dashboard. Values are AES-256-GCM encrypted with the SETTINGS_KEY
-- secret, so a copy of the database alone does not reveal them. The UI can write but never read them.
CREATE TABLE settings (
  name       TEXT PRIMARY KEY,
  value      TEXT NOT NULL,            -- v1.<b64 iv>.<b64 ciphertext+tag>
  hint       TEXT,                     -- last 4 characters, for display only
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
