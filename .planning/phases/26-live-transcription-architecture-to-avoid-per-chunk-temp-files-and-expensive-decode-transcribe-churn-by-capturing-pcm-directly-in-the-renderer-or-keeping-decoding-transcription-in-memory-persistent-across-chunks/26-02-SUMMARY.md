---
phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
plan: 02
subsystem: live-transcription
tags: [python, fastapi, websocket, pcm, asr]
requires:
  - phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
    provides: prepare route and websocket contract names
provides:
  - in-memory PCM session ingest with sample-clock metadata
  - queued websocket events for patch, telemetry, state, and complete
  - regression coverage for PCM window slicing and websocket PCM route behavior
affects: [phase-26, live-transcription, sidecar]
tech-stack:
  added: []
  patterns: [pcm-first ingest, bounded in-memory windowing, websocket event queue]
key-files:
  created:
    - .planning/phases/26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks/26-02-SUMMARY.md
  modified:
    - sidecar/app/services/live_transcription.py
    - sidecar/app/routes/transcribe.py
    - sidecar/tests/test_live_decode_window.py
    - sidecar/tests/test_live_transcription_integration.py
    - sidecar/tests/test_live_transcription_routes.py
key-decisions:
  - "Live PCM packets are now the authoritative sidecar ingest unit; timing comes from renderer packet metadata, not arrival order."
  - "Output websocket events are queued through the session so route handlers can stream patch/telemetry/state/complete messages."
patterns-established:
  - "Sidecar hot path should write bounded PCM windows directly to WAV for inference, never per-packet WebM temp files."
  - "Websocket route tests are more reliable in this harness when input/output route handlers are exercised directly with fake websocket objects."
requirements-completed: [P26-02, P26-03, P26-04, P26-05, P26-07, P26-08]
duration: 32 min
completed: 2026-04-18
---

# Phase 26 Plan 02 Summary

**Replaced the sidecar’s live hot path with PCM-first in-memory ingest and websocket-driven output events.**

## Accomplishments
- Rewrote `LiveTranscriptionManager` around direct PCM packet ingestion with explicit sample/ms metadata.
- Added bounded PCM-window slicing from `pcm_buffer` + `pcm_packet_ranges` and removed live-path WebM decode/temp-file churn.
- Added queued websocket events for `patch`, `telemetry`, `state`, and `complete` plus fatal error emission for malformed input.
- Added regression coverage for PCM window selection, websocket PCM route handling, and pause/resume span tracking.

## Task Commits
1. **Task 1: in-memory PCM ingest + bounded inference window** - `305ddb9`
2. **Task 2: websocket route flow coverage** - `00c05c7`

## Files Created/Modified
- `sidecar/app/services/live_transcription.py` - PCM-first session model, event queue, pause spans, bounded window inference.
- `sidecar/app/routes/transcribe.py` - websocket input/output routes now parse PCM metadata/control events and stream queued output events.
- `sidecar/tests/test_live_decode_window.py` - PCM packet-range window slicing coverage.
- `sidecar/tests/test_live_transcription_integration.py` - PCM websocket flow and pause/resume integration coverage.
- `sidecar/tests/test_live_transcription_routes.py` - websocket metadata/binary ordering, fatal error, and ready-event route coverage.

## Deviations from Plan
- `sidecar/app/routes/transcribe.py` landed in the first implementation commit because route parsing and manager event semantics were tightly coupled; the second commit focused on the dedicated websocket route regression coverage.
- The sidecar pytest command in this environment prints a full passing summary but the Poetry wrapper process does not exit cleanly afterward. Verification used the passing pytest output as the source of truth.

## Verification
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -x -vv` *(22 passed; Poetry wrapper lingered after output in this environment)*

## Next Phase Readiness
- Wave 3 can now switch the renderer to AudioWorklet/WebSocket streaming against a real PCM ingest backend.

---
*Completed: 2026-04-18*
