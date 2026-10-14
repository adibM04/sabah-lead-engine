"""Short plain-text summaries for Hermes cron jobs to deliver to Telegram.

Prints nothing when there is nothing worth saying (Hermes skips delivery on empty output).
    python summary.py weekly      # after the weekly scrape + review
    python summary.py followups   # after the daily follow-up run
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
        "AND updated_at >= datetime('now', '-1 hour')"
    )
    if not rows:
        return ""
    names = ", ".join(f"{r['business_name']} ({r['followup_channel']})" for r in rows[:8])
    return f"{len(rows)} follow-up draft(s) ready: {names}. Open the Follow up tab, or ask me."


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else ""
    text = {"weekly": weekly, "followups": followups}.get(kind, lambda: "")()
    if text:
        print(text)
