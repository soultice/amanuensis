---
phase: 28
status: passed
score: 95
verified: "2026-04-19"
verifier: "pi"
---

# Verification: Phase 28 — Real-World Live Latency Follow-Up

## Scope
Verify Phase 28 plans (`28-01`, `28-02`, `28-03`) against the phase objective: make the first real live session land on the warm path when possible, remove temp-file churn from incremental live inference, and leave cadence/default behavior evidence-backed instead of intuition-backed.

## Inputs Reviewed
- `.planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-01-PLAN.md`
- `.planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-02-PLAN.md`
- `.planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-03-PLAN.md`
- `.planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-01-SUMMARY.md`
- `.planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-02-SUMMARY.md`
- `.planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-03-SUMMARY.md`
- `sidecar/app/main.py`
- `sidecar/app/routes/transcribe.py`
- `sidecar/app/state.py`
- `sidecar/app/services/live_warmth.py`
- `sidecar/app/services/transcription.py`
- `sidecar/app/services/live_transcription.py`
- `sidecar/tests/test_live_decode_window.py`
- `sidecar/tests/test_live_transcription_routes.py`
- `sidecar/tests/test_live_transcription_integration.py`
- `src/renderer/src/stores/transcript.ts`
- `src/renderer/src/types/live-transcript.ts`
- `src/renderer/src/components/AppToolbar.vue`
- `scripts/live-latency-benchmark.mjs`

## Implementation Checks

### 1. Warm readiness is explicit and fail-open
Verified in `sidecar/app/state.py`, `sidecar/app/services/live_warmth.py`, `sidecar/app/main.py`, and `sidecar/app/routes/transcribe.py`:
- sidecar tracks dedicated live warm status separate from model presence
- startup warmup only runs when the model is already present
- warmup remains background/fail-open and records `warm`, `warming`, `failed`, or `skipped`
- the real websocket prepare path now returns live warm metadata to the renderer

### 2. The first record action exposes warmup state to the user
Verified in renderer wiring:
- `src/renderer/src/types/live-transcript.ts` models live warm metadata without changing legacy payload contracts
- `src/renderer/src/stores/transcript.ts` hydrates and resets the new fields
- `src/renderer/src/components/AppToolbar.vue` surfaces a compact readiness badge during `transcribing` / `live` / `finalizing`

### 3. Incremental live inference is diskless
Verified in `sidecar/app/services/transcription.py` and `sidecar/app/services/live_transcription.py`:
- live windows now go through `transcribe_pcm_bytes(...)`
- `LiveTranscriptionManager._transcribe_pcm_window(...)` uses the in-memory seam via executor thread dispatch
- temp-WAV-per-window staging is gone from the live hot path
- transcript normalization, suffix patch replacement, timestamp shifting, and final `{words, segments, language, duration}` contract are unchanged

### 4. Benchmarking exists and defaults remain evidence-backed
Verified in `scripts/live-latency-benchmark.mjs` and `sidecar/app/services/live_transcription.py`:
- benchmark script replays mono PCM through `/transcribe/live/prepare` plus websocket input/output
- output includes wall-clock TTFT, sidecar TTFT, update-gap p50/p95, queue depth, scheduler drops, finalize latency, and transcript counts
- status targets now include finalize budget alongside TTFT / cadence / queue goals
- no cadence or default speed-mode changes were made because current evidence still favors `safe_auto`

## Automated Verification

### Backend live regression suite
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -q`
- Result: `26 passed`

### Renderer type safety
- `npm run typecheck:web`
- Result: passed

### Benchmark script syntax
- `node --check scripts/live-latency-benchmark.mjs`
- Result: passed

### Diskless hot-path spot-check
- `python3 - <<'PY'
from pathlib import Path
text = Path('sidecar/app/services/live_transcription.py').read_text()
print('NamedTemporaryFile' in text, 'write_pcm_to_wav' in text, 'transcribe_pcm_bytes' in text)
PY`
- Result: `False False True`

## Measured Tuning Decision
Existing real-world investigation data captured in `28-RESEARCH.md` still points to the same decision after this implementation slice:
- `safe_auto` warm path: about **339ms wall TTFT / 77ms sidecar TTFT / 334ms finalize**
- `safe_auto` cold path before warmup: about **1984ms wall TTFT / 1721ms sidecar TTFT / 1325ms finalize**
- `aggressive_internal`: no clear TTFT win large enough to offset worse tail / finalize behavior

**Decision:** keep `safe_auto` as the default and leave current producer cadence thresholds unchanged until a fresh post-Phase-28 benchmark rerun proves a net UX win.

## Requirement / Decision Coverage
- **P28-01 / P28-02:** proactive warmup remains fail-open and now exposes truthful warm readiness
- **P28-03 / P28-04:** incremental live decode no longer stages temp WAV files while keeping merge/final contracts unchanged
- **P28-05 / P28-06:** defaults remain evidence-backed; `safe_auto` stays the default
- **P28-07 / P28-08:** repeatable benchmark path exists and output remains lightweight/human-readable

## Score and Caveats

### Score: **95 / 100**
Strong code and regression evidence shows Phase 28 delivered the intended warm-readiness and diskless-hot-path changes, and the benchmark harness is now checked into the repo.

### Caveats
1. The new benchmark harness is available, but this verification did not run a fresh real-model cold/warm capture inside CI; the tuning decision therefore relies on the measured numbers already recorded in `28-RESEARCH.md` plus the new repeatable script.
2. Working-tree planning artifacts already contained unrelated local changes before execution; verification focused on Phase 28 code and phase-local documentation outcomes.

## Final Result
**PASS** — Phase 28 appears complete. Live readiness is explicit and fail-open, the incremental live path no longer writes temp WAV files per decode window, and future cadence/default decisions now have a repeatable benchmark path instead of guesswork.
