# Phase 5: Export & Packaging - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Export the annotated transcript as a `.md` file with an adjacent `assets/` folder, with annotations injected at their word-range position in correct Markdown form. Package the app as installable binaries for macOS (`.dmg`), Windows (`.exe`), and Linux (`.AppImage`) with no Python installation required on the target machine.

</domain>

<decisions>
## Implementation Decisions

### Export Trigger
- **D-01:** The "Export" button lives in the **AnnotationPanel header** — it appears at the top of the bottom panel alongside the annotation list.
- **D-02:** Clicking "Export" opens a native save dialog (via `dialog.showSaveDialog`) to choose the output directory. The `.md` file and `assets/` folder are written there.
- **D-03:** Export is only enabled when the transcript exists. The button is disabled (with a tooltip) if `transcriptStore.hasTranscript` is false.

### Footnote Format (EXPORT-04)
- **D-04:** Text and audio annotations use **standard Markdown footnote syntax**:
  - Inline reference at the annotation position: `word[^N]` where N is a sequential footnote number
  - Footnotes section at the document bottom: `[^N]: content text` for text annotations; `[^N]: 🎵 filename.mp3` for audio annotations
- **D-05:** Footnote numbers are assigned in the order annotations appear in the transcript (by `wordStartIdx` ascending).

### Transcript Paragraph Structure (EXPORT-01)
- **D-06:** The transcript is exported as **one line per Whisper segment** (not one continuous paragraph, not one word per line). Each segment produces its own text line.
- **D-07:** Annotations are injected **inline** at the position of their last annotated word: image as `![](assets/filename)`, hyperlink as `[display text](url)` (display text = the URL hostname or the word text), footnote reference as `[^N]`. These appear directly after the last word of the annotation range, before the newline.
- **D-08:** The exported document structure:
  ```markdown
  # Transcript

  [segment 1 text with inline annotations][^1]
  [segment 2 text with inline annotations]
  [segment 3 text with inline annotation ![](assets/image.png)]
  ...

  ---

  [^1]: The footnote text content here
  [^2]: 🎵 audio-clip.mp3
  ```

### Markdown Export Logic
- **D-09:** Annotations are injected sorted by `wordStartIdx` ascending — the order they appear in the text.
- **D-10:** Image annotation export: copy asset file from `userData/sessions/assets/` to `{outputDir}/assets/{filename}`, then inject `![](assets/{filename})` after the last word in the range.
- **D-11:** Link annotation export: inject `[{content}]({content})` (content is the URL) after the last word in the range.
- **D-12:** The export IPC handler runs in the main process: receives the session data, writes the `.md` file, copies image/audio assets to `{outputDir}/assets/`.

### Python Sidecar Packaging
- **D-13:** Use **PyInstaller** to build the Python sidecar into a standalone binary per platform. The binary is included in the Electron app bundle via `electron-builder` `extraResources`.
- **D-14:** Model weights (~3GB for Whisper large-v3) are **not bundled** — they live in `userData/models/`. The onboarding screen (Phase 1) handles first-run download.
- **D-15:** CI targets: macOS (arm64 + x86_64 universal), Windows (x64 `.exe` NSIS installer), Linux (x64 `.AppImage`).

### Agent's Discretion
- Exact export button label and icon
- PyInstaller spec file contents and hook configuration
- electron-builder CI/CD configuration (GitHub Actions or local build scripts)
- Error handling for export failures (disk full, permission denied)
- Whether to include a `README.md` in the export output folder

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — EXPORT-01 through EXPORT-05 (the five export requirements)

### Phase 1 packaging groundwork
- `build/entitlements.mac.plist` — macOS entitlements (mic permission, JIT) already committed in Phase 2
- `package.json` §build — `electron-builder` build config (appId, mac/win/linux targets) already present; Phase 5 adds `extraResources` for PyInstaller binary

### Phase 4 annotation model (export source)
- `src/renderer/src/stores/annotation.ts` — `Annotation` interface `{id, wordStartIdx, wordEndIdx, type, content, assetFilename}`; `sortedAnnotations` getter returns annotations by wordStartIdx

### Architecture research
- `.planning/research/STACK.md` — PyInstaller 6.15, electron-builder 25 versions
- `.planning/research/PITFALLS.md` — P2 (PyInstaller bundling cross-platform, CI build strategy)

### Phase 5 integration points
- `src/renderer/src/components/AnnotationPanel.vue` — export button goes in this component's header
- `src/renderer/src/stores/transcript.ts` — `words[]` array with word objects; transcript must be segmented for per-segment export
- `sidecar/app/main.py` — sidecar is the PyInstaller target; must be buildable via `pyinstaller app/main.py`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useAnnotationStore.sortedAnnotations` — already sorted by `wordStartIdx`; ready for export iteration
- `useTranscriptStore.words[]` — `Word` objects with `{id, word, start, end}`; export maps words to segments
- `window.api` contextBridge pattern — add `exportMarkdown(data)` IPC channel for main process file writing
- Phase 4 session IPC pattern — `session:copyAsset`, `session:getAssetsDir` — reuse for locating source assets

### Established Patterns
- IPC via contextBridge: all file system operations go through `ipcMain.handle` in main process
- `dialog.showSaveDialog` (main process) returns the chosen path; renderer calls via `window.api`
- Native save dialog pattern established in research Phase 1

### Integration Points
- `AnnotationPanel.vue` — add export button in component header (top row)
- `src/main/index.ts` — add `ipcMain.handle('export:markdown', ...)` handler
- `src/preload/index.ts` — expose `exportMarkdown` in `window.api`
- `sidecar/` — add `amanuensis-sidecar.spec` PyInstaller spec file
- `package.json` — add `extraResources` for packaged sidecar binary + build scripts

</code_context>

<specifics>
## Specific Ideas

- Export button in AnnotationPanel header, enabled only when transcript exists
- Standard footnote syntax keeps the exported `.md` clean and compatible with all Markdown renderers
- One line per segment mirrors how Whisper naturally segments speech — natural reading rhythm
- Annotations inject right after the last word of their range, on the same line as the segment text

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-export-packaging*
*Context gathered: 2026-04-12*
