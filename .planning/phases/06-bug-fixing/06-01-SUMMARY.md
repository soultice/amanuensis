# Plan 06-01 Summary: Bug Fixes

**Status:** Complete
**Completed:** 2026-04-12

## What Was Fixed

6 critical runtime bugs identified by codebase audit and fixed:

1. **CSP `file://` block** — Added `file:` to `img-src` and `media-src` in both the main process CSP header and renderer `index.html`. Annotation images from `userData/sessions/assets/` now render correctly.

2. **Model download progress stuck at 0%** — Added `setInterval` polling of `/model/status` inside the `model:download` IPC handler. Forwards progress to renderer via `win.webContents.send('model:progress', progress)`. Clears on `state === 'present'` or `state === 'error'`.

3. **Model status race condition** — Added `watch(sidecarStore.status)` in `App.vue` that calls `modelStore.refresh()` when sidecar transitions to `'ready'`, ensuring model status is accurate after the sidecar finishes starting.

4. **WaveSurfer doesn't reload** — Removed static `url` from WaveSurfer init options. Added `watch(audioBlobUrl)` to call `waveSurfer.value.load(url)` when audio becomes available after recording. Also loads immediately on waveSurfer init if audio is already present (session restore).

5. **Pinia proxy corruption** — Added `markRaw()` around `MediaRecorder`, `MediaStream` (in `useRecordingStore`), and `WaveSurfer` instance (in `usePlaybackStore`) to prevent Vue reactivity from wrapping native browser objects.

6. **Session restore export failure** — Fixed `restore()` in `useSessionStore` to add `segmentId: 0` fallback for words missing it, and construct a single fallback segment covering all words when `segments` array is empty.

## Self-Check: PASSED

TypeScript clean (0 errors). All 6 bugs addressed.
