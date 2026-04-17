---
phase: 24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc
plan: 01
subsystem: live-transcription
tags: [fastapi, telemetry, queueing, pinia, vue]
requires:
  - phase: 21-increase-speed-of-live-transcription
    provides: latency targets, live metrics plumbing, adaptive renderer cadence
provides:
  - truthful sidecar backlog accounting including waiting lock contenders
  - renderer-visible worker vs waiting pipeline telemetry
  - regression test coverage for concurrent backlog semantics
affects: [phase-24-optimizations, live-transcription, telemetry]
tech-stack:
  added: []
  patterns: [truthful backlog accounting, worker-vs-waiting telemetry split]
key-files:
  created:
    - .planning/phases/24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc/24-01-SUMMARY.md
  modified:
    - sidecar/app/services/live_transcription.py
    - sidecar/tests/test_live_transcription_routes.py
    - src/renderer/src/types/live-transcript.ts
    - src/renderer/src/stores/transcript.ts
    - src/renderer/src/components/AppStatusBar.vue
key-decisions:
  - "Queue depth now reflects int(worker_busy) + waiting_requests at emission points rather than lock-internal counters."
  - "Renderer status bar shows pipeline worker occupancy and waiting backlog independently from latency telemetry."
patterns-established:
  - "Sidecar metrics should distinguish busy worker state from queued waiters."
  - "Live telemetry fields must be consumed from both chunk responses and status polling."
requirements-completed: [P24-02, P24-07]
duration: 4 min
completed: 2026-04-17
---

# Phase 24 Plan 01: Truthful live backlog telemetry Summary

**Live backlog telemetry now reports true queued pressure (worker + waiters) and surfaces that split in the renderer for optimization validation.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-17T18:49:03Z
- **Completed:** 2026-04-17T18:53:16Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Added `worker_busy` and `waiting_requests` session bookkeeping so lock waiters are counted.
- Emitted `workerBusy` + `waitingRequests` in sidecar chunk metrics and status observed telemetry.
- Extended renderer types/store/status bar to display `Pipeline: Worker … · Waiting …` during live/finalizing states.
- Added concurrency regression coverage asserting `workerBusy`, `waitingRequests`, and `queueDepth` under contention.

## Task Commits

1. **Task 1: Count real waiting work in sidecar telemetry** - `82e5abb` (feat)
2. **Task 2: Extend renderer telemetry types/state/UI** - `7b84b45` (feat)
3. **Task 3: Add concurrent backlog regression test** - `8d70cfd` (test)

**Plan metadata:** (docs commit)

## Files Created/Modified
- `sidecar/app/services/live_transcription.py` - worker/waiting fields, truthful queueDepth expression, enriched metrics payloads.
- `src/renderer/src/types/live-transcript.ts` - typed workerBusy/waitingRequests fields for chunk and status telemetry.
- `src/renderer/src/stores/transcript.ts` - liveWorkerBusy/liveWaitingRequests state handling, resets, and polling/chunk ingestion updates.
- `src/renderer/src/components/AppStatusBar.vue` - pipeline telemetry label (`Pipeline: Worker … · Waiting …`).
- `sidecar/tests/test_live_transcription_routes.py` - concurrency regression test for backlog semantics.

## Decisions Made
- Treat queue depth as an emitted metric derived from worker occupancy + lock waiters, not an increment/decrement counter.
- Keep `/transcribe/live/stop` payload contract unchanged while expanding telemetry only.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TestClient cross-thread chunk request deadlocked**
- **Found during:** Task 3 (concurrency regression test)
- **Issue:** A second threaded `/live/chunk` TestClient request could hang indefinitely in this test harness.
- **Fix:** Kept first chunk as real route request and used a threaded direct manager ingest for the contending second chunk to preserve backlog semantics while ensuring suite stability.
- **Files modified:** `sidecar/tests/test_live_transcription_routes.py`
- **Verification:** `cd sidecar && poetry run pytest tests/test_live_transcription_routes.py -q`
- **Committed in:** `8d70cfd`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope creep; deviation only stabilized concurrency testing mechanics.

## Issues Encountered
- Starlette TestClient threaded live chunk calls can block in this repository’s harness; resolved in-test while preserving required backlog assertions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backlog telemetry is now trustworthy for optimization waves.
- Ready for `24-02-PLAN.md` execution.

---
*Phase: 24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc*
*Completed: 2026-04-17*
