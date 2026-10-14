"""Weekly agent for the Sabah lead engine.

Runs a fixed sequence of steps. It never sends anything and never activates its own
changes: playbook edits and new search queries are saved as proposals you approve in
the dashboard (Insights tab).

    python weekly.py                  # everything: follow-ups, then the weekly review
    python weekly.py --only followups # daily: draft follow-ups for leads that are due
    python weekly.py --only review    # weekly review only
    python weekly.py --dry-run        # print what it would do, write nothing
"""
from __future__ import annotations

import argparse
import json
import re
import time

from pydantic import BaseModel, Field

from db import d1
from lead_engine import audit, load_playbook
from llm import chat_json

MIN_CONTACTED = 5   # sent messages needed before outcome data is worth reasoning about
MIN_EDITS = 3       # or edited drafts
FROZEN_SECTION = "## Grounding"  # the agent may never change this section


# ------------------------------------------------------------- follow-ups
class FollowUp(BaseModel):
    text: str = Field(description="The follow-up message, plain text")


def follow_ups(playbook: str, version: int | None, dry_run: bool) -> int:
    rows = d1(
        "SELECT * FROM leads WHERE status IN ('sent','whatsapp') AND follow_up_at IS NOT NULL "
        "AND follow_up_at <= date('now') AND followup_draft IS NULL ORDER BY follow_up_at LIMIT 20"
    )
    print(f"[followups] {len(rows)} due")
    made = 0
    for lead in rows:
        channel = "email" if lead["status"] == "sent" and lead.get("email") else "whatsapp"
        original = lead.get("draft_edited") or lead.get("email_draft") if channel == "email" else (
            lead.get("whatsapp_edited") or lead.get("whatsapp_draft")
        )
        user = f"""
Write ONE follow-up message to {lead['business_name']} ({lead['category']}, {lead['area']}) by {channel}.
Sent {lead['sent_at']}. No reply yet.

THE MESSAGE ALREADY SENT:
{original or '(not recorded)'}

Rules for this follow-up:
- 25 to 50 words. No guilt, no "just checking in", no "bumping this".
- Add one new useful thing: a quick concrete tip they can use without us, or a specific small offer (a free fix list, a one-page mock-up).
- Do not repeat the first pitch. Make it easy to say no.
- Follow every other part of the playbook, including grounding.
"""
        try:
            out = chat_json(playbook, user, FollowUp)
        except Exception as e:  # noqa: BLE001
            print(f"   [followup] {lead['business_name']} failed: {e}")
            continue
        print(f"   {lead['business_name']} ({channel})")
        if not dry_run:
            d1(
                "UPDATE leads SET followup_draft = ?, followup_channel = ?, status = 'follow_up' WHERE id = ?",
                [out.text, channel, lead["id"]],
            )
        made += 1
        time.sleep(1)
    return made


# ----------------------------------------------------------------- review
class SuggestedQuery(BaseModel):
    query: str = Field(description="Google Maps search, like 'physiotherapy clinic in Kota Kinabalu'")
    reason: str = Field(description="One sentence of evidence for why it is worth trying")


class Review(BaseModel):
    digest_markdown: str = Field(description="Plain weekly summary, under 200 words, with the real numbers")
    change_summary: list[str] = Field(default_factory=list, description="Each change made to the playbook and the evidence behind it. Empty if no change.")
    new_playbook: str = Field(default="", description="The COMPLETE revised playbook text, or an empty string if no change is justified")
    suggested_queries: list[SuggestedQuery] = Field(default_factory=list, description="At most 5")


def section(text: str, heading: str) -> str:
    m = re.search(rf"^{re.escape(heading)}\b.*?(?=^## |\Z)", text, re.S | re.M)
    return m.group(0).strip() if m else ""


def gather() -> dict:
    stats: dict = {}
    stats["by_status"] = {r["status"]: r["n"] for r in d1("SELECT status, COUNT(*) n FROM leads GROUP BY status")}
    stats["new_leads_7d"] = d1("SELECT COUNT(*) n FROM leads WHERE created_at >= datetime('now','-7 days')")[0]["n"]
    stats["contacted"] = d1("SELECT COUNT(*) n FROM leads WHERE sent_at IS NOT NULL")[0]["n"]
    stats["by_category_and_pitch"] = d1(
        "SELECT category, pitch_type, COUNT(*) leads, "
        "SUM(sent_at IS NOT NULL) contacted, SUM(status IN ('replied','won')) replied, SUM(status = 'won') won "
        "FROM leads GROUP BY category, pitch_type ORDER BY contacted DESC LIMIT 25"
    )
    stats["flagged_drafts"] = d1("SELECT COUNT(*) n FROM leads WHERE draft_flags IS NOT NULL")[0]["n"]
    stats["skip_or_loss_reasons"] = d1(
        "SELECT outcome_reason, COUNT(*) n FROM leads WHERE outcome_reason IS NOT NULL GROUP BY outcome_reason"
    )
    edits = d1(
        "SELECT business_name, category, pitch_type, email_draft, draft_edited, whatsapp_draft, whatsapp_edited "
        "FROM leads WHERE draft_edited IS NOT NULL OR whatsapp_edited IS NOT NULL ORDER BY updated_at DESC LIMIT 15"
    )
    stats["edit_count"] = len(edits)
    stats["edits"] = [
        {k: (v[:1200] if isinstance(v, str) else v) for k, v in e.items() if v is not None} for e in edits
    ]
    stats["reply_notes"] = [
        {"business": r["business_name"], "status": r["status"], "notes": (r["notes"] or "")[:300]}
        for r in d1("SELECT business_name, status, notes FROM leads WHERE status IN ('replied','won','lost') AND notes IS NOT NULL LIMIT 10")
    ]
    stats["known_queries"] = [r["query"] for r in d1("SELECT query FROM search_queries")]
    return stats


REVIEW_SYSTEM = """You are the weekly analyst for Smart Native Maker's cold-outreach engine in Kota Kinabalu.
You read last period's data and improve the outreach playbook, carefully.

Rules:
- Change only what the data supports. Prefer one to three small edits over a rewrite. If the data is thin, change nothing and say so plainly in the digest.
- Treat the owner's edits to drafts as the strongest signal: they show what the model got wrong. Look for patterns across edits (words removed, claims softened, length cut), not one-offs.
- Keep the playbook's headings and structure. Never alter the "## Grounding" section. Never add pressure tactics, flattery, invented urgency, or anything that makes claims the signals can't support.
- Report real numbers only. Small samples are small samples; say so.
- Suggested search queries must be Sabah businesses a web or systems studio could help, similar in type to what replied. At most 5, none already in known_queries.
"""


def review(playbook: str, version: int | None, dry_run: bool) -> None:
    stats = gather()
    enough = stats["contacted"] >= MIN_CONTACTED or stats["edit_count"] >= MIN_EDITS
    pending = d1("SELECT version FROM playbook WHERE status = 'proposed' LIMIT 1")

    user = (
        f"CURRENT PLAYBOOK (version {version}):\n{playbook}\n\nDATA:\n{json.dumps(stats, indent=1, ensure_ascii=False)}\n\n"
        f"Enough data to change the playbook: {enough}. "
        + ("A proposal is already waiting for approval, so leave new_playbook empty. " if pending else "")
        + "Write the digest, and propose playbook changes only if justified."
    )
    result = chat_json(REVIEW_SYSTEM, user, Review)

    proposed = result.new_playbook.strip()
    problem = ""
    if not enough or pending:
        proposed = ""
    if proposed:
        if section(proposed, FROZEN_SECTION) != section(playbook, FROZEN_SECTION):
            problem = "the Grounding section was altered"
        elif "## Banned" not in proposed or not 1500 <= len(proposed) <= 12000:
            problem = "the revised playbook is malformed"
        elif proposed == playbook.strip():
            problem = "no actual change"
        if problem:
            print(f"[review] discarded proposal: {problem}")
            proposed = ""

    digest = result.digest_markdown.strip()
    if problem and "altered" in problem:
        digest += "\n\n(The agent tried to edit the Grounding rules; that proposal was discarded.)"
    print(digest)

    known = {q.lower() for q in stats["known_queries"]}
    queries = [q for q in result.suggested_queries if q.query.strip().lower() not in known][:5]

    if dry_run:
        print("\n[proposal]", "yes" if proposed else "none", "\n[queries]", [q.query for q in queries])
        return

    new_version = None
    if proposed:
        rationale = "\n".join(f"- {c}" for c in result.change_summary) or "No summary given"
        d1("INSERT INTO playbook (content, status, rationale) VALUES (?, 'proposed', ?)", [proposed, rationale])
        new_version = d1("SELECT MAX(version) v FROM playbook")[0]["v"]
    d1(
        "INSERT INTO weekly_runs (digest, stats, playbook_version) VALUES (?, ?, ?)",
        [digest, json.dumps({k: v for k, v in stats.items() if k not in ("edits", "known_queries")}), new_version],
    )
    for q in queries:
        d1("INSERT OR IGNORE INTO search_queries (query, status, reason) VALUES (?, 'suggested', ?)", [q.query.strip(), q.reason])
    print(f"[review] saved. Proposal: {new_version or 'none'}. New query suggestions: {len(queries)}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--only", choices=["followups", "review"])
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    playbook, version = load_playbook(False)
    if args.only in (None, "followups"):
        follow_ups(playbook, version, args.dry_run)
    if args.only in (None, "review"):
        review(playbook, version, args.dry_run)


if __name__ == "__main__":
    main()
