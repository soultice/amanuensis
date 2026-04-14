# Phase 15: Waveform Horizontal Layout — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 15-waveform-horizontal-layout
**Areas discussed:** Waveform side & width, Waveform orientation, AnnotationPanel placement, Responsiveness

---

## Waveform Side & Width

| Option | Description | Selected |
|--------|-------------|----------|
| Left | Waveform panel on the left of the transcript | ✓ |
| Right | Waveform panel on the right of the transcript | |
| Fixed px width | e.g., 200px side panel | |
| Percentage width | Scales with window width | ✓ |

**User's choice:** Left, percentage-based — "so much that it doesn't hurt readability but is clearly readable"
**Notes:** Resolved to ~25% based on leaving 75% for the transcript which already constrains itself to 68ch.

---

## Waveform Orientation

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal (rotated 90°) | Time flows top-to-bottom via CSS rotation | ✓ |
| Horizontal at reduced height | Waveform stays landscape in a wider side panel | |
| Keep stacked but wider | Just make the existing top strip taller | |

**User's choice:** "Of course it should be rendered top down horizontally. It should be stretched to the length of the transcription so it matches roughly the position of the waveform to the word in the text."
**Notes:** CSS `rotate(90deg)` on the inner wave element. Waveform height (in WaveSurfer terms) = panel pixel width. Panel height = transcript scroll container height. Temporal alignment is approximate (no scroll-sync this phase).

---

## AnnotationPanel Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Below transcript column only | Right column has transcript + annotations stacked | |
| Below everything (full width) | Spans both waveform and transcript columns | ✓ |
| Floating/overlay | Panel overlays content when active | |

**User's choice:** "Should be below everything"

---

## Responsiveness

| Option | Description | Selected |
|--------|-------------|----------|
| Responsive breakpoints | Collapses to stacked layout at narrow widths | |
| Not a concern | Always windowed large | ✓ |

**User's choice:** "Don't care about responsiveness for now"

---

## Agent's Discretion

- Exact WaveSurfer resize observer handling when panel width changes
- Whether the waveform side panel gets a right-border separator
- Padding inside the rotated waveform container
- Empty-state placeholder text/icon handling after rotation

## Deferred Ideas

- Scroll-sync between waveform and transcript
- Pixel-perfect word ↔ waveform position alignment
- Responsive/stacked fallback for narrow windows
