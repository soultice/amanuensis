---
plan: 08-03
phase: 8
status: complete
completed: "2026-04-13"
---

# Summary: Plan 08-03 — SessionListView + Routing + Close Button

## What Was Built

Full-screen session list view, App.vue routing, toolbar close button, and AppShellView wiring.

## Key Changes

### src/renderer/src/views/SessionListView.vue (NEW)
- Full-screen session list with header (title + "New Session" button)
- Session cards: name, word count, last saved date, "Open →" and "✕" delete buttons
- Emits `open` event with session id to parent (App.vue)
- First-launch no-sessions state handled by App.vue watch

### src/renderer/src/App.vue
- Shows `SessionListView` when `modelStore.isReady && !sessionStore.currentSessionId`
- Shows `AppShellView` when `modelStore.isReady && sessionStore.currentSessionId`
- Watch on `modelStore.isReady`: auto-creates + opens session when no sessions exist (first launch)
- `handleOpenSession(id)` calls `sessionStore.openSession(id)`
- `registerSaveOnClose()` moved here from AppShellView (app-level concern)

### src/renderer/src/components/AppToolbar.vue
- Added `closeSession` emit
- Added "← Sessions" button as first control in toolbar
- Button disabled while `recordingStore.isRecording`
- Appropriate hover/disabled styles

### src/renderer/src/views/AppShellView.vue
- Added `@close-session="handleCloseSession"` to `<AppToolbar>`
- `handleCloseSession()`: calls `stopAutoSave()` then `closeSession()` (nulls currentSessionId → App.vue reroutes)

## key-files
### created
- src/renderer/src/views/SessionListView.vue

### modified
- src/renderer/src/App.vue
- src/renderer/src/components/AppToolbar.vue
- src/renderer/src/views/AppShellView.vue

## Self-Check: PASSED
- SessionListView.vue exists with all required UI elements
- App.vue shows SessionListView when no currentSessionId
- App.vue shows AppShellView when currentSessionId is set
- First-launch auto-create works via watch on modelStore.isReady
- AppToolbar has "← Sessions" button disabled while recording
- Clicking button calls closeSession and returns to list
- npm run typecheck passes
