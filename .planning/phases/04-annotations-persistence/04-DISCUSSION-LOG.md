# Phase 4: Annotations & Persistence - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 04-annotations-persistence
**Areas discussed:** Annotation trigger, Annotated spans visual, Move annotation UX, Auto-save feedback

---

## Annotation Trigger

| Option | Description | Selected |
|---|---|---|
| Toolbar button | "Add annotation" appears in toolbar when word range selected | |
| AnnotationPanel button | Button appears in bottom panel when selection is active | |
| Floating button | Button floats near selected text in transcript | ✓ |

**User's choice:** Floating button — "add annotation button appears floating"

**Notes:** CSS Anchor Positioning anchors the floating button to the last selected word span.

---

## Annotated Spans Visual

| Option | Description | Selected |
|---|---|---|
| Colored underline | Different color underline (e.g., orange) on annotated spans | |
| Superscript badge | Small numbered badge after the last word in the range | ✓ |
| Background tint | Subtle background on annotated word range | |

**User's choice:** Superscript badge number — "small superscript badge number"

**Notes:** Avoids conflict with blue playback underline and blue selection tint. Badge number corresponds to annotation order in transcript.

---

## Move Annotation UX

| Option | Description | Selected |
|---|---|---|
| Select then "Move here" | Select new range, click "Move here" on annotation | |
| Edit dialog re-selection | Edit dialog has "Change range" button | |
| Drag and drop | Drag annotation card from panel, drop on transcript word span | ✓ |

**User's choice:** Drag and drop — "move annotation can be dragged and dropped"

**Notes:** Source is the annotation card in AnnotationPanel; drop target is a word span in TranscriptPanel. Dropping onto an already-annotated span is blocked (non-overlap enforcement).

---

## Auto-Save Feedback

| Option | Description | Selected |
|---|---|---|
| Silent | No UI — saves happen invisibly in background | ✓ |
| "Saved" flash | Brief indicator in status bar after each save | |
| Persistent counter | "Last saved: X seconds ago" in status bar | |

**User's choice:** Silent — "auto save feedback silent"

**Notes:** Save-on-close is also silent. Atomic writes + backup rotation ensure reliability without needing user-visible confirmation.

---

## Agent's Discretion

- CSS Anchor Positioning syntax for floating button and dialog
- Drag-and-drop implementation (HTML5 native vs library)
- Floating button animation
- `<dialog>` visual design
- Badge styling (size, color, font)

## Deferred Ideas

None.
