# Phase 9: UI Overhaul — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning — decisions confirmed by user 2026-04-13

<domain>
## Phase Boundary

Replace all ad-hoc hex literals with a Solarized-based CSS custom-property design
system, add a light/dark mode toggle (persisted), and make the transcript panel
genuinely comfortable to read (measure, leading, font).

No new features. No new npm dependencies. No changes to IPC, stores, or business
logic. Pure presentation layer.
</domain>

<decisions>
## Implementation Decisions

### Colour system
- **D-01:** All colours live as CSS custom properties on `:root` (light) and
  `[data-theme="dark"]`. No Tailwind, no SCSS — plain CSS variables consumed by
  all Vue `<style scoped>` blocks via `var(--token)`.
- **D-02:** Palette is canonical Solarized:
  - Light bg: `#fdf6e3` (base3) / highlight: `#eee8d5` (base2)
  - Dark bg:  `#002b36` (base03) / highlight: `#073642` (base02)
  - Body text light: `#657b83` (base00) / dark: `#839496` (base0)
  - Emphasis light: `#586e75` (base01) / dark: `#93a1a1` (base1)
  - Deemphasis: `#93a1a1` (base1) / `#586e75` (base01)
  - Accent (interactive): `#268bd2` (blue) — same both modes
  - Accent hover: `#2aa198` (cyan) — same both modes
  - Danger: `#dc322f` (red)
  - Warning bg light: `#b58900` (yellow)
  - Success/active: `#859900` (green)
  - Border light: `#d9cdb4` (between base2/base3) / dark: `#0d3a47`

### Dark mode mechanism
- **D-03:** `data-theme="dark"` attribute on `<html>` element toggles dark palette.
- **D-04:** A `useThemeStore` (Pinia, no persist plugin needed) exposes
  `isDark: boolean` and `toggle()`. On init it reads `localStorage.getItem('theme')`
  and sets the attribute. On toggle it writes to localStorage.
- **D-05:** Dark mode button lives in `AppToolbar` (☀ / ☾ icon, right-hand side).
  Also available in `SessionListView` header.

### Transcript reading optimisation
- **D-06:** Transcript text column is constrained to `max-width: 68ch` and centred
  within its scrollable container (padding on the container keeps it centred at
  all widths).
- **D-07:** Font: `'Georgia', 'Times New Roman', serif` — a web-safe, genuinely
  readable serif. No external font fetch (respects Electron CSP).
- **D-08:** Body text size `1.0625rem` (17px at 16px root), line-height `1.85`.
  Word-click still works — no behavioural change.
- **D-09:** Transcript meta bar (word count / language / duration) uses the
  deemphasis token and is visually separated from the prose.
- **D-10:** Active word underline uses `--accent` token; selection highlight uses
  `rgba(var(--accent-rgb), 0.12)`.

### Component scope
- **D-11:** Files touched:
  - `src/renderer/src/assets/base.css` — token definitions only
  - `src/renderer/src/stores/theme.ts` — new Pinia store
  - `src/renderer/src/App.vue` — apply theme on mount/toggle
  - `src/renderer/src/components/AppToolbar.vue` — dark mode button + tokens
  - `src/renderer/src/components/AppStatusBar.vue` — tokens
  - `src/renderer/src/components/TranscriptPanel.vue` — reading layout + tokens
  - `src/renderer/src/components/AnnotationPanel.vue` — tokens
  - `src/renderer/src/components/AnnotationDialog.vue` — tokens
  - `src/renderer/src/components/WaveformPanel.vue` — tokens
  - `src/renderer/src/components/LevelMeter.vue` — tokens
  - `src/renderer/src/components/SidecarErrorDialog.vue` — tokens
  - `src/renderer/src/views/AppShellView.vue` — tokens
  - `src/renderer/src/views/OnboardingView.vue` — tokens
  - `src/renderer/src/views/SessionListView.vue` — tokens + dark mode button

### Constraints
- **D-12:** `npm run typecheck` must pass after each plan.
- **D-13:** No external font downloads — Electron's `connect-src` CSP blocks them.
  Georgia/serif stack is the safe choice.
- **D-14:** The `asset://` protocol and all IPC are untouched.
- **D-15:** WaveSurfer canvas colours are not Solarized (WaveSurfer uses its own
  API) — leave waveform colours as-is for now; only the panel background changes.
</decisions>

<solarized_tokens>
## Token Reference

```css
/* Light (default) */
--bg:          #fdf6e3;   /* base3  — main background */
--bg-hl:       #eee8d5;   /* base2  — elevated / toolbar */
--bg-raised:   #ffffff;   /* cards, dialogs */
--border:      #d9cdb4;   /* subtle dividers */
--text:        #657b83;   /* base00 — body copy */
--text-em:     #586e75;   /* base01 — headings / labels */
--text-de:     #93a1a1;   /* base1  — deemphasis */
--accent:      #268bd2;   /* blue   — interactive */
--accent-rgb:  38,139,210;
--accent-2:    #2aa198;   /* cyan   — hover */
--danger:      #dc322f;   /* red */
--warn-bg:     #fffbec;
--warn-text:   #7a5800;
--warn-border: #b58900;
--success:     #859900;   /* green */

/* Dark — overrides on [data-theme="dark"] */
--bg:          #002b36;   /* base03 */
--bg-hl:       #073642;   /* base02 */
--bg-raised:   #073642;
--border:      #0d3a47;
--text:        #839496;   /* base0  */
--text-em:     #93a1a1;   /* base1  */
--text-de:     #586e75;   /* base01 */
--warn-bg:     #1a1200;
--warn-text:   #b58900;
--warn-border: #7a5800;
```
</solarized_tokens>

<component_inventory>
## Current Style Inventory (colours to replace)

| Component | Hardcoded values |
|-----------|-----------------|
| base.css | `#ffffff`, `#1a1a1a`, `system-ui` font |
| AppToolbar | `#e5e7eb`, `#374151`, `#9ca3af`, `#1a56db`, `#d1d5db`, `#dc2626` |
| AppStatusBar | (small) |
| AppShellView | `#e5e7eb`, `#fafafa`, `#fff8e1`, `#856404`, `#f59e0b` |
| TranscriptPanel | `#9ca3af`, `#e5e7eb`, `#1a56db`, `#374151`, `#6b7280`, `#1a1a1a`, `#f3f4f6` |
| AnnotationPanel | many blue/gray literals |
| AnnotationDialog | many literals |
| SessionListView | `#f9fafb`, `#e5e7eb`, `#111827`, `#1a56db`, `#6b7280` |
| OnboardingView | `#f5f7fa`, `#1a56db`, `#666`, `#1a1a1a` |
| SidecarErrorDialog | literals |
| WaveformPanel | panel bg only |
| LevelMeter | literals |
</component_inventory>

<plan_outline>
## Plan Wave Structure

### Wave 1: Foundation (must come first)
- **09-01** — CSS design tokens + `useThemeStore` + App.vue theme init

### Wave 2: Layout surfaces (parallel, depend on 09-01)
- **09-02** — AppToolbar, AppStatusBar, AppShellView, LevelMeter (structural surfaces)
- **09-03** — TranscriptPanel reading optimisation

### Wave 3: Content panels (parallel, depend on 09-01)
- **09-04** — AnnotationPanel, AnnotationDialog
- **09-05** — SessionListView, OnboardingView, SidecarErrorDialog, WaveformPanel
</plan_outline>

---

*Phase: 09-ui-overhaul*
*Context gathered: 2026-04-13*
