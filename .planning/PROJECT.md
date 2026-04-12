# Amanuensis

## What This Is

A cross-platform desktop application (Rust + Tauri) for creating spoken documentation notes. The user records audio, transcribes it locally via OpenAI Whisper, annotates specific time ranges with images, voice comments, and clipboard content, then exports a rich markdown document to share with colleagues.

## Core Value

A complete, reliable pipeline from spoken word to annotated markdown document — every step must actually work or the tool is useless.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] User can select one audio input device from all available system devices
- [ ] User can start and stop an audio recording via dedicated buttons
- [ ] User sees a live visual indicator (e.g. waveform or level meter) confirming audio is being captured
- [ ] App transcribes recorded audio via a local OpenAI Whisper large model with automatic language detection
- [ ] User can view the full transcribed text
- [ ] User can click a word in the transcript and see the corresponding position highlighted on the audio timeline
- [ ] User can attach annotations to a selected time range in the transcript (images, voice comments, clipboard content)
- [ ] User can edit, move, and remove existing annotations
- [ ] Annotations cannot overlap
- [ ] Annotation dialog uses CSS anchor positioning and opens as a `<dialog>` element with clipboard and file picker inputs
- [ ] App exports the annotated transcript as a markdown file, injecting annotations at their text position (images as `![]()`, audio as file links, clipboard text as footnotes, URLs as hyperlinks, clipboard images as images)
- [ ] App opens to the current session if one exists; otherwise shows a list of past recordings
- [ ] App auto-saves continuously and saves on close so sessions can be resumed
- [ ] Whisper large model downloads in the background on first launch; UI remains usable; status is always visible (present / downloading / error)

### Out of Scope

- Cloud-based transcription — local-only is a hard requirement
- Real-time / live transcription during recording — post-recording only
- Collaboration features beyond exporting a markdown file
- Mobile platforms — macOS, Windows, Linux desktop only
- Whisper model size selection — large model only, not configurable

## Context

Three previous AI-built attempts at this application all collapsed due to the same pattern: core features (audio recording, Whisper transcription, model downloading) were either broken or absent, and the UI was unusable. The app accumulated technical debt faster than working features were shipped.

This version must treat the core pipeline as the non-negotiable spine: device selection → record → transcribe → annotate → export. Each step must be genuinely functional before moving to the next. UI polish is secondary to pipeline reliability.

## Constraints

- **Tech stack**: Rust + Tauri — not negotiable, user has chosen this
- **Platform**: Cross-platform — macOS, Windows, Linux must all work
- **Transcription**: OpenAI Whisper large model, local only, auto language detection — no cloud fallback
- **Build approach**: Incremental and verifiable — each phase must produce something that actually runs and does its job

## Key Decisions

| Decision | Rationale | Outcome |
| -------- | --------- | ------- |
| Whisper large model, local only | Privacy, no cloud dependency, consistent behavior | - Pending |
| Type-driven markdown annotation format | Image files → `![]()`, audio → file link, clipboard text → footnote, URLs → hyperlink, clipboard images → `![]()` | - Pending |
| Current session as primary landing | User resumes work immediately; past recordings only shown when nothing is active | - Pending |
| Background model download, non-blocking UI | App is usable immediately; model status always visible | - Pending |
| CSS anchor + `<dialog>` for annotation UI | Native browser primitive, no custom popover library needed | - Pending |

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
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization*
