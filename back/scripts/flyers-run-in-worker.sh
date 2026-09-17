#!/usr/bin/env bash
# Shared: sync scraper src → worker, run a tsx job with LM Studio on the Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

JOB="${1:-}"
shift || true
if [[ -z "$JOB" ]]; then
  echo "usage: $0 <job-file.ts> [-- args...]" >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx worker; then
  echo "worker not running — start with: docker compose up -d" >&2
  exit 1
fi

echo "→ sync scraper/src into worker"
docker compose exec -T worker mkdir -p /app/scraper/src
docker compose cp scraper/src/. worker:/app/scraper/src/

MIMO_URL="${MIMO_DOCKER_BASE_URL:-http://host.docker.internal:1234/v1}"

echo "→ $JOB in worker (MIMO_BASE_URL=$MIMO_URL)"
docker compose exec \
  -e "MIMO_BASE_URL=$MIMO_URL" \
  -e "STORAGE_ROOT=/data/storage" \
  -e "SMART_GROCERY_ROOT=/app" \
  -e "MIMO_CONCURRENCY=${MIMO_CONCURRENCY:-1}" \
  worker \
  ./node_modules/.bin/tsx "scraper/src/flyers/jobs/$JOB" "$@"
