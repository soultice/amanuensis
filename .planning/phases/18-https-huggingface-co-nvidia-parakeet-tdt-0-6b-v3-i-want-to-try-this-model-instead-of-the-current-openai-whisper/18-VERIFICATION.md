---
phase: 18
status: passed
verified: "2026-04-16"
score: 8/8
---

# Verification: Phase 18 — Parakeet ONNX Migration

## Must-Haves

| # | Requirement / Must-Have | Status | Evidence |
|---|--------------------------|--------|----------|
| 1 | TRANS-01: local transcription backend is active | ✓ Passed | `sidecar/app/services/transcription.py` imports and uses `onnx_asr` |
| 2 | TRANS-02: auto-language path preserved (or hidden when unavailable) | ✓ Passed | Backend returns `language: ""`; UI hides language badge when empty in `TranscriptPanel.vue` |
| 3 | TRANS-03: explicit model download UX remains | ✓ Passed | `model_manager.py` keeps `missing/downloading/present/error`; `model` routes unchanged contract |
| 4 | TRANS-04: full transcript contract preserved | ✓ Passed | `/transcribe` response still contains `words`, `segments`, `language`, `duration` |
| 5 | NAV-01: click-to-seek compatibility retained | ✓ Passed | Word objects still include `start`/`end` timestamps consumed by transcript store/playback |
| 6 | NAV-02: active-word highlighting compatibility retained | ✓ Passed | Word timing contract preserved and typecheck passed |
| 7 | COMPAT-01: packaging stack aligns with new runtime | ✓ Passed | `amanuensis-sidecar.spec` now includes `onnx_asr` + `onnxruntime`; removed CT2/faster-whisper imports |
| 8 | COMPAT-03: docs/runtime prerequisites aligned | ✓ Passed | `README.md` and `CONTRIBUTING.md` include Parakeet + ffmpeg requirements |

## Automated Checks Run

```bash
rg -n "onnx_asr|ffmpeg|language" sidecar/app/services/transcription.py src/renderer/src/components/TranscriptPanel.vue
rg -n "parakeet-tdt-0.6b-v3-onnx|MODEL_MARKERS|model.onnx" sidecar/app/services/model_manager.py src/main/index.ts
rg -n "onnxruntime|onnx_asr|faster_whisper|ctranslate2" sidecar/amanuensis-sidecar.spec
npm run typecheck
cd sidecar && poetry run python -m py_compile app/services/model_manager.py app/services/transcription.py app/routes/model.py app/routes/transcribe.py app/main.py
```

## Human Verification Notes

Recommended manual validation on target OSes:
1. First-launch onboarding model download completes and transitions to app shell.
2. Record/transcribe flow succeeds with ffmpeg installed and model downloaded.
3. Transcript word click + playback highlighting still match audio timing.

## Verdict: PASSED

Phase goal achieved: faster-whisper path replaced with NVIDIA Parakeet ONNX in sidecar, transcript/timestamp contract retained, and explicit model download UX preserved.
