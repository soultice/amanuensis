# Architecture Research: Amanuensis

*Researched: 2026-04-12*

## Component Map

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                          │
│                                                          │
│  ┌──────────────────────┐    ┌──────────────────────┐   │
│  │   Renderer Process   │    │    Main Process       │   │
│  │   (Vue 3 + Vite)     │◄──►│    (Node.js)          │   │
│  │                      │IPC │                       │   │
│  │  - Audio capture     │    │  - App lifecycle       │   │
│  │  - Waveform display  │    │  - Window management  │   │
│  │  - Transcript view   │    │  - File system I/O    │   │
│  │  - Annotation UI     │    │  - Sidecar management │   │
│  │  - Export trigger    │    │  - Auto-save scheduler│   │
│  └──────────┬───────────┘    └──────────┬────────────┘   │
│             │ HTTP                       │ spawn/kill     │
│             │ (localhost:PORT)           │                │
│             ▼                           ▼                │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Python Sidecar                       │   │
│  │   FastAPI + faster-whisper                        │   │
│  │                                                   │   │
│  │   POST /transcribe  → word timestamps JSON        │   │
│  │   GET  /health      → port ready check            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## IPC Pattern (Renderer ↔ Main)

**Security model:** `contextIsolation: true`, `nodeIntegration: false` (required).

Communication flows through a `preload.ts` script that exposes a typed API via `contextBridge`:

```
Renderer → contextBridge.exposeInMainWorld('api', {...})
         → ipcRenderer.invoke('channel', payload)
         → ipcMain.handle('channel', handler)
         → Node.js / file system / sidecar port
```

Channels needed:
- `session:save` — write session JSON to userData
- `session:load` — read session JSON from userData
- `session:export` — write .md + copy assets to chosen directory
- `dialog:openFile` — trigger native file picker
- `sidecar:getPort` — return the port the Python sidecar is listening on
- `app:ready` — signal sidecar has started

**Renderer → Python sidecar (HTTP):**

Once port is known, renderer calls Python API directly:
```
POST http://localhost:{port}/transcribe
  body: multipart/form-data { audio: File }
  response: { segments: [{id, start, end, text, words: [{word, start, end, probability}]}] }
```

This avoids routing large audio file data through Electron IPC (avoids serialization overhead).

## Data Flow

```
1. User selects audio device
   └─ navigator.mediaDevices.enumerateDevices() in renderer

2. User records audio
   └─ MediaRecorder API → chunks → Blob → ArrayBuffer
   └─ Sent to Python sidecar as multipart/form-data

3. Python transcribes
   └─ faster-whisper large-v3, word_timestamps=True, language="auto"
   └─ Returns: segments with per-word {word, start, end, probability}

4. Renderer receives transcript
   └─ Flat array of Word objects: {id, word, start, end}
   └─ Rendered as inline <span data-word-id="..." data-start="..." data-end="...">

5. User selects words
   └─ MouseEvent range selection on word spans
   └─ Derives {startTime, endTime} from span dataset attributes
   └─ WaveSurfer Regions plugin creates region from startTime → endTime

6. User attaches annotation
   └─ CSS-anchored <dialog> opens at selection
   └─ Annotation stored: {id, wordStartIdx, wordEndIdx, type, content, assetPath?}

7. Auto-save
   └─ Main process debounced timer (every 30s) + Pinia store watcher
   └─ Writes session.json to app.getPath('userData')/sessions/current.json

8. Export
   └─ User chooses output directory via native dialog
   └─ Main process walks annotations in word-index order
   └─ Builds Markdown string, copies image files to {outputDir}/assets/
   └─ Writes {outputDir}/transcript.md
```

## Session Data Model

```json
{
  "version": 1,
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "audioPath": "absolute/path/to/recording.webm",
  "transcript": {
    "language": "en",
    "words": [
      { "id": 0, "word": "Hello", "start": 0.0, "end": 0.42 },
      { "id": 1, "word": "world", "start": 0.45, "end": 0.89 }
    ]
  },
  "annotations": [
    {
      "id": "uuid",
      "wordStartIdx": 3,
      "wordEndIdx": 7,
      "type": "image|audio|text|link",
      "content": "text content or URL",
      "assetFilename": "uuid.png"
    }
  ]
}
```

Assets (images, audio clips) are stored in `app.getPath('userData')/sessions/assets/` during the session, then copied to the export `assets/` folder on export.

## Python Sidecar Startup Sequence

```
1. App starts → main process spawns PyInstaller binary
2. Sidecar binds to random available port, writes port to stdout
3. Main process reads port from stdout, stores it
4. Renderer requests port via ipcRenderer.invoke('sidecar:getPort')
5. Renderer begins polling GET /health until 200 OK
6. Transcribe button enabled
```

## Suggested Build Order

```
Phase 1 — Foundation
  ├─ electron-vite scaffold (main + renderer + preload)
  ├─ Python sidecar (FastAPI + faster-whisper /transcribe endpoint)
  ├─ IPC bridge (contextBridge channels)
  └─ Sidecar spawn + health check

Phase 2 — Audio & Transcription
  ├─ Device enumeration + selection UI
  ├─ MediaRecorder capture + level meter
  ├─ Audio upload to sidecar + transcription progress
  └─ Word array state in Pinia

Phase 3 — Transcript + Waveform
  ├─ Word span rendering
  ├─ WaveSurfer integration + playback
  ├─ Word click → seek audio
  ├─ Word range selection
  └─ WaveSurfer region highlighting on selection

Phase 4 — Annotations
  ├─ CSS Anchor + <dialog> annotation UI
  ├─ Image from file picker + clipboard paste
  ├─ Annotation CRUD (create, edit, move, remove)
  ├─ Non-overlap enforcement
  └─ Session persistence (save/load)

Phase 5 — Export + Packaging
  ├─ Markdown generation with annotation injection
  ├─ Asset copy to output folder
  ├─ electron-builder + PyInstaller bundling
  └─ Auto-save + save-on-close
```

## Key Architectural Constraints

- **Audio file must stay on disk** — do not hold entire recording in memory. Write chunks to `userData` as they come in.
- **Word indices are the source of truth** for annotation positions — not character offsets. Word indices are stable after transcription.
- **Python sidecar is stateless** — it does not store session data. All state lives in the Electron main process and renderer.
- **Renderer never touches the file system directly** — all disk I/O goes through IPC to main process (security model requirement).
