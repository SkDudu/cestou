#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/flyers-run-in-worker.sh" flyer-test-extraction.ts "$@"
