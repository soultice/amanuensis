# Phase 1: Foundation - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a working Electron + Vue 3 app that spawns a Python FastAPI sidecar, verifies it's healthy via IPC, and presents a fully-scaffolded (but empty) app shell to the user. No recording, transcription, or annotation features yet — this phase produces the secure, connected skeleton that every subsequent phase builds on.

</domain>

<decisions>
## Implementation Decisions

### First-Run Experience
- **D-01:** On first launch (or when the Whisper large-v3 model is absent), the app shows a setup/onboarding screen — not the main app shell.
- **D-02:** The onboarding screen must surface the current model status: already downloaded and ready, currently downloading (with progress), or missing/not yet downloaded.
- **D-03:** The user must be able to initiate the model download from the onboarding screen. The app transitions to the main shell only once the model is ready.

### App Shell Structure
- **D-04:** Phase 1 scaffolds the full final layout — not a minimal placeholder. The shell should reflect the eventual app structure (toolbar/header area, main content area, status bar) even though all panels are empty/disabled at this stage.
- **D-05:** The scaffolded shell is what the user sees after the onboarding screen completes. Subsequent phases fill in each section progressively.

### Sidecar Failure Handling
- **D-06:** If the Python sidecar fails to start (crash, missing Python, model error, port conflict), the app shows a **blocking error dialog** — the user cannot proceed until the issue is resolved or the app is restarted.
- **D-07:** The error dialog should include: what failed, any available error detail from the sidecar process stdout/stderr, and a "Restart App" action.

### Python Development Environment
- **D-08:** The Python sidecar must use **Poetry** for dependency management — not venv+pip, not conda.
- **D-09:** `pyproject.toml` and `poetry.lock` are committed. The README must include Poetry setup instructions.

### Agent's Discretion
- Exact visual design of the onboarding screen (layout, color, branding)
- Model download implementation details (which faster-whisper API to use for download, temp file location)
- Error dialog component library choice
- Status bar content and styling in the scaffolded shell
- Port discovery mechanism for the sidecar (stdout pipe vs. temp file)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Vision, constraints, tech stack decisions
- `.planning/REQUIREMENTS.md` — Full v1 requirement list (context for what the shell must eventually accommodate)
- `.planning/research/STACK.md` — Prescriptive library versions: Electron 33+, electron-vite 2+, Vue 3.5+, TypeScript 5.6+, Pinia 2.2+, FastAPI 0.115+, faster-whisper 1.1+, PyInstaller 6.15+
- `.planning/research/ARCHITECTURE.md` — Component map, IPC pattern (contextBridge), sidecar startup sequence, data flow
- `.planning/research/PITFALLS.md` — P2 (PyInstaller bundling), P5 (Electron security/contextIsolation), P6 (macOS mic entitlements groundwork)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield project

### Established Patterns
- None yet — this phase establishes them

### Integration Points
- The scaffolded shell layout must accommodate (in later phases): device selector + record/stop controls (Phase 2), waveform display (Phase 3), transcript panel (Phase 2–3), annotation sidebar (Phase 4), export button (Phase 5)
- The IPC bridge (`window.api`) established here is the contract all later phases call into — design it to be extensible

</code_context>

<specifics>
## Specific Ideas

- Onboarding screen should make model status immediately obvious (e.g., a clear status badge: "Ready ✓", "Downloading… 47%", "Not downloaded")
- Blocking error dialog should not be dismissible — the sidecar is required for the app to function at all
- The full shell scaffold should give the app a "real" feel from the start, even before features are wired in

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-12*
