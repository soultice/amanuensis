---
plan: 10-02
phase: 10
status: complete
completed: 2026-04-14
---

# Summary: Plan 10-02 — PyInstaller Spec Hardening + Sidecar Build

## What was done

- Rewrote `sidecar/amanuensis-sidecar.spec` with comprehensive `hiddenimports` covering:
  - `faster_whisper.*` internals (transcribe, audio, feature_extractor, tokenizer, vad)
  - `ctranslate2.*` (specs, converters)
  - `tokenizers.*` (Rust extension — models, pre_tokenizers, decoders, processors, normalizers)
  - `av.*` (PyAV audio decoding — stream, frame, resampler, container, codec)
  - `starlette.*` (routing, middleware, cors, responses, requests)
  - `fastapi.*`, `anyio.*`, `numpy.*`, `multipart`, `huggingface_hub.*`
- Added `importlib_path()` helper and conditional `datas` entry for ctranslate2 package data
- Installed PyInstaller via `poetry run pip install pyinstaller`
- Built sidecar: `npm run build:sidecar` — completed successfully in ~34s
- Smoke tested binary: `./dist-sidecar/amanuensis-sidecar/amanuensis-sidecar --port 18999 --user-data /tmp/...` → `GET /health` returned `{"status":"ok"}`

## Acceptance criteria met

- ✓ Spec contains all required hidden imports
- ✓ `dist-sidecar/amanuensis-sidecar/amanuensis-sidecar` exists and is executable
- ✓ Binary starts and `/health` returns 200 within 15s
- ✓ Binary exits cleanly on SIGTERM
