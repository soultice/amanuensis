# Roadmap: Amanuensis

## Overview

Four phases, strictly ordered by pipeline dependency. Phase 1 proves audio recording works on all three platforms. Phase 2 builds the transcription engine on top of verified audio. Phase 3 adds the annotation system and markdown export on top of verified transcription. Phase 4 wraps everything in persistent session management. Each phase must be fully functional before the next begins — this is the lesson from three failed previous attempts.

## Phases

- [ ] **Phase 1: Recording Pipeline** - Working Tauri app that records real audio to disk on macOS, Windows, and Linux with device selection and live level meter
- [ ] **Phase 2: Transcription Engine** - Whisper large model downloads and transcribes to word-level timestamps; transcript renders with audio seek-on-click
- [ ] **Phase 3: Annotation + Export** - Full annotation CRUD with CSS anchor dialog and type-driven markdown export
- [ ] **Phase 4: Session Persistence** - Auto-save, save-on-close, session resume, and past sessions browser

## Phase Details

### Phase 1: Recording Pipeline
**Goal**: A working Tauri v2 app that captures real audio from a user-selected input device on macOS, Windows, and Linux, writes it to a WAV file, and shows a live audio level indicator during recording.
**Depends on**: Nothing (first phase)
**Requirements**: ADEV-01, ADEV-02, REC-01, REC-02, REC-03
**Success Criteria** (what must be TRUE):
  1. User can open the app and see a dropdown listing all system audio input devices
  2. User can select a device, press Record, speak, press Stop, and find a non-empty WAV file on disk
  3. The level meter visibly reacts to voice and shows silence when the room is quiet
  4. The above works on macOS (with mic permission), Windows (WASAPI), and Linux (PipeWire/ALSA)
**Plans**: 3 plans

Plans:
- [ ] 01-01: Tauri v2 project scaffold, build prerequisites, cross-platform CI verification
- [ ] 01-02: Audio device enumeration (cpal) + device selection UI (Svelte 5)
- [ ] 01-03: Recording pipeline (start/stop + WAV writer + live level meter events)

### Phase 2: Transcription Engine
**Goal**: The Whisper large model downloads automatically in the background with visible progress; recorded audio can be transcribed to text with word-level timestamps; the transcript renders in the UI with clicking a word seeking to that position in the audio.
**Depends on**: Phase 1
**Requirements**: MOD-01, MOD-02, MOD-03, TRNS-01, TRNS-02, TRNS-03, TRNS-04, SYNC-01, SYNC-02
**Success Criteria** (what must be TRUE):
  1. On first launch (no model file), the model downloads in the background; the rest of the UI is usable; a status indicator shows download progress
  2. After stopping a recording, user can trigger transcription; a progress indicator updates during transcription; the UI does not freeze
  3. The transcript shows each word individually with correct language auto-detected
  4. Clicking a word in the transcript moves the waveform playhead to that word's audio position
  5. Word timestamps are genuinely word-level (distinct start/end per word, not paragraph-level)
**Plans**: 3 plans

Plans:
- [ ] 02-01: Whisper model management (download with HTTP progress + status events + disk cache)
- [ ] 02-02: Transcription engine (whisper-rs async + word-level timestamps + SQLite word storage)
- [ ] 02-03: Transcript view (word list UI) + waveform (wavesurfer.js) + word-click seek sync

### Phase 3: Annotation + Export
**Goal**: User can attach image, voice comment, or clipboard content annotations to any non-overlapping time range in the transcript via a CSS-anchor-positioned dialog; annotations can be edited, moved, and removed; the annotated transcript exports to a valid markdown file with each annotation injected at the correct position in the correct format.
**Depends on**: Phase 2
**Requirements**: ANN-01, ANN-02, ANN-03, ANN-04, ANN-05, ANN-06, DLG-01, DLG-02, DLG-03, EXP-01, EXP-02, EXP-03, EXP-04, EXP-05, EXP-06, EXP-07
**Success Criteria** (what must be TRUE):
  1. User can select a word range and open an annotation dialog anchored to that selection
  2. User can paste an image, paste a URL, paste text, or pick a file — each is accepted and stored correctly
  3. Attempting to create an annotation that overlaps an existing one shows an error and is rejected
  4. Annotations appear as markers on the waveform timeline at their time position
  5. User can click an annotation marker to edit, move, or remove it
  6. Exported markdown file contains all annotations injected at their text position with correct format (image as `![]()`, audio as link, text as footnote, URL as hyperlink)
**Plans**: 3 plans

Plans:
- [ ] 03-01: Annotation data model (SQLite schema + CRUD commands + overlap enforcement in Rust)
- [ ] 03-02: Annotation dialog (CSS anchor + `<dialog>` + clipboard detection + file picker + waveform markers)
- [ ] 03-03: Markdown export (type-driven annotation injection + file save dialog)

### Phase 4: Session Persistence
**Goal**: Sessions are automatically saved continuously and on close; the app reopens to the last active session with all transcript and annotation data intact; if no active session exists, a list of past sessions is shown.
**Depends on**: Phase 3
**Requirements**: SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. User can close the app mid-session and reopen it to find the transcript and annotations exactly as left
  2. When no active session exists, the app opens to a list of past sessions sorted by date
  3. User can open a past session and resume annotating or re-export it
  4. App saves state automatically every 30 seconds and immediately on window close
**Plans**: 2 plans

Plans:
- [ ] 04-01: Session auto-save + save-on-close (tauri-plugin-sql + tauri-plugin-store)
- [ ] 04-02: Sessions list UI + session open/resume flow + active session routing

## Progress

**Execution Order:**
Phases execute sequentially: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
| ----- | -------------- | ------ | --------- |
| 1. Recording Pipeline | 0/3 | Not started | - |
| 2. Transcription Engine | 0/3 | Not started | - |
| 3. Annotation + Export | 0/3 | Not started | - |
| 4. Session Persistence | 0/2 | Not started | - |
