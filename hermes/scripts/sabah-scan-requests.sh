#!/usr/bin/env bash
# Hermes no-agent cron script (every 2 minutes): run scans requested from the dashboard.
# Silent unless a manual scan finished, then it prints a one-line result for Telegram.
set -euo pipefail
DIR="${SABAH_DIR:-$HOME/sabah-lead-engine}/pipeline"
cd "$DIR"
exec 9>/tmp/sabah-lead.lock
flock -n 9 || exit 0
PY="$DIR/.venv/bin/python"
"$PY" lead_engine.py --scan-requests >> run.log 2>&1
"$PY" summary.py scans
