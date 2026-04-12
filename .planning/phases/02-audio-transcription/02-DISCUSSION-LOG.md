# Phase 2: Audio & Transcription - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 02-audio-transcription
**Areas discussed:** Level meter style, Transcription trigger, Transcript layout, Progress display

---

## Level Meter Style

| Option | Description | Selected |
|---|---|---|
| Bar-graph volume meter | Vertical bars in toolbar responding to mic amplitude | ✓ |
| Waveform strip | Thin real-time waveform below the toolbar | |
| Minimal dot/ring indicator | Animated dot or pulsing ring | |

**User's choice:** Bar-graph — "level meter style: bar graph"

**Notes:** Lives in the toolbar alongside record/stop controls.

---

## Transcription Trigger

| Option | Description | Selected |
|---|---|---|
| Auto-start | Transcription begins immediately when recording stops | |
| Transcribe button | User clicks "Transcribe" when ready, after optional playback | ✓ |

**User's choice:** Show Transcribe button — "transcription trigger show transcribe button"

**Notes:** Allows user to review/play back recording before committing to transcription.

---

## Transcript Layout

| Option | Description | Selected |
|---|---|---|
| Flowing paragraph text | Words run together as a continuous document | ✓ |
| Segmented line-by-line | Each sentence/segment on its own line with timestamp | |

**User's choice:** Flowing paragraph text — "transcript layout flowing paragraph text"

**Notes:** Word timestamps stored internally for Phase 3 clickable spans; visual presentation is plain text in Phase 2.

---

## Progress Display

| Option | Description | Selected |
|---|---|---|
| Inline in transcript panel | Replaces placeholder while transcribing, transitions to text | ✓ |
| Toolbar / status bar | Small indicator in existing bottom bar | |
| Modal overlay | Full-screen or dialog progress screen | |

**User's choice:** Inline — "progress display inline"

**Notes:** Progress replaces the transcript panel placeholder; no layout shift when transcription completes.

---

## Agent's Discretion

- Exact bar-graph meter (bar count, animation, color)
- Device selector component style
- Transcribe button placement and styling
- Error states for failed transcription
- Playback controls layout

## Deferred Ideas

None.
