#!/usr/bin/env bash
# Hermes no-agent cron script (every 30 minutes): regenerate queued drafts and build requested mock-ups. Silent.
set -euo pipefail
DIR="${SABAH_DIR:-$HOME/sabah-lead-engine}/pipeline"
cd "$DIR"
exec 9>/tmp/sabah-lead.lock
flock -n 9 || exit 0
PY="$DIR/.venv/bin/python"
"$PY" lead_engine.py --redraft --max 5 >> run.log 2>&1
"$PY" mockups.py --max 2 >> run.log 2>&1
