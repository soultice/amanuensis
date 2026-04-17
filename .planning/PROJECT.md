# Amanuensis

## What This Is

A cross-platform desktop application for recording audio, transcribing it locally via NVIDIA Parakeet ONNX, annotating the transcript with images and rich metadata, and exporting polished Markdown documentation — including an assets folder — to share with colleagues. Multiple sessions supported: create, close, browse, and reopen in-progress transcripts at any time.

## Core Value

Turn a spoken recording into a shareable, annotated Markdown document with zero friction — fast enough that it doesn't interrupt the user's workflow.

## Requirements

### Validated

- [x] User can export a `.md` file with an adjacent `assets/` folder; annotations are injected at their transcript position in the correct Markdown form — images as `![]()` on their own block line, footnotes and hyperlinks inline *(Validated in Phase 7: Image Export Formatting)*
- [x] Live transcription now reports measurable first-token/cadence telemetry with natural-feel target budgets and keeps the final transcript stop payload contract (`{words, segments, language, duration}`) *(Validated in Phase 21: Increase speed of live transcription)*
- [x] Live renderer cadence adapts to sidecar latency/queue telemetry and exposes in-session verification hints (`Latency: TTFT ... Queue ...`) without regressing non-blocking failure behavior *(Validated in Phase 21: Increase speed of live transcription)*

### Active

- [ ] User can select any available audio input device before recording
- [ ] User can start and stop an audio recording via dedicated buttons
- [ ] App provides real-time visual indication that audio is being captured (level meter or waveform)
- [ ] App transcribes the recorded audio via a local NVIDIA Parakeet ONNX model with automatic language handling, producing word-level timestamps
- [ ] User can view the full transcribed text
- [ ] User can click a single word or select a range of words in the transcript and see the corresponding position highlighted on the audio timeline
- [ ] User can attach annotations to a selected word or word range (images from file picker or clipboard, audio clips, clipboard text/hyperlinks)
- [ ] User can edit, move, and remove existing annotations
- [ ] Annotations cannot overlap
- [ ] Annotation edit dialog uses CSS anchor positioning and the `<dialog>` element; supports clipboard paste and file picker
- [ ] User can view a list of saved sessions and open any of them to resume work
- [ ] User can close the current session and return to a session list
- [ ] User can create a new session from the session list
- [ ] App opens to the session list on launch (not directly into a session)
- [ ] User can export a `.md` file with an adjacent `assets/` folder; annotations are injected at their transcript position in the correct Markdown form (images as `![]()`, footnotes, hyperlinks)
- [ ] App auto-saves session state and restores it on next open

### Out of Scope

- In-app screen capture — user pastes or picks screenshots manually
- Multiple concurrent sessions / recording library — one session at a time *(reversed in Phase 8: user can switch between sessions)*
- Cloud sync or remote transcription API — local model only
- OAuth / user accounts — single-user local app
- Mobile or web deployment — desktop only

## Context

- The user creates spoken technical notes and needs to turn them into documentation quickly, without switching tools or losing context.
- Colleagues receive a `.md` file + `assets/` folder — no special tooling required on their end.
- Local ASR backend must provide per-word timestamp alignment for transcript navigation and annotations.
- Current state: Phase 21 completed with sidecar warmup + bounded decode windows, speed-mode policy (`safe_auto` default), and renderer adaptive flush cadence driven by sidecar telemetry.
- The annotation interaction is text-first: the user works in the transcript, not on a raw waveform. Word selections map to audio timestamps internally.
- CSS Anchor Positioning (`anchor()` / `position-anchor`) and native `<dialog>` are target APIs for the annotation UI.

## Constraints

- **Tech stack**: Electron (shell) + Vue 3 + TypeScript + Vite (renderer) + Python FastAPI sidecar (Parakeet ONNX backend) — chosen for cross-platform desktop capability and native OS access
- **Platform**: macOS, Windows, Linux — no platform-specific APIs in business logic
- **ASR model**: NVIDIA Parakeet ONNX, local-only execution, no remote API
- **Packaging**: Must run as a standalone desktop app (electron-builder); Python sidecar bundled or installed via setup step
- **Annotations**: Non-overlapping, tied to word-range spans in the transcript

## Key Decisions

| Decision | Rationale | Outcome |
| --- | --- | --- |
| Electron over Tauri | Python sidecar integration simpler; Rust not needed; team familiarity | - Pending |
| Vue 3 over React | User preference | - Pending |
| Local Parakeet ONNX model | User requirement; privacy; no API cost | Implemented in Phase 18 |
| Text-first annotation (not waveform-first) | User clicks words, not timeline; lower cognitive load | - Pending |
| `.md` + `assets/` export (not base64 embed) | Colleague usability; files remain editable | - Pending |
| One session at a time | Simplifies state management; matches stated workflow | **Reversed in Phase 8** — user explicitly requested multi-session support |

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
*Last updated: 2026-04-17 after Phase 21 complete — live transcription speed telemetry, bounded sidecar decode windows, and renderer adaptive cadence shipped*
