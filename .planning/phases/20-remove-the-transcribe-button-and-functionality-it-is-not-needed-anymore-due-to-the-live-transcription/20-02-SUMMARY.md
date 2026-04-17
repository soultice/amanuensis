---
phase: 20-remove-the-transcribe-button-and-functionality-it-is-not-needed-anymore-due-to-the-live-transcription
plan: 02
subsystem: live-first-ui
key_files:
  created: []
  modified:
    - src/renderer/src/components/AppToolbar.vue
    - src/renderer/src/views/AppShellView.vue
    - src/renderer/src/components/TranscriptPanel.vue
    - src/renderer/src/components/AnnotationPanel.vue
    - src/renderer/src/components/AppStatusBar.vue
metrics:
  completed: 2026-04-17
  tasks_completed: 2
---

# Phase 20 Plan 02 Summary

Removed the visible Transcribe button and updated transcript-related UI copy/status labels to match the live-first recording flow.

Implemented:
- removed toolbar Transcribe button, related prop plumbing, and AppShell handler
- updated transcript empty-state and recovery-progress copy
- updated annotation tooltips to refer to transcript completion instead of a missing button
- changed status bar label from `Live:` to `Transcript:`

## Verification
- `npm run typecheck` ✅
- `npm run build` ✅
- `rg -n "toolbar__btn--transcribe|@transcribe|click <strong>Transcribe</strong>|Transcribe first|Live:" src/renderer/src` returns no stale UI affordance/copy matches ✅
