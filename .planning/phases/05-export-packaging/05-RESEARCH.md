# Phase 5: Export & Packaging - Research

*Researched: 2026-04-12*

## Goal

(1) Export annotated transcript as `.md` + `assets/` via `dialog.showSaveDialog`. (2) Package the app with PyInstaller sidecar binary via electron-builder `extraResources`.

---

## 1. Segment Boundaries — Required for One-Line-per-Segment Export

**Current state:** The sidecar `/transcribe` endpoint returns `words[]` but discards segment boundaries. The Phase 5 CONTEXT requires "one line per Whisper segment."

**Fix:** The sidecar must return segment metadata alongside words.

**Updated sidecar response:**
```json
{
  "words": [{"id": 0, "word": "Hello", "start": 0.0, "end": 0.42, "probability": 0.99, "segmentId": 0}],
  "segments": [{"id": 0, "start": 0.0, "end": 2.4, "text": "Hello world..."}],
  "language": "en",
  "duration": 60.5
}
```

**Sidecar changes:**
```python
segments_list = []
words = []
word_id = 0
for seg_idx, segment in enumerate(segments):
    segments_list.append({"id": seg_idx, "start": round(segment.start, 3), "end": round(segment.end, 3), "text": segment.text.strip()})
    if segment.words:
        for w in segment.words:
            words.append({..., "segmentId": seg_idx})
```

**Frontend changes:**
- Add `Segment` interface: `{id: number; start: number; end: number; text: string}`
- Add `segments: Segment[]` to `useTranscriptStore` state
- Restore `segments` from session JSON alongside `words`

---

## 2. Markdown Export Logic

**Export algorithm:**

```typescript
function buildMarkdown(
  words: Word[],
  segments: Segment[],
  annotations: Annotation[],
  assetsDir: string
): { markdown: string; assetsToCopy: Array<{src: string; dest: string}> } {

  const sortedAnnotations = [...annotations].sort((a, b) => a.wordStartIdx - b.wordStartIdx)
  const footnotes: string[] = []
  let footnoteNum = 0

  // Map: wordEndIdx → annotation
  const annotationByEnd = new Map<number, Annotation>()
  for (const ann of sortedAnnotations) {
    annotationByEnd.set(ann.wordEndIdx, ann)
  }

  // Build per-word annotation markers
  const wordAnnotationMarker = new Map<number, string>()
  const assetsToCopy: Array<{src: string; dest: string}> = []

  for (const ann of sortedAnnotations) {
    let marker = ''
    if (ann.type === 'image' && ann.assetFilename) {
      marker = `![](assets/${ann.assetFilename})`
      assetsToCopy.push({ src: `${assetsDir}/${ann.assetFilename}`, dest: ann.assetFilename })
    } else if (ann.type === 'link') {
      marker = `[${ann.content}](${ann.content})`
    } else {
      // text or audio → footnote
      footnoteNum++
      const n = footnoteNum
      if (ann.type === 'audio') {
        footnotes.push(`[^${n}]: 🎵 ${ann.assetFilename ?? ann.content}`)
        if (ann.assetFilename) {
          assetsToCopy.push({ src: `${assetsDir}/${ann.assetFilename}`, dest: ann.assetFilename })
        }
      } else {
        footnotes.push(`[^${n}]: ${ann.content}`)
      }
      marker = `[^${n}]`
    }
    wordAnnotationMarker.set(ann.wordEndIdx, marker)
  }

  // Build segment lines
  const lines: string[] = ['# Transcript', '']
  for (const segment of segments) {
    const segWords = words.filter(w => w.segmentId === segment.id)
    let line = segWords.map(w => {
      const marker = wordAnnotationMarker.get(w.id) ?? ''
      return w.word + marker
    }).join('')
    lines.push(line.trim())
  }

  // Footnotes section
  if (footnotes.length > 0) {
    lines.push('')
    lines.push('---')
    lines.push('')
    footnotes.forEach(f => lines.push(f))
  }

  return { markdown: lines.join('\n'), assetsToCopy }
}
```

---

## 3. Electron Export IPC

**Main process handler:**
```typescript
ipcMain.handle('export:markdown', async (_event, payload: {
  markdown: string
  assetsToCopy: Array<{ src: string; dest: string }>
}) => {
  const result = await dialog.showSaveDialog({
    title: 'Export Transcript',
    defaultPath: 'transcript.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (result.canceled || !result.filePath) return { canceled: true }

  const mdPath = result.filePath
  const outputDir = path.dirname(mdPath)
  const assetsDir = path.join(outputDir, 'assets')

  await fsPromises.mkdir(assetsDir, { recursive: true })
  await fsPromises.writeFile(mdPath, payload.markdown, 'utf-8')

  for (const { src, dest } of payload.assetsToCopy) {
    try {
      await fsPromises.copyFile(src, path.join(assetsDir, dest))
    } catch (err) {
      console.error('[export] Failed to copy asset:', src, err)
    }
  }

  return { canceled: false, filePath: mdPath }
})
```

**Preload + env.d.ts:**
```typescript
exportMarkdown: (payload: { markdown: string; assetsToCopy: Array<{src: string; dest: string}> }): Promise<{ canceled: boolean; filePath?: string }> =>
  ipcRenderer.invoke('export:markdown', payload)
```

---

## 4. PyInstaller — Sidecar Binary

**Build command (run from project root):**
```bash
cd sidecar
poetry run pyinstaller \
  --onedir \
  --name amanuensis-sidecar \
  --distpath ../dist-sidecar \
  --workpath ../build-sidecar \
  app/main.py
```

`--onedir` (not `--onefile`) is preferred because:
- `--onefile` extracts to a temp dir on every launch (slow, 30+ seconds)
- `--onedir` launches immediately — critical for Electron startup UX
- faster-whisper + ctranslate2 have many native libs that work better as a directory

**PyInstaller spec file (`sidecar/amanuensis-sidecar.spec`):**
```python
# -*- mode: python ; coding: utf-8 -*-
block_cipher = None

a = Analysis(
    ['app/main.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'faster_whisper',
        'ctranslate2',
        'huggingface_hub',
    ],
    hookspath=[],
    cipher=block_cipher,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name='amanuensis-sidecar',
    console=True,
)
coll = COLLECT(exe, a.binaries, a.zipfiles, a.datas, name='amanuensis-sidecar')
```

---

## 5. electron-builder `extraResources` Config

**package.json `build` section update:**
```json
"build": {
  "appId": "com.amanuensis.app",
  "productName": "Amanuensis",
  "extraResources": [
    {
      "from": "dist-sidecar/amanuensis-sidecar",
      "to": "sidecar",
      "filter": ["**/*"]
    }
  ],
  "mac": {
    "entitlementsInherit": "build/entitlements.mac.plist",
    "extendInfo": {
      "NSMicrophoneUsageDescription": "Amanuensis needs microphone access to record audio for transcription."
    }
  },
  "win": { "target": "nsis" },
  "linux": { "target": "AppImage" }
}
```

**In `src/main/sidecar.ts`, production path:**
```typescript
const binaryName = process.platform === 'win32' ? 'amanuensis-sidecar.exe' : 'amanuensis-sidecar'
const binaryDir = path.join(process.resourcesPath, 'sidecar')
command = path.join(binaryDir, binaryName)
```

**npm scripts to add:**
```json
"build:sidecar": "cd sidecar && poetry run pyinstaller amanuensis-sidecar.spec --distpath ../dist-sidecar --workpath ../build-sidecar --clean",
"build:all": "npm run build:sidecar && npm run build && npm run build:electron"
```

## RESEARCH COMPLETE
