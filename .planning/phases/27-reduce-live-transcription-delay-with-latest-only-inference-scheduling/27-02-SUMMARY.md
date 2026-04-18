---
phase: 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling
plan: 02
subsystem: live-transcription-telemetry
tags: [typescript, vue, pinia, pytest, telemetry]
requires:
  - phase: 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling
    provides: scheduler-truth fields emitted from sidecar live telemetry/status paths
provides:
  - typed scheduler telemetry additions on the live transcript contract
  - renderer store hydration/reset support for scheduler-truth fields
  - compact status-bar visibility for scheduler progress and dropped stale work
affects: [phase-27, renderer, telemetry, status-bar]
tech-stack:
  added: []
  patterns: [optional contract extension, store hydration, compact status label]
key-files:
  created:
    - .planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-02-SUMMARY.md
  modified:
    - sidecar/tests/test_live_transcription_routes.py
    - src/renderer/src/types/live-transcript.ts
    - src/renderer/src/stores/transcript.ts
    - src/renderer/src/components/AppStatusBar.vue
key-decisions:
  - "Scheduler telemetry remains optional additions on the existing live patch/telemetry/status contract."
  - "UI exposure stays to one compact `Scheduler:` label instead of a new panel or graph."
patterns-established:
  - "Renderer telemetry evolution flows through shared types first, then Pinia state hydration/reset, then minimal view wiring."
  - "Route tests lock the exact scheduler field names used across sidecar and renderer."
requirements-completed: [D-04, D-07]
duration: 1 session
completed: 2026-04-18
---

# Phase 27 Plan 02 Summary

**Plumbed scheduler-truth telemetry through the existing live contract and surfaced it compactly in the renderer.**

## Accomplishments
- Added optional scheduler fields to live chunk, patch, telemetry, and status typings without renaming existing latency/queue/runtime fields.
- Extended the transcript store to track, hydrate, and reset `livePendingLatest`, `liveLatestSeqAccepted`, `liveLatestSeqProcessed`, and `liveSupersededResultsDropped`.
- Added one compact `Scheduler:` status-bar label showing `Pending yes|no`, `Latest processed/accepted`, and `Dropped count` while a live session is active.
- Strengthened sidecar route tests so they verify both legacy live telemetry fields and the new scheduler-truth fields.

## Task Commits
1. **Task 1: renderer typing/store plumbing** - `2fa5d16`
2. **Task 2: route coverage + compact UI label** - `e9b18f7`

## Files Created/Modified
- `src/renderer/src/types/live-transcript.ts` - optional scheduler fields on live telemetry/status payloads.
- `src/renderer/src/stores/transcript.ts` - store state, hydration, and reset paths for scheduler telemetry.
- `src/renderer/src/components/AppStatusBar.vue` - compact scheduler label in the existing live telemetry strip.
- `sidecar/tests/test_live_transcription_routes.py` - route/status assertions for scheduler-truth fields alongside existing metrics.

## Verification
- `cd sidecar && poetry run pytest tests/test_live_transcription_routes.py -q`
- `npm run typecheck:web`

## Next Phase Readiness
- Phase verification can now reason about scheduler responsiveness with truthful accepted/processed/drop counters visible end-to-end.

---
*Completed: 2026-04-18*
