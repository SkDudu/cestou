#!/usr/bin/env bash
# Persist offers via flyer-extraction job inside worker (SPEC 019 Fase 1).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec bash "$ROOT/scripts/flyers-run-in-worker.sh" flyer-extraction.ts "$@"
