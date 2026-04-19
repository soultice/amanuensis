---
phase: 28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning
plan: 03
subsystem: live-latency-benchmarking
requires:
  - phase: 28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning
    provides: explicit warm readiness and diskless live decode hot path
provides:
  - repeatable websocket live-latency benchmark script
  - finalize target visibility in sidecar status metadata
  - documented evidence for keeping `safe_auto` as the default and leaving cadence constants unchanged for now
affects: [phase-28, tooling, live-transcription]
tech-stack:
  added: []
  patterns: [human-readable benchmark summary, websocket PCM replay, evidence-backed no-op tuning decision]
key-files:
  created:
    - .planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-03-SUMMARY.md
    - scripts/live-latency-benchmark.mjs
  modified:
    - sidecar/app/services/live_transcription.py
key-decisions:
  - "Phase 28 adds a benchmark path first; cadence and speed-mode defaults stay unchanged because current evidence still favors `safe_auto`."
  - "Benchmark output stays lightweight and human-readable rather than introducing a heavier observability subsystem."
requirements-completed: [P28-05, P28-06, P28-07, P28-08]
duration: 1 session
completed: 2026-04-19
---

# Phase 28 Plan 03 Summary

**Added a repeatable live-latency benchmark and kept defaults evidence-backed.**

## Accomplishments
- Added `scripts/live-latency-benchmark.mjs` to replay mono PCM over the real live websocket path, collect TTFT / patch-gap / queue / scheduler / finalize metrics, and print both human-readable and JSON summaries.
- Exposed finalize target budget (`finalizeP95Ms`) alongside existing TTFT / cadence / queue targets in sidecar live status metadata.
- Documented the measured decision to keep `safe_auto` as the default and leave the current producer cadence constants unchanged until a new real-machine rerun shows a clear net UX win.

## Task Commits
1. **Benchmark harness + measured no-op tuning decision** — `3eb2a90`

## Verification
- `node --check scripts/live-latency-benchmark.mjs`
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -q`

## Tuning Outcome
- `safe_auto` remains the default.
- No renderer cadence constants changed in this phase because the available evidence did not justify trading tail/finalize behavior for marginal early-response gains.
