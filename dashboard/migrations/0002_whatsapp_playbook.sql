-- Phase 1: WhatsApp drafts, grounding flags, and the playbook the drafter follows.
ALTER TABLE leads ADD COLUMN whatsapp_draft  TEXT;
ALTER TABLE leads ADD COLUMN whatsapp_edited TEXT;   -- your tweaked version, if any
ALTER TABLE leads ADD COLUMN pitch_type      TEXT;   -- website | internal_system | ui_fix | mixed
ALTER TABLE leads ADD COLUMN draft_flags     TEXT;   -- JSON array of things to double-check before sending
ALTER TABLE leads ADD COLUMN playbook_version INTEGER; -- which playbook wrote the draft

-- The rules the drafter follows. The weekly agent only ever inserts 'proposed' rows;
-- a row becomes 'active' when you approve it in the dashboard.
CREATE TABLE playbook (
  version     INTEGER PRIMARY KEY AUTOINCREMENT,
  content     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','active','rejected','retired')),
  rationale   TEXT,                                   -- why the agent proposed this change
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  decided_at  TEXT
);
CREATE INDEX playbook_status_idx ON playbook (status, version DESC);

-- Seeded leads have no WhatsApp link yet. Mobile numbers (+60 1x) can take WhatsApp; 088 landlines cannot.
UPDATE leads
SET whatsapp_link = 'https://wa.me/' || replace(replace(replace(phone, '+', ''), ' ', ''), '-', '')
WHERE whatsapp_link IS NULL AND phone LIKE '+60 1%';
