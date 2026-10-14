#!/usr/bin/env bash
# Hermes no-agent cron script: regenerate drafts you queued. Silent (no stdout, so no Telegram message).
set -euo pipefail
DIR="${SABAH_DIR:-$HOME/sabah-lead-engine}/pipeline"
cd "$DIR"
exec 9>/tmp/sabah-lead.lock
flock -n 9 || exit 0
"$DIR/.venv/bin/python" lead_engine.py --redraft --max 5 >> run.log 2>&1
