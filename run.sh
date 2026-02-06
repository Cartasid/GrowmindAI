#!/usr/bin/env bash
set -euo pipefail

export APP_HOME=/app
export BACKEND_DIR="$APP_HOME/backend"

cd "$BACKEND_DIR"
exec uvicorn app.main:app --host 0.0.0.0 --port 8080
