# Roadmap: Amanuensis

**Created:** 2026-04-12
**Requirements:** 30 v1 requirements across 5 phases
**Granularity:** Coarse

---

## Phase Overview

| # | Phase | Goal | Requirements | Plans |
|---|---|---|---|---|
| 1 | Foundation | Working Electron app with Python sidecar connected and health-checked | Complete    | 2026-04-12 |
| 2 | Audio & Transcription | User can record audio and receive a word-level transcript | AUDIO-01–05, TRANS-01–04 | 2 |
| 3 | Transcript & Waveform | User can navigate the transcript and audio in sync | NAV-01–03 | 1 |
| 4 | Annotations & Persistence | User can annotate word ranges and session persists across relaunches | ANNOT-01–10, SESSION-01–03 | 2 |
| 5 | Export & Packaging | User can export Markdown docs and install the app | EXPORT-01–05 | 2 |

---

## Phase 1: Foundation

**Goal:** A working Electron + Vue 3 app that spawns the Python FastAPI sidecar, verifies it's healthy, and exposes a secure IPC bridge to the renderer. No features yet — just a solid, secure scaffold that every subsequent phase builds on.

**Requirements:** *(structural — no user-facing requirements yet; enables all others)*

**Plans:**
2/2 plans complete
   - Python FastAPI sidecar (faster-whisper installed, `/health` endpoint, port discovery)
   - Sidecar spawn on app start, health polling, graceful shutdown

**Success Criteria:**
1. App window opens and displays a placeholder Vue view
2. Python sidecar starts automatically with the app and responds to `GET /health` with 200
3. Renderer receives the sidecar port number via `window.api.getSidecarPort()` without error
4. App closes cleanly, killing the sidecar process
5. `contextIsolation: true` and `nodeIntegration: false` verified in Electron security audit

---

## Phase 2: Audio & Transcription

**Goal:** User can select a microphone, record audio with visual feedback, and receive a complete word-level transcript from the local Whisper model.

**Requirements:** AUDIO-01, AUDIO-02, AUDIO-03, AUDIO-04, AUDIO-05, TRANS-01, TRANS-02, TRANS-03, TRANS-04

**Plans:**
1. Audio capture — device enumeration UI, MediaRecorder recording, level meter, playback
2. Transcription pipeline — WebM→WAV conversion in sidecar, faster-whisper large-v3 transcription, word timestamps, progress SSE, transcript display

**Success Criteria:**
1. User sees a dropdown listing all available audio input devices and can select one
2. Clicking Record starts capture; the level meter visibly responds to voice input
3. Clicking Stop ends recording; audio is playable in the app
4. After stopping, transcription starts automatically with a visible progress indicator
5. Transcribed text appears with per-word data (word, start, end timestamps) after completion
6. Auto language detection works without any user input

---

## Phase 3: Transcript & Waveform

**Goal:** User can click any word in the transcript to seek the audio to that point, select a word range for annotation, and see the current word highlighted during playback.

**Requirements:** NAV-01, NAV-02, NAV-03

**Plans:**
1. WaveSurfer integration, word-span rendering, click-to-seek, playback word highlight, drag-to-select word range, WaveSurfer region highlight for selection

**Success Criteria:**
1. Transcript words are rendered as individually clickable spans
2. Clicking a word seeks audio playback to within 200ms of that word's start timestamp
3. During playback, the word currently being spoken is visually highlighted in the transcript
4. User can drag across words to select a range; selected words are visually highlighted
5. The selected word range is highlighted as a region on the WaveSurfer waveform

---

## Phase 4: Annotations & Persistence

**Goal:** User can attach, edit, move, and remove image/text/link/audio annotations on word ranges, with non-overlapping enforcement, a CSS-anchored dialog UI, and full session persistence across relaunches.

**Requirements:** ANNOT-01, ANNOT-02, ANNOT-03, ANNOT-04, ANNOT-05, ANNOT-06, ANNOT-07, ANNOT-08, ANNOT-09, ANNOT-10, SESSION-01, SESSION-02, SESSION-03

**Plans:**
1. Annotation CRUD — CSS anchor `<dialog>`, file picker, clipboard paste, image/text/link/audio types, non-overlap enforcement, edit/move/remove
2. Session persistence — atomic JSON save every 30s, save-on-close, restore on launch (audio path, transcript, annotations)

**Success Criteria:**
1. Selecting a word range and clicking "Add annotation" opens a `<dialog>` positioned adjacent to the selection
2. User can paste an image from clipboard or pick one from disk — it appears attached to the word range in the transcript view
3. User can paste a URL from clipboard — it appears as a hyperlink annotation
4. Selecting a word range that overlaps an existing annotation is blocked with a clear visual indicator
5. Closing and relaunching the app restores the transcript and all annotations exactly
6. Session auto-saves every 30s; a force-quit does not corrupt the session file

---

## Phase 5: Export & Packaging

**Goal:** User can export a `.md` file with `assets/` folder where annotations appear at their transcript position in correct Markdown form, and the app is installable on macOS, Windows, and Linux.

**Requirements:** EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05

**Plans:**
1. Markdown export — annotation injection at word-range position, image copy to `assets/`, hyperlink formatting, footnote formatting, native save dialog
2. Cross-platform packaging — PyInstaller sidecar binary, electron-builder config, macOS entitlements, CI build for macOS/Windows/Linux

**Success Criteria:**
1. User can trigger export via a button and choose an output directory via a native dialog
2. Exported `.md` contains transcript text with image annotations rendered as `![description](assets/filename.png)` at the correct position
3. Hyperlink annotations appear as `[text](url)` at the correct position
4. Other annotation types (text, audio) appear as Markdown footnotes at the correct position
5. App packages successfully into a `.dmg` (macOS), `.exe` installer (Windows), and `.AppImage` (Linux) with no Python installation required on the target machine

---

## Requirement Coverage

| Requirement | Phase |
|---|---|
| AUDIO-01 | Phase 2 |
| AUDIO-02 | Phase 2 |
| AUDIO-03 | Phase 2 |
| AUDIO-04 | Phase 2 |
| AUDIO-05 | Phase 2 |
| TRANS-01 | Phase 2 |
| TRANS-02 | Phase 2 |
| TRANS-03 | Phase 2 |
| TRANS-04 | Phase 2 |
| NAV-01 | Phase 3 |
| NAV-02 | Phase 3 |
| NAV-03 | Phase 3 |
| ANNOT-01 | Phase 4 |
| ANNOT-02 | Phase 4 |
| ANNOT-03 | Phase 4 |
| ANNOT-04 | Phase 4 |
| ANNOT-05 | Phase 4 |
| ANNOT-06 | Phase 4 |
| ANNOT-07 | Phase 4 |
| ANNOT-08 | Phase 4 |
| ANNOT-09 | Phase 4 |
| ANNOT-10 | Phase 4 |
| EXPORT-01 | Phase 5 |
| EXPORT-02 | Phase 5 |
| EXPORT-03 | Phase 5 |
| EXPORT-04 | Phase 5 |
| EXPORT-05 | Phase 5 |
| SESSION-01 | Phase 4 |
| SESSION-02 | Phase 4 |
| SESSION-03 | Phase 4 |

**Coverage: 30/30 ✓**

---
*Roadmap created: 2026-04-12*
