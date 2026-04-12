# Phase 4: Annotations & Persistence - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

User can attach, edit, move, and remove image/text/link/audio annotations on word ranges. A CSS-anchored `<dialog>` opens adjacent to the selection for creating/editing. Annotations cannot overlap. The session (audio path, transcript, annotations) is auto-saved every 30s with atomic writes and restored on relaunch.

</domain>

<decisions>
## Implementation Decisions

### Annotation Trigger
- **D-01:** When a word range is selected, a **floating "Add annotation" button** appears near the selected text in the transcript — positioned via CSS Anchor Positioning anchored to the last selected word span.
- **D-02:** The floating button disappears when the word range is deselected.
- **D-03:** The CSS-anchored `<dialog>` for creation/editing (ANNOT-09) also uses CSS Anchor Positioning anchored to the selected word range.

### Annotated Spans Visual
- **D-04:** Annotated word ranges are indicated by a **small superscript badge number** after the last word in the range (e.g., `word¹`). Badge numbers correspond to the annotation's position in the transcript (ordered by word index).
- **D-05:** No background tint or underline on annotated spans — the badge is the sole visual indicator. This avoids conflict with the blue playback underline and the blue selection tint.

### Move Annotation UX
- **D-06:** Moving an annotation (ANNOT-06) uses **drag and drop** — the user drags an annotation card from `AnnotationPanel` and drops it onto a word span in the transcript.
- **D-07:** On drop, the annotation's word range is updated to the drop target's word index (single word). If the user needs a multi-word range for the moved annotation, they use the edit dialog afterward.
- **D-08:** Drop target validation: dropping onto a span already covered by a different annotation is blocked (non-overlap enforcement, ANNOT-08).

### Auto-Save Feedback
- **D-09:** Auto-save is **completely silent** — no toast, no status bar update, no indicator. The user trusts it is happening.
- **D-10:** Save-on-close (SESSION-02) is also silent — it happens synchronously before the window closes, no notification.

### Non-Overlap Enforcement
- **D-11:** When the user has a word range selected and clicks "Add annotation," the app checks whether the selection overlaps any existing annotation. If it does, the floating button is replaced with a visual indicator that the range is occupied (e.g., button is disabled with a tooltip "Range already annotated").
- **D-12:** Word indices are the source of truth for overlap detection (from Phase 1 KEY DECISION: "Word indices are the source of truth").

### Session Persistence
- **D-13:** Session file stored at `app.getPath('userData')/sessions/current.json`. Atomic write: write to `.tmp`, then `fs.rename()`. Three-file backup rotation (`current.json`, `backup-1.json`, `backup-2.json`).
- **D-14:** On restore, the app checks `audioBlobUrl` path validity. If the audio file no longer exists, restore transcript and annotations but show a warning that the audio file is missing.
- **D-15:** Image and audio clip annotation assets are stored in `app.getPath('userData')/sessions/assets/` during the session.

### Agent's Discretion
- Exact CSS Anchor Positioning syntax for the floating button and dialog
- Drag-and-drop library choice (native HTML5 drag API vs a Vue drag library)
- Animation/transition on the floating button appearance
- `<dialog>` visual design (card style, shadow, border)
- Exact badge styling (superscript size, color, font)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — ANNOT-01 through ANNOT-10, SESSION-01 through SESSION-03

### Architecture decisions (from research)
- `.planning/research/ARCHITECTURE.md` — Session data model (`{version, createdAt, audioPath, transcript: {words}, annotations: [{id, wordStartIdx, wordEndIdx, type, content, assetFilename}]}`), atomic write pattern, asset storage in userData
- `.planning/research/PITFALLS.md` — P7 (auto-save atomicity: `.tmp` + `fs.rename()`, 3-file backup rotation), P8 (CSS anchor scroll offset, `position-try-fallbacks`)

### Phase 3 output (selection foundation)
- `src/renderer/src/stores/playback.ts` — `selectionMin`, `selectionMax`, `hasSelection`, `clearSelection` — the word range selection that annotations attach to
- `src/renderer/src/components/TranscriptPanel.vue` — word spans are the anchor targets for the floating button and annotation dialog; `word-span--selected` class shows current selection
- `src/renderer/src/components/AnnotationPanel.vue` — empty placeholder that Phase 4 fills with the annotation list

### Project context
- `.planning/PROJECT.md` — "Annotations: Non-overlapping, tied to word-range spans in the transcript"; "Text-first annotation" principle
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-08/D-09: Poetry; D-06/D-07: blocking error dialog (pattern for critical error feedback)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `playbackStore.selectionMin` / `selectionMax` — word index range for new annotation target
- `playbackStore.hasSelection` — controls when floating "Add annotation" button appears
- `playbackStore.clearSelection()` — called after annotation is created (deselect)
- `transcriptStore.words[idx]` — word timestamps needed to map annotation word indices to audio time
- `SidecarErrorDialog.vue` — pattern for `<dialog>` with `showModal()` (Phase 1)

### Established Patterns
- Pinia store per concern — add `useAnnotationStore` for annotation CRUD + overlap detection
- Pinia store per concern — add `useSessionStore` for auto-save, save-on-close, restore
- CSS scoped styles with BEM-ish naming (`.word-span--selected`, `.level-meter__bar`)
- IPC via `contextBridge` for file system operations — file picker and asset copy go through `window.api`

### Integration Points
- `TranscriptPanel.vue` — add floating "Add annotation" button (CSS anchored to selection); add superscript badges on annotated word spans
- `AnnotationPanel.vue` — replace placeholder with annotation list (drag source for move)
- `AppShellView.vue` — may need `useAnnotationStore` and `useSessionStore` initialization
- `src/main/index.ts` — add IPC handlers for `session:save`, `session:load`, `dialog:openFile`, `session:getAssetsDir`

</code_context>

<specifics>
## Specific Ideas

- Floating button anchored to the last selected word's `<span>` — appears just above or below the selection, not in the toolbar
- Superscript badge `¹` style inline in the text flow — small, muted color, doesn't disrupt reading
- Drag and drop from AnnotationPanel cards onto transcript word spans — the "landing zone" highlight should be the word span, not the entire panel
- Silent auto-save means zero UI overhead — the save happens in background, user never notices unless they look at the session file

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-annotations-persistence*
*Context gathered: 2026-04-12*
