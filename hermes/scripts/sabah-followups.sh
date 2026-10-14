#!/usr/bin/env bash
# Hermes no-agent cron script: draft follow-ups that are due. Prints only if some were drafted.
set -euo pipefail
DIR="${SABAH_DIR:-$HOME/sabah-lead-engine}/pipeline"
cd "$DIR"
exec 9>/tmp/sabah-lead.lock
flock -n 9 || exit 0
PY="$DIR/.venv/bin/python"
"$PY" weekly.py --only followups >> run.log 2>&1
"$PY" summary.py followups
