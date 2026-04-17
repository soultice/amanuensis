---
phase: 24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc
plan: 03
subsystem: api
tags: [patch-protocol, live-chunk, renderer-merge]
requires:
  - phase: 24-01
    provides: truthful live telemetry baseline
  - phase: 24-02
    provides: bounded upload cadence
provides:
  - patch-based live chunk payload contract
  - renderer suffix patch application
affects: [phase-24, live-transcription]
tech-stack:
  added: []
  patterns: [replaceFromWordIndex suffix replacement]
key-files:
  created: []
  modified:
    - sidecar/app/services/live_transcription.py
    - src/renderer/src/types/live-transcript.ts
    - src/renderer/src/stores/transcript.ts
    - sidecar/tests/test_live_transcription_integration.py
    - sidecar/tests/test_live_transcription_routes.py
key-decisions:
  - "Live chunk finalized payloads now use mode='patch' with replaceFromWordIndex."
  - "Renderer applies patches by preserving prefix and replacing only changed suffix."
patterns-established:
  - "Patch contract: finalized = {mode, replaceFromWordIndex, words, segments}."
requirements-completed: [P24-01, P24-02, P24-05, P24-06, P24-07]
duration: 45min
completed: 2026-04-17
---

# Phase 24 Plan 03 Summary

**Live chunk responses were converted from full snapshots to bounded suffix patches, and renderer state now applies deterministic replace-from-index merges.**

## Accomplishments
- Added patch typing (`mode: 'patch'`, `replaceFromWordIndex`) in `live-transcript.ts`.
- Updated sidecar live chunk payload shape to include patch metadata and suffix-only word payload.
- Updated renderer `pushLiveChunk()` to apply prefix+suffix replacement instead of full transcript replacement.
- Added regression tests for patch metadata and suffix replacement.

## Verification
- `cd sidecar && poetry run pytest tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -q`
- `npm run typecheck:web`
- `npm run build`

## Deviations from Plan
- None.
