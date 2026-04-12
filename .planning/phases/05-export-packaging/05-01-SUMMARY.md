# Plan 05-01 Summary: Markdown Export

**Status:** Complete
**Completed:** 2026-04-12

## What Was Built

Updated sidecar `/transcribe` to return `segments[]` with `{id, start, end, text}` and added `segmentId` to each word. Updated `useTranscriptStore` with `Segment` interface, `segmentId` on `Word`, and `segments[]` state. Session save/restore includes segments. Added `export:markdown` IPC handler (main process): `dialog.showSaveDialog` → write `.md` via `fs.writeFile` → copy assets via `fs.copyFile`. Exposed `window.api.exportMarkdown`. Added export button to `AnnotationPanel` header (disabled without transcript). `exportMarkdown()` builds Markdown: one line per Whisper segment, inline `![]()` for images, `[url](url)` for links, `[^N]` footnotes for text/audio with `[^N]: content` section at bottom.

## Self-Check: PASSED

EXPORT-01–05 addressed. TypeScript clean. Sidecar Python imports clean.
