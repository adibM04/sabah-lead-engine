"""Sabah Lead Engine.

Scrapes Google Maps (Apify), audits each business's web presence,
drafts a personalised cold email with Gemini, and saves everything into
Cloudflare D1 for review in the dashboard. Sending stays manual (Zoho).

Usage:
    python lead_engine.py                       # uses queries.json
    python lead_engine.py --max 15              # leads per query
    python lead_engine.py --query "dental clinic in Sandakan"
    python lead_engine.py --dry-run             # no database reads or writes
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from apify_client import ApifyClient
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).with_name(".env"))

APIFY_TOKEN = os.environ["APIFY_TOKEN"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
CF_ACCOUNT_ID = os.environ["CF_ACCOUNT_ID"]
CF_D1_DATABASE_ID = os.environ["CF_D1_DATABASE_ID"]
CF_API_TOKEN = os.environ["CF_API_TOKEN"]  # needs D1 Edit permission only
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
SENDER_NAME = os.getenv("SENDER_NAME", "Adib")
STUDIO_NAME = os.getenv("STUDIO_NAME", "Smart Native Maker")

QUERIES_FILE = Path(__file__).with_name("queries.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
BAD_EMAIL_SUFFIXES = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js",
    "sentry.io", "example.com", "wixpress.com", "domain.com",
)
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")

apify = ApifyClient(APIFY_TOKEN)
gemini = genai.Client(api_key=GEMINI_API_KEY)

D1_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
    f"/d1/database/{CF_D1_DATABASE_ID}/query"
)


def d1(sql: str, params: list | None = None) -> list[dict]:
    """Run one SQL statement against D1 and return the result rows."""
    resp = requests.post(
        D1_URL,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"},
        json={"sql": sql, "params": params or []},
        timeout=30,
    )
    body = resp.json()
    if not resp.ok or not body.get("success"):
        raise RuntimeError(f"D1 error {resp.status_code}: {body.get('errors')}")
    return body["result"][0].get("results", [])


class Outreach(BaseModel):
    detected_bottleneck: str = Field(description="One line: what is missing or broken in their online funnel")
    email_subject: str = Field(description="Short, casual subject line mentioning the business name")
    observation_hook: str = Field(description="One specific sentence about what you noticed on their website, socials or reviews")
    custom_fix_pitch: str = Field(description=f"One specific sentence on what {STUDIO_NAME} can build to fix it")
    full_email_draft: str = Field(description=f"Complete plain-text email, signed by {SENDER_NAME} from {STUDIO_NAME}")


# ---------------------------------------------------------------- scrape
def scrape(queries: list[str], max_results: int) -> list[dict]:
    print(f"[scrape] {len(queries)} queries, up to {max_results} each")
    run = apify.actor("compass/crawler-google-places").call(
        run_input={
            "searchStringsArray": queries,
            "maxCrawledPlacesPerSearch": max_results,
            "language": "en",
            "countryCode": "my",
            "scrapeContacts": True,  # pulls emails and socials from linked sites
        }
    )
    items = list(apify.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"[scrape] {len(items)} places returned")
    return items


# ----------------------------------------------------------------- audit
def clean_emails(raw: list[str]) -> list[str]:
    seen: dict[str, None] = {}
    for e in raw:
        e = e.lower().strip(".,;:")
        if e.endswith(BAD_EMAIL_SUFFIXES) or "@" not in e:
            continue
        seen[e] = None
    return list(seen)


def audit(url: str | None) -> dict:
    result = {"emails": [], "whatsapp": False, "linktree": False, "preview": "No website available."}
    if not url:
        return result
    low = url.lower()
    result["linktree"] = any(x in low for x in ("linktr.ee", "beacons.ai"))
    result["whatsapp"] = any(x in low for x in ("wa.me", "whatsapp.com", "wasap.my"))

    try:
        html = requests.get(url, headers=UA, timeout=10).text
        result["emails"] = clean_emails(EMAIL_RE.findall(html))
        hl = html.lower()
        result["whatsapp"] = result["whatsapp"] or any(x in hl for x in ("wa.me", "api.whatsapp.com", "wasap.my"))
        result["linktree"] = result["linktree"] or "linktr.ee" in hl
    except Exception as e:  # noqa: BLE001
        print(f"   [audit] HTML check failed: {e}")

    try:
        r = requests.get(f"https://r.jina.ai/{url}", headers=UA, timeout=15)
        if r.status_code == 200:
            result["preview"] = r.text[:2500]
    except Exception:  # noqa: BLE001
        pass
    return result


# ----------------------------------------------------------------- draft
def draft(lead: dict, a: dict) -> Outreach:
    prompt = f"""
You are {SENDER_NAME}, CTO of '{STUDIO_NAME}', a local software and workflow automation studio in Sabah.
Write a cold email to a local Sabah business.

BUSINESS
- Name: {lead['business_name']}
- Category: {lead['category']}
- Area: {lead['area']}
- Google rating: {lead['rating']} stars ({lead['reviews_count']} reviews)
- Website: {lead['website'] or 'None (only Google Maps / socials)'}

AUDIT SIGNALS
- Direct WhatsApp link on site: {a['whatsapp']}
- Uses Linktree: {a['linktree']}
- Homepage content: {a['preview'][:1200]}

INSTRUCTIONS
1. Name one real operational or conversion bottleneck from these signals. Examples: no website means they lose high-intent Google searches; everything routed to manual WhatsApp means staff answer the same questions and send the same PDFs all day; a basic site means no online booking or lead qualification.
2. Only claim what the signals support. Do not invent features, prices or facts about them.
3. Email: 90-120 words, natural, non-salesy, local tone.
4. Say pricing is scoped to what they actually need, with no bloated agency packages.
5. Offer a casual 15-minute coffee near their area or a quick online call.
"""
    resp = gemini.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=Outreach,
            temperature=0.4,
        ),
    )
    return Outreach.model_validate_json(resp.text)


# -------------------------------------------------------------- pipeline
def existing_place_ids() -> set[str]:
    return {r["place_id"] for r in d1("SELECT place_id FROM leads")}


def save_lead(lead: dict) -> None:
    row = dict(lead)
    row["all_emails"] = json.dumps(row.get("all_emails") or [])
    row["has_whatsapp_link"] = int(bool(row.get("has_whatsapp_link")))
    row["uses_linktree"] = int(bool(row.get("uses_linktree")))
    cols = list(row)
    d1(
        f"INSERT OR IGNORE INTO leads ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
        [row[c] for c in cols],
    )


def to_lead(place: dict, query_hint: str | None) -> dict:
    phone = place.get("phoneUnformatted") or place.get("phone") or ""
    digits = re.sub(r"\D", "", str(phone))
    return {
        "place_id": place.get("placeId") or place.get("cid") or place.get("url"),
        "search_query": place.get("searchString") or query_hint,
        "business_name": place.get("title", "Unknown business"),
        "category": place.get("categoryName") or "Local business",
        "area": place.get("neighborhood") or place.get("street") or place.get("city") or "Kota Kinabalu",
        "address": place.get("address"),
        "phone": phone or None,
        "whatsapp_link": f"https://wa.me/{digits}" if digits else None,
        "website": place.get("website"),
        "google_maps_url": place.get("url"),
        "rating": place.get("totalScore"),
        "reviews_count": place.get("reviewsCount") or 0,
    }


def run(queries: list[str], max_results: int, dry_run: bool) -> None:
    known = set() if dry_run else existing_place_ids()
    places = scrape(queries, max_results)
    saved = skipped = failed = 0

    for i, place in enumerate(places, 1):
        lead = to_lead(place, queries[0] if len(queries) == 1 else None)
        if not lead["place_id"]:
            continue
        if lead["place_id"] in known:
            skipped += 1
            continue
        known.add(lead["place_id"])

        print(f"[{i}/{len(places)}] {lead['business_name']} ({lead['website'] or 'no website'})")
        a = audit(lead["website"])
        emails = clean_emails(list(place.get("emails") or []) + a["emails"])
        lead.update(
            email=emails[0] if emails else None,
            all_emails=emails,
            has_whatsapp_link=a["whatsapp"],
            uses_linktree=a["linktree"],
        )

        try:
            out = draft(lead, a)
        except Exception as e:  # noqa: BLE001
            print(f"   [draft] failed: {e}")
            failed += 1
            continue

        lead.update(
            detected_bottleneck=out.detected_bottleneck,
            email_subject=out.email_subject,
            observation_hook=out.observation_hook,
            custom_fix=out.custom_fix_pitch,
            email_draft=out.full_email_draft,
        )

        if dry_run:
            print(json.dumps(lead, indent=2, ensure_ascii=False))
        else:
            save_lead(lead)
        saved += 1
        time.sleep(1)

    print(f"\n[done] saved {saved}, already known {skipped}, draft failures {failed}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--query", action="append", help="search query (repeatable); overrides queries.json")
    p.add_argument("--max", type=int, default=10, help="max places per query")
    p.add_argument("--dry-run", action="store_true", help="print leads, do not touch the database")
    args = p.parse_args()

    queries = args.query or json.loads(QUERIES_FILE.read_text())
    if not queries:
        sys.exit("No queries. Add some to queries.json or pass --query.")
    run(queries, args.max, args.dry_run)


if __name__ == "__main__":
    main()
