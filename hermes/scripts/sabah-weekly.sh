#!/usr/bin/env bash
# Hermes no-agent cron script: weekly scrape + review, then print a short Telegram summary.
set -euo pipefail
DIR="${SABAH_DIR:-$HOME/sabah-lead-engine}/pipeline"
cd "$DIR"
exec 9>/tmp/sabah-lead.lock
flock -n 9 || exit 0   # another run is active; stay quiet
PY="$DIR/.venv/bin/python"
"$PY" lead_engine.py --max 15 >> run.log 2>&1
"$PY" weekly.py --only review >> run.log 2>&1
"$PY" summary.py weekly
