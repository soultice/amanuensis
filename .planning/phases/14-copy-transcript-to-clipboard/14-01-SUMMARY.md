---
plan: 14-01
phase: 14
status: complete
completed: 2026-04-14
---
# Summary: Plan 14-01 — Copy Transcript to Clipboard

- Added `copied` ref and `copyTranscriptText()` async function to `AnnotationPanel.vue`
- `copyTranscriptText()`: joins `transcriptStore.words.map(w => w.word).join('').trim()` and writes to clipboard
- Button shows `⎘ Copy` normally, `✓ Copied` for 1.5s after copy, then reverts
- Button disabled when `!transcriptStore.hasTranscript`
- CSS: `.copy-btn` styled with neutral background, accent border on hover (distinct from Export button)
- `npm run build` passes cleanly
