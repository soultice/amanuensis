---
phase: 24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc
plan: 04
subsystem: infra
tags: [onnxruntime, execution-provider, gpu]
requires:
  - phase: 24-01
    provides: live baseline metrics
  - phase: 24-02
    provides: bounded producer behavior
provides:
  - auto provider selection (CUDA/DML/CoreML/CPU)
  - runtime provider metadata in live-start response
  - Electron sidecar device flag plumbing
affects: [phase-24, runtime]
tech-stack:
  added: []
  patterns: [provider-order resolution with CPU fallback]
key-files:
  created:
    - sidecar/tests/test_transcription_providers.py
  modified:
    - sidecar/app/services/transcription.py
    - sidecar/app/routes/transcribe.py
    - src/main/sidecar.ts
    - README.md
key-decisions:
  - "`auto` now prefers CUDA → DML → CoreML → CPU; forced cpu/cuda modes are preserved with safe fallback."
  - "Runtime provider metadata is surfaced on `/transcribe/live/start` for observability."
patterns-established:
  - "Provider resolution is centralized in resolve_execution_provider_order()."
requirements-completed: [P24-01, P24-04, P24-05, P24-06]
duration: 40min
completed: 2026-04-17
---

# Phase 24 Plan 04 Summary

**Execution-provider selection now auto-picks the best available ONNX runtime backend and exposes the chosen provider in live-start responses.**

## Accomplishments
- Added `get_available_execution_providers()`, `resolve_execution_provider_order()`, and `describe_runtime_provider()`.
- Wired provider metadata (`deviceMode`, `runtimeProvider`, `availableProviders`) into `/transcribe/live/start`.
- Added `AMANUENSIS_ASR_DEVICE` plumbing and `--device` spawn args in Electron main process.
- Documented runtime mode control in `README.md` and added provider-selection tests.

## Verification
- `cd sidecar && poetry run pytest tests/test_transcription_providers.py tests/test_live_transcription_routes.py -q`
- `npm run build`

## Deviations from Plan
- None.
