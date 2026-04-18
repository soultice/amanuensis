---
phase: 26
status: human_needed
verified: "2026-04-18"
verifier: inline
---

# Verification: Phase 26 — Live PCM Streaming Architecture

## Phase Goal

Replace the live transcription blob-upload/polling hot path with fail-fast renderer PCM streaming over two persistent websocket channels while preserving sidecar authority, transcript contracts, pause-safe timing, and the durable saved audio artifact.

## Automated Checks

| Check | Result |
| --- | --- |
| `npm run typecheck && npm run build` | ✓ PASS |
| `cd sidecar && poetry run pytest tests/test_live_decode_window.py tests/test_live_transcription_routes.py tests/test_live_transcription_integration.py -x -vv` | ✓ PASS (22 tests; Poetry wrapper lingered after the passing summary in this environment) |

## Must-Haves (Code + Tests)

| Must-have | Evidence | Status |
| --- | --- | --- |
| Renderer captures PCM via AudioWorklet instead of blob uploads for the live path | `src/renderer/src/audio/live-pcm-capture.worklet.ts`, `src/renderer/src/stores/recording.ts` | ✓ PASS |
| Sidecar exposes prepare + two websocket channels and ingests PCM in memory | `sidecar/app/routes/transcribe.py`, `sidecar/app/services/live_transcription.py` | ✓ PASS |
| Explicit timing/sample metadata drives sidecar ingest | `LivePcmPacketMetadata`, `ingest_pcm(...)` signature and packet-range bookkeeping | ✓ PASS |
| Transcript updates arrive from websocket output events rather than `/live/status` polling | `src/renderer/src/lib/live-transcription-stream.ts`, `src/renderer/src/stores/transcript.ts`, `src/renderer/src/views/AppShellView.vue` | ✓ PASS |
| Final transcript contract remains `{words, segments, language, duration}` | sidecar complete payload + integration assertions | ✓ PASS |
| Durable audio artifact remains available for playback/session reopen | archival `MediaRecorder` path in `recording.ts`, asset restoration in `session.ts` | ✓ PASS |

## Human Verification Required

1. Start recording with the sidecar ready: recording should not begin if prepare/websocket startup fails.
2. Speak continuously for ~20s: transcript text should appear during recording and keep updating without the old chunk-upload lag pattern.
3. Pause and resume twice: transcript continuity should remain coherent and final duration should exclude the paused span.
4. Stop recording: transcript should finalize and waveform/playback should still work from the saved audio artifact.
5. Save/close/reopen the session: waveform/playback should reload, and if transcript data is missing but audio exists, restore-time recovery should still work.

## Result

Automated verification passed. Human UX verification is still required before Phase 26 can be marked complete.
