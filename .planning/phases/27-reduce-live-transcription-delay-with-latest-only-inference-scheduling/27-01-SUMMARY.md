---
phase: 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling
plan: 01
subsystem: sidecar-live-transcription
tags: [python, fastapi, asyncio, live-transcription, scheduler]
requires:
  - phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
    provides: websocket PCM ingest, canonical PCM buffers, patch-based transcript updates
provides:
  - one-worker latest-only live inference scheduling
  - stale-result dropping before merge/emission
  - stop-time draining of the newest useful tail without FIFO replay
affects: [phase-27, sidecar, live-transcription]
tech-stack:
  added: []
  patterns: [overwriteable latest snapshot, per-session worker, stale completion guard]
key-files:
  created:
    - .planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-01-SUMMARY.md
  modified:
    - sidecar/app/services/live_transcription.py
    - sidecar/app/routes/transcribe.py
    - sidecar/tests/test_live_decode_window.py
    - sidecar/tests/test_live_transcription_integration.py
key-decisions:
  - "All PCM still appends to canonical session history; only superseded inference work is skipped."
  - "WebSocket PCM ingest now schedules work quickly and lets the per-session worker own inference + merge/emission."
patterns-established:
  - "Latest-only scheduling is implemented as one in-flight worker plus one overwriteable pending snapshot."
  - "Stale completions are dropped with generation/seq guards before they can regress transcript state."
requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06]
duration: 1 session
completed: 2026-04-18
---

# Phase 27 Plan 01 Summary

**Replaced inline per-packet inference with a latest-only sidecar scheduler.**

## Accomplishments
- Added per-session scheduler state (`pending_latest`, `worker_task`, `worker_wakeup`, accepted/processed sequence tracking, and stale-drop counters) to `LiveSession`.
- Refactored PCM ingest so it only validates, appends canonical PCM history, stores the newest pending snapshot, and wakes a single worker.
- Added `_ensure_session_worker()` / `_run_session_worker()` to build decode windows outside the ingest lock, merge only fresh results, and emit unchanged `patch` / `telemetry` / `complete` contracts.
- Updated stop handling and websocket disconnect handling so the newest pending tail is drained before final completion semantics are returned.
- Added deterministic scheduler coverage for overwriteable pending snapshots, stale-result dropping, and newest-tail websocket behavior under backlog.

## Task Commits
1. **Task 1: latest-only scheduler implementation** - `e1490b9`
2. **Task 2: scheduler regression coverage** - `63fdb1c`

## Files Created/Modified
- `sidecar/app/services/live_transcription.py` - latest-only worker scheduler, stale-drop guards, scheduler-truth metrics.
- `sidecar/app/routes/transcribe.py` - websocket disconnect path now waits briefly for in-flight live work to flush.
- `sidecar/tests/test_live_decode_window.py` - helper-level coverage for overwriteable pending snapshots and stale completion dropping.
- `sidecar/tests/test_live_transcription_integration.py` - websocket backlog integration proving superseded intermediate windows are skipped while completion payloads stay unchanged.

## Verification
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_integration.py -q`
- `cd sidecar && poetry run pytest tests/test_live_transcription_routes.py -q`

## Next Phase Readiness
- Phase 27-02 can now consume truthful scheduler fields without changing the live transcript payload shape.

---
*Completed: 2026-04-18*
