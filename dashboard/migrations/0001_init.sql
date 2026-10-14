-- Sabah Lead Engine: Cloudflare D1 (SQLite) schema.
-- Apply with: npx wrangler d1 migrations apply sabah-leads --remote

CREATE TABLE leads (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  place_id            TEXT NOT NULL UNIQUE,           -- Google place id: dedupe key across runs
  search_query        TEXT,
  business_name       TEXT NOT NULL,
  category            TEXT,
  area                TEXT,
  address             TEXT,
  phone               TEXT,
  whatsapp_link       TEXT,
  website             TEXT,
  google_maps_url     TEXT,
  rating              REAL,
  reviews_count       INTEGER DEFAULT 0,

  email               TEXT,                           -- primary email, NULL when none found
  all_emails          TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  has_whatsapp_link   INTEGER NOT NULL DEFAULT 0,
  uses_linktree       INTEGER NOT NULL DEFAULT 0,

  detected_bottleneck TEXT,
  email_subject       TEXT,
  observation_hook    TEXT,
  custom_fix          TEXT,
  email_draft         TEXT,
  draft_edited        TEXT,                           -- your tweaked version, if any

  status              TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','approved','sent','whatsapp','replied','follow_up','won','lost','skipped')),
  notes               TEXT,
  sent_at             TEXT,
  follow_up_at        TEXT,

  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

CREATE INDEX leads_status_idx   ON leads (status);
CREATE INDEX leads_created_idx  ON leads (created_at DESC);
CREATE INDEX leads_category_idx ON leads (category);

CREATE TRIGGER leads_updated_at
AFTER UPDATE ON leads
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE leads SET updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = NEW.id;
END;
