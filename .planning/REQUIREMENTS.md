# Requirements: Amanuensis

**Defined:** 2026-04-12
**Core Value:** A complete, reliable pipeline from spoken word to annotated markdown document — every step must actually work or the tool is useless.

## v1 Requirements

### Audio Device

- [ ] **ADEV-01**: User can view all available system audio input devices in a dropdown
- [ ] **ADEV-02**: User can select one input device to record from; selection persists across sessions

### Recording

- [ ] **REC-01**: User can start an audio recording via a dedicated button
- [ ] **REC-02**: User can stop an active audio recording via a dedicated button
- [ ] **REC-03**: User sees a live visual indicator (level meter or waveform) confirming audio is being captured during recording

### Model

- [ ] **MOD-01**: App downloads the Whisper large model in the background on first launch
- [ ] **MOD-02**: UI shows model status at all times: Not Downloaded / Downloading (X%) / Ready / Error
- [ ] **MOD-03**: UI remains fully usable while model is downloading

### Transcription

- [ ] **TRNS-01**: App transcribes the recorded audio using the local Whisper large model after recording stops
- [ ] **TRNS-02**: Transcription uses automatic language detection
- [ ] **TRNS-03**: Transcription produces word-level timestamps (each word has a start and end time in ms)
- [ ] **TRNS-04**: User can view the full transcribed text

### Transcript-Audio Sync

- [ ] **SYNC-01**: User can click a word in the transcript and see the corresponding position highlighted on the audio timeline
- [ ] **SYNC-02**: The audio timeline shows a waveform with a playback cursor

### Annotations

- [ ] **ANN-01**: User can select a time range in the transcript and attach an annotation to it
- [ ] **ANN-02**: Annotation types: image (from file picker), audio/voice comment (recorded clip or file), clipboard content (text, URL, or image auto-detected)
- [ ] **ANN-03**: User can edit an existing annotation's content
- [ ] **ANN-04**: User can move an annotation to a different time range
- [ ] **ANN-05**: User can remove an annotation
- [ ] **ANN-06**: Annotations cannot overlap — the app rejects a new annotation that overlaps an existing one

### Annotation Dialog

- [ ] **DLG-01**: Annotation dialog opens as a `<dialog>` element using CSS anchor positioning, anchored to the selected text range
- [ ] **DLG-02**: Dialog provides clipboard paste input (auto-detects text, URL, or image)
- [ ] **DLG-03**: Dialog provides a file picker for image and audio file attachment

### Export

- [ ] **EXP-01**: User can export the annotated transcript as a markdown file via a save dialog
- [ ] **EXP-02**: Annotations are injected at their text position in the markdown output
- [ ] **EXP-03**: Image annotations render as `![](path/to/image.png)` in markdown
- [ ] **EXP-04**: Voice comment / audio annotations render as `[voice comment](path/to/comment.wav)` in markdown
- [ ] **EXP-05**: Clipboard text annotations render as footnotes (`[^1]` inline + definition at end)
- [ ] **EXP-06**: URL annotations render as `[text](https://url)` hyperlinks in markdown
- [ ] **EXP-07**: Clipboard image annotations render as `![](path/to/image.png)` in markdown

### Session

- [ ] **SESS-01**: App opens to the current active session if one exists
- [ ] **SESS-02**: If no active session exists, app shows a list of past sessions the user can reopen
- [ ] **SESS-03**: App auto-saves session state continuously (transcript, annotations, device selection)
- [ ] **SESS-04**: App saves session state on close; session is fully restorable on next launch

## v2 Requirements

### Playback

- **PLAY-01**: User can play back the recorded audio with a play/pause/seek controls
- **PLAY-02**: User can adjust playback speed (0.5x, 1x, 1.5x, 2x)
- **PLAY-03**: Transcript word highlight follows playback position in real time

### Search

- **SRCH-01**: User can search for a word or phrase within the transcript
- **SRCH-02**: Search results highlight matching words in the transcript

### Export

- **EXP-V2-01**: User can export to additional formats (HTML, plain text)

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Cloud / API-based transcription | Hard requirement: local-only. Privacy and no-network-dependency. |
| Real-time transcription during recording | Adds streaming complexity, latency, chunking. Post-recording batch transcription is correct for documentation use. |
| Whisper model size selection | Large model only — consistency and quality requirement. |
| Multi-user collaboration | Infrastructure, auth, sync conflicts — none of which is the product. |
| Speaker diarization | Requires a separate pipeline (pyannote-audio); not supported by whisper-rs. |
| In-app markdown editor | Scope creep; duplicates any text editor. Export then edit elsewhere. |
| Video recording / screen capture | Completely different capture pipeline. |
| Sync across devices / cloud storage | Out of scope; export the markdown file and share. |
| Mobile platforms | Desktop only: macOS, Windows, Linux. |

## Traceability

Requirements mapped to phases after roadmap creation.

| Requirement | Phase | Status |
| ----------- | ----- | ------ |
| ADEV-01 | Phase 1 | Pending |
| ADEV-02 | Phase 1 | Pending |
| REC-01 | Phase 1 | Pending |
| REC-02 | Phase 1 | Pending |
| REC-03 | Phase 1 | Pending |
| MOD-01 | Phase 2 | Pending |
| MOD-02 | Phase 2 | Pending |
| MOD-03 | Phase 2 | Pending |
| TRNS-01 | Phase 2 | Pending |
| TRNS-02 | Phase 2 | Pending |
| TRNS-03 | Phase 2 | Pending |
| TRNS-04 | Phase 2 | Pending |
| SYNC-01 | Phase 2 | Pending |
| SYNC-02 | Phase 2 | Pending |
| ANN-01 | Phase 3 | Pending |
| ANN-02 | Phase 3 | Pending |
| ANN-03 | Phase 3 | Pending |
| ANN-04 | Phase 3 | Pending |
| ANN-05 | Phase 3 | Pending |
| ANN-06 | Phase 3 | Pending |
| DLG-01 | Phase 3 | Pending |
| DLG-02 | Phase 3 | Pending |
| DLG-03 | Phase 3 | Pending |
| EXP-01 | Phase 3 | Pending |
| EXP-02 | Phase 3 | Pending |
| EXP-03 | Phase 3 | Pending |
| EXP-04 | Phase 3 | Pending |
| EXP-05 | Phase 3 | Pending |
| EXP-06 | Phase 3 | Pending |
| EXP-07 | Phase 3 | Pending |
| SESS-01 | Phase 4 | Pending |
| SESS-02 | Phase 4 | Pending |
| SESS-03 | Phase 4 | Pending |
| SESS-04 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
*Last updated: 2026-04-12 after initial definition*
