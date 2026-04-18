---
phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
plan: 03
subsystem: renderer-live-transcription
tags: [typescript, vue, pinia, audio-worklet, websocket]
requires:
  - phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
    provides: prepare/output websocket contract and sidecar PCM ingest
provides:
  - AudioWorklet PCM capture batches for live ASR
  - renderer websocket client for prepare/input/output streaming
  - fail-fast recording startup and websocket-driven transcript updates
affects: [phase-26, renderer, live-transcription]
tech-stack:
  added: []
  patterns: [audio-worklet batching, prepare-before-record, websocket event-driven transcript state]
key-files:
  created:
    - .planning/phases/26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks/26-03-SUMMARY.md
    - src/renderer/src/audio/live-pcm-capture.worklet.ts
    - src/renderer/src/lib/live-transcription-stream.ts
  modified:
    - src/renderer/src/stores/recording.ts
    - src/renderer/src/stores/transcript.ts
    - src/renderer/src/views/AppShellView.vue
key-decisions:
  - "Recording startup now performs live-stream prepare/connect before `recordingState` flips to `recording`."
  - "Renderer transcript state is driven by websocket output events, not `/live/status` polling or `/live/chunk` uploads."
patterns-established:
  - "Use an AudioWorklet with packetized PCM batches for live ASR while keeping MediaRecorder strictly as the archival recording path."
  - "Fail-fast live startup belongs in the recording store; AppShell no longer bootstraps live transcription after recording already started."
requirements-completed: [P26-01, P26-02, P26-03, P26-06, P26-07, P26-08]
duration: 24 min
completed: 2026-04-18
---

# Phase 26 Plan 03 Summary

**Switched the renderer live path from blob uploads/polling to fail-fast PCM websocket streaming.**

## Accomplishments
- Added `live-pcm-capture.worklet.ts` to batch 128-frame callbacks into 2048-sample PCM packets.
- Added `LiveTranscriptionStream` to call `/transcribe/live/prepare`, open both websockets, and send JSON metadata + binary PCM frames.
- Reworked `transcript.ts` to consume `ready`, `patch`, `telemetry`, `state`, `complete`, and `error` websocket events.
- Reworked `recording.ts` so recording waits for prepare/connect success before entering `recording`, then streams AudioWorklet PCM while MediaRecorder collects only the archival audio artifact.
- Removed AppShell’s post-start live-session watcher; live startup is now owned by the recording store.

## Task Commits
1. **Task 1: PCM worklet + live stream client** - `43c6d9a`
2. **Task 2: fail-fast renderer store refactor** - `491b94f`

## Files Created/Modified
- `src/renderer/src/audio/live-pcm-capture.worklet.ts` - packetized PCM capture worklet.
- `src/renderer/src/lib/live-transcription-stream.ts` - prepare/connect/sendPcm/sendControl websocket client.
- `src/renderer/src/stores/transcript.ts` - websocket-driven transcript patch/telemetry/finalization handling.
- `src/renderer/src/stores/recording.ts` - fail-fast startup, AudioWorklet wiring, archival recorder separation.
- `src/renderer/src/views/AppShellView.vue` - removed old watcher-based live startup.

## Verification
- `npm run typecheck && npm run build`

## Next Phase Readiness
- Wave 4 can now tighten session persistence around the separated archival recording artifact without reintroducing live blob fallback.

---
*Completed: 2026-04-18*
