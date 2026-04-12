# Phase 1: Foundation - Research

*Researched: 2026-04-12*

## Goal

Establish the electron-vite + Vue 3 + TypeScript scaffold, Python FastAPI sidecar with Poetry, secure IPC bridge, onboarding screen with model status, scaffolded app shell layout, and blocking sidecar error dialog.

---

## 1. electron-vite + Vue 3 Project Structure

**Scaffold command:**
```bash
npm create @quick-start/electron@latest amanuensis -- --template vue-ts
```
This generates the `alex8088/electron-vite-boilerplate` structure (the canonical TypeScript + Vue3 template).

**Canonical directory layout:**
```
amanuensis/
├── electron.vite.config.ts          # single config for main + preload + renderer
├── src/
│   ├── main/
│   │   └── index.ts                 # Electron main process
│   ├── preload/
│   │   └── index.ts                 # contextBridge preload
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.ts              # Vue app entry
│           ├── App.vue              # root component
│           ├── components/
│           ├── stores/              # Pinia stores
│           └── views/
│               ├── OnboardingView.vue
│               └── AppView.vue
├── sidecar/                         # Python sidecar
│   ├── pyproject.toml
│   ├── poetry.lock
│   └── app/
│       ├── main.py                  # FastAPI entry
│       └── routes/
│           └── health.py
└── package.json
```

**electron.vite.config.ts key points:**
- `main.build.rollupOptions.input`: points to `src/main/index.ts`
- `preload.build.rollupOptions.input`: points to `src/preload/index.ts`
- `renderer`: standard Vite config with `@vitejs/plugin-vue`
- Set `resolve.alias` for `@renderer` → `src/renderer/src`

---

## 2. Secure IPC Bridge (contextBridge)

**Electron security requirements (non-negotiable):**
- `contextIsolation: true` (default since Electron 12)
- `nodeIntegration: false` (default)
- `sandbox: true` (Electron 20+ default for preload)

**preload/index.ts pattern:**
```typescript
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Sidecar
  getSidecarPort: (): Promise<number> =>
    ipcRenderer.invoke('sidecar:get-port'),
  getSidecarStatus: (): Promise<'starting' | 'ready' | 'error'> =>
    ipcRenderer.invoke('sidecar:get-status'),

  // Model status
  getModelStatus: (): Promise<ModelStatus> =>
    ipcRenderer.invoke('model:get-status'),
  downloadModel: (): Promise<void> =>
    ipcRenderer.invoke('model:download'),

  // Events (renderer listens)
  onModelProgress: (cb: (progress: number) => void) => {
    ipcRenderer.on('model:progress', (_e, p) => cb(p))
    return () => ipcRenderer.removeAllListeners('model:progress')
  },
  onSidecarError: (cb: (err: string) => void) => {
    ipcRenderer.on('sidecar:error', (_e, e) => cb(e))
    return () => ipcRenderer.removeAllListeners('sidecar:error')
  }
})
```

**TypeScript type declarations** (src/renderer/src/env.d.ts):
```typescript
interface Window {
  api: {
    getSidecarPort(): Promise<number>
    getSidecarStatus(): Promise<'starting' | 'ready' | 'error'>
    getModelStatus(): Promise<ModelStatus>
    downloadModel(): Promise<void>
    onModelProgress(cb: (progress: number) => void): () => void
    onSidecarError(cb: (err: string) => void): () => void
  }
}

interface ModelStatus {
  state: 'present' | 'downloading' | 'missing' | 'error'
  progress?: number   // 0-100 when downloading
  error?: string
}
```

---

## 3. Python Sidecar — Port Discovery Pattern

**Best pattern for port discovery:** Pass port as a CLI argument from Electron.

1. Electron main uses `get-port` npm package to find a free port at startup
2. Passes it as `--port {N}` to the Python sidecar
3. No stdout parsing needed — Electron already knows the port

```typescript
// main/sidecar.ts
import { ChildProcess, spawn } from 'child_process'
import getPort from 'get-port'
import path from 'path'
import { app } from 'electron'

let sidecarProcess: ChildProcess | null = null
let sidecarPort: number | null = null

export async function startSidecar(): Promise<number> {
  const port = await getPort()
  sidecarPort = port

  const isDev = !app.isPackaged
  const sidecarPath = isDev
    ? path.join(__dirname, '../../sidecar')
    : path.join(process.resourcesPath, 'sidecar')

  sidecarProcess = isDev
    ? spawn('poetry', ['run', 'python', '-m', 'app.main', '--port', String(port)], {
        cwd: sidecarPath,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    : spawn(path.join(sidecarPath, 'amanuensis-sidecar'), ['--port', String(port)], {
        stdio: ['ignore', 'pipe', 'pipe']
      })

  return port
}

export function getSidecarPort() { return sidecarPort }

export async function killSidecar() {
  if (sidecarProcess) {
    sidecarProcess.kill()
    sidecarProcess = null
  }
}
```

**Health polling** (wait for sidecar ready before showing UI):
```typescript
async function waitForSidecar(port: number, timeoutMs = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/health`)
      if (res.ok) return
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Sidecar did not start within ${timeoutMs}ms`)
}
```

---

## 4. Python Sidecar — Poetry + FastAPI Setup

**pyproject.toml:**
```toml
[tool.poetry]
name = "amanuensis-sidecar"
version = "0.1.0"
description = "Whisper transcription sidecar for Amanuensis"
authors = []
package-mode = false

[tool.poetry.dependencies]
python = ">=3.10,<3.13"
fastapi = "^0.115"
uvicorn = {extras = ["standard"], version = "^0.32"}
faster-whisper = "^1.1"
python-multipart = "^0.0.12"

[tool.poetry.dev-dependencies]
pytest = "^8"

[build-system]
requires = ["poetry-core"]
build-backend = "poetry-core.masonry.api"
```

**sidecar/app/main.py:**
```python
import argparse
import uvicorn
from fastapi import FastAPI

app = FastAPI(title="Amanuensis Sidecar")

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")
```

**Dev setup instructions for README:**
```bash
cd sidecar
poetry install
# Poetry handles venv creation automatically
```

---

## 5. Whisper Model Download — faster-whisper API

**Check if model exists before downloading:**
```python
import os
from pathlib import Path

def get_model_path(user_data_dir: str) -> Path:
    return Path(user_data_dir) / "models" / "large-v3"

def model_is_present(user_data_dir: str) -> bool:
    model_path = get_model_path(user_data_dir)
    # faster-whisper stores model as config.json + model.bin + tokenizer files
    return (model_path / "model.bin").exists()
```

**Download with progress reporting (SSE or IPC):**
```python
from huggingface_hub import snapshot_download
import threading

def download_model(user_data_dir: str, progress_callback):
    model_dir = get_model_path(user_data_dir)
    model_dir.mkdir(parents=True, exist_ok=True)

    # snapshot_download handles resumption if interrupted
    snapshot_download(
        repo_id="Systran/faster-whisper-large-v3",
        local_dir=str(model_dir),
        local_dir_use_symlinks=False
    )
    progress_callback(100)
```

**Electron passes `userData` path to sidecar** via CLI arg `--user-data <path>` so sidecar knows where to look/download.

**Model status IPC handler (main process):**
```typescript
ipcMain.handle('model:get-status', async (): Promise<ModelStatus> => {
  const modelDir = path.join(app.getPath('userData'), 'models', 'large-v3')
  const modelBin = path.join(modelDir, 'model.bin')
  if (fs.existsSync(modelBin)) return { state: 'present' }
  if (isDownloading) return { state: 'downloading', progress: downloadProgress }
  return { state: 'missing' }
})
```

---

## 6. App Shell Layout (Full Scaffold)

The shell must accommodate all future phases. Recommended layout:

```
┌─────────────────────────────────────────────────────┐
│  Toolbar (record controls, device selector) - Phase 2│
├─────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │  Waveform panel  │  │  Transcript panel         │ │
│  │  (Phase 3)       │  │  (Phase 2+)               │ │
│  └──────────────────┘  └──────────────────────────┘ │
│  ┌────────────────────────────────────────────────┐  │
│  │  Annotation panel (Phase 4)                    │  │
│  └────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  Status bar (sidecar status, model status)           │
└─────────────────────────────────────────────────────┘
```

**Vue component structure:**
```
App.vue
├── OnboardingView.vue  (shows when model missing or downloading)
└── AppShellView.vue    (shows when model ready)
    ├── AppToolbar.vue  (empty in Phase 1, filled in Phase 2)
    ├── WaveformPanel.vue (empty/hidden in Phase 1)
    ├── TranscriptPanel.vue (empty in Phase 1)
    ├── AnnotationPanel.vue (empty/hidden in Phase 1)
    └── AppStatusBar.vue (sidecar status indicator)
```

**App.vue routing logic:**
```vue
<template>
  <OnboardingView v-if="showOnboarding" />
  <AppShellView v-else />
  <SidecarErrorDialog v-if="sidecarError" :error="sidecarError" />
</template>
```

---

## 7. Sidecar Failure — Blocking Error Dialog

**Pattern:** A `<dialog>` element as a Vue component, shown when sidecar fails. Not dismissible.

```vue
<!-- SidecarErrorDialog.vue -->
<template>
  <dialog ref="dialogRef" open>
    <h2>Sidecar Failed to Start</h2>
    <p>{{ error }}</p>
    <button @click="restartApp">Restart App</button>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
const props = defineProps<{ error: string }>()
const dialogRef = ref<HTMLDialogElement>()

onMounted(() => {
  dialogRef.value?.showModal()
  // Prevent close on Escape key
  dialogRef.value?.addEventListener('cancel', e => e.preventDefault())
})

function restartApp() {
  window.api.restartApp()
}
</script>
```

The `dialog` uses `showModal()` for a native blocking overlay. `cancel` event is intercepted to prevent Escape from closing it.

---

## 8. Onboarding View — Model Status States

```vue
<!-- OnboardingView.vue — state machine approach -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

type ModelState = 'checking' | 'present' | 'downloading' | 'missing' | 'error'
const state = ref<ModelState>('checking')
const progress = ref(0)

onMounted(async () => {
  const status = await window.api.getModelStatus()
  state.value = status.state === 'present' ? 'present' : status.state
  // If present, App.vue will switch to AppShellView
})

async function startDownload() {
  state.value = 'downloading'
  window.api.onModelProgress(p => { progress.value = p })
  await window.api.downloadModel()
  state.value = 'present'
}
</script>
```

Status badge copy:
- `present` → "Model ready ✓" (transitions to app shell automatically)
- `downloading` → "Downloading Whisper large-v3… {N}%"
- `missing` → "Model not downloaded" + "Download (~3 GB)" button
- `error` → "Download failed — retry?"

---

## 9. Pinia Store Design

**useSidecarStore:**
```typescript
export const useSidecarStore = defineStore('sidecar', {
  state: () => ({
    port: null as number | null,
    status: 'starting' as 'starting' | 'ready' | 'error',
    error: null as string | null,
  }),
  actions: {
    async initialize() { ... }
  }
})
```

**useModelStore:**
```typescript
export const useModelStore = defineStore('model', {
  state: () => ({
    status: 'checking' as ModelStatus['state'],
    progress: 0,
  })
})
```

---

## 10. Key Packages — Final List

| Package | Version | Purpose |
|---|---|---|
| electron | ^33 | Desktop shell |
| electron-vite | ^2 | Build tool |
| electron-builder | ^25 | Packaging |
| vue | ^3.5 | UI |
| typescript | ^5.6 | Types |
| pinia | ^2.2 | State |
| @vueuse/core | ^11 | Composables |
| get-port | ^7 | Find free port for sidecar |
| fastapi | ^0.115 | Python API |
| uvicorn[standard] | ^0.32 | ASGI server |
| faster-whisper | ^1.1 | Whisper inference |
| huggingface_hub | latest | Model download |
| python-multipart | ^0.0.12 | File uploads (Phase 2+) |

---

## Pitfall Mitigations for This Phase

- **P5 (contextIsolation):** Set `contextIsolation: true`, `nodeIntegration: false` in BrowserWindow options from day one — electron-vite scaffold sets this by default; verify it's not changed.
- **P2 (sidecar bundling):** In dev mode, use `poetry run python -m app.main`. In production, use PyInstaller binary from `process.resourcesPath`. Branch on `app.isPackaged`.
- **macOS mic entitlements:** Add `entitlements.mac.plist` to project now (even though mic not used until Phase 2) so packaging works from the start.

## RESEARCH COMPLETE
