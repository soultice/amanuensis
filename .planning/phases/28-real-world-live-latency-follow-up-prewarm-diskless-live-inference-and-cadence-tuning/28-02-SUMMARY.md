---
phase: 28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning
plan: 02
subsystem: sidecar-live-hot-path
requires:
  - phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
    provides: canonical in-memory PCM history, websocket PCM ingest
  - phase: 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling
    provides: latest-only scheduler, suffix-patch transcript merge semantics
provides:
  - in-memory PCM-byte recognition helper for Parakeet live windows
  - temp-WAV-free incremental live decode path
  - regression seams that patch the in-memory helper instead of tempfile staging
affects: [phase-28, sidecar, live-transcription]
tech-stack:
  added: []
  patterns: [shared recognition-contract normalization, diskless live decode, injectable in-memory transcription seam]
key-files:
  created:
    - .planning/phases/28-real-world-live-latency-follow-up-prewarm-diskless-live-inference-and-cadence-tuning/28-02-SUMMARY.md
  modified:
    - sidecar/app/main.py
    - sidecar/app/services/transcription.py
    - sidecar/app/services/live_transcription.py
    - sidecar/tests/test_live_decode_window.py
    - sidecar/tests/test_live_transcription_routes.py
    - sidecar/tests/test_live_transcription_integration.py
key-decisions:
  - "The decode input seam changes, but transcript merge and final payload contracts stay exactly the same."
  - "The batch file path stays file-oriented; only the incremental live hot path goes diskless in this phase."
requirements-completed: [P28-03, P28-04]
duration: 1 session
completed: 2026-04-19
---

# Phase 28 Plan 02 Summary

**Removed per-window temp WAV writes from the incremental live inference path.**

## Accomplishments
- Added `transcribe_pcm_bytes(...)` so live inference can feed mono `pcm_s16le` bytes directly into the cached Parakeet model.
- Refactored `LiveTranscriptionManager` to use the in-memory seam instead of `NamedTemporaryFile(... .wav) -> write_pcm_to_wav() -> transcribe_wav_file()` on every decode window.
- Kept `_normalize_full_result()`, timestamp shifting, suffix patch replacement, and final `{words, segments, language, duration}` contracts unchanged.
- Updated sidecar route + integration tests to patch the new in-memory seam directly, proving the hot path is diskless without changing visible behavior.

## Task Commits
1. **Diskless live decode handoff** — `3eb2a90`

## Verification
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -q`
- `python3 - <<'PY'
from pathlib import Path
text = Path('sidecar/app/services/live_transcription.py').read_text()
print('NamedTemporaryFile' in text, 'write_pcm_to_wav' in text, 'transcribe_pcm_bytes' in text)
PY`
  - Result: `False False True`

## Next Phase Readiness
- Plan 28-03 can benchmark TTFT/gap/finalize behavior against the new warm + diskless live path without legacy temp-file noise in the hot loop.
