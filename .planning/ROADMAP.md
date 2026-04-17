# Roadmap: Amanuensis

**Created:** 2011-04-12
**Requirements:** 30 v1 requirements across 5 phases
**Granularity:** Coarse

---

## Phase Overview

| # | Phase | Goal | Status |
|---|---|---|---|
| 1 | Foundation | Working Electron app with Python sidecar connected and health-checked | Complete |
| 2 | Audio & Transcription | User can record audio and receive a word-level transcript | Complete |
| 3 | Transcript & Waveform | User can navigate the transcript and audio in sync | Complete |
| 4 | Annotations & Persistence | User can annotate word ranges and session persists across relaunches | Complete |
| 5 | Export & Packaging | User can export Markdown docs and install the app | Complete |
| 6 | Bug Fixing | End-to-end bug audit and fixes for full app usability | Complete |
| 7 | Image Export Formatting | Image annotations render as block elements in exported Markdown | Complete |
| 8 | Session Management | User can maintain multiple transcript sessions, switch between them, close and reopen in-progress work | Complete |
| 9 | UI Overhaul | Solarized palette (light + dark mode), reading-optimised transcript panel | Complete |
| 10 | Packaging & Distribution | Single installer per platform shipping Electron + frozen Python sidecar | Complete |
| 12 | Auto-Save Indicator & Manual Save Trigger | Auto-save countdown + manual save button | Complete |
| 13 | Editable Session Title | User can rename sessions; export reflects title | Complete |
| 14 | Copy Transcript to Clipboard | One-click copy of full transcript text | Complete |

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
2/2 plans complete
   1. Audio capture — device enumeration, MediaRecorder, level meter
   2. Transcription pipeline — WebM→WAV conversion, faster-whisper large-v3, word timestamps, progress SSE, transcript display

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
2/2 plans complete

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
2/2 plans complete
   1. Annotation CRUD — image/text/link/audio types, non-overlapping enforcement, dialog UI
   2. Session persistence — atomic JSON save every 30s, save-on-close, restore on launch

**Success Criteria:**
1. Selecting a word range and clicking "Add annotation" opens a `<dialog>` positioned adjacent to the selection
2. User can paste an image from clipboard or pick one from disk — it appears attached to the word range
3. User can paste a URL — it appears as a hyperlink annotation
4. Overlapping annotations are blocked with a clear visual indicator
5. Closing and relaunching the app restores the transcript and all annotations exactly
6. Session auto-saves every 30s; a force-quit does not corrupt the session file

---

## Phase 5: Export & Packaging

**Goal:** User can export a `.md` file with `assets/` folder where annotations appear at their transcript position in correct Markdown form, and the app is installable on macOS, Windows, and Linux.

**Requirements:** EXPORT-01, EXPORT-02, EXPORT-03, EXPORT-04, EXPORT-05

**Plans:**
2/2 plans complete
   1. Markdown export — transcript text, image/link/text/audio annotations at correct positions
   2. Cross-platform packaging — PyInstaller sidecar binary, electron-builder config, macOS entitlements

**Success Criteria:**
1. User can trigger export via a button and choose an output directory via a native dialog
2. Exported `.md` contains transcript text with image annotations as `![description](assets/filename.png)`
3. Hyperlink annotations appear as `[text](url)` at the correct position
4. Other annotation types appear as Markdown footnotes at the correct position
5. App packages into `.dmg` (macOS), `.exe` (Windows), and `.AppImage` (Linux) with no Python required

---

## Phase 6: Bug Fixing

**Goal:** Audit the app end-to-end for runtime bugs across all phases and fix them so the app is functionally usable.

**Requirements:** *(gap-closure — no new requirements, validates existing phases 1–5)*

**Plans:**
1/1 plans complete

**Success Criteria:**
1. App launches without errors
2. Recording and transcription work end-to-end
3. Word click-to-seek and selection work in the transcript
4. Annotations can be created, edited, and removed
5. Session saves and restores correctly across relaunches

---

## Phase 7: Image Export Formatting

**Goal:** When exporting to Markdown, image annotations must not be inline — they must be rendered as block elements: the preceding transcript text ends on its own line, the image appears on its own line, and the following text begins on a new line.

**Requirements:** *(refinement of EXPORT-02)*

**Plans:**
1/1 plans complete

**Success Criteria:**
1. Exported `.md` renders images as block-level elements — each image is preceded and followed by a blank line
2. No transcript text appears on the same line as an image tag
3. Existing text and hyperlink annotation formatting is unaffected

---

## Phase 8: Session Management

**Goal:** Allow users to maintain multiple transcript sessions simultaneously. A user can close the current session (saving all state), browse a list of past sessions, and open any of them to continue work — or start a fresh session from scratch.

**Requirements:** *(extends SESSION-01–03 from Phase 4)*

**Plans:**
3/3 plans complete

**Success Criteria:**
1. User can see a list of all saved sessions (title, date, word count)
2. User can open any past session and resume annotation where they left off
3. User can close the current session and return to the session list
4. User can create a brand-new session from the session list
5. Switching sessions preserves all annotation and transcript data for the closed session
6. App opens to the session list on relaunch

---

## Phase 9: UI Overhaul

**Goal:** Replace ad-hoc utility styles with a coherent Solarized-based design system (light and dark modes), and optimise the transcript panel for comfortable long-form reading.

**Requirements:** *(UI-01 through UI-N)*

**Plans:**
5/5 plans complete

**Success Criteria:**
1. App ships Solarized Light as default; Solarized Dark toggled via a toolbar button
2. Dark mode preference persists across sessions (localStorage)
3. Transcript panel uses a readable measure (≤75ch), comfortable line-height, and a legible font
4. All interactive elements use the Solarized palette
5. Session list view and onboarding view are also reskinned
6. No regression in existing functionality

---

## Phase 10: Packaging & Distribution

**Goal:** Produce a single self-contained installer per platform (macOS `.dmg`, Windows NSIS `.exe`, Linux `.AppImage`) that bundles the Electron app and the frozen Python sidecar. No Python or Node runtime required on the end-user machine.

**Requirements:** *(build infrastructure — no new user-facing requirements)*

**Plans:**
0/4 plans complete

**Success Criteria:**
1. `npm run build:all` completes without error on macOS ARM64
2. The produced `.dmg` installs and launches the app successfully
3. Sidecar starts automatically within the packaged app and `GET /health` returns 200
4. Model download works from within the packaged app (userData path correct)
5. No user needs Python, Node, or any runtime pre-installed
6. GitHub Actions workflow builds and uploads the `.dmg` artifact on push to `main`

---

## Phase 11: Pause & Resume Recordings

**Goal:** User can pause an active recording and resume it; silence during pause is excluded from the audio file so the transcript is seamless.

**Requirements:** *(extends AUDIO-02, AUDIO-03 from Phase 2)*

**Plans:**
0/2 plans complete

**Success Criteria:**
1. While recording, the record button changes to "⏸ Pause" and clicking it suspends audio capture
2. While paused, the button shows "● Resume" and clicking it resumes capture
3. The Stop button remains available during both recording and paused states
4. The level meter is frozen (inactive) while paused
5. The final audio blob contains no silence from pause periods
6. Reported recording duration excludes time spent paused

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

### Phase 12: Auto-Save Indicator & Manual Save Trigger

**Goal:** A 48px progress bar in the toolbar fills left-to-right over 30s showing time until the next auto-save. Clicking it saves immediately without resetting the countdown.
**Requirements:** extends SESSION-01
**Depends on:** Phase 11
**Plans:** 2 plans

**Success Criteria:**
1. A slim progress bar is visible in the toolbar whenever a session is active
2. The bar fills from 0% to 100% over 30 seconds, then resets after each auto-save
3. Clicking the bar triggers an immediate save
4. The countdown continues from the same position after a manual save
5. A tooltip shows "Next auto-save in Xs — click to save now"

---

### Phase 13: Editable Session Title

**Goal:** User can click a title at the top of the transcript panel to rename the session; new sessions default to "Untitled session"; exported Markdown uses the title as the H1 heading.
**Requirements:** extends SESSION-01–03
**Depends on:** Phase 12
**Plans:** 3 plans

**Success Criteria:**
1. An editable title appears at the top of the transcript panel for all session states
2. Clicking the title makes it editable inline; Enter/blur commits, Escape cancels
3. New sessions default to "Untitled session"
4. Rename persists across app restarts
5. Exported Markdown H1 reflects the session title

---

### Phase 14: Copy Transcript to Clipboard

**Goal:** A "Copy" button in the annotation panel header copies the plain transcript text to the clipboard with a brief "✓ Copied" confirmation.
**Requirements:** extends TRANS-04
**Depends on:** Phase 13
**Plans:** 1 plan

**Success Criteria:**
1. "⎘ Copy" button appears in the annotation panel header next to Export
2. Clicking it writes `words.map(w => w.word).join('').trim()` to the clipboard
3. Button briefly shows "✓ Copied" for 1.5s then reverts
4. Button is disabled when no transcript exists



### Phase 15: Waveform Horizontal Layout

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 14
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 15 to break down)

### Phase 16: Make project installable on any machine ✓

**Goal:** Ensure anyone can clone and `npm install` without a corporate registry override.
**Requirements**: INSTALL-01, INSTALL-02, INSTALL-03
**Depends on:** Phase 15
**Plans:** 1 plan
**Completed:** 2026-04-16

Plans:
- [x] 16-01: Add .npmrc, npm engine constraint, and README prerequisites (2026-04-16)

### Phase 17: "I want to make sure the app is compatible with all three major OS (Linux, macOS, Windows) meaning i should be able to install it bundled to an app OR by checking out the repository and working on it to contribute"

**Goal:** Cross-platform compatibility — app builds and runs on Linux, macOS, and Windows for both end users (bundled installer) and contributors (dev checkout)
**Requirements**: COMPAT-01–05
**Depends on:** Phase 16
**Plans:** 3/3 complete ✓ (2026-04-16)

Plans:
- [x] 17-01: Extend CI to Linux and Windows (matrix build workflow)
- [x] 17-02: Fix Windows dev mode + electron-builder cross-platform config
- [x] 17-03: CONTRIBUTING.md with platform-specific setup guide

### Phase 18: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 I want to try this model instead of the current openai-whisper"

**Goal:** Replace faster-whisper with NVIDIA Parakeet ONNX in the sidecar while preserving transcript/timestamp contracts and explicit model download UX.
**Requirements**: TRANS-01, TRANS-02, TRANS-03, TRANS-04, NAV-01, NAV-02, COMPAT-01, COMPAT-03
**Depends on:** Phase 17
**Plans:** 3/3 plans complete

Plans:
- [x] 18-01: Replace model-management stack with Parakeet ONNX
- [x] 18-02: Implement Parakeet transcription path and preserve UI contract
- [x] 18-03: Packaging alignment, docs updates, and roadmap bookkeeping

### Phase 19: "transcription should be live from now on"

**Goal:** Add live transcription during active recording so transcript text appears in near real-time, while preserving existing recording reliability and finalized word timestamp contracts.
**Requirements**: D-01–D-09 (see `19-CONTEXT.md`)
**Depends on:** Phase 18
**Plans:** 3/3 planned, automated verification passed; human UX validation Complete

Plans:
- [x] 19-01: Sidecar live transcription session protocol and lifecycle-safe routes
- [x] 19-02: Renderer live session orchestration and interim/final transcript state
- [x] 19-03: UI warning/finalizing states and integration verification

**Success Criteria:**
1. Interim transcript text appears during recording with low-latency updates
2. Finalized chunks replace interim text and keep word timestamps only on finalized data
3. Pause/resume recording also pauses/resumes live transcription without corrupting transcript boundaries
4. Stopping recording finalizes any Complete interim transcript and leaves the transcript in the existing final schema
5. If live transcription fails, recording continues and the UI shows a visible non-blocking warning

### Phase 20: "remove the transcribe button and functionality it is not needed anymore due to the live transcription"

**Goal:** Remove the legacy manual transcribe affordance now that live transcription owns the recording-to-transcript flow.
**Requirements**: TRANS-01, TRANS-03, TRANS-04, NAV-01, NAV-02, NAV-03
**Depends on:** Phase 19
**Plans:** 2/2 plans complete ✓
**Completed:** 2026-04-17

Plans:
- [x] 20-01: Convert manual batch transcription into internal recovery for live failures and restored sessions
- [x] 20-02: Remove visible Transcribe UI and align live-first copy/status UX

### Phase 21: "increase speed of live transcription"

**Goal:** Improve first-token speed and live update cadence so live transcription feels natural while preserving Phase 19 transcript/failure contracts.
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08 (see `21-CONTEXT.md`)
**Depends on:** Phase 20
**Plans:** 3/3 plans complete ✓
**Completed:** 2026-04-17

Plans:
- [x] 21-01: Sidecar latency instrumentation and natural-feel target contracts
- [x] 21-02: Sidecar bounded-work speed architecture with safe_auto default and internal aggressive mode
- [x] 21-03: Renderer adaptive cadence and UX verification using sidecar telemetry

### Phase 22: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 21
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 22 to break down)

### Phase 23: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 22
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 23 to break down)

### Phase 24: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 23
**Plans:** 1/5 plans complete

Plans:
- [x] 24-01: Truthful backlog telemetry and renderer visibility
- [ ] 24-02: Pending
- [ ] 24-03: Pending
- [ ] 24-04: Pending
- [ ] 24-05: Pending

### Phase 25: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 24
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 25 to break down)

### Phase 26: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 25
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 26 to break down)

### Phase 27: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 26
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 27 to break down)

### Phase 28: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 27
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 28 to break down)

### Phase 29: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 28
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 29 to break down)

### Phase 30: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 29
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 30 to break down)

### Phase 31: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 30
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 31 to break down)

### Phase 32: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 31
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 32 to break down)

### Phase 33: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 32
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 33 to break down)

### Phase 34: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 33
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 34 to break down)

### Phase 35: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 34
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 35 to break down)

### Phase 36: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 35
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 36 to break down)

### Phase 37: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 36
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 37 to break down)

### Phase 38: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 37
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 38 to break down)

### Phase 39: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 38
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 39 to break down)

### Phase 40: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 39
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 40 to break down)

### Phase 41: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 40
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 41 to break down)

### Phase 42: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 41
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 42 to break down)

### Phase 43: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 42
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 43 to break down)

### Phase 44: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 43
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 44 to break down)

### Phase 45: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 44
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 45 to break down)

### Phase 46: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 45
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 46 to break down)

### Phase 47: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 46
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 47 to break down)

### Phase 48: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 47
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 48 to break down)

### Phase 49: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 48
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 49 to break down)

### Phase 50: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 49
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 50 to break down)

### Phase 51: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 50
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 51 to break down)

### Phase 52: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 51
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 52 to break down)

### Phase 53: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 52
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 53 to break down)

### Phase 54: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 53
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 54 to break down)

### Phase 55: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 54
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 55 to break down)

### Phase 56: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 55
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 56 to break down)

### Phase 57: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 56
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 57 to break down)

### Phase 58: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 57
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 58 to break down)

### Phase 59: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 58
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 59 to break down)

### Phase 60: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 59
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 60 to break down)

### Phase 61: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 60
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 61 to break down)

### Phase 62: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 61
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 62 to break down)

### Phase 63: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 62
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 63 to break down)

### Phase 64: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 63
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 64 to break down)

### Phase 65: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 64
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 65 to break down)

### Phase 66: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 65
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 66 to break down)

### Phase 67: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 66
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 67 to break down)

### Phase 68: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 67
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 68 to break down)

### Phase 69: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 68
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 69 to break down)

### Phase 70: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 69
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 70 to break down)

### Phase 71: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 70
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 71 to break down)

### Phase 72: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 71
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 72 to break down)

### Phase 73: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 72
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 73 to break down)

### Phase 74: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 73
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 74 to break down)

### Phase 75: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 74
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 75 to break down)

### Phase 76: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 75
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 76 to break down)

### Phase 77: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 76
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 77 to break down)

### Phase 78: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 77
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 78 to break down)

### Phase 79: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 78
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 79 to break down)

### Phase 80: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 79
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 80 to break down)

### Phase 81: "the text width should be fixed and optimized for reading, currently it flickers as more text chunks are coming in"

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 80
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 81 to break down)

### Phase 82: "it seems there are too many chunks coming in, the longer the spoken text the worse the delay becomes and the longer the queue seems to be. find optimizations and implement them. optimizations can include running on the GPU, having less chunks, etc."

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 81
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 82 to break down)

---
*Roadmap last cleaned: 2026-04-17*
