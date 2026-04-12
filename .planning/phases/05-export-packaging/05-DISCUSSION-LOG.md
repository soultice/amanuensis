# Phase 5: Export & Packaging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 05-export-packaging
**Areas discussed:** Export trigger, Footnote format, Transcript paragraph structure

---

## Export Trigger

| Option | Description | Selected |
|---|---|---|
| Toolbar button | Export button in the recording controls toolbar — already crowded | |
| Status bar button | Dedicated button in AppStatusBar at bottom of screen | |
| AnnotationPanel header | Export button at top of annotation list panel | ✓ |

**User's choice:** AnnotationPanel header — "button in the annotation panel header"

**Notes:** Logical placement — near the annotations that are being exported. Disabled when no transcript.

---

## Footnote Format

| Option | Description | Selected |
|---|---|---|
| Standard footnote syntax | `word[^N]` inline + `[^N]: content` section at bottom | ✓ |
| Inline blockquote | `> 📝 text content` immediately after word range | |
| Inline bold | `**[Note: text content]**` inserted inline | |

**User's choice:** Standard footnote syntax — "uses standard footnote syntax"

**Notes:** Most Markdown-compatible. Sequential footnote numbers by wordStartIdx order.

---

## Transcript Paragraph Structure

| Option | Description | Selected |
|---|---|---|
| Continuous paragraph | One flowing paragraph mirroring the transcript view | |
| One line per segment | Each Whisper segment on its own line | ✓ |
| Both | Paragraph + timestamped segments reference section | |

**User's choice:** One line per Whisper segment — "one line per whisper segment"

**Notes:** Mirrors natural speech segmentation. Annotations inject after the last word of their range on the same segment line.

---

## Agent's Discretion

- Export button label and icon
- PyInstaller spec file configuration
- electron-builder CI configuration
- Export error handling
- Optional README in output folder

## Deferred Ideas

None.
