# Plan 18-01 Summary

## What changed
- Replaced sidecar dependency stack from `faster-whisper` to `onnx-asr` in `sidecar/pyproject.toml`.
- Regenerated `sidecar/poetry.lock` to resolve ONNX runtime packages.
- Updated `sidecar/app/services/model_manager.py` to download Parakeet ONNX model from `istupakov/parakeet-tdt-0.6b-v3-onnx`.
- Switched model marker validation from Whisper `model.bin` to Parakeet ONNX artifacts (`model.onnx`, `tokens.txt`).
- Kept model manager state/progress/error contract unchanged.
- Updated model route and sidecar state/main wording to model-neutral ASR text.

## Verification run
- `cd sidecar && poetry lock` (success)
- `cd sidecar && poetry run python -m py_compile app/services/model_manager.py app/routes/model.py app/main.py app/state.py` (success)

## Notes
- Explicit model download behavior remains in place.
- No fallback backend was introduced.
