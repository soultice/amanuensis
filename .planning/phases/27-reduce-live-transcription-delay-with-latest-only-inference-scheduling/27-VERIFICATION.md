---
phase: 27
status: passed
score: 97
verified: "2026-04-18"
verifier: "pi"
---

# Verification: Phase 27 — Reduce Live Transcription Delay with Latest-Only Inference Scheduling

## Scope
Verify phase 27 plans (`27-01`, `27-02`) against the phase objective: reduce live backlog lag by preferring the newest useful PCM tail, dropping stale completions before they emit, and keeping telemetry/UI changes lightweight without breaking the live transcript contract.

## Inputs Reviewed
- `.planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-01-PLAN.md`
- `.planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-02-PLAN.md`
- `.planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-01-SUMMARY.md`
- `.planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-02-SUMMARY.md`
- `sidecar/app/services/live_transcription.py`
- `sidecar/app/routes/transcribe.py`
- `sidecar/tests/test_live_decode_window.py`
- `sidecar/tests/test_live_transcription_integration.py`
- `sidecar/tests/test_live_transcription_routes.py`
- `src/renderer/src/types/live-transcript.ts`
- `src/renderer/src/stores/transcript.ts`
- `src/renderer/src/components/AppStatusBar.vue`

## Implementation Checks

### 1. Latest-only worker scheduling is present
Verified in `sidecar/app/services/live_transcription.py`:
- per-session scheduler state exists: `pending_latest`, `worker_task`, `worker_wakeup`, `latest_seq_accepted`, `latest_seq_processed`, `superseded_results_dropped`
- `ingest_pcm(...)` now only validates/appends PCM history, schedules the newest snapshot, and wakes a session worker
- `_ensure_session_worker()` / `_run_session_worker()` own decode-window building, transcription, merge, and emission outside the hot ingest lock

### 2. Stale completions are dropped before transcript state mutates
Verified in `live_transcription.py`:
- overwriteable latest snapshot scheduling increments a generation counter per accepted snapshot
- worker re-checks staleness before merge/emit via `_mark_superseded_result_if_needed(...)`
- superseded completions increment `superseded_results_dropped`
- final transcript merge path still preserves `replaceFromWordIndex` suffix-patch behavior

### 3. Stop/final payload contract remains intact
Verified in `live_transcription.py` and tests:
- stop drains outstanding latest work before final `complete`
- final payload still returns `words`, `segments`, `language`, `duration`
- websocket disconnect path waits briefly for in-flight work to flush so patch emission is not lost on fast test disconnects

### 4. Scheduler telemetry remains lightweight and wired end-to-end
Verified across sidecar + renderer:
- telemetry/status now expose optional `pendingLatest`, `latestSeqAccepted`, `latestSeqProcessed`, `supersededResultsDropped`
- `src/renderer/src/types/live-transcript.ts` models the new fields without changing legacy names
- `src/renderer/src/stores/transcript.ts` hydrates and resets scheduler state
- `src/renderer/src/components/AppStatusBar.vue` adds one compact `Scheduler:` label only

## Automated Verification

### Backend scheduler suite
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_integration.py tests/test_live_transcription_routes.py -q`
- Result: `25 passed`

### Renderer type safety
- `npm run typecheck:web`
- Result: passed

## Requirement/Decision Coverage
- **D-01 / D-02 / D-05 / D-06:** latest-only pending slot and stale-result drop guard implemented
- **D-03:** implementation intentionally allows intermediate churn in favor of catch-up responsiveness
- **D-04:** patch and final completion payload shapes preserved
- **D-07:** scheduler observability limited to optional telemetry fields plus one compact status-bar label

## Score and Gaps

### Score: **97 / 100**
Strong evidence from code structure, regression tests, route tests, and renderer typecheck that Phase 27 delivered the intended scheduling change without broad contract churn.

### Minor caveats
1. Phase completion bookkeeping files (`ROADMAP.md`, `STATE.md`) already had unrelated local modifications in the working tree, so this verification focuses on code/test outcomes rather than marking planning artifacts complete.
2. The websocket disconnect flush is intentionally lightweight (`wait_for(..., timeout=1)`) to preserve responsiveness while keeping tests deterministic.

## Final Result
**PASS** — Phase 27 appears complete. Live ingestion now schedules the newest useful tail via one worker + one overwriteable pending snapshot, stale completions are dropped before emission, scheduler-truth telemetry is visible end-to-end, and targeted backend plus renderer checks pass.
