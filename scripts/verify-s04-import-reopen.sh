#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm run test -- src/renderer/src/stores/session.import.spec.ts
npm run test -- src/renderer/src/stores/session.reopen.spec.ts
npm run test -- src/renderer/src/stores/transcript.import.spec.ts
npm run test -- src/renderer/src/App.import.spec.ts
poetry run pytest sidecar/tests/test_live_transcription_integration.py -k "batch"
npm run typecheck
