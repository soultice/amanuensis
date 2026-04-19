---
phase: 28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning
plan: 01
subsystem: live-transcription-readiness
requires:
  - phase: 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling
    provides: live websocket prepare/output flow, scheduler telemetry, compact toolbar stats
provides:
  - fail-open sidecar-managed live-model prewarm state
  - renderer-visible warm readiness metadata on the real websocket prepare path
  - first-record visibility when warmup is still pending or unavailable
affects: [phase-28, sidecar, renderer, live-transcription]
tech-stack:
  added: []
  patterns: [fail-open background warmup, explicit warm-state metadata, lightweight readiness badge]
key-files:
  created:
    - .planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-01-SUMMARY.md
    - sidecar/app/services/live_warmth.py
  modified:
    - sidecar/app/main.py
    - sidecar/app/routes/transcribe.py
    - sidecar/app/state.py
    - sidecar/tests/test_live_transcription_routes.py
    - src/renderer/src/stores/transcript.ts
    - src/renderer/src/types/live-transcript.ts
    - src/renderer/src/components/AppToolbar.vue
key-decisions:
  - "Model presence and live warm readiness are tracked separately so the UI can expose startup races truthfully."
  - "Warmup remains fail-open and background-only; the app never blocks startup on it."
requirements-completed: [P28-01, P28-02, P28-07, P28-08]
duration: 1 session
completed: 2026-04-19
---

# Phase 28 Plan 01 Summary

**Made live warm readiness explicit instead of implicit.**

## Accomplishments
- Added a sidecar-owned live warm state machine (`idle` / `warming` / `warm` / `failed` / `skipped`) with timestamps, trigger source, and last warmup duration.
- Kept startup prewarm fail-open while ensuring it only runs when the model is already present.
- Extended `/transcribe/live/prepare` and legacy `/transcribe/live/start` responses with warm-state metadata so the renderer can distinguish “model present” from “live path warmed”.
- Added a lightweight toolbar badge so the first record click no longer hides warmup races from the user.
- Added regression coverage proving warmup is skipped when the model is missing and exposed on the live prepare contract when present.

## Task Commits
1. **Warm readiness + renderer visibility** — `3eb2a90`

## Verification
- `cd sidecar && poetry run pytest tests/test_live_transcription_routes.py -q`
- `npm run typecheck:web`

## Next Phase Readiness
- Plan 28-02 can now remove the temp-WAV hot path while preserving the same live prepare/output contract and explicit readiness surface.
