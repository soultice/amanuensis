---
phase: 21-increase-speed-of-live-transcription
plan: 02
subsystem: api
tags: [fastapi, speed-mode, warmup, bounded-window]
requires:
  - phase: 21-01
    provides: telemetry contracts and latency targets
provides:
  - Safe-default internal speed mode policy with environment override
  - Bounded decode window helper and periodic full reconcile cadence
  - Live-start model warmup path with non-fatal warning behavior
affects: [live-transcription, renderer-cadence, reliability]
tech-stack:
  added: []
  patterns: [safe-default-mode, warmup-nonfatal, bounded-live-decode]
key-files:
  created: []
  modified:
    - sidecar/app/services/live_transcription.py
    - sidecar/app/services/transcription.py
    - sidecar/app/routes/transcribe.py
    - sidecar/tests/test_live_transcription_integration.py
key-decisions:
  - "Keep `safe_auto` as default and reserve `aggressive_internal` for explicit env opt-in only."
  - "Warm model during `/live/start` but never fail session start when warmup fails."
patterns-established:
  - "Mode-aware bounded decoding with periodic full reconcile for correctness drift control."
requirements-completed: [D-03, D-05, D-06, D-07]
duration: 42min
completed: 2026-04-17
---

# Phase 21 Plan 02: Sidecar Speed Architecture Summary

**Live sidecar now runs with safe-default speed policy, bounded chunk decode windows, and a warmup path that reduces first-token cold-start latency without breaking failure/stop contracts.**

## Accomplishments
- Added explicit speed-mode constants/resolver and surfaced `speedMode` in live-start responses.
- Replaced unconditional full-history chunk decode with `build_decode_window_blob(...)` and periodic full reconciles.
- Added `warm_model_for_live(...)` and wired non-fatal warmup telemetry (`warmupMs`) into `/live/start`.
- Extended integration coverage for speed-mode and failure semantics parity across modes.

## Task Commits
1. **Task 1** - `71e8fdf` (feat)
2. **Task 2** - `d2fbfd7` (perf)
3. **Task 3** - `7c683a3` (test)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
Wave 3 renderer work can now consume `speedMode`, TTFT/latency telemetry, queue depth, and warmup measurements to tune adaptive flush cadence.
