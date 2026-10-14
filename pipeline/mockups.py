"""Build a concept mock-up page for a lead (a redesigned booking flow), so the offer in the email is concrete.

Uses only what the business's own page says; anything missing is shown as a labelled placeholder.
The page is static HTML and CSS (no scripts, no external files) and is shown in a sandboxed frame in the dashboard.

    python mockups.py --max 2          # leads where you pressed "Build mock-up"
    python mockups.py --auto-max 3     # also build for new UI-fix leads that have none yet
"""
from __future__ import annotations

import argparse
import re
import time

from db import d1
from lead_engine import audit
from llm import chat_text

NOW = "strftime('%Y-%m-%dT%H:%M:%SZ','now')"
BANNER = (
    '<div style="background:#10262b;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:8px 14px;text-align:center">'
    "Concept mock-up by Smart Native Maker. Not the business's official site.</div>"
)
FORBIDDEN = re.compile(
    r"<script|<iframe|<object|<embed|<link|<form[^>]+action\s*=\s*[\"']?https?:|@import|javascript:|\son\w+\s*=|"
    r"src\s*=\s*[\"']?https?:|url\(\s*[\"']?https?:",
    re.I,
)

SYSTEM = """You are a senior interface designer at Smart Native Maker, a small studio in Kota Kinabalu.
You make one concept mock-up page that shows how a small business's website could let a customer book more easily.

Output exactly one complete HTML document and nothing else (no explanation, no code fence).

Hard rules:
- Inline CSS only, in one <style> block. No JavaScript, no external fonts, images, scripts or links to other sites. Use system fonts and CSS shapes or simple inline SVG for any graphics.
- Use ONLY facts from the supplied page text and lead data (business name, services, branches, opening hours, rating, review count). Where a detail is missing, show a clearly labelled placeholder such as "Service name" or "Branch name". Never invent prices, staff names, addresses, phone numbers or reviews.
- Mobile-first (about 390px wide), and it should still look good wide. Clean and specific to this business's trade, not a generic template. Use CSS variables for a small palette.
- Show the booking path: a header with one clear "Book now" button, a branch picker only if the text shows more than one branch, a three-step booking card (service, branch or time, details) as static UI, and a short reviews strip using only the given rating and review count.
- Keep it under 12 KB.
"""


def extract_html(text: str) -> str | None:
    m = re.search(r"<!doctype html.*?</html>", text, re.I | re.S) or re.search(r"<html.*?</html>", text, re.I | re.S)
    return m.group(0) if m else None


def build(lead: dict) -> str:
    a = audit(lead["website"], preview_chars=7000)
    user = f"""
BUSINESS: {lead['business_name']} ({lead['category']}, {lead['area']})
Google rating: {lead['rating']} from {lead['reviews_count']} reviews
Website: {lead['website'] or 'none'}
What we noticed about their current site: {lead.get('observation_hook') or 'n/a'}
Problem to fix: {lead.get('detected_bottleneck') or 'n/a'}

THEIR PAGE TEXT (may be empty or truncated):
{a['preview']}
"""
    html = extract_html(chat_text(SYSTEM, user, max_tokens=9000))
    if not html:
        raise ValueError("The model did not return an HTML page")
    if FORBIDDEN.search(html):
        raise ValueError("The page used a script or an outside resource")
    if len(html) > 70_000:
        raise ValueError("The page was too large")
    return re.sub(r"(<body[^>]*>)", r"\1" + BANNER, html, count=1, flags=re.I)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=int, default=2, help="requested mock-ups to build")
    p.add_argument("--auto-max", type=int, default=0, help="also build this many for new UI-fix leads")
    args = p.parse_args()

    rows = d1("SELECT * FROM leads WHERE mockup_status = 'requested' ORDER BY updated_at LIMIT ?", [args.max])
    if args.auto_max:
        rows += d1(
            "SELECT * FROM leads WHERE mockup_status IS NULL AND status = 'new' AND pitch_type IN ('ui_fix','mixed') "
            "AND website IS NOT NULL AND website != '' ORDER BY score DESC LIMIT ?",
            [args.auto_max],
        )
    if not rows:
        return
    print(f"[mockups] {len(rows)} to build")
    for lead in rows:
        print(f"   {lead['business_name']}")
        try:
            html = build(lead)
            d1(f"UPDATE leads SET mockup_html = ?, mockup_status = 'ready', mockup_at = {NOW} WHERE id = ?", [html, lead["id"]])
        except Exception as e:  # noqa: BLE001
            print(f"   [mockup] failed: {e}")
            d1("UPDATE leads SET mockup_status = 'failed' WHERE id = ?", [lead["id"]])
        time.sleep(1)


if __name__ == "__main__":
    main()
