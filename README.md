# Sabah Lead Engine

Scrape Sabah businesses, audit their web presence, draft a personalised cold email, and review everything in a dashboard. You send from Zoho by hand.

```
pipeline/   Python: Apify -> audit -> DeepSeek draft -> Cloudflare D1 (runs on the AWS box)
dashboard/  React + Vite review desk, Pages Functions API, D1 migrations (Cloudflare Pages)
```

Everything lives on Cloudflare except the weekly pipeline run. The dashboard login is Cloudflare Access, and the API checks the Access token itself, so the `*.pages.dev` URL can't be used to get around it.

## One-time setup

1. **D1 database**
   ```
   cd dashboard
   npm install
   npx wrangler login
   npx wrangler d1 create sabah-leads        # copy the database_id it prints
   ```
   Put that id in `dashboard/wrangler.toml` (`database_id`), commit, then:
   ```
   npm run db:migrate                         # creates the leads table
   ```

2. **Pages project**
   - Cloudflare dashboard > Workers & Pages > Create > Pages > connect this GitHub repo.
   - Root directory `dashboard`, build command `npm run build`, output `dist`.
   - Settings > Bindings: D1 database, variable name `DB`, database `sabah-leads`.
   - Settings > Variables: `ACCESS_TEAM_DOMAIN` (like `yourteam.cloudflareaccess.com`) and `ACCESS_AUD` (from step 3).

3. **Cloudflare Access** (Zero Trust > Access > Applications > Add > Self-hosted)
   - Cover the custom domain **and** the `*.pages.dev` hostname, with an allow policy for your email only.
   - Copy the application's AUD tag into `ACCESS_AUD` above, then redeploy.

4. **API token for the pipeline**: My Profile > API Tokens > Create. Use a custom token with only `Account > D1 > Edit`. Note your Account ID too.

5. **Pipeline** (AWS box)
   ```
   git clone https://github.com/adibM04/sabah-lead-engine ~/sabah-lead-engine
   cd ~/sabah-lead-engine/pipeline
   python3 -m venv .venv && . .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env && chmod 600 .env && nano .env
   python lead_engine.py --dry-run --max 2 --query "dental clinic in Kota Kinabalu"
   python lead_engine.py --max 3 --query "dental clinic in Kota Kinabalu"   # real write
   ```
   Schedules. If you use Hermes, skip this and follow `hermes/README.md` instead (don't run both). System cron, UTC (KL is +8):
   ```
   crontab -e
   0 23 * * 0   cd ~/sabah-lead-engine/pipeline && flock -n /tmp/lead.lock sh -c '.venv/bin/python lead_engine.py --max 15 && .venv/bin/python weekly.py --only review' >> run.log 2>&1
   30 23 * * *  cd ~/sabah-lead-engine/pipeline && flock -n /tmp/lead.lock .venv/bin/python weekly.py --only followups >> run.log 2>&1
   */30 * * * * cd ~/sabah-lead-engine/pipeline && flock -n /tmp/lead.lock .venv/bin/python lead_engine.py --redraft --max 5 >> run.log 2>&1
   ```
   Weekly (Mon 07:00): scrape, then the review. Daily 07:30: follow-up drafts. Every 30 min: regenerate drafts you queued. Update later with `git pull` and `npm run db:migrate`.

6. **API keys from the dashboard (optional)**: add a Pages secret `SETTINGS_KEY` (16+ random characters, `npx wrangler pages secret put SETTINGS_KEY --project-name sabah-lead-engine`), put the same value in the pipeline `.env`, then enter the DeepSeek and Apify keys under Settings. They are stored AES-GCM encrypted and the page can never read them back. Without this, put the keys in `.env`.

## The weekly agent

`weekly.py` runs fixed steps. It never sends a message and never changes its own rules:

1. Reads outcomes, your edits to drafts, and skip/loss reasons.
2. Proposes a new playbook version (diff shown in Insights). Only you can approve it. The Grounding section is locked: a proposal that edits it is discarded.
3. Suggests new search queries. You click Use or Dismiss.
4. Drafts one follow-up per lead when `follow_up_at` is due.

Approved playbooks apply to new drafts straight away; unedited drafts in "To review" refresh on the next 30-minute run.

## Daily flow

Open the desk, work the **To review** tab. `j`/`k` move, edit the draft if needed, `c` copies, paste into Zoho, send, `s` marks sent (follow-up is set 5 days out). Leads with no email show a WhatsApp button instead.

## Local development

```
cd dashboard
cp .dev.vars.example .dev.vars     # DEV_BYPASS=1 skips Access locally only
npm run db:migrate:local
npm run preview                    # builds, then serves the app and API on localhost
```

## Notes

- Never set `DEV_BYPASS` in Cloudflare. Without Access configured, the API refuses every request.
- Re-runs skip places already in the database (`place_id` is unique).
- Check every draft before sending. The model only sees homepage text and basic signals, so it can misread a business.
- Cold email to businesses in Malaysia falls under PDPA. Keep drafts honest, identify yourself clearly, and stop contacting anyone who asks.

## Drafting with DeepSeek

Drafts follow the active row in the `playbook` table (v1 is seeded from `pipeline/playbook_default.md` on first run). Each lead gets an email draft (only if it has an email) and a WhatsApp text. Claims about a website must carry a word-for-word quote from the fetched page; quotes that can't be found are shown as "Check before sending".

```
python lead_engine.py --backfill --max 40   # draft for leads that have none (e.g. the seeded list)
```
Set `DEEPSEEK_API_KEY` in `pipeline/.env`. Model defaults to `deepseek-v4-pro` (`DEEPSEEK_MODEL`).

## Chat panel

The sparkle button in the top bar opens a chat with DeepSeek on the right. It sees the selected lead (details, drafts, notes) and the active playbook, streams its replies, and can put a reply straight into the email or WhatsApp editor ("Use as email" / "Use as WhatsApp"). It cannot send anything. It uses the DeepSeek key saved under Settings, or a `DEEPSEEK_API_KEY` Pages variable if you set one. `DEEPSEEK_MODEL` (default `deepseek-v4-pro`) can also be set as a Pages variable.

## Scans, scores, mock-ups, replies, backup

- **Scans tab** shows the run that is happening now (progress, stalled warning), the history of runs, and a "Scan now" box. A request waits in `scan_requests`; Hermes runs `sabah-scan-requests.sh` every 2 minutes, which scrapes, audits and drafts, then sends a Telegram summary.
- **Lead score** (0 to 85) sorts the list "Best first": no website 40 (social page only 30, has a site 10), reviews up to 20, rating 4.5+ gives 10 (4.0+ gives 5), email 15 (else a phone 5). The formula lives in three places that must match: `migrations/0005`, `pipeline/lead_engine.py` (`score_lead`) and `dashboard/src/score.ts`.
- **Mock-ups**: the Mock-up tab on a lead builds a one-page concept from their website with DeepSeek. It is sandboxed (no scripts, nothing loaded from outside) and can be downloaded as HTML. `sabah-redraft.sh` builds requested ones; `sabah-weekly.sh` auto-builds a few for UI-fix leads.
- **They replied?** Paste a reply on a lead and DeepSeek suggests a status and a short answer. Nothing is changed until you click.
- **Insights** has the funnel (leads, contacted, replied, won) by category, pitch and playbook version.
- **Backup**: Settings has CSV and full JSON downloads (API keys are never included).

## Deploying without a laptop

Pushing to `main` is enough. Cloudflare Pages builds the dashboard, and the first API request after a deploy applies any new files in `dashboard/migrations/` to D1 by itself (`functions/_lib/migrate.ts`; it uses the same `d1_migrations` table as wrangler). `npm run build` regenerates `functions/_lib/migrations.generated.ts` from the SQL files, so commit that file with new migrations.
