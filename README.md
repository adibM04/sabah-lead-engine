# Sabah Lead Engine

Scrape Sabah businesses, audit their web presence, draft a personalised cold email, and review everything in a dashboard. You send from Zoho by hand.

```
pipeline/   Python: Apify -> audit -> Gemini draft -> Supabase
dashboard/  React + Vite review desk (deploy to Cloudflare Pages)
supabase/   schema.sql
```

## Setup

1. **Supabase**
   - Create a project. Run `supabase/schema.sql` in the SQL editor.
   - Authentication > Users > Add user (your email and a password). Turn off public sign-ups in Authentication settings.
   - Settings > API: copy the project URL, the `anon` key and the `service_role` key.

2. **Pipeline** (VPS or laptop)
   ```
   cd pipeline
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env        # fill in tokens; service_role key goes here only
   python lead_engine.py --dry-run --max 2 --query "dental clinic in Kota Kinabalu"
   python lead_engine.py       # runs everything in queries.json
   ```
   Re-runs skip places already in the database. Weekly cron on the VPS:
   `0 7 * * 1 cd /path/pipeline && .venv/bin/python lead_engine.py --max 15`

3. **Dashboard**
   ```
   cd dashboard
   cp .env.example .env        # URL + anon key only
   npm install
   npm run dev
   ```
   Deploy: Cloudflare Pages, build command `npm run build`, output `dist`, set the two `VITE_` variables. Put Cloudflare Access in front of it as a second lock.

## Daily flow

Open the desk, work the **To review** tab. Use `j`/`k` to move, edit the draft if needed, `c` to copy, paste into Zoho, send, `s` to mark sent (follow-up is set 5 days out). Leads with no email show a WhatsApp button instead.

## Notes

- The `service_role` key bypasses row level security. Keep it out of the dashboard and out of git.
- Check every draft before sending. The model only sees the homepage text and basic signals, so it can misread a business.
- Cold email to businesses in Malaysia falls under PDPA. Keep drafts honest, identify yourself clearly, and stop contacting anyone who asks.
