---
phase: 24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc
plan: 02
subsystem: ui
tags: [live-transcription, producer-backpressure, mediarecorder]
requires:
  - phase: 24-01
    provides: truthful backlog telemetry
provides:
  - bounded one-in-flight live upload producer
  - 250ms recorder timeslice and producer telemetry
affects: [phase-24, live-transcription]
tech-stack:
  added: []
  patterns: [single in-flight upload with retry-coalescing]
key-files:
  created: []
  modified:
    - src/renderer/src/stores/recording.ts
    - src/renderer/src/components/AppStatusBar.vue
key-decisions:
  - "Live chunk flushes are now strictly one in-flight with retry coalescing."
  - "Producer telemetry (upload + buffered ms/bytes) is shown in status bar during live/finalizing states."
patterns-established:
  - "Producer backpressure: gate pushes on _liveFlushInFlight and replay newest buffered audio once upload completes."
requirements-completed: [P24-01, P24-02, P24-03, P24-06, P24-07]
duration: 45min
completed: 2026-04-17
---

# Phase 24 Plan 02 Summary

**Renderer live producer now emits fewer chunks, keeps at most one upload in flight, and surfaces producer buffering state for long-session diagnosis.**

## Accomplishments
- Switched MediaRecorder to `recorder.start(MEDIA_RECORDER_TIMESLICE_MS)` with `MEDIA_RECORDER_TIMESLICE_MS = 250`.
- Added producer state fields (`liveUploadInFlight`, `liveBufferedBytes`, `liveBufferedMs`) and one-in-flight guards (`_liveFlushInFlight`, `_liveFlushRetryRequested`).
- Added `Producer:` status bar line: `Upload busy/idle` plus buffered ms/bytes.

## Verification
- `npm run typecheck:web`
- `npm run build`

## Deviations from Plan
- None.
