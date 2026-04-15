---
phase: 15-waveform-horizontal-layout
plan: 01
subsystem: renderer/layout
tags: [waveform, layout, css-grid, wavesurfer, css-rotation]
dependency_graph:
  requires: []
  provides: [waveform-vertical-layout, two-column-main-grid]
  affects: [AppShellView, WaveformPanel]
tech_stack:
  added: [ResizeObserver]
  patterns: [CSS 90° rotation geometry, custom Y-axis click-to-seek, grid-template-columns]
key_files:
  modified:
    - src/renderer/src/views/AppShellView.vue
    - src/renderer/src/components/WaveformPanel.vue
decisions:
  - "CSS rotate(90deg) with transform-origin: 0 0 used for vertical waveform (WaveSurfer v7 has no native vertical option)"
  - "WaveSurfer interact: false + custom Y-axis handler replaces broken X-axis seek after rotation"
  - "ResizeObserver syncs wave div CSS width and WaveSurfer height option to panel dimensions"
  - "seekToProgress not available in this WaveSurfer version — replaced with setTime(relativeTime * getDuration())"
metrics:
  completed: 2026-04-14
  tasks_completed: 3
  files_modified: 2
---

# Phase 15 Plan 01: Waveform Horizontal Layout Summary

**One-liner:** Two-column CSS grid layout with WaveformPanel in left 25% column rendered vertically via CSS 90° rotation and custom Y-axis seek handler.

## What Was Implemented

### Task 1: AppShellView — Two-Column Main Grid
Modified `src/renderer/src/views/AppShellView.vue` CSS only (template and script untouched):
- `.app-shell__main`: Changed from `grid-template-rows: 180px 1fr auto` to `grid-template-columns: 25% 1fr` + `grid-template-rows: 1fr auto`
- `.app-shell__waveform`: Added `grid-column: 1; grid-row: 1;`, changed `border-bottom` → `border-right`, added `min-height: 0`
- `.app-shell__transcript`: Added `grid-column: 2; grid-row: 1;`
- `.app-shell__annotations`: Added `grid-column: 1 / -1; grid-row: 2;` (spans both columns)

### Task 2: WaveformPanel — CSS Rotation, ResizeObserver, Custom Seek
Modified `src/renderer/src/components/WaveformPanel.vue`:
- **Template**: Added `ref="panelRef"` and `@click="handlePanelClick"` to outer div
- **Script**:
  - Added `panelRef` ref and `resizeObserver` variable
  - `watch(waveSurfer)`: Added `ws.setOptions({ interact: false })` to disable built-in X-axis seek; added ResizeObserver that syncs wave div CSS width to panel height and WaveSurfer height option to panel width
  - Added `handlePanelClick`: uses Y-axis position (`clientY - rect.top / rect.height`) to seek via `setTime(relativeTime * getDuration())`
  - `onUnmounted`: disconnects ResizeObserver before destroying WaveSurfer
- **CSS**: 
  - Removed `padding: 0 16px` from `.waveform-panel`
  - `.waveform-panel__wave`: `position: absolute; top: 100%; left: 0; transform: rotate(90deg); transform-origin: 0 0` (rotation geometry fills panel exactly)
  - `.waveform-panel__empty`: Added `writing-mode: vertical-rl; transform: rotate(180deg)` for readable vertical placeholder text

### Task 3: Typecheck
Fixed two type errors discovered during typecheck:
1. `watch(waveColors)` block: Changed `setOptions({ ...waveSurfer.value.options, ...colors })` → `setOptions(colors)` (peaks type mismatch in spread)
2. `handlePanelClick`: `seekToProgress` not available in this WaveSurfer version — replaced with `setTime(relativeTime * getDuration())`

## Acceptance Criteria Results

| Criterion | Result |
|-----------|--------|
| `grid-template-columns: 25% 1fr` in AppShellView.vue | ✅ PASS |
| `grid-template-rows: 1fr auto` in `.app-shell__main` | ✅ PASS |
| `grid-column: 1;` on waveform | ✅ PASS |
| `grid-column: 2;` on transcript | ✅ PASS |
| `grid-column: 1 / -1;` on annotations | ✅ PASS |
| `grid-template-rows: 180px` gone | ✅ PASS |
| `border-bottom` gone from waveform | ✅ PASS |
| `border-right` on waveform | ✅ PASS |
| `rotate(90deg)` in WaveformPanel.vue | ✅ PASS |
| `transform-origin: 0 0` | ✅ PASS |
| `top: 100%` on `.waveform-panel__wave` | ✅ PASS |
| `interact: false` in watch(waveSurfer) | ✅ PASS |
| Y-axis click seek handler | ✅ PASS |
| ResizeObserver setup + disconnect | ✅ PASS |
| `setOptions({ height: ... })` in ResizeObserver | ✅ PASS |
| `panelRef` in template and script | ✅ PASS |
| `padding: 0 16px` removed | ✅ PASS |
| `writing-mode: vertical-rl` on empty state | ✅ PASS |
| `npm run typecheck` exits 0 | ✅ PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `seekToProgress` not available in installed WaveSurfer version**
- **Found during:** Task 3 (typecheck)
- **Issue:** `Property 'seekToProgress' does not exist on type` — the WaveSurfer instance type doesn't expose this method in the version installed
- **Fix:** Replaced with `waveSurfer.value.setTime(relativeTime * waveSurfer.value.getDuration())` which achieves the same effect
- **Files modified:** `src/renderer/src/components/WaveformPanel.vue`
- **Commit:** (included in main commit)

**2. [Rule 1 - Bug] Type error from spreading `waveSurfer.value.options` in `setOptions` call**
- **Found during:** Task 3 (typecheck)
- **Issue:** Spreading `.options` caused `peaks` property type mismatch with newer TypeScript/lib definitions
- **Fix:** Changed `setOptions({ ...waveSurfer.value.options, ...colors })` to `setOptions(colors)` since `setOptions` merges internally
- **Files modified:** `src/renderer/src/components/WaveformPanel.vue`
- **Commit:** (included in main commit)

## Known Stubs

None — all functionality is wired to real data sources.
