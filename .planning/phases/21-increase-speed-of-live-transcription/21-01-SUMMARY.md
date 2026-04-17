---
phase: 21-increase-speed-of-live-transcription
plan: 01
subsystem: api
tags: [fastapi, live-transcription, telemetry, latency]
requires: []
provides:
  - Sidecar latency target constants and per-session telemetry fields
  - Live chunk/status telemetry payloads for TTFT, queue depth, and update cadence
  - Regression tests protecting telemetry keys and unchanged stop contract
affects: [live-transcription, renderer-cadence, verification]
tech-stack:
  added: []
  patterns: [sidecar-telemetry-contract, latency-targets-in-status]
key-files:
  created: []
  modified:
    - sidecar/app/services/live_transcription.py
    - sidecar/tests/test_live_transcription_routes.py
    - sidecar/tests/test_live_transcription_integration.py
key-decisions:
  - "Expose both target and observed telemetry values from sidecar status to make renderer tuning objective."
  - "Keep stop payload schema unchanged while adding live metrics only to chunk/status responses."
patterns-established:
  - "Telemetry-first optimization: instrument before tuning."
requirements-completed: [D-01, D-02, D-04, D-08]
duration: 35min
completed: 2026-04-17
---

# Phase 21 Plan 01: Sidecar Telemetry Baseline Summary

**Sidecar now emits first-token/cadence telemetry with research-backed targets while preserving Phase 19 final stop schema and failure semantics.**

## Accomplishments
- Added explicit latency target constants and session telemetry state primitives.
- Emitted chunk-level metrics (`serverLatencyMs`, `timeToFirstTokenMs`, `queueDepth`, `updateGapMs`).
- Exposed status-level target/observed telemetry and added regression tests for telemetry + stop contract invariants.

## Task Commits
1. **Task 1** - `10d2ccd` (feat)
2. **Task 2** - `4c6f0aa` (feat)
3. **Task 3** - `39f2523` (test)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
Wave 2 can consume telemetry targets/observations and implement warm-path + bounded decode windows against a locked sidecar contract.
