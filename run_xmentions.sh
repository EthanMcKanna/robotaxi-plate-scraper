#!/bin/zsh
# X mention listener launcher — env from ~/robotaxi-collectors.env
# (X_BEARER_TOKEN, INGEST_SECRET_SCRAPER).
cd "$(dirname "$0")"
set -a; source "$HOME/robotaxi-collectors.env"; set +a
export ROBOTAXI_INGEST_URL=https://robotaxi-api-v1.ethanmckanna.workers.dev
export ROBOTAXI_INGEST_SECRET="$INGEST_SECRET_SCRAPER"
export PYTHONUNBUFFERED=1
exec python3 stream_mentions.py
