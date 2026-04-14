# Phase 15: Waveform Horizontal Layout — Context

**Gathered:** 2026-04-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Move the WaveformPanel from its current position as a horizontal strip above the
transcript into a side panel that sits to the LEFT of the transcript, displayed
vertically so that time runs top-to-bottom and the waveform height matches the
scroll height of the transcript. The AnnotationPanel moves below the full-width
split. No new features, no new stores, no IPC changes.

</domain>

<decisions>
## Implementation Decisions

### D-01: Layout — side-by-side columns

The `app-shell__main` grid changes from:
```
grid-template-rows: 180px 1fr auto;   ← current (stacked)
```
to a two-column layout with the waveform on the LEFT and the transcript on the
RIGHT, with the AnnotationPanel spanning the full width below:

```
grid-template-columns: 25% 1fr;
grid-template-rows: 1fr auto;

app-shell__waveform   → column 1, row 1
app-shell__transcript → column 2, row 1
app-shell__annotations → column 1 / span 2, row 2
```

**Width:** The waveform column is `25%` of the main area. This is wide enough to be
clearly readable while leaving 75% for the transcript (which already constrains
itself to `max-width: 68ch`). Executor may adjust by ±3% if it looks off in practice.

### D-02: Waveform rendered top-to-bottom (vertical time axis)

The waveform must read **top = audio start, bottom = audio end**, matching the
reading direction of the transcript text alongside it. This means:

- The WaveSurfer canvas is rotated 90° clockwise via CSS:
  `transform: rotate(90deg)` on the inner wave container, with the outer container
  clipping and compensating dimensions so the rotated canvas fills the panel width.
- WaveSurfer `height` option is set to match the rendered WIDTH of the side panel
  (i.e., the panel's pixel width becomes WaveSurfer's height, producing a canvas
  that, when rotated, fills the panel height).
- `interact: true` is preserved — the user can still click to seek; after rotation
  the click Y-position maps to time position, which is correct.

**Alternative to CSS rotation (executor's discretion if rotation causes interaction
bugs):** render the waveform at a very large fixed height (e.g., 2000px) inside a
div that matches the transcript scroll container height; no rotation needed but
WaveSurfer `height` must match the panel height dynamically.

### D-03: Waveform height = transcript scroll height (temporal alignment)

The waveform panel height equals the scrollable height of the transcript — so that
a word at 50% of the audio duration appears roughly at 50% of the transcript's
vertical extent. This is a best-effort visual alignment, not pixel-perfect sync.

Implementation: the waveform side-panel uses `height: 100%` and `overflow: hidden`
matching the transcript column. Exact scroll-sync (waveform scrolling in lockstep
with transcript) is **out of scope** for this phase — position correspondence is
approximate, achieved by matching container heights.

### D-04: AnnotationPanel — full-width below the split

`app-shell__annotations` spans both columns (column 1 / -1, row 2). Its existing
`max-height: 200px` and `border-top` are preserved. No behaviour change.

### D-05: Responsiveness — not a concern

No responsive breakpoints or fallback stacked layout needed. The app is always
used in a large enough window.

### Agent's Discretion
- Exact handling of the WaveSurfer resize observer when the panel width changes
  (may need `ws.setOptions({ height: panelWidth })` on ResizeObserver callback)
- Whether the waveform panel gets a subtle right-border separator (likely yes, using
  `var(--border)` to match existing panel borders)
- Exact padding inside the rotated waveform container
- Whether the empty-state placeholder ("Waveform appears after recording") text is
  rotated or replaced with a rotated icon

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Layout (single source of truth for the shell)
- `src/renderer/src/views/AppShellView.vue` — current grid layout, all section
  class names, existing grid-row assignments. The grid restructuring happens here.

### Waveform
- `src/renderer/src/components/WaveformPanel.vue` — WaveSurfer init options
  (`height: 160`, `barWidth`, `barGap`, `interact`, `regionsPlugin`), resize
  handling, theme-adaptive colours. All WaveSurfer option changes happen here.

### Transcript (reference for scroll container dimensions)
- `src/renderer/src/components/TranscriptPanel.vue` — `max-width: 68ch` constraint,
  `overflow-y: auto` scroll container. The waveform column height must match this
  container's rendered height, not the content height.

### Solarized design tokens (for any new borders/backgrounds)
- `.planning/phases/09-ui-overhaul/09-CONTEXT.md` §solarized_tokens — use
  `var(--border)`, `var(--bg-hl)` for panel borders and background.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WaveformPanel.vue`: self-contained; owns its WaveSurfer instance. The rotation
  approach requires only CSS changes to the container and a `height` option update.
- `useThemeStore`: already wired into WaveformPanel for colour updates — no change.

### Established Patterns
- Shell layout is a named-class CSS grid in `AppShellView.vue`. All layout changes
  should stay in that file's `<style scoped>` block.
- Solarized tokens (`var(--border)`, `var(--bg-hl)`) are the correct choice for any
  new borders or backgrounds in the waveform side panel.
- `grid-row` is explicit on every direct child of `.app-shell` to prevent
  auto-placement bugs when the warning banner is absent (see existing comments).
  The same explicit grid placement must be used for the new column layout.

### Integration Points
- `AppShellView.vue` → `.app-shell__main` grid: the only file that needs structural
  change.
- `WaveformPanel.vue`: CSS tweak for rotation + dynamic `height` option.
- Nothing else changes (stores, IPC, transcript, annotations untouched).

</code_context>

<specifics>
## Specific Ideas

- "Stretched to the length of the transcription so it matches roughly the position
  of the waveform to the word in the text" — temporal alignment by matching
  container heights, not by scroll-sync. The visual metaphor is the key outcome.

</specifics>

<deferred>
## Deferred Ideas

- Scroll-sync: waveform panel scrolling in lockstep with the transcript as the user
  reads — compelling but a separate feature.
- Responsive / stacked fallback for narrow windows — explicitly deferred.
- Pixel-perfect word ↔ waveform position alignment (would require knowing rendered
  word positions and audio timestamps together) — future phase.

</deferred>

---

*Phase: 15-waveform-horizontal-layout*
*Context gathered: 2026-04-14*
