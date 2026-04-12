# Phase 4: Annotations & Persistence - Research

*Researched: 2026-04-12*

## Goal

Build annotation CRUD with CSS-anchored dialog, floating "Add" button, superscript badges, drag-to-move, non-overlap enforcement, and atomic session persistence (auto-save every 30s, save-on-close, restore on relaunch).

---

## 1. CSS Anchor Positioning for Dialog & Floating Button

**Browser support:** Fully supported in Chrome 125+ and Edge 125+. Electron 33+ ships Chromium 130+ — **no polyfill needed**.

**Core pattern:**

```css
/* Set anchor-name on the anchor element (applied via :style binding in Vue) */
/* Dynamic: set on the last word span in the selection */

/* Floating button — positioned above/right of selection end */
.annotation-float-btn {
  position: fixed;
  position-anchor: --selection-end;
  inset-area: top span-inline-end;
  position-try-fallbacks: bottom span-inline-end, top span-all, bottom span-all;
  margin: 6px;
}

/* Annotation dialog — opens adjacent to selection */
.annotation-dialog {
  position: fixed;
  position-anchor: --selection-end;
  inset-area: top span-inline-end;
  position-try-fallbacks: bottom span-inline-end, top, bottom;
  margin: 8px;
  /* Prevent closing on Escape ONLY when blocking (not here — dialog IS dismissible) */
}
```

**Vue dynamic anchor-name on word span:**

```vue
<!-- In TranscriptPanel, on the last selected word span: -->
<span
  v-for="word in transcriptStore.words"
  :key="word.id"
  class="word-span"
  :style="word.id === playbackStore.selectionMax ? { anchorName: '--selection-end' } : {}"
  ...
>
```

**Fallback for non-supporting browsers (not needed for Electron):** Use `getBoundingClientRect()` + `position: fixed`. Electron is always Chromium 130+ so the CSS anchor API is the primary approach.

---

## 2. Drag and Drop — Native HTML5 API (no library)

Native HTML5 drag API is sufficient for this use case (annotation card → word span). No library needed.

**Pattern:**

```typescript
// On AnnotationPanel card (drag source):
function onDragStart(event: DragEvent, annotationId: string): void {
  event.dataTransfer!.effectAllowed = 'move'
  event.dataTransfer!.setData('text/plain', annotationId)
}

// On word span (drop target):
function onDragOver(event: DragEvent): void {
  event.preventDefault()
  event.dataTransfer!.dropEffect = 'move'
  // Add visual hover class to the word span
}

function onDrop(event: DragEvent, wordIndex: number): void {
  event.preventDefault()
  const annotationId = event.dataTransfer!.getData('text/plain')
  annotationStore.moveAnnotation(annotationId, wordIndex)
}
```

**In Vue template (word spans):**
```vue
<span
  class="word-span"
  :class="{ 'word-span--drop-target': dragOverWordIndex === word.id }"
  @dragover.prevent="dragOverWordIndex = word.id"
  @dragleave="dragOverWordIndex = null"
  @drop="handleDrop($event, word.id)"
>
```

---

## 3. Annotation Data Model

```typescript
export type AnnotationType = 'image' | 'audio' | 'text' | 'link'

export interface Annotation {
  id: string              // UUID (crypto.randomUUID())
  wordStartIdx: number    // inclusive, index into transcriptStore.words[]
  wordEndIdx: number      // inclusive
  type: AnnotationType
  content: string         // for text/link: the text or URL; for image/audio: empty
  assetFilename: string | null  // for image/audio: filename in userData/sessions/assets/
  createdAt: string       // ISO timestamp
}
```

**`useAnnotationStore` state:**
```typescript
export const useAnnotationStore = defineStore('annotation', {
  state: () => ({
    annotations: [] as Annotation[],
  }),
  getters: {
    // Sorted by wordStartIdx for ordered display and overlap detection
    sortedAnnotations: (s) => [...s.annotations].sort((a, b) => a.wordStartIdx - b.wordStartIdx),
    // Check if a word range overlaps any existing annotation
    overlapsExisting: (s) => (startIdx: number, endIdx: number, excludeId?: string): boolean => {
      return s.annotations.some(a => {
        if (a.id === excludeId) return false
        // Overlap: ranges intersect if start1 <= end2 AND end1 >= start2
        return startIdx <= a.wordEndIdx && endIdx >= a.wordStartIdx
      })
    },
    // Get annotation for a specific word index (for badge rendering)
    annotationForWord: (s) => (wordIdx: number): Annotation | undefined => {
      return s.annotations.find(a => wordIdx >= a.wordStartIdx && wordIdx <= a.wordEndIdx)
    },
    // Get annotation where wordIdx is the LAST word (for badge rendering position)
    annotationEndingAtWord: (s) => (wordIdx: number): number | null => {
      const idx = [...s.annotations]
        .sort((a, b) => a.wordStartIdx - b.wordStartIdx)
        .findIndex(a => a.wordEndIdx === wordIdx)
      return idx >= 0 ? idx + 1 : null  // 1-indexed badge number
    },
  },
  actions: {
    addAnnotation(annotation: Annotation): void { ... },
    updateAnnotation(id: string, updates: Partial<Annotation>): void { ... },
    removeAnnotation(id: string): void { ... },
    moveAnnotation(id: string, newWordIdx: number): void { ... },
    clearAll(): void { this.annotations = [] },
  },
})
```

---

## 4. Electron IPC — New Handlers Needed

Add to `src/main/index.ts` via `contextBridge` + `ipcMain.handle`:

```typescript
// File picker for images and audio clips
ipcMain.handle('dialog:openFile', async (_event, options: { filters: Array<{name: string; extensions: string[]}> }) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters,
  })
  return result.canceled ? null : result.filePaths[0]
})

// Session save — atomic write
ipcMain.handle('session:save', async (_event, data: string) => {
  const sessionDir = path.join(app.getPath('userData'), 'sessions')
  await fs.mkdir(sessionDir, { recursive: true })
  const sessionPath = path.join(sessionDir, 'current.json')
  const tmpPath = path.join(sessionDir, 'current.json.tmp')
  await fs.writeFile(tmpPath, data, 'utf-8')
  await fs.rename(tmpPath, sessionPath)  // atomic
})

// Session load
ipcMain.handle('session:load', async () => {
  const sessionPath = path.join(app.getPath('userData'), 'sessions', 'current.json')
  try {
    return await fs.readFile(sessionPath, 'utf-8')
  } catch { return null }
})

// Assets directory
ipcMain.handle('session:getAssetsDir', async () => {
  const assetsDir = path.join(app.getPath('userData'), 'sessions', 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  return assetsDir
})

// Copy file to assets dir (for image/audio annotations)
ipcMain.handle('session:copyAsset', async (_event, srcPath: string) => {
  const assetsDir = path.join(app.getPath('userData'), 'sessions', 'assets')
  await fs.mkdir(assetsDir, { recursive: true })
  const ext = path.extname(srcPath)
  const filename = `${crypto.randomUUID()}${ext}`
  await fs.copyFile(srcPath, path.join(assetsDir, filename))
  return filename
})
```

**Clipboard handling in renderer (no IPC needed):**
```typescript
// Read image from clipboard
const clipboardItems = await navigator.clipboard.read()
for (const item of clipboardItems) {
  if (item.types.includes('image/png')) {
    const blob = await item.getType('image/png')
    // Convert blob to file path via temp file + IPC, OR store as data URL for session
  }
}

// Read text/URL from clipboard
const text = await navigator.clipboard.readText()
```

**Clipboard image handling:** Since saving requires a file path, convert clipboard image blob to a temp file via a new IPC handler `session:saveBlobAsAsset(buffer, ext)`.

---

## 5. Annotation Dialog Content by Type

### Image (ANNOT-01, ANNOT-02)
- File picker: `window.api.openFile({ filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','gif','webp'] }] })`
- Clipboard: read `image/png` or `image/jpeg` blob from clipboard
- Display: `<img>` thumbnail in the dialog after selection

### Audio clip (ANNOT-04)
- File picker: `window.api.openFile({ filters: [{ name: 'Audio', extensions: ['mp3','wav','ogg','m4a','webm'] }] })`
- Display: filename after selection

### Text / Hyperlink (ANNOT-03)
- Clipboard: `navigator.clipboard.readText()` → if URL pattern → type: 'link'; else type: 'text'
- Inline `<textarea>` or `<input>` in dialog for manual entry

---

## 6. Session Data Model (JSON)

```typescript
interface SessionData {
  version: 1
  savedAt: string            // ISO timestamp
  audioPath: string | null   // absolute path to recording file in userData
  transcript: {
    language: string
    duration: number
    words: Word[]            // from useTranscriptStore
  } | null
  annotations: Annotation[]  // from useAnnotationStore
}
```

**Auto-save trigger (SESSION-01):**
```typescript
// In useSessionStore, setInterval on mount, clearInterval on unmount
const autoSaveInterval = setInterval(async () => {
  await saveSession()
}, 30_000)
```

**Save-on-close (SESSION-02):**
```typescript
// In main process, before-quit event (already wired in Phase 1)
// Renderer sends 'session:requestSave' synchronously on beforeunload
window.addEventListener('beforeunload', (e) => {
  // Trigger synchronous save — IPC is async, so we use a flag
  window.api.triggerSave()
})
// OR: main process triggers save on will-quit, waits for renderer response
```

**Better pattern for save-on-close:** Main process sends `'session:save-now'` event to renderer on `before-quit`, renderer responds with session data, main process writes file, then allows quit.

**Restore (SESSION-03):**
```typescript
// On app start, after model is ready:
const raw = await window.api.loadSession()
if (raw) {
  const session: SessionData = JSON.parse(raw)
  // Restore transcript words
  transcriptStore.words = session.transcript?.words ?? []
  transcriptStore.language = session.transcript?.language ?? ''
  // Restore annotations
  annotationStore.annotations = session.annotations
  // Try to load audio
  if (session.audioPath && existsSync(session.audioPath)) {
    recordingStore.audioBlobUrl = `file://${session.audioPath}`
  }
}
```

---

## 7. Non-Overlap Enforcement (ANNOT-08)

When `playbackStore.hasSelection` is true:
- Check `annotationStore.overlapsExisting(selectionMin, selectionMax)`
- If overlap: floating button shows as disabled with visual indicator "Range already annotated"
- If no overlap: floating button is active, clicking opens dialog

---

## 8. Superscript Badge Rendering

In `TranscriptPanel`, after the last word in an annotated range, render a `<sup>`:

```vue
<template v-for="word in transcriptStore.words" :key="word.id">
  <span class="word-span" ...>{{ word.word }}</span>
  <!-- Show badge after the LAST word in an annotation range -->
  <sup
    v-if="annotationStore.annotationEndingAtWord(word.id) !== null"
    class="annotation-badge"
  >{{ annotationStore.annotationEndingAtWord(word.id) }}</sup>
</template>
```

```css
.annotation-badge {
  font-size: 0.6rem;
  color: #6b7280;
  vertical-align: super;
  cursor: default;
  user-select: none;
}
```

---

## 9. Key Pitfalls

- **P7 (auto-save atomicity):** On Windows, `fs.rename()` can fail with EPERM. Add a retry (max 3, 50ms delay) or use `write-file-atomic` npm package. Simplest: install `write-file-atomic` in Electron main.
- **P8 (CSS anchor scroll):** Use `position-try-fallbacks` to handle cases where the dialog would be clipped by the viewport. Test with long transcripts.
- **Clipboard image in Electron:** `navigator.clipboard.read()` requires `clipboard-read` permission. In Electron, grant this via `session.setPermissionRequestHandler`.
- **Dialog dismiss vs blocking:** The annotation dialog IS dismissible (user can press Escape to cancel) — unlike the SidecarErrorDialog. Do NOT call `e.preventDefault()` on the cancel event.

## RESEARCH COMPLETE
