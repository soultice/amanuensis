#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SIDECAR_URL:-http://127.0.0.1:8765}"
TMP_AUDIO="$(mktemp -t live-chunk.XXXXXX.webm)"
trap 'rm -f "$TMP_AUDIO"' EXIT

printf 'RIFFFAKEWEBM' > "$TMP_AUDIO"

start_json=$(curl -sfS -X POST "${BASE_URL}/transcribe/live/start" \
  -H 'Content-Type: application/json' \
  -d '{"sampleRate":44100,"channels":1,"mimeType":"audio/webm;codecs=opus"}')

session_id=$(printf '%s' "$start_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["sessionId"])')

curl -sfS -X POST "${BASE_URL}/transcribe/live/chunk" \
  -F "sessionId=${session_id}" \
  -F "seq=1" \
  -F "chunkStartMs=0" \
  -F "chunkEndMs=400" \
  -F "isLast=false" \
  -F "audio=@${TMP_AUDIO};type=audio/webm" >/dev/null

curl -sfS -X POST "${BASE_URL}/transcribe/live/pause" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${session_id}\",\"atMs\":400}" >/dev/null

curl -sfS -X POST "${BASE_URL}/transcribe/live/resume" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${session_id}\",\"atMs\":550}" >/dev/null

stop_json=$(curl -sfS -X POST "${BASE_URL}/transcribe/live/stop" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${session_id}\",\"atMs\":900}")

printf '%s' "$stop_json" | python3 - <<'PY'
import json, sys
payload = json.load(sys.stdin)
required = {"words", "segments", "language", "duration"}
missing = sorted(required - payload.keys())
if missing:
    raise SystemExit(f"missing keys: {missing}")
print("live transcription smoke: OK")
PY
