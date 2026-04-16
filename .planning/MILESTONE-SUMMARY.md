# Milestone Summary: Amanuensis v1.0

**Completed:** 2026-04-16
**Duration:** 2026-04-12 → 2026-04-16 (4 days)
**Phases:** 17
**Plans:** 37

---

## What Was Built

Amanuensis is a cross-platform desktop application that turns a spoken recording into a shareable, annotated Markdown document — locally, with zero cloud dependency.

### Core Capabilities Delivered

| Capability | Phases |
|---|---|
| Electron + Vue 3 app scaffold with Python FastAPI sidecar | 1 |
| Audio recording with device selection, level meter, and playback | 2 |
| Local transcription via faster-whisper large-v3 with word timestamps | 2 |
| Transcript navigation — word click-to-seek, range selection, playback highlight | 3 |
| Annotations — image, text, hyperlink, audio — CSS-anchored dialog, non-overlapping | 4 |
| Session persistence — atomic auto-save (30s), save-on-close, restore on launch | 4 |
| Markdown export with `assets/` folder; image/link/audio/text annotations at position | 5, 7 |
| End-to-end bug fix pass | 6 |
| Multi-session management — list, open, close, create sessions | 8 |
| Solarized design system (light + dark mode) | 9 |
| Self-contained installers: macOS DMG, Windows NSIS, Linux AppImage (PyInstaller sidecar) | 10 |
| Pause & resume recordings (silence excluded from audio) | 11 |
| Auto-save countdown bar with manual save trigger | 12 |
| Editable session title (persisted, reflected in exported Markdown H1) | 13 |
| One-click transcript copy to clipboard | 14 |
| Waveform horizontal layout | 15 |
| Project installability (public npm registry, engine constraints, volta pins) | 16 |
| Cross-platform CI/CD — matrix build (Linux/macOS/Windows), Windows dev mode fix, CONTRIBUTING.md | 17 |

---

## Requirements Coverage

- **v1 requirements:** 30/30 ✓
- **Unmapped requirements:** 0

---

## Phase Breakdown

| # | Phase | Plans | Key Deliverables |
|---|---|---|---|
| 1 | Foundation | 2 | Electron scaffold, Python sidecar, IPC bridge |
| 2 | Audio & Transcription | 2 | MediaRecorder, faster-whisper, word timestamps |
| 3 | Transcript & Waveform | 2 | WaveSurfer, word click, range selection |
| 4 | Annotations & Persistence | 2 | CRUD, dialog UI, session JSON |
| 5 | Export & Packaging | 2 | Markdown export, electron-builder |
| 6 | Bug Fixing | 1 | Runtime bug audit |
| 7 | Image Export Formatting | 1 | Block-level image rendering in export |
| 8 | Session Management | 3 | Session list view, multi-session switching |
| 9 | UI Overhaul | 5 | Solarized palette, dark mode, typography |
| 10 | Packaging & Distribution | 4 | PyInstaller, cross-platform installers |
| 11 | Pause & Resume | 2 | Pause/resume button, silence exclusion |
| 12 | Auto-Save Indicator | 2 | Progress bar, manual save trigger |
| 13 | Editable Session Title | 3 | Inline rename, persisted, in export |
| 14 | Copy Transcript | 1 | Clipboard copy with feedback |
| 15 | Waveform Horizontal Layout | 1 | Horizontal waveform panel |
| 16 | Project Installability | 1 | .npmrc, engine constraints, README |
| 17 | Cross-platform Compatibility | 3 | CI matrix, Windows Poetry fix, CONTRIBUTING.md |

---

## Key Technical Decisions

| Decision | Outcome |
|---|---|
| Electron over Tauri | Python sidecar integration simpler; team familiarity |
| Vue 3 over React | User preference |
| Local faster-whisper large-v3 | Privacy, no API cost, user requirement |
| PyInstaller for sidecar bundling | Single binary, no Python required on end-user machine |
| CSS Anchor Positioning + `<dialog>` | Native, no JS positioning library needed |
| Atomic file writes (tmp + rename) | Prevents session corruption on force-quit |
| Multi-session as flat JSON files | Simple, browsable, no SQLite dependency |
| Solarized palette | Consistent, readable, light + dark support |

---

## Artefacts

- `src/` — Electron main + renderer (Vue 3 + TypeScript)
- `sidecar/` — Python FastAPI + faster-whisper
- `.github/workflows/build.yml` — Cross-platform CI matrix
- `CONTRIBUTING.md` — Platform-specific contributor guide
- `.npmrc` — Public registry pin
- `package.json` — Engine constraints + Volta pins

---

*Generated: 2026-04-16*
