# Plan 18-03 Summary

## What changed
- Updated `sidecar/amanuensis-sidecar.spec`:
  - removed faster-whisper/ctranslate2 hidden imports and data collection
  - added `onnx_asr` and `onnxruntime` hidden imports
  - kept FastAPI/Uvicorn runtime imports intact.
- Updated docs to align with migrated stack:
  - `README.md` now references NVIDIA Parakeet ONNX and ffmpeg requirement
  - `CONTRIBUTING.md` now includes ffmpeg prerequisite and updated model download wording.
- Phase 18 roadmap section had already been normalized to concrete goal + 3 plans and remains aligned.

## Verification run
- `rg -n "onnx_asr|onnxruntime|faster_whisper|ctranslate2" sidecar/amanuensis-sidecar.spec`
- `rg -n "Parakeet|ffmpeg|Whisper" README.md CONTRIBUTING.md`

## Notes
- Packaging config now matches sidecar runtime dependencies.
