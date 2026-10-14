-- Phase 2/3: outcome reasons, follow-ups, regenerate requests, weekly digests, query suggestions.
ALTER TABLE leads ADD COLUMN outcome_reason    TEXT;               -- why it was lost or skipped
ALTER TABLE leads ADD COLUMN followup_draft    TEXT;               -- one follow-up, drafted when due
ALTER TABLE leads ADD COLUMN followup_channel  TEXT;               -- email | whatsapp
ALTER TABLE leads ADD COLUMN redraft           INTEGER NOT NULL DEFAULT 0;  -- 1 = regenerate on next pipeline run

CREATE TABLE weekly_runs (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  digest           TEXT NOT NULL,                  -- markdown, shown at the top of Insights
  stats            TEXT NOT NULL DEFAULT '{}',     -- JSON snapshot the digest was based on
  playbook_version INTEGER                         -- version proposed this run, if any
);

CREATE TABLE search_queries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT NOT NULL UNIQUE,
  status     TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested','active','rejected')),
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
