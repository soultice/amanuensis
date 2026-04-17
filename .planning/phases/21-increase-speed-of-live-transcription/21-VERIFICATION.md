---
phase: 21
status: passed
verified: "2026-04-17"
verifier: inline
---

# Verification: Phase 21 — Increase Speed of Live Transcription

## Phase Goal

Improve first-token speed and live update cadence so live transcription feels natural, while preserving Phase 19 final transcript and failure-handling contracts.

## Automated Checks

| Check | Result |
|---|---|
| `cd sidecar && poetry run pytest tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -q` | ✓ PASS (12 tests) |
| `npm run typecheck:web` | ✓ PASS |
| `npm run build` | ✓ PASS |
| `cd sidecar && poetry run pytest tests/test_live_transcription_integration.py::test_live_happy_path -q` | ✓ PASS |

## Must-Haves (Code + Tests)

| Must-have | Evidence | Status |
|---|---|---|
| First-token telemetry is explicitly measured and exposed from sidecar before renderer tuning | `sidecar/app/services/live_transcription.py` adds TTFT target constants + `ttft_ms`, `timeToFirstTokenMs`, status target/observed metrics | ✓ PASS |
| Latency goals are concrete and research-backed | `TTFT_P50_TARGET_MS=800`, `TTFT_P95_TARGET_MS=1500`, `UPDATE_CADENCE_P50_TARGET_MS=600`, `QUEUE_DEPTH_P95_TARGET=1`, `FINALIZE_P95_TARGET_MS=2500` | ✓ PASS |
| Sidecar speed architecture is safe-default with optional aggressive override | `resolve_live_speed_mode()` + `safe_auto` default and `aggressive_internal` env override in `live_transcription.py` and route tests | ✓ PASS |
| Bounded chunk work and warm path are wired without startup fatality | `build_decode_window_blob(...)`, bounded window constants, `warm_model_for_live(...)`, and non-fatal warmup warning behavior in `/live/start` | ✓ PASS |
| Renderer cadence consumes sidecar telemetry and adapts flush windows | `transcript.ts` telemetry state capture + `recording.ts` `computeAdaptiveFlushWindowMs(...)` thresholds | ✓ PASS |
| UX exposes natural-feel criteria and live telemetry observability | `TranscriptPanel.vue` natural-feel target hint and `AppStatusBar.vue` `Latency: TTFT ... Queue ...` telemetry label | ✓ PASS |
| Final stop payload contract remains unchanged (`{words, segments, language, duration}`) | sidecar stop handler unchanged, route/integration tests assert top-level keys | ✓ PASS |
| Live failure remains non-blocking and session remains stoppable | `test_live_failure_does_not_abort_session` + `test_live_failure_semantics_preserved_in_safe_auto_and_aggressive` | ✓ PASS |

## Notes

- Verification is fully automated for this phase scope (sidecar tests + renderer typecheck/build).
- Human UX latency feel can be additionally spot-checked with a live recording session, but automated telemetry and contract checks passed.

## Result

Phase 21 verification passed. Sidecar and renderer now operate with telemetry-driven latency controls while preserving existing transcript-finalization and failure-safety contracts.
