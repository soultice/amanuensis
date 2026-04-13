---
created: 2026-04-13T11:32:11.749Z
title: Wrap export output in dedicated subfolder
area: general
files:
  - src/renderer/src/components/AnnotationPanel.vue:107-155
  - src/main/index.ts:186-215
---

## Problem

When the user exports a transcript, the app writes `transcript.md` directly into the
user-chosen target folder and creates an `assets/` subfolder alongside it. This means
the export "output" is two separate items at the same directory level, which makes
zipping, moving, or sharing the export more cumbersome — the user has to select both
`transcript.md` and `assets/` manually.

## Solution

On export, create a new subfolder inside the chosen target directory (e.g. named
`transcript/` or derived from a title/timestamp), then write `transcript.md` and
`assets/` inside that subfolder. The user picks the *parent* directory; the app owns
naming the subfolder. This makes the full export a single folder the user can
zip/move/share in one action.

Implementation touch points:
- `src/main/index.ts` — `ipcMain.handle('export:markdown', ...)` creates the output
  path and copies assets; needs to mkdir a subfolder and adjust paths
- `src/renderer/src/components/AnnotationPanel.vue` — `exportMarkdown()` assembles
  the asset copy list with relative dest paths; `assets/` prefix should still work
  relative to the new subfolder
