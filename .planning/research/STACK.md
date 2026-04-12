# Stack Research: Amanuensis

*Researched: 2026-04-12*

## Recommended Stack

### Desktop Shell

**Electron 33+** with **electron-vite** as the build tool.

- `electron-vite` is the de-facto standard for Electron + Vite projects. It provides a single Vite config for main process, renderer, and preload scripts, with HMR in the renderer and hot reload in main.
- Boilerplate: `alex8088/electron-vite-boilerplate` (TypeScript + Vue 3 + Vite, 200+ stars, actively maintained)
- **Why Electron over Tauri:** Tauri requires Rust for native modules and has more friction integrating a Python sidecar. Electron's Node.js main process can spawn and manage a Python subprocess directly with no Rust layer.

| Package | Version | Role |
|---|---|---|
| electron | ^33 | Desktop shell |
| electron-vite | ^2 | Build tool (replaces electron-webpack) |
| electron-builder | ^25 | Cross-platform packaging (.dmg, .exe, .AppImage) |

### Frontend Renderer

**Vue 3 + TypeScript + Vite** (inside the Electron renderer process)

| Package | Version | Role |
|---|---|---|
| vue | ^3.5 | UI framework |
| typescript | ^5.6 | Type safety |
| vite | ^6 | Bundler (managed by electron-vite) |
| pinia | ^2.2 | State management (sessions, annotations) |
| @vueuse/core | ^11 | Composables (useClipboard, useFileDialog, etc.) |
| @meersagor/wavesurfer-vue | ^2.0 | WaveSurfer.js Vue 3 wrapper — waveform + regions plugin |
| wavesurfer.js | ^7 | Audio waveform visualization |

**Why `@meersagor/wavesurfer-vue`:** Modular plugin architecture (timeline, regions, zoom). Full TypeScript support. Uses Vue 3 Composition API. Regions plugin is exactly what's needed to highlight audio spans corresponding to word ranges.

### Python Sidecar (Whisper Backend)

**FastAPI + faster-whisper**

| Package | Version | Role |
|---|---|---|
| fastapi | ^0.115 | HTTP API for transcription requests |
| uvicorn | ^0.32 | ASGI server |
| faster-whisper | ^1.1 | Whisper inference (CTranslate2 backend) |
| python-multipart | ^0.0.12 | File upload support |

**Why `faster-whisper` over `openai-whisper`:**
- 4× faster inference with same accuracy
- Lower memory usage (supports 8-bit quantization)
- Native `word_timestamps=True` support — returns per-word `start`, `end`, `probability`
- Actively maintained (22K+ GitHub stars)
- `openai-whisper` requires ffmpeg subprocess; faster-whisper handles it internally

**Whisper model:** `large-v3` (latest large model). Auto language detection is default.

**IPC pattern (Electron ↔ Python):**
1. Electron main process spawns Python sidecar as a child process on app start
2. Sidecar starts FastAPI on a random available localhost port (avoids conflicts)
3. Main process communicates port number to renderer via `ipcMain` / `contextBridge`
4. Renderer calls the sidecar REST API directly for transcription results
5. Long-running transcription uses Server-Sent Events (SSE) or polling for progress

### Packaging: Python Binary

**PyInstaller** bundled as an `extraResources` entry in electron-builder config.

- PyInstaller compiles the FastAPI + faster-whisper sidecar into a standalone binary per platform (no Python installation required on target machine)
- Binary placed in `resources/sidecar/` within the Electron app bundle
- Electron main process spawns the binary at startup
- Whisper model files (~3GB for large-v3) downloaded on first run to `app.getPath('userData')/models/` — not bundled (too large)

### CSS Anchor Positioning

**Fully supported** in Electron 33+ (ships Chromium 130+, CSS Anchor Positioning supported since Chrome 125). No polyfill needed. Native `<dialog>` element also fully supported.

### Audio Recording

- **Web Audio API** in renderer — `navigator.mediaDevices.enumerateDevices()` for device list, `getUserMedia()` for capture, `MediaRecorder` for recording
- Output format: WebM/Opus → converted to WAV (16kHz mono) on the Python side before Whisper ingestion
- Known issue: macOS Sonoma microphone permission prompt on `enumerateDevices()` — fixed in Electron 28+ (PR #40733)

### Session Persistence

**JSON files** in `app.getPath('userData')` — one `session.json` per session. Simple, portable, no SQLite dependency for v1.

## What NOT to Use

| Avoid | Reason |
|---|---|
| `openai-whisper` | 4× slower, higher memory, `openai-whisper` pip package is heavier |
| `WhisperX` | Adds diarization complexity not needed; word timestamps work fine in faster-whisper |
| Tauri | Rust requirement adds friction for Python sidecar integration |
| `electron-forge` | electron-builder is more flexible for custom extraResources (Python binary) |
| SQLite for v1 | Over-engineering; JSON session files are simpler and sufficient |
| `vue-audio-recorder` | Unmaintained; use Web Audio API directly |

## Confidence Levels

| Decision | Confidence | Notes |
|---|---|---|
| electron-vite | High | Industry standard for Electron + Vite |
| faster-whisper | High | Clear winner over openai-whisper for local inference |
| wavesurfer.js + Vue wrapper | High | Best maintained waveform lib with Vue 3 support |
| PyInstaller sidecar pattern | Medium | Works well but model download UX needs care |
| JSON session persistence | High | Appropriate for v1 single-session model |
| CSS Anchor Positioning | High | Supported in Electron's Chromium |
