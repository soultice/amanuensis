---
phase: 24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc
plan: 05
subsystem: api
tags: [pcm-window, ffmpeg, live-hot-path]
requires:
  - phase: 24-01
    provides: truthful queue telemetry
  - phase: 24-02
    provides: bounded producer flow
provides:
  - decode-once helpers for WebM->PCM->WAV
  - PCM window live hot path with fallback preservation
  - regression coverage for PCM window behavior
affects: [phase-24, live-transcription]
tech-stack:
  added: []
  patterns: [decode once, reuse PCM windows]
key-files:
  created: []
  modified:
    - sidecar/app/services/transcription.py
    - sidecar/app/services/live_transcription.py
    - sidecar/tests/test_live_decode_window.py
    - sidecar/tests/test_live_transcription_integration.py
key-decisions:
  - "Live ingest now decodes each uploaded WebM chunk once and composes bounded PCM windows for inference."
  - "Full-history WebM decode remains only as fallback path for soft decode failures."
patterns-established:
  - "PCM window helpers: resolve_pcm_window_start_index() + build_pcm_window_blob()."
requirements-completed: [P24-01, P24-02, P24-03, P24-05, P24-06]
duration: 55min
completed: 2026-04-17
---

# Phase 24 Plan 05 Summary

**Sidecar live ingestion now follows a decode-once PCM window pipeline, removing repeated overlapping WebM decode work on the hot path while preserving non-fatal fallback semantics.**

## Accomplishments
- Added reusable transcription helpers: `decode_webm_to_pcm`, `write_pcm_to_wav`, `transcribe_wav_file`.
- Refactored `transcribe_file()` to compose decode-once pipeline.
- Extended live session with PCM chunk buffers/ranges and switched ingest hot path to bounded PCM windows.
- Retained fallback behavior for soft decode failures and added focused tests (`test_build_pcm_window_blob_*`, `test_live_pcm_window_path_preserves_full_transcript_snapshot`).

## Verification
- `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_integration.py tests/test_transcription_spacing.py -q`

## Deviations from Plan
- None.
