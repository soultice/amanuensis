---
status: verifying
trigger: "Debug the issue: live transcription can use stale ONNX model state/cache after the model path or on-disk model contents change."
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T21:05:00Z
---

## Current Focus

verifying: targeted regressions for model-state revalidation and model-cache invalidation by model path/provider
next_action: manual smoke check if needed against a removed/re-downloaded model directory

## Symptoms

expected: live transcription should only use a fully present ONNX model at the current path and should reload when the model dir changes
actual: model state could stay "present" after marker files changed on disk, and the transcription singleton could reuse a previously loaded model after the model path changed
impact: live start/transcribe could point at a missing/incomplete model directory or the wrong cached ONNX model instance
reproduction: remove/change marker files after startup or switch model dirs in-process

## Evidence

- `ModelManager.state` had stale in-memory state; it did not re-check marker files on read, and `get_model_path()` returned `_model_dir` even when required markers were missing.
- Regression coverage now proves state revalidates `missing -> present -> missing` as marker files appear/disappear, and `get_model_path()` raises on partial model dirs.
- `transcription.get_model()` cached a single module-level model instance, so a later call with a different model directory could reuse the stale model.
- The fix adds `_model_cache_key = (resolved model dir, provider order)`; regression coverage confirms same-dir reuse and reload on different model dirs.

## Resolution

root_cause: model availability and loaded-model caching were both too sticky—filesystem state was not revalidated on access, and the singleton ASR cache ignored model path/provider changes.
fix: revalidate markers in `ModelManager.state`, require full marker presence in `get_model_path()`, return an absolute `model_dir.resolve()` (prevents ORT external-data loads from seeing an empty model path), and key the transcription cache by resolved model dir plus provider order.
verification: `cd sidecar && poetry run pytest tests/test_model_manager.py tests/test_transcription_providers.py -q` → `6 passed`
files_changed:
  - `sidecar/app/services/model_manager.py`
  - `sidecar/app/services/transcription.py`
  - `sidecar/tests/test_model_manager.py`
  - `sidecar/tests/test_transcription_providers.py`
