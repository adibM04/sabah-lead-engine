-- Website report: cached on the lead so it survives a page refresh, re-read on demand.

ALTER TABLE leads ADD COLUMN website_report    TEXT;
ALTER TABLE leads ADD COLUMN website_report_at TEXT;
