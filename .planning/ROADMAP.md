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
| 10 | Packaging & Distribution | Single installer per platform shipping Electron + frozen Python sidecar | Pending |
| 12 | Auto-Save Indicator & Manual Save Trigger | Auto-save countdown + manual save button | Pending |
| 13 | Editable Session Title | User can rename sessions; export reflects title | Pending |
| 14 | Copy Transcript to Clipboard | One-click copy of full transcript text | Pending |

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

---
*Roadmap last cleaned: 2026-04-14*
