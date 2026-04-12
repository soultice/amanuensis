# Pitfalls Research: Amanuensis

*Researched: 2026-04-12*

## P1: Whisper Large Model — Memory & Speed on CPU

**The problem:** `faster-whisper large-v3` requires ~3GB VRAM on GPU. On CPU, it may use 8–12GB RAM and transcribe at 10–30× real time (a 10-minute recording takes 3–5 minutes on modern laptop CPU, 15–20 minutes on older hardware). Users will think the app crashed.

**Warning signs:**
- Transcription takes >2 minutes with no feedback
- macOS Activity Monitor shows Python process consuming >6GB RAM
- App appears frozen during transcription

**Prevention:**
- Show a prominent transcription progress indicator with estimated time (SSE or polling)
- Do NOT block the Electron main process — transcription happens in the Python sidecar only
- Warn users on first run that large model requires download (~3GB) and is slow on CPU
- Consider offering `large-v3` (default) with a note that GPU accelerates it significantly
- Use `word_timestamps=True` but be aware it adds ~20% to transcription time

**Phase to address:** Phase 1 (sidecar) + Phase 2 (progress UI)

---

## P2: Python Sidecar Bundling — Cross-Platform Headaches

**The problem:** PyInstaller-bundled binaries are platform-specific. You need separate CI builds for macOS (arm64 + x86_64), Windows (x64), and Linux (x64). The Whisper model weights (~3GB) cannot be bundled — they must be downloaded on first use. faster-whisper also depends on CUDA/cuDNN for GPU acceleration, which adds native library complexity.

**Warning signs:**
- "ImportError: cannot import name X" at runtime in packaged app
- Binary works on dev machine but fails on target machine
- Model download fails silently

**Prevention:**
- Build PyInstaller binaries in CI (GitHub Actions) for each platform separately
- Store model files in `app.getPath('userData')/models/` — never in the app bundle
- Implement a first-run model download screen with progress bar
- Use `faster-whisper`'s built-in model download (`WhisperModel("large-v3", download_root=...)`) rather than manual download
- Add a health check endpoint (`GET /health`) — Electron should not allow recording until this returns 200

**Phase to address:** Phase 1 + Phase 5 (packaging)

---

## P3: Audio Format — Whisper Expects WAV/16kHz Mono

**The problem:** `MediaRecorder` in Electron/Chromium produces WebM/Opus. Whisper (and faster-whisper) expect WAV or FLAC, ideally 16kHz mono. If the wrong format is passed, you get silent failures or garbage transcription.

**Warning signs:**
- Transcription returns empty text or obvious errors
- `ffmpeg` not found error in Python sidecar logs
- Word timestamps show all words at t=0

**Prevention:**
- Convert audio in the Python sidecar before passing to Whisper: use `ffmpeg-python` or `soundfile` + `librosa` to convert WebM → WAV 16kHz mono
- Alternatively, record as WAV directly using a Node.js native audio library in the main process (e.g., `node-record-lpcm16`) — avoids conversion but adds native dependency
- Always log the audio file format received by the sidecar
- Test with short (5s) recordings first

**Phase to address:** Phase 2

---

## P4: Word Timestamp Drift / Accuracy

**The problem:** faster-whisper's word-level timestamps are good but not perfect. Timestamps can drift by 50–200ms, especially at sentence boundaries, during silence, or with heavy accents. This makes the "click word → seek audio" feature feel slightly off.

**Warning signs:**
- Clicking a word plays audio from noticeably before/after the word
- Words at the start of sentences seem early; words at the end seem late

**Prevention:**
- Do NOT try to fix this in v1 — it's a model limitation, not a code bug
- Add a 50ms pre-roll offset when seeking (seek to `word.start - 0.05`): makes clicking feel more natural
- The WaveSurfer region highlight should cover `word.start` to `word.end` exactly as returned — visual feedback helps users understand alignment
- Document this as a known limitation

**Phase to address:** Phase 3

---

## P5: Electron Security — contextIsolation & nodeIntegration

**The problem:** Electron's default security model requires `contextIsolation: true` and `nodeIntegration: false`. Many tutorials show the insecure way (`nodeIntegration: true`). Violating this exposes the app to XSS attacks that can access the file system.

**Warning signs:**
- Code uses `require('electron')` in renderer directly
- `window.electron` available without a preload script
- `ipcRenderer` imported directly in Vue components

**Prevention:**
- ALWAYS use `contextIsolation: true`, `nodeIntegration: false` from day one (electron-vite scaffold does this correctly)
- All Node.js access must go through the `preload.ts` contextBridge
- The renderer only calls `window.api.xxx()` — never `ipcRenderer` directly

**Phase to address:** Phase 1 (non-negotiable from the start)

---

## P6: macOS Microphone Permission

**The problem:** On macOS, `navigator.mediaDevices.enumerateDevices()` and `getUserMedia()` require microphone permission. Without the correct Electron entitlements and Info.plist keys, the permission dialog never appears and audio capture silently fails.

**Warning signs:**
- `enumerateDevices()` returns no audio input devices on macOS
- `getUserMedia()` throws `NotAllowedError`
- Recording appears to start but audio file is empty

**Prevention:**
- Add `com.apple.security.device.microphone` entitlement to `entitlements.mac.plist`
- Add `NSMicrophoneUsageDescription` to Info.plist with a user-facing description
- Handle `NotAllowedError` in the renderer with a clear "Please allow microphone access" message
- Test on a real macOS machine (not just CI) — permissions behave differently in dev vs packaged

**Phase to address:** Phase 2 + Phase 5 (packaging)

---

## P7: Auto-Save Edge Cases

**The problem:** Auto-save must survive: app crash, force-quit (SIGKILL), disk full, and concurrent write conflicts. A naive "write session.json every 30 seconds" approach can corrupt the file if the app is killed mid-write.

**Warning signs:**
- Session file is 0 bytes after crash
- Session restores with partial data (annotations missing)
- Write errors on Windows (file locked by another process)

**Prevention:**
- Use atomic writes: write to a `.tmp` file, then `fs.rename()` to the target — rename is atomic on most filesystems
- Keep the last 3 session backups (`current.json`, `backup-1.json`, `backup-2.json`) — if `current.json` is corrupt, fall back
- Hook into Electron's `before-quit` and `will-quit` events for save-on-close (both are needed for different quit paths on macOS)
- On Windows, use `app.setAppUserModelId()` and handle the `second-instance` event correctly

**Phase to address:** Phase 4 + Phase 5

---

## P8: CSS Anchor Positioning — Scroll Offset

**The problem:** CSS Anchor Positioning places elements relative to their anchor, but the transcript is scrollable. If the user has scrolled down, the `<dialog>` anchored to a word span may appear in the wrong position or off-screen.

**Warning signs:**
- Annotation dialog appears at the top of the page instead of next to the selected word
- Dialog clips outside the viewport

**Prevention:**
- The transcript container must have `overflow: hidden` or `overflow-y: auto` with `position: relative` — do not use `overflow: clip` on ancestors of the anchor element (breaks anchor positioning)
- Use `position-try-fallbacks` to allow the dialog to flip above/below the anchor when it would clip
- Test with long transcripts where the selected word is near the bottom of the viewport

**Phase to address:** Phase 4

---

## Summary by Phase

| Phase | Pitfalls to Address |
|---|---|
| Phase 1 | P2 (sidecar bundling foundation), P5 (contextIsolation) |
| Phase 2 | P1 (Whisper speed/progress), P3 (audio format), P6 (macOS mic permission) |
| Phase 3 | P4 (word timestamp drift) |
| Phase 4 | P7 (auto-save atomicity), P8 (CSS anchor scroll) |
| Phase 5 | P2 (PyInstaller CI), P6 (macOS entitlements), P7 (save-on-close hooks) |
