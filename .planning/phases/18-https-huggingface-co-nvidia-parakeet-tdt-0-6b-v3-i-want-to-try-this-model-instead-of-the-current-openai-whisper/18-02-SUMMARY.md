# Plan 18-02 Summary

## What changed
- Rewrote `sidecar/app/services/transcription.py` to use `onnx_asr` (Parakeet ONNX) instead of faster-whisper.
- Added ffmpeg-based conversion (`webm` -> `16kHz mono wav`) before inference.
- Added token-to-word timestamp aggregation and preserved response shape:
  - `words`
  - `segments`
  - `language`
  - `duration`
- Updated `sidecar/app/routes/transcribe.py` copy and error message to ASR model terminology.
- Updated Electron model fallback marker in `src/main/index.ts` to Parakeet ONNX path.
- Updated renderer UX:
  - `TranscriptPanel.vue`: language badge hidden when language is empty
  - `TranscriptPanel.vue`: transcribing text now references Parakeet
  - `AppToolbar.vue`: transcribe tooltip is model-neutral
  - `OnboardingView.vue`: model messaging updated to Parakeet.

## Verification run
- `cd sidecar && poetry run python -m py_compile app/services/transcription.py app/routes/transcribe.py` (success)
- `npm run typecheck` (success)

## Notes
- Language is intentionally returned as empty string when unavailable so UI can hide it.
- Contract consumed by transcript store remains intact.
