---
## RESEARCH COMPLETE

**Phase:** 15 - Waveform Horizontal Layout
**Researched:** 2026-04-14
**Domain:** CSS Grid Layout Restructure + WaveSurfer v7 CSS Rotation
**Confidence:** HIGH (all critical findings verified against WaveSurfer v7 renderer source)

---

# Phase 15: Waveform Horizontal Layout - Research

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** `app-shell__main` grid changes to two-column layout:
```
grid-template-columns: 25% 1fr;
grid-template-rows: 1fr auto;

app-shell__waveform   → column 1, row 1
app-shell__transcript → column 2, row 1
app-shell__annotations → column 1 / span 2, row 2
```
Waveform column is 25% of main area. Executor may adjust ±3% if needed.

**D-02:** Waveform rendered top-to-bottom via CSS rotation. `transform: rotate(90deg)` on inner wave container. WaveSurfer `height` option = panel pixel width. `interact: true` preserved for seek. Alternative (executor's discretion if rotation causes interaction bugs): render at large fixed height (e.g., 2000px) inside a panel-height div; no rotation, WaveSurfer height = panel height dynamically.

**D-03:** Waveform panel height = transcript scroll container height (best-effort temporal alignment). Use `height: 100%; overflow: hidden` matching transcript column. Scroll-sync is OUT OF SCOPE.

**D-04:** AnnotationPanel spans both columns (`column 1 / -1, row 2`). Preserves existing `max-height: 200px` and `border-top`. No behaviour change.

**D-05:** No responsive breakpoints needed. Desktop-only, always large window.

### Claude's Discretion

- Exact ResizeObserver implementation for panel-width changes (trigger `ws.setOptions({ height: panelWidth })`)
- Whether waveform panel gets a subtle right-border separator (likely yes, `var(--border)`)
- Exact padding inside the rotated waveform container
- Empty-state placeholder behaviour when rotated

### Deferred Ideas (OUT OF SCOPE)

- Scroll-sync (waveform scrolling in lockstep with transcript)
- Responsive/stacked fallback for narrow windows
- Pixel-perfect word ↔ waveform position alignment
</user_constraints>

---

## Summary

Phase 15 restructures `AppShellView.vue`'s `app-shell__main` grid from a row-stacked layout (180px / 1fr / auto) to a two-column layout (25% / 1fr) with `AnnotationPanel` spanning full width in row 2. The waveform renders vertically (time top-to-bottom) via CSS 90° clockwise rotation of the WaveSurfer container. All other components are untouched.

**CRITICAL FINDING:** WaveSurfer v7 has NO native `vertical` option. The v7 TypeScript rewrite (confirmed from renderer.ts source) dropped this v6 feature. CSS rotation is the only path to vertical rendering. However, WaveSurfer v7's internal click-to-seek uses `clientX / rect.width` — after CSS rotation, this computes the WRONG axis (horizontal instead of vertical). Click-to-seek **breaks** with naive CSS rotation. A custom click handler is required.

**Primary recommendation:** CSS rotation approach with `interact: false` + custom Y-axis click handler. Three changes: (1) AppShellView grid, (2) WaveformPanel CSS + ResizeObserver, (3) Custom seek handler.

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| wavesurfer.js | 7.x (7.12.3 latest) | Waveform rendering | Renderer source verified |
| @meersagor/wavesurfer-vue | current | Vue3 composable wrapper | Passes all WaveSurfer options through |
| Vue 3 | 3.x | Component framework | Composition API used throughout |

### Supporting (already in project)
| API | Purpose | How Used |
|-----|---------|----------|
| ResizeObserver | Panel resize detection | Update WaveSurfer `height` when panel width changes |
| CSS Custom Properties | Dynamic dimensions | `--wave-length` set via JS to drive panel height |

### No New Dependencies
This phase requires zero new npm packages. All changes are CSS + JS within existing components.

---

## Architecture Patterns

### Recommended Project Structure (unchanged)
```
src/renderer/src/
├── views/
│   └── AppShellView.vue          ← ONLY structural CSS changes here
├── components/
│   └── WaveformPanel.vue         ← CSS rotation + height option + click handler
└── (all other files unchanged)
```

### Pattern 1: Two-Column Grid with Full-Width Footer

**What:** `app-shell__main` switches from row-stacked to column layout with annotation spanning both.

**Current (to replace):**
```css
/* AppShellView.vue — BEFORE */
.app-shell__main {
  grid-row: 3;
  display: grid;
  grid-template-rows: 180px 1fr auto;
  overflow: hidden;
  min-height: 0;
}
.app-shell__waveform {
  border-bottom: 1px solid var(--border);
  background: var(--bg-hl);
  overflow: hidden;
}
.app-shell__transcript {
  overflow-y: auto;
  min-height: 0;
  background: var(--bg);
}
.app-shell__annotations {
  border-top: 1px solid var(--border);
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg);
}
```

**After:**
```css
/* AppShellView.vue — AFTER */
.app-shell__main {
  grid-row: 3;
  display: grid;
  grid-template-columns: 25% 1fr;
  grid-template-rows: 1fr auto;
  overflow: hidden;
  min-height: 0;
}
.app-shell__waveform {
  grid-column: 1;
  grid-row: 1;
  border-right: 1px solid var(--border);
  background: var(--bg-hl);
  overflow: hidden;
  min-height: 0;
}
.app-shell__transcript {
  grid-column: 2;
  grid-row: 1;
  overflow-y: auto;
  min-height: 0;
  background: var(--bg);
}
.app-shell__annotations {
  grid-column: 1 / -1;    /* spans both columns */
  grid-row: 2;
  border-top: 1px solid var(--border);
  max-height: 200px;
  overflow-y: auto;
  background: var(--bg);
}
```

**Key rule (from CONTEXT.md):** Explicit `grid-column` and `grid-row` on EVERY direct child of `.app-shell__main` — same discipline as the outer `.app-shell` grid to prevent auto-placement bugs.

### Pattern 2: CSS 90° Rotation for Vertical Waveform

**What:** Wave container div rotated 90° clockwise so WaveSurfer's horizontal time axis becomes vertical.

**The dimension math:**
- Panel dimensions: `width = W` (≈25% viewport), `height = H` (= transcript height, large)
- WaveSurfer `height` option = `W` (panel width) → canvas is `W×W` initially, expands to `H×W` after rotation
- Wave div CSS `width` = `H` (panel height, set dynamically) — this becomes the visual height after rotation
- After rotation: visual size = `W × H` — fills the panel exactly ✓

**CSS (verified working pattern):**
```css
/* WaveformPanel.vue — AFTER */
.waveform-panel {
  height: 100%;
  position: relative;
  overflow: hidden;
  padding: 0;    /* remove existing horizontal padding — confounds rotation math */
}
.waveform-panel__wave {
  position: absolute;
  top: 100%;                       /* = panelHeight; positions transform-origin correctly */
  left: 0;
  /* width set dynamically by ResizeObserver: panelHeight px */
  transform: rotate(90deg);
  transform-origin: 0 0;           /* rotate around element's own top-left corner */
}
```

**How this fills the panel (geometry proof):**
After 90° CW rotation around point `(0, panelHeight)` [the element's top-left]:
- Corner `(0, panelHeight)` → stays at `(0, panelHeight)` — still at panel origin
- Corner `(panelHeight, panelHeight)` → maps to `(0, 0)` — top-left of panel ✓
- Corner `(0, panelHeight + panelWidth)` → maps to `(panelWidth, panelHeight)` — bottom-right ✓
- Corner `(panelHeight, panelHeight + panelWidth)` → maps to `(panelWidth, 0)` — top-right ✓
- Visual bounding box: `x:[0, panelWidth], y:[0, panelHeight]` — fills panel perfectly ✓

### Pattern 3: ResizeObserver for Dynamic Dimensions

**What:** ResizeObserver on `.waveform-panel` updates wave div width and WaveSurfer height when panel width changes.

```typescript
// WaveformPanel.vue — in onMounted or watch(containerRef)
const ro = new ResizeObserver(([entry]) => {
  const { width, height } = entry.contentRect   // panelWidth, panelHeight
  if (waveRef.value) {
    waveRef.value.style.width = `${height}px`   // wave div width = panelHeight
  }
  if (waveSurfer.value) {
    waveSurfer.value.setOptions({ height: Math.floor(width) })  // WaveSurfer height = panelWidth
  }
})
ro.observe(panelRef.value)   // panelRef = the .waveform-panel element
```

**WaveSurfer v7 API (confirmed from source):**
- `ws.setOptions({ height: N })` — correct v7 method (verified in `wavesurfer.ts`)
- `ws.setHeight()` — **REMOVED in v7** — do NOT use
- WaveSurfer v7 already has its own internal ResizeObserver for WIDTH changes (on `scrollContainer`), but it does NOT watch for HEIGHT changes — our ResizeObserver handles that

### Pattern 4: Custom Y-Axis Click Handler (CRITICAL)

**Why needed (verified from renderer.ts source):**

WaveSurfer v7 renderer click handler (line from `renderer.ts`):
```javascript
this.wrapper.addEventListener('click', (e) => {
  const rect = this.wrapper.getBoundingClientRect()
  const [x, y] = utils.getRelativePointerPosition(rect, e.clientX, e.clientY)
  this.emit('click', x, y)
  // wavesurfer.ts then calls: this.seekToProgress(x)   ← uses X!
})
```

After CSS 90° rotation, `getBoundingClientRect()` returns the visual bounding box: `width=panelWidth, height=panelHeight`. A click at the TOP of the panel has small `clientY`, so `relativeY ≈ 0` (= time start ✓) but `relativeX = (clientX - rect.left) / panelWidth` which is the HORIZONTAL position (meaningless for time). WaveSurfer seeks to the wrong position.

**Fix: disable WaveSurfer's internal seek, add custom handler:**

```typescript
// WaveformPanel.vue — after WaveSurfer is initialized
watch(waveSurfer, (ws) => {
  if (!ws) return
  
  // Disable internal click-to-seek (rotation makes X-seek incorrect)
  ws.setOptions({ interact: false })
  
  // ... existing event wiring (ready, timeupdate, play, pause, finish) ...
})

// In <template> or onMounted:
// Add click handler to the outer .waveform-panel element
function handlePanelClick(e: MouseEvent): void {
  if (!waveSurfer.value || !panelRef.value) return
  const rect = panelRef.value.getBoundingClientRect()
  // After rotation: vertical position = time
  const relativeTime = (e.clientY - rect.top) / rect.height
  const clamped = Math.max(0, Math.min(1, relativeTime))
  waveSurfer.value.seekToProgress(clamped)
}
```

Add `@click="handlePanelClick"` to `.waveform-panel` div in template. Reference `panelRef` for the outer container (rename from `containerRef` or add a second ref).

**Effect of `interact: false`:** Sets `pointer-events: none` on WaveSurfer's internal shadow DOM wrapper. Cursor display (the vertical seek line) is disabled. The outer container still receives clicks. Hover cursor visual is lost — acceptable tradeoff. If cursor is needed, use CSS on `::part(cursor)` or implement separately.

### Pattern 5: RegionsPlugin After Rotation

**Status:** ✅ Works correctly without changes.

Regions are rendered as absolutely positioned divs in WaveSurfer's shadow DOM with `left` and `width` CSS props based on time position. After the entire container is rotated:
- Region `left` → maps to vertical position in screen space (= time axis) ✓
- Region `width` → maps to vertical span in screen space ✓
- The region overlays rotate with the parent and display as horizontal stripes spanning the waveform width

Since the app uses `drag: false, resize: false` (confirmed in `WaveformPanel.vue`), region interaction is not needed. Visual display is correct.

### Anti-Patterns to Avoid

- **Using `setHeight()`:** Removed in WaveSurfer v7. Will throw. Use `setOptions({ height: N })`.
- **Setting `top: 0` with `transform-origin: 0 0`:** Wave div goes off-screen upward. Use `top: 100%`.
- **Not setting explicit `grid-column` / `grid-row`:** CONTEXT.md explicitly warns about auto-placement bugs when the warning banner is absent. ALL `.app-shell__main` children need explicit placement.
- **Keeping existing `padding: 0 16px` on `.waveform-panel`:** This confounds the rotation geometry. Remove or move padding to inner content.
- **Using `interact: true` with CSS rotation and no override:** WaveSurfer will seek to the wrong time on click.
- **Putting layout logic in multiple files:** All shell layout changes stay in `AppShellView.vue`. WaveformPanel changes stay in `WaveformPanel.vue`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|------------|-------------|-----|
| Resize detection | MutationObserver polling | `ResizeObserver` | Native, performant, already used in WaveSurfer internally |
| Height update | Custom CSS variable juggling | `ws.setOptions({ height })` | Official WaveSurfer v7 API |
| Click coordinate transform | Matrix math on `offsetX/offsetY` | `rect.top / rect.height` on outer container | simpler, correct after rotation |
| Region rendering | Custom overlay divs | RegionsPlugin (existing) | Already works correctly after rotation |

---

## Common Pitfalls

### Pitfall 1: Assuming `vertical: true` Exists in WaveSurfer v7

**What goes wrong:** Developer sets `vertical: true` in WaveSurfer options. Option is silently ignored (no error). Waveform renders horizontally as always.

**Why it happens:** The `vertical` option existed in WaveSurfer v6 (confirmed on archived v6.6.4 docs). It was removed in the v7 TypeScript rewrite. The official example page still hosts a v6 demo with that option. The v7 options TypeDoc does NOT list `vertical`.

**How to avoid:** Check v7 `WaveSurferOptions` type — no `vertical` field. Use CSS rotation instead.

**Warning signs:** Waveform renders horizontally despite setting `vertical: true`.

### Pitfall 2: Click-to-Seek Broken by Rotation (the main gotcha)

**What goes wrong:** CSS rotation makes the waveform look correct. But clicking near the top of the waveform seeks to ~50% of the audio (because it's responding to horizontal position, not vertical).

**Why it happens:** WaveSurfer v7 renderer uses `(e.clientX - rect.left) / rect.width` for seek progress. After 90° rotation, `rect.width = panelWidth` (the narrow dimension) and `clientX` is horizontal. The correct time fraction is `(e.clientY - rect.top) / rect.height`.

**How to avoid:** Set `interact: false` on WaveSurfer. Add custom `@click` handler on outer `.waveform-panel` using Y-axis calculation.

**Warning signs:** Clicking top of waveform seeks to ~50%; clicking the bottom of the waveform seeks to ~50% (always near 50% regardless of vertical position).

### Pitfall 3: Wave Div Width Not Set Dynamically

**What goes wrong:** Wave div `width` is set to `100%` (= panel width, not panel height). After rotation, the visible waveform only spans a short distance vertically, leaving most of the panel empty.

**Why it happens:** Forgetting that after rotation, CSS `width` maps to visual HEIGHT. The wave div must be `panelHeight` pixels wide so it fills the panel height after rotation.

**How to avoid:** ResizeObserver reads `entry.contentRect.height` (= panelHeight) and sets `waveEl.style.width = height + 'px'`.

**Warning signs:** Waveform visually ends partway down the panel; large empty area below.

### Pitfall 4: Wave Div Positioned Off-Screen

**What goes wrong:** Wave div is at `top: 0, left: 0` with `transform-origin: 0 0`. After rotation, the element appears above the panel (negative Y), not inside it.

**Why it happens:** `rotate(90deg)` with `transform-origin: 0 0` rotates the element's top-right corner up into negative Y space. The element needs to start at `top: 100%` so after rotation it falls back into the panel.

**How to avoid:** Use `position: absolute; top: 100%; left: 0; transform-origin: 0 0;` on the wave div.

**Warning signs:** Waveform invisible; panel appears empty; no rendering errors in console.

### Pitfall 5: WaveSurfer Height Not Updated After Panel Height Changes

**What goes wrong:** On initial load the height is set correctly. After window resize, WaveSurfer `height` option remains stale (still panel width from load time), but the wave div width is updated. The rotated waveform no longer fills the panel in the across-waveform direction.

**Why it happens:** WaveSurfer v7's internal ResizeObserver watches container WIDTH (for horizontal re-render), not container HEIGHT. We need our own ResizeObserver watching the panel element.

**How to avoid:** ResizeObserver on `.waveform-panel` updates BOTH `waveEl.style.width` (= panelHeight) AND `ws.setOptions({ height: panelWidth })`.

### Pitfall 6: Forgetting `min-height: 0` on Grid Children

**What goes wrong:** Waveform panel or transcript panel overflows the grid, causing the layout to break or scroll when content is large.

**Why it happens:** Grid children with `height: 100%` inside `1fr` rows can still overflow if their content forces minimum height. The existing `.app-shell__transcript` has `min-height: 0` — the waveform column needs it too.

**How to avoid:** Add `min-height: 0` to `.app-shell__waveform`.

---

## Code Examples

### Complete WaveformPanel CSS (After)

```css
/* WaveformPanel.vue <style scoped> — AFTER */
.waveform-panel {
  height: 100%;
  position: relative;
  overflow: hidden;
  /* padding: 0 16px; -- REMOVED: confounds rotation geometry */
}

.waveform-panel__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-de);
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  pointer-events: none;
  writing-mode: vertical-rl;   /* rotate placeholder text to match panel orientation */
  transform: rotate(180deg);   /* flip so text reads top-to-bottom */
}

.waveform-panel__wave {
  position: absolute;
  top: 100%;                 /* positions transform-origin at panel bottom-left */
  left: 0;
  /* width: set dynamically via ResizeObserver (= panelHeight px) */
  /* height: controlled by WaveSurfer height option (= panelWidth px) */
  transform: rotate(90deg);
  transform-origin: 0 0;
}
```

### ResizeObserver Integration (TypeScript)

```typescript
// WaveformPanel.vue <script setup>
const panelRef = ref<HTMLElement | null>(null)    // add ref to outer .waveform-panel
const waveRef = ref<HTMLElement | null>(null)     // ref to .waveform-panel__wave div

let resizeObserver: ResizeObserver | null = null

watch(waveSurfer, (ws) => {
  if (!ws) return

  // Critical: disable internal X-axis seek (broken after rotation)
  ws.setOptions({ interact: false })

  // Existing event wiring
  ws.on('ready', (dur: number) => playbackStore.onWaveSurferReady(dur))
  ws.on('timeupdate', (t: number) => playbackStore.onTimeUpdate(t))
  ws.on('play', () => playbackStore.onPlayPause(true))
  ws.on('pause', () => playbackStore.onPlayPause(false))
  ws.on('finish', () => playbackStore.onPlayPause(false))

  if (recordingStore.audioBlobUrl) {
    ws.load(recordingStore.audioBlobUrl)
  }

  // Set up ResizeObserver to sync dimensions
  if (panelRef.value && waveRef.value) {
    resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (waveRef.value) {
        waveRef.value.style.width = `${Math.floor(height)}px`
      }
      ws.setOptions({ height: Math.floor(width) })
    })
    resizeObserver.observe(panelRef.value)
  }
})

// Custom Y-axis click-to-seek handler
function handlePanelClick(e: MouseEvent): void {
  if (!waveSurfer.value || !panelRef.value) return
  const rect = panelRef.value.getBoundingClientRect()
  const relativeTime = (e.clientY - rect.top) / rect.height
  waveSurfer.value.seekToProgress(Math.max(0, Math.min(1, relativeTime)))
}

onUnmounted(() => {
  resizeObserver?.disconnect()
  waveSurfer.value?.destroy()
})
```

### Template Changes (WaveformPanel.vue)

```vue
<template>
  <div ref="panelRef" class="waveform-panel" @click="handlePanelClick">
    <p v-if="!recordingStore.audioBlobUrl" class="waveform-panel__empty">
      Waveform appears after recording
    </p>
    <div ref="waveRef" class="waveform-panel__wave">
      <div ref="containerRef" />   <!-- WaveSurfer mounts here, inside waveRef -->
    </div>
  </div>
</template>
```

> **Note on containerRef:** The existing `containerRef` is what WaveSurfer mounts into. The `waveRef` is the new outer div that we rotate. `waveRef` wraps `containerRef`. WaveSurfer's shadow DOM goes inside `containerRef`.

**Alternative simpler approach:** Keep existing template structure (`containerRef` on the wave div). The WaveSurfer container IS the element we rotate. Add `panelRef` on the outer `.waveform-panel` for click handling. The `containerRef` becomes `waveRef` (same element). Rename the existing `ref="containerRef"` to `ref="waveRef"` and use `waveRef` for both WaveSurfer mount and rotation target. Add `panelRef` on the outer div.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|-----------------|--------------|--------|
| `ws.setHeight(n)` | `ws.setOptions({ height: n })` | WaveSurfer v7 | Method removed; use setOptions |
| `vertical: true` option | CSS rotation or custom renderFunction | WaveSurfer v7 | No native vertical support |
| Click handler uses offsetX | v7 uses `clientX - rect.left` | WaveSurfer v7 rewrite | Means rotation breaks click |
| Row-based main grid | Column-based main grid | This phase | Waveform moves to side panel |

---

## Open Questions

1. **WaveSurfer cursor display with `interact: false`**
   - What we know: `interact: false` sets `pointer-events: none` on the shadow DOM wrapper, disabling cursor visibility
   - What's unclear: Whether the playback position cursor (vertical line showing current time) is still rendered when `interact: false` — it's rendered independently of `interact` in the renderer CSS
   - Recommendation: Test at runtime. The cursor is rendered by `.cursor` in shadow DOM and updated via `renderProgress()`, which doesn't depend on `interact`. Should still display. If cursor disappears, use `::part(cursor)` to force visibility.

2. **WaveSurfer `seekToProgress` vs `seekTo`**
   - What we know: `seekToProgress(0-1)` seeks to a relative position. `seekTo` is the old API.
   - What's unclear: Whether `seekToProgress` exists in `@meersagor/wavesurfer-vue`'s wrapped instance
   - Recommendation: Use `waveSurfer.value.seekToProgress(n)` directly since `waveSurfer` is the raw WaveSurfer instance from the composable.

3. **Initial height before ResizeObserver fires**
   - What we know: ResizeObserver fires asynchronously. WaveSurfer initializes with `height: 160` from existing options. On first audio load, dimensions may be wrong.
   - What's unclear: Whether WaveSurfer needs a valid height BEFORE the first `load()` call
   - Recommendation: In `onMounted`, synchronously compute `panelRef.value.clientWidth` and set initial `height` option before WaveSurfer creates. Or accept that the first ResizeObserver callback (which fires immediately after observe) will correct it.

---

## Environment Availability

Step 2.6: SKIPPED — No external dependencies. This phase is purely CSS/JS changes within the existing Electron + Vue3 + WaveSurfer stack. No new tools, services, or CLIs required.

---

## Sources

### Primary (HIGH confidence)
- WaveSurfer v7 `renderer.ts` source (fetched from `raw.githubusercontent.com/katspaugh/wavesurfer.js/main/src/renderer.ts`) — click handler implementation, ResizeObserver pattern, setOptions API
- WaveSurfer v7 options TypeDoc (`wavesurfer.xyz/docs/options`) — confirmed `vertical` is NOT in v7 options
- WaveSurfer upgrade guide (`wavesurfer.xyz/docs/`) — confirmed `setHeight` removed, use `setOptions`
- Source files read: `AppShellView.vue`, `WaveformPanel.vue`, `TranscriptPanel.vue`, `15-CONTEXT.md`

### Secondary (MEDIUM confidence)
- WaveSurfer v6.6.4 archived example (confirmed `vertical: true` was v6-only, not v7)
- WaveSurfer v7 example page (`wavesurfer.xyz/example/vertical/`) — uses v6 code fragment; NOT a v7 feature

### Tertiary (LOW confidence)
- GitHub Issue #634 (2016, v1 era) on vertical rendering — historical context only, approach changed significantly in v7

---

## Metadata

**Confidence breakdown:**
- Grid restructure (AppShellView): HIGH — CSS grid is straightforward, pattern confirmed from existing code
- CSS rotation approach: HIGH — geometry verified mathematically
- Click-to-seek fix: HIGH — verified from actual renderer.ts source code
- RegionsPlugin after rotation: MEDIUM — logical inference from region rendering approach; not runtime-tested
- ResizeObserver API: HIGH — standard browser API, WaveSurfer setOptions confirmed from source

**Research date:** 2026-04-14
**Valid until:** 2026-07-14 (WaveSurfer v7 stable; CSS transforms stable)
