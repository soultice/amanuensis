# Amanuensis

## What This Is

A cross-platform desktop application for recording audio, transcribing it locally via OpenAI Whisper, annotating the transcript with images and rich metadata, and exporting polished Markdown documentation — including an assets folder — to share with colleagues. One session at a time: open, record, annotate, export, done.

## Core Value

Turn a spoken recording into a shareable, annotated Markdown document with zero friction — fast enough that it doesn't interrupt the user's workflow.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can select any available audio input device before recording
- [ ] User can start and stop an audio recording via dedicated buttons
- [ ] App provides real-time visual indication that audio is being captured (level meter or waveform)
- [ ] App transcribes the recorded audio via a local OpenAI Whisper large model with automatic language detection, producing word-level timestamps
- [ ] User can view the full transcribed text
- [ ] User can click a single word or select a range of words in the transcript and see the corresponding position highlighted on the audio timeline
- [ ] User can attach annotations to a selected word or word range (images from file picker or clipboard, audio clips, clipboard text/hyperlinks)
- [ ] User can edit, move, and remove existing annotations
- [ ] Annotations cannot overlap
- [ ] Annotation edit dialog uses CSS anchor positioning and the `<dialog>` element; supports clipboard paste and file picker
- [ ] User can export a `.md` file with an adjacent `assets/` folder; annotations are injected at their transcript position in the correct Markdown form (images as `![]()`, footnotes, hyperlinks)
- [ ] App auto-saves session state and restores it on next open

### Out of Scope

- In-app screen capture — user pastes or picks screenshots manually
- Multiple concurrent sessions / recording library — one session at a time
- Cloud sync or remote Whisper API — local model only
- OAuth / user accounts — single-user local app
- Mobile or web deployment — desktop only

## Context

- The user creates spoken technical notes and needs to turn them into documentation quickly, without switching tools or losing context.
- Colleagues receive a `.md` file + `assets/` folder — no special tooling required on their end.
- Whisper must use the `large` model and the `--word_timestamps` flag to enable per-word audio alignment.
- The annotation interaction is text-first: the user works in the transcript, not on a raw waveform. Word selections map to audio timestamps internally.
- CSS Anchor Positioning (`anchor()` / `position-anchor`) and native `<dialog>` are target APIs for the annotation UI.

## Constraints

- **Tech stack**: Electron (shell) + Vue 3 + TypeScript + Vite (renderer) + Python FastAPI sidecar (Whisper backend) — chosen for cross-platform desktop capability and native OS access
- **Platform**: macOS, Windows, Linux — no platform-specific APIs in business logic
- **Whisper model**: `large` only, auto language detection — no smaller models, no remote API
- **Packaging**: Must run as a standalone desktop app (electron-builder); Python sidecar bundled or installed via setup step
- **Annotations**: Non-overlapping, tied to word-range spans in the transcript

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| Electron over Tauri | Python sidecar integration simpler; Rust not needed; team familiarity | - Pending |
| Vue 3 over React | User preference | - Pending |
| Local Whisper `large` model | User requirement; privacy; no API cost | - Pending |
| Text-first annotation (not waveform-first) | User clicks words, not timeline; lower cognitive load | - Pending |
| `.md` + `assets/` export (not base64 embed) | Colleague usability; files remain editable | - Pending |
| One session at a time | Simplifies state management; matches stated workflow | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after Phase 1 (Foundation) complete*
