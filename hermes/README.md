# Connecting the lead engine to Hermes

Three pieces: an MCP server (chat tools), a skill (how to use them), and cron scripts (schedules plus Telegram reports). Do this on the box where Hermes runs.

## 1. Pipeline ready
```
cd ~/sabah-lead-engine && git pull
cd pipeline && . .venv/bin/activate && pip install -r requirements.txt
```
`pipeline/.env` needs the three `CF_` lines. Add `SETTINGS_KEY` (same value as the Pages secret) if you enter the DeepSeek and Apify keys in the dashboard.

## 2. Install the skill and scripts
```
mkdir -p ~/.hermes/skills/business ~/.hermes/scripts
cp -r ~/sabah-lead-engine/hermes/skills/sabah-leads ~/.hermes/skills/business/
cp ~/sabah-lead-engine/hermes/scripts/*.sh ~/.hermes/scripts/ && chmod +x ~/.hermes/scripts/*.sh
```
If the repo is not at `~/sabah-lead-engine`, export `SABAH_DIR` for the Hermes service.

## 3. Add the MCP server
In `~/.hermes/config.yaml` (use absolute paths; replace `/home/ubuntu` with your home):
```yaml
mcp_servers:
  sabah_leads:
    command: "/home/ubuntu/sabah-lead-engine/pipeline/.venv/bin/python"
    args: ["mcp_server.py"]
    cwd: "/home/ubuntu/sabah-lead-engine/pipeline"
```
Then `hermes mcp test sabah_leads` and, in a running chat, `/reload-mcp`. Tools show up as `mcp_sabah_leads_*`.

Approving playbook changes from chat is off by default (approve in the dashboard). To allow it, add `env: { ALLOW_APPROVE: "1" }` to the block above.

## 4. Schedules (replace any system cron lines for this project)
```
hermes cron create "every monday 7am" --no-agent --script sabah-weekly.sh --deliver telegram --name sabah-weekly
hermes cron create "daily at 7:30am" --no-agent --script sabah-followups.sh --deliver telegram --name sabah-followups
hermes cron create "every 30m" --no-agent --script sabah-redraft.sh --deliver telegram --name sabah-redraft
hermes cron list
```
Check the next-run times in `hermes cron list` match Kota Kinabalu time. Hermes runs these scripts with no model, so they cost nothing beyond the pipeline's own DeepSeek calls. An empty output sends no message, so the follow-up and redraft jobs stay quiet unless something happened. Test one now with `hermes cron run sabah-followups`.

## 5. Talk to it on Telegram
"what needs review", "find Royal Salon", "sent the email to KaMi Dental", "Unique Dental replied, they want a quote", "redo the draft for Pretty Smile", "how did last week go".
