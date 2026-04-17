---
phase: 21-increase-speed-of-live-transcription
plan: 03
subsystem: ui
tags: [vue, pinia, live-transcript, adaptive-flush, telemetry]
requires:
  - phase: 21-01
    provides: sidecar telemetry contract and targets
  - phase: 21-02
    provides: speed mode policy and bounded sidecar path
provides:
  - Transcript store telemetry capture for TTFT, queue depth, latency, update gap, and speed mode
  - Adaptive flush window logic in recording store using sidecar backpressure/latency telemetry
  - UI surfacing of natural-feel targets and live latency status indicators
affects: [live-transcription, recording, status-bar, transcript-panel]
tech-stack:
  added: []
  patterns: [telemetry-driven-ui-cadence, adaptive-live-flush]
key-files:
  created: []
  modified:
    - src/renderer/src/types/live-transcript.ts
    - src/renderer/src/stores/transcript.ts
    - src/renderer/src/stores/recording.ts
    - src/renderer/src/components/TranscriptPanel.vue
    - src/renderer/src/components/AppStatusBar.vue
key-decisions:
  - "Use sidecar telemetry as the single source of truth for renderer flush cadence/backpressure decisions."
  - "Expose live TTFT/queue indicators in status bar to make natural-feel verification observable during recording."
patterns-established:
  - "Adaptive flush windows keyed by first-token state, queue depth, server latency, and speed mode."
requirements-completed: [D-01, D-02, D-04, D-08]
duration: 48min
completed: 2026-04-17
---

# Phase 21 Plan 03: Renderer Cadence and UX Feedback Summary

**Renderer now adapts live flush timing using sidecar telemetry and surfaces TTFT/queue signals plus natural-feel targets directly in the recording UX.**

## Accomplishments
- Extended live transcript types/store state to capture TTFT, queue depth, update gap, server latency, and speed mode.
- Implemented `computeAdaptiveFlushWindowMs(...)` with safe/aggressive thresholds and first-token priority.
- Added UX hints and status-bar telemetry display (`Latency: TTFT ... Queue ...`) while preserving existing live failure warning copy.

## Task Commits
1. **Task 1** - `4a8e629` (feat)
2. **Task 2** - `4fdad56` (perf)
3. **Task 3** - `7a7671f` (feat)

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Next Phase Readiness
Phase 21 now has end-to-end speed instrumentation + adaptive renderer behavior in place, ready for phase-level verification against natural-feel latency goals.
