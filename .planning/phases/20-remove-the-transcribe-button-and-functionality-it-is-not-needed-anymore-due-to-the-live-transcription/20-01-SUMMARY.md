---
phase: 20-remove-the-transcribe-button-and-functionality-it-is-not-needed-anymore-due-to-the-live-transcription
plan: 01
subsystem: transcript-recovery
key_files:
  created: []
  modified:
    - src/renderer/src/stores/transcript.ts
    - src/renderer/src/stores/recording.ts
    - src/renderer/src/stores/session.ts
    - src/preload/index.ts
    - src/renderer/src/env.d.ts
    - src/main/index.ts
    - sidecar/tests/test_live_transcription_integration.py
metrics:
  completed: 2026-04-17
  tasks_completed: 3
---

# Phase 20 Plan 01 Summary

Converted manual batch transcription into an internal recovery path instead of a user-facing action.

Implemented:
- `recoverTranscriptFromAudio(audioBlob)` in `src/renderer/src/stores/transcript.ts`
- automatic recovery after live-stop failure or live-unavailable recording sessions in `src/renderer/src/stores/recording.ts`
- restore-time recovery for saved sessions with audio but no transcript in `src/renderer/src/stores/session.ts`
- `readSessionAsset(sessionId, filename)` bridge across preload/main for persisted audio asset reads
- regression coverage proving the batch `/transcribe` route still exists for hidden recovery

## Verification
- `npm run typecheck:web` ✅
- `npm run typecheck:node` ✅
- `cd sidecar && poetry run pytest tests/test_live_transcription_integration.py -q` ✅
