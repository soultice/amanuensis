---
created: 2026-04-14T12:19:27.240Z
issue: Starting a new recording overwrites the active session instead of creating a new one
type: logic_error
phase: 10 of 10 (packaging distribution)
status: resolved
---

## Root Cause
`AppToolbar.vue`'s `startRecording()` called `recordingStore.startRecording()` directly without checking whether the current session already had content, causing the existing `audioBlob`/`audioBlobUrl` to be overwritten in-place on the same session.

## Fix
1. Added `newSession()` action to `session.ts` — saves the current session, resets all stores, creates a fresh session on disk, and sets it as `currentSessionId` without routing through `SessionListView`.
2. In `AppToolbar.vue`'s `startRecording()`, added a guard: if `recordingStore.isStopped || transcriptStore.hasTranscript`, call `sessionStore.newSession()` before starting the recording.

## Files Modified
- `src/renderer/src/stores/session.ts` — added `newSession()` action
- `src/renderer/src/components/AppToolbar.vue` — imported session/transcript stores, updated `startRecording()` guard

## Verification
1. Start a recording, stop it → session has audio
2. Click "● Rec" again
3. Expected: a brand-new session is created and recording starts fresh
4. Old session is preserved (saved before switching)
