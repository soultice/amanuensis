# Requirements: Amanuensis

**Defined:** 2026-04-12
**Core Value:** Turn a spoken recording into a shareable, annotated Markdown document with zero friction — fast enough that it doesn't interrupt the user's workflow.

## v1 Requirements

### Audio Capture

- [ ] **AUDIO-01**: User can view all available audio input devices and select one before recording
- [ ] **AUDIO-02**: User can start a recording via a dedicated button
- [ ] **AUDIO-03**: User can stop a recording via a dedicated button
- [ ] **AUDIO-04**: App displays a real-time audio level meter while recording is active
- [ ] **AUDIO-05**: User can play back the recorded audio

### Transcription

- [ ] **TRANS-01**: App automatically transcribes the recording after the user stops it, using the local faster-whisper large-v3 model
- [ ] **TRANS-02**: Transcription uses automatic language detection (no manual language selection required)
- [ ] **TRANS-03**: App displays a transcription progress indicator while transcription is running
- [ ] **TRANS-04**: User can view the full transcribed text after transcription completes

### Transcript Navigation

- [ ] **NAV-01**: User can click a word in the transcript to seek the audio playback to that word's timestamp
- [ ] **NAV-02**: The current word is highlighted in the transcript during audio playback
- [ ] **NAV-03**: User can select a range of words in the transcript to use as an annotation target

### Annotations

- [ ] **ANNOT-01**: User can attach an image annotation to a selected word range (via file picker)
- [ ] **ANNOT-02**: User can attach an image annotation to a selected word range (via clipboard paste)
- [ ] **ANNOT-03**: User can attach a text or hyperlink annotation to a selected word range (via clipboard paste)
- [ ] **ANNOT-04**: User can attach an audio clip annotation to a selected word range (via file picker)
- [ ] **ANNOT-05**: User can edit an existing annotation
- [ ] **ANNOT-06**: User can move an annotation to a different word range
- [ ] **ANNOT-07**: User can remove an annotation
- [ ] **ANNOT-08**: Annotations cannot overlap — the app prevents selecting a word range that is already covered by an existing annotation
- [ ] **ANNOT-09**: Annotation creation and editing uses a CSS-anchored `<dialog>` element that opens adjacent to the selected word range
- [ ] **ANNOT-10**: The annotation dialog supports inserting content from clipboard and from a file picker

### Export

- [ ] **EXPORT-01**: User can export the annotated transcript as a `.md` file with an adjacent `assets/` folder
- [ ] **EXPORT-02**: Image annotations are exported as `![](assets/filename)` at their position in the transcript
- [ ] **EXPORT-03**: Hyperlink annotations are exported as `[text](url)` at their position in the transcript
- [ ] **EXPORT-04**: Other annotation types (text, audio) are exported as Markdown footnotes at their position in the transcript
- [ ] **EXPORT-05**: Annotations are injected at their word-range position in the exported document, in order

### Session

- [ ] **SESSION-01**: App auto-saves the current session every 30 seconds using atomic file writes
- [ ] **SESSION-02**: App saves the session when the user closes the window
- [ ] **SESSION-03**: App restores the previous session (audio, transcript, annotations) on next launch

## v2 Requirements

*(None — all features are v1)*

## Out of Scope

| Feature | Reason |
|---|---|
| In-app screen capture | Explicitly excluded — user pastes or picks screenshots manually |
| Multiple concurrent sessions / recording library | One session at a time; stated workflow |
| Cloud sync or remote Whisper API | Local model only; no cloud dependency |
| Speaker diarization | Adds ML complexity; single-speaker workflow assumed |
| Real-time transcription (while recording) | Whisper large model too slow for streaming |
| Smaller Whisper models | User requirement: large-v3 only |
| Translation | Auto-detect is sufficient; translation out of scope |
| Waveform editing (cut, splice) | Documentation tool, not a DAW |
| Collaboration / review comments | Single-user local tool |
| Mobile or web deployment | Desktop only |

## Traceability

| Requirement | Phase | Status |
|---|---|---|
| AUDIO-01 | — | Pending |
| AUDIO-02 | — | Pending |
| AUDIO-03 | — | Pending |
| AUDIO-04 | — | Pending |
| AUDIO-05 | — | Pending |
| TRANS-01 | — | Pending |
| TRANS-02 | — | Pending |
| TRANS-03 | — | Pending |
| TRANS-04 | — | Pending |
| NAV-01 | — | Pending |
| NAV-02 | — | Pending |
| NAV-03 | — | Pending |
| ANNOT-01 | — | Pending |
| ANNOT-02 | — | Pending |
| ANNOT-03 | — | Pending |
| ANNOT-04 | — | Pending |
| ANNOT-05 | — | Pending |
| ANNOT-06 | — | Pending |
| ANNOT-07 | — | Pending |
| ANNOT-08 | — | Pending |
| ANNOT-09 | — | Pending |
| ANNOT-10 | — | Pending |
| EXPORT-01 | — | Pending |
| EXPORT-02 | — | Pending |
| EXPORT-03 | — | Pending |
| EXPORT-04 | — | Pending |
| EXPORT-05 | — | Pending |
| SESSION-01 | — | Pending |
| SESSION-02 | — | Pending |
| SESSION-03 | — | Pending |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 30 ⚠️

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after initial definition*
