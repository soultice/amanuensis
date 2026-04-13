---
created: 2026-04-13
issue: re-opening session shows audio-not-found error; transcript and annotations not displayed
type: runtime_error
phase: 10-packaging-distribution
status: resolved
---

## Root Cause

Four bugs stacked together — the symptom (blank panel) was the end result of all four firing at once.

### Bug 1: CSS grid collapses content panel to 24px
`.app-shell` had `grid-template-rows: 48px 1fr 24px` (3 rows). When `audioFileMissing = true` the warning banner was inserted as the 1st grid child — making 4 children for 3 rows. CSS grid auto-placed them: warning→48px, toolbar→1fr, **main→24px** (overflow:hidden), statusbar→implicit row. Transcript and annotations were rendered but invisible inside a 24px slot.

### Bug 2: Audio blob never persisted to disk
`buildSessionData()` called `.replace(/^file:\/\//, '')` on `audioBlobUrl`, but recordings create `blob:null/uuid...` URLs (not `file://`). The replace was a no-op; the blob URL was stored verbatim. Blob URLs are ephemeral to the browser session — they don't survive a reopen.

### Bug 3: CSP blocked file:// media URLs
`openSession()` restored audio as `` `file://${data.audioPath}` ``. The Electron CSP is `media-src 'self' blob: asset:` — `file:` is not listed. Even if a valid file path were stored, WaveSurfer would be blocked from loading it.

### Bug 4: asset:// handler missing webm MIME type
The `asset://` protocol handler had no entry for `webm`, falling back to `application/octet-stream`, which breaks WaveSurfer's audio detection.

## Fix

### `src/renderer/src/views/AppShellView.vue`
Changed grid: `48px 1fr 24px` → `auto 48px 1fr 24px`. The `auto` warning row collapses to 0 when the warning element is absent (v-if).

### `src/renderer/src/stores/session.ts — save()`
Before serialising, detects `blob:` URLs and writes the audio to the session assets dir via `saveBlobAsset()`. Updates `audioBlobUrl` to `asset://localhost/{filename}` so the URL survives across sessions and is allowed by CSP.

### `src/renderer/src/stores/session.ts — buildSessionData()`
Normalises `audioBlobUrl` to a storable form: strips `asset://localhost/` to store just the filename; strips `file://` for legacy paths; drops blob: URLs (should not occur after save() runs first).

### `src/renderer/src/stores/session.ts — openSession()`
Restores audio using:
- `blob:` prefix → `audioFileMissing = true` (old broken sessions)
- `/absolute/path` → legacy; checks fileExists, serves via `asset://localhost/{filename}`
- bare `filename.webm` → `asset://localhost/{filename}` directly

### `src/main/index.ts`
Added `webm: 'audio/webm'` to the asset:// protocol MIME table.

## Verification

1. Record audio → transcribe → close session → reopen session
2. Audio loads in waveform; transcript text and annotations display correctly
3. No warning banner for newly saved sessions
4. Old sessions with `blob:` audioPath: warning shows but transcript still displays correctly (grid fix)
