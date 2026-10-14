"""Short plain-text summaries for Hermes cron jobs to deliver to Telegram.

Prints nothing when there is nothing worth saying (Hermes skips delivery on empty output).
    python summary.py weekly      # after the weekly scrape + review
    python summary.py followups   # after the daily follow-up run
    python summary.py scans       # after a scan requested from the dashboard
"""
from __future__ import annotations

import sys

from db import d1


def weekly() -> str:
    run = d1("SELECT ran_at, digest, playbook_version FROM weekly_runs ORDER BY id DESC LIMIT 1")
    if not run:
        return ""
    new = d1("SELECT COUNT(*) n FROM leads WHERE status = 'new'")[0]["n"]
    sugg = d1("SELECT COUNT(*) n FROM search_queries WHERE status = 'suggested'")[0]["n"]
    lines = ["Lead engine weekly review", "", run[0]["digest"][:1200], "", f"{new} leads waiting in To review."]
    if run[0]["playbook_version"]:
        lines.append(f"Playbook v{run[0]['playbook_version']} is waiting for your approval (dashboard, Insights).")
    if sugg:
        lines.append(f"{sugg} new search queries suggested.")
    return "\n".join(lines)


def followups() -> str:
    rows = d1(
        "SELECT business_name, followup_channel FROM leads WHERE status = 'follow_up' AND followup_draft IS NOT NULL "
        "AND updated_at >= strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 hour')"
    )
    if not rows:
        return ""
    names = ", ".join(f"{r['business_name']} ({r['followup_channel']})" for r in rows[:8])
    return f"{len(rows)} follow-up draft(s) ready: {names}. Open the Follow up tab, or ask me."


def scans() -> str:
    """Manual scans (requested from the dashboard) that finished and have not been reported yet."""
    import json

    rows = d1("SELECT * FROM scan_runs WHERE source = 'manual' AND status IN ('done','failed') AND notified = 0 ORDER BY id")
    if not rows:
        return ""
    lines = []
    for r in rows:
        q = ", ".join(json.loads(r["queries"]))
        if r["status"] == "done":
            lines.append(f"Scan finished: {q}. {r['new_leads']} new leads, {r['skipped']} already known, {r['failed']} draft failures.")
        else:
            lines.append(f"Scan failed: {q}. {r['error'] or 'Unknown error'}")
        d1("UPDATE scan_runs SET notified = 1 WHERE id = ?", [r["id"]])
    return "\n".join(lines)


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else ""
    text = {"weekly": weekly, "followups": followups, "scans": scans}.get(kind, lambda: "")()
    if text:
        print(text)
