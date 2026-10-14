-- Scans (watch + manual requests), lead score, mock-ups.

CREATE TABLE scan_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source       TEXT NOT NULL DEFAULT 'scheduled' CHECK (source IN ('scheduled','manual')),
  status       TEXT NOT NULL DEFAULT 'running'   CHECK (status IN ('running','done','failed')),
  phase        TEXT,                                -- scraping | drafting | finished
  queries      TEXT NOT NULL DEFAULT '[]',          -- JSON array of search strings
  started_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  finished_at  TEXT,
  heartbeat_at TEXT,                                -- last time the run reported in; old = stalled
  found        INTEGER NOT NULL DEFAULT 0,          -- places returned by the scraper
  to_process   INTEGER NOT NULL DEFAULT 0,          -- new places to audit and draft
  processed    INTEGER NOT NULL DEFAULT 0,
  new_leads    INTEGER NOT NULL DEFAULT 0,
  skipped      INTEGER NOT NULL DEFAULT 0,          -- already in the database
  failed       INTEGER NOT NULL DEFAULT 0,          -- draft failures
  error        TEXT,
  notified     INTEGER NOT NULL DEFAULT 0           -- 1 once a Telegram summary was sent for a manual run
);
CREATE INDEX scan_runs_started_idx ON scan_runs (started_at DESC);

-- "Scan now" requests from the dashboard; the pipeline picks them up within a couple of minutes.
CREATE TABLE scan_requests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  query        TEXT NOT NULL,
  max_results  INTEGER NOT NULL DEFAULT 10,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  run_id       INTEGER,
  error        TEXT
);

ALTER TABLE leads ADD COLUMN score         INTEGER;
ALTER TABLE leads ADD COLUMN mockup_html   TEXT;
ALTER TABLE leads ADD COLUMN mockup_status TEXT CHECK (mockup_status IN ('requested','ready','failed'));
ALTER TABLE leads ADD COLUMN mockup_at     TEXT;

-- Lead score (0 to 85): no website 40 (social page only 30, has a site 10), reviews up to 20,
-- rating 4.5+ gives 10 (4.0+ gives 5), an email 15 (else a phone 5).
-- Mirrored in pipeline/lead_engine.py and dashboard/src/score.ts. Keep the three in step.
UPDATE leads SET score =
    (CASE
       WHEN website IS NULL OR website = '' THEN 40
       WHEN uses_linktree = 1 OR website LIKE '%facebook.com%' OR website LIKE '%instagram.com%'
         OR website LIKE '%linktr.ee%' OR website LIKE '%carrd.co%' OR website LIKE '%beacons.ai%' THEN 30
       ELSE 10
     END)
  + (MIN(COALESCE(reviews_count, 0), 500) * 20 / 500)
  + (CASE WHEN COALESCE(rating, 0) >= 4.5 THEN 10 WHEN COALESCE(rating, 0) >= 4.0 THEN 5 ELSE 0 END)
  + (CASE WHEN email IS NOT NULL AND email != '' THEN 15 WHEN phone IS NOT NULL AND phone != '' THEN 5 ELSE 0 END);

CREATE INDEX leads_score_idx ON leads (score DESC);
