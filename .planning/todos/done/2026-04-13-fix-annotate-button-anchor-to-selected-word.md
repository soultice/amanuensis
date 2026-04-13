---
created: 2026-04-13T11:52:00.000Z
title: Fix +Annotate button anchoring to selected word
area: ui
files:
  - src/renderer/src/components/TranscriptPanel.vue:32-57
  - src/renderer/src/components/TranscriptPanel.vue:243-248
---

## Problem

When the user clicks a word (or selects a range), the `+ Annotate` floating button
appears at the position of the *leftmost* word in the transcript rather than anchored
to the bottom-right of the clicked/last-selected word.

The button uses CSS Anchor Positioning:
- The last selected word span gets `anchor-name: --selection-end` via `:style`
  (`word.id === playbackStore.selectionMax`)
- The button uses `position: fixed; position-anchor: --selection-end;
  inset-area: top span-inline-end`

The bug is likely one of:
1. **Wrong `inset-area` property name** — Chrome 125+ renamed `inset-area` to
   `position-area`. If the Electron build ships Chromium ≥ 125, `inset-area` is
   silently ignored and the button falls back to its default fixed position (top-left
   of viewport, which overlaps the first/leftmost word).
2. **CSS Anchor Positioning not active** — the feature may require an origin trial
   or flag in older Electron builds, causing full fallback to `position: fixed` at 0,0.

## Solution

**Option A — Fix property name (try first, low effort):**
Add both `inset-area` and `position-area` in the CSS rule so it works across
Chromium versions:

```css
.annotation-float-btn {
  position: fixed;
  position-anchor: --selection-end;
  inset-area: bottom span-inline-end;       /* Chrome < 125 */
  position-area: bottom span-inline-end;    /* Chrome ≥ 125 */
  position-try-fallbacks: top span-inline-end, bottom span-all, top span-all;
  ...
}
```

Also change `top span-inline-end` → `bottom span-inline-end` so the button floats
*below* the word's right edge (matching the described expected position: bottom-right).

**Option B — JS fallback (if CSS anchoring is unreliable in target Electron):**
Add a `wordSpanRefs` map keyed by `word.id`, watch `selectionMax`, and use
`getBoundingClientRect()` to compute `top`/`left` for the button as reactive styles.
This is more robust but more code.

Check Electron version first (`process.versions.chrome` in devtools) to confirm
Chromium version before picking an option.
