# Amanuensis

Cross-platform desktop app for recording audio, transcribing with local NVIDIA Parakeet ONNX, annotating the transcript, and exporting Markdown documentation.

## Prerequisites

- **Node.js** ≥ 18 (tested on v22)
- **npm** ≥ 8 (bundled with Node.js; tested on v11)
- **Python** ≥ 3.10
- **[Poetry](https://python-poetry.org/docs/#installation)** ≥ 1.8
- **ffmpeg** available on PATH (required for audio conversion before transcription)

Install Poetry:
```bash
curl -sSL https://install.python-poetry.org | python3 -
```

## Development Setup

> **New contributor?** See [CONTRIBUTING.md](./CONTRIBUTING.md) for platform-specific setup instructions (Windows, Linux, macOS).

### 1. Install Node.js dependencies

```bash
npm install
```

### 2. Install Python sidecar dependencies

```bash
cd sidecar
poetry install
cd ..
```

### 3. Run in development mode

```bash
npm run dev
```

Electron opens with hot-reload. The Python FastAPI sidecar is spawned automatically via `poetry run`.

### Runtime ASR device mode

Use `AMANUENSIS_ASR_DEVICE` to control sidecar execution provider mode:

- `auto` (default): pick best available provider (CUDA/DML/CoreML/CPU)
- `cpu`: force CPU only
- `cuda`: prefer CUDA and fall back to CPU when unavailable

Example:

```bash
AMANUENSIS_ASR_DEVICE=auto npm run dev
```

### First run

On first launch the app shows an onboarding screen. The NVIDIA Parakeet ONNX model (~600MB) must be downloaded before transcription is available. Click **Download Model** and wait for the progress indicator to complete.

## Project Structure

```
src/
  main/           Electron main process (Node.js + TypeScript)
    index.ts      App lifecycle, IPC handlers, window creation
    sidecar.ts    Sidecar spawn, health polling, port management
  preload/
    index.ts      contextBridge — window.api exposed to renderer
  renderer/
    src/
      App.vue           Root component (onboarding vs shell routing)
      views/
        OnboardingView.vue    Model status + download screen
        AppShellView.vue      Full app layout (populated by Phase 2+)
      components/
        AppToolbar.vue        Toolbar (Phase 2: recording controls)
        WaveformPanel.vue     Waveform display (Phase 3: WaveSurfer)
        TranscriptPanel.vue   Transcript view (Phase 2+)
        AnnotationPanel.vue   Annotation list (Phase 4)
        AppStatusBar.vue      Sidecar status indicator
        SidecarErrorDialog.vue  Blocking error dialog
      stores/
        sidecar.ts    Pinia store — sidecar port/status
        model.ts      Pinia store — model state/progress

sidecar/                  Python FastAPI backend
  pyproject.toml          Poetry dependency manifest
  app/
    main.py               FastAPI entry point + CLI args (--port, --user-data)
    state.py              Shared singletons (model_manager)
    routes/
      health.py           GET /health
      model.py            GET /model/status, POST /model/download
    services/
      model_manager.py    Parakeet model presence check + download

.planning/                GSD planning artifacts
```

## Packaging

Building distributable installers requires building the Python sidecar binary first (PyInstaller), then packaging the Electron app (electron-builder).

### Additional Prerequisites

```bash
cd sidecar
poetry add --dev pyinstaller
poetry install
```

### Build Steps

**Build everything at once:**

```bash
npm run build:all
```

Or step by step:

```bash
# 1. Build Python sidecar binary (platform-specific)
npm run build:sidecar   # produces dist-sidecar/amanuensis-sidecar/

# 2. Build renderer (Vite)
npm run build

# 3. Package Electron app
npm run build:electron   # produces release/
```

### Output

| Platform | File | Location |
|---|---|---|
| macOS | `.dmg` | `release/` |
| Windows | `.exe` (NSIS) | `release/` |
| Linux | `.AppImage` | `release/` |

### Notes

- **NVIDIA Parakeet model (~600MB) is not bundled.** It is downloaded on first launch via the onboarding screen.
- **ffmpeg is required at runtime** for WebM → WAV conversion before ASR inference.
- Build each platform's binary on the target platform (macOS binary on macOS, etc.).
- For CI, use GitHub Actions with separate jobs per platform.

## Type Checking

```bash
npm run typecheck
```

## Build

```bash
npm run build
# Then package with electron-builder (Phase 5)
```

## Architecture

The renderer (Vue 3) communicates with the Electron main process via a typed `window.api` bridge (contextBridge). The main process spawns the Python FastAPI sidecar on startup, discovers a free port with `get-port`, and polls `/health` before marking the sidecar as ready. All communication with the sidecar from the renderer goes directly via HTTP to `localhost:{port}` (not through Electron IPC) to avoid serialisation overhead for large audio files.

Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
# amanuensis
