# Feature Research

**Domain:** Desktop audio transcription + annotation + documentation tool
**Researched:** 2026-04-12
**Confidence:** HIGH (based on analysis of Descript, Otter.ai, Whisper Desktop, Audacity, Adobe Podcast)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
| ------- | ------------ | ---------- | ----- |
| Audio device selection | Microphone choice is standard in any recording tool | Low | Dropdown of system input devices; remember last selection |
| Start / Stop recording buttons | Baseline UX for any recorder | Low | Clear visual state (recording vs not) |
| Live audio level indicator | Confirms mic is working and capturing signal | Low | Waveform or VU meter; users immediately check this after pressing Record |
| Transcription after recording | Core value — without this, it's just a recorder | High | Must complete without user intervention; show progress |
| View transcribed text | Users need to read/verify the transcript | Low | Scrollable, readable text view |
| Word-level transcript-audio sync | Click a word, hear/see that moment in audio | Medium | Standard in Descript, Otter — users expect bi-directional sync |
| Session save and resume | Recording sessions are valuable; losing them = rage quit | Medium | Auto-save continuously; restore state on relaunch |
| Export / output | A tool that can't export its result is useless | Low | File save dialog; users expect one click to get the output |

### Differentiators (Competitive Advantage)

Features that set this product apart. Not baseline expectations.

| Feature | Value Proposition | Complexity | Notes |
| ------- | ----------------- | ---------- | ----- |
| Time-range annotations | Attach rich media to specific spoken moments — no other local tool does this | High | The core differentiator of Amanuensis |
| Type-driven markdown injection | Annotations become semantically correct markdown (image/link/footnote by type) | Medium | Turns spoken notes into publishable documentation |
| Voice comment annotations | Record a separate audio note at a transcript position | Medium | Useful for adding clarification without re-recording |
| Non-overlapping annotation enforcement | Clean, non-ambiguous annotation model | Low-Medium | Professional constraint that prevents data corruption |
| CSS anchor + dialog annotation entry | Contextual, inline annotation UI without leaving the transcript | Medium | Faster workflow than modal dialogs |
| Clipboard-aware annotation | Paste image or URL directly into annotation — no intermediate step | Low | Significant UX speedup |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
| ------- | ------------- | --------------- | ----------- |
| Real-time transcription during recording | Feels futuristic | Adds 200-500ms latency per segment, requires chunked streaming to Whisper, dramatically increases complexity with marginal benefit for documentation use case | Post-recording batch transcription |
| Cloud transcription fallback | "What if local is slow?" | Contradicts privacy requirement, adds API key management, network dependency, cost | Optimize local: large model is fast enough on any recent CPU/GPU |
| Multi-user collaboration | "Can I share my session?" | Sync conflicts, authentication, server infrastructure — none of which is the product | Export markdown and share the file |
| In-app markdown editor | "Can I edit the markdown before exporting?" | Scope creep; duplicates what every text editor does | Export then open in editor of choice |
| Video recording | "I want to capture my screen too" | Completely different capture pipeline; out of scope | Use a separate screen recorder alongside Amanuensis |
| Speaker diarization ("who spoke when") | Seems useful for multi-person recordings | Whisper large model doesn't do diarization reliably; requires pyannote-audio — completely different pipeline | Document it as out of scope |

## Feature Dependencies

```
[Audio Device Selection]
    └──enables──> [Recording]
                      └──produces──> [Audio File]
                                         └──enables──> [Transcription]
                                                            └──produces──> [Word Timestamps]
                                                                               └──enables──> [Transcript-Audio Sync]
                                                                               └──enables──> [Annotations]
                                                                                                └──enables──> [Markdown Export]

[Session Persistence] ──wraps──> [Recording + Transcript + Annotations]

[Live Audio Level] ──requires──> [Active Recording Stream] (parallel to recording)

[Model Download] ──must precede──> [Transcription]
```

### Dependency Notes

- **Recording requires device selection:** Must pick device before stream opens.
- **Transcription requires audio file:** Batch model — record first, transcribe after stop.
- **Annotations require word timestamps:** Can't attach to time ranges without word-level timing data from Whisper.
- **Markdown export requires annotations:** Export without annotations is just raw transcript text.
- **Model download must precede transcription:** Whisper large model (~3GB) must be present on disk.
- **Live audio level is independent:** Runs in parallel with recording; does not affect transcript.

## MVP Recommendation

### Launch With (v1)

Minimum viable product — the pipeline must work end-to-end:

- [ ] **Audio device selection** — can't record without this
- [ ] **Start/Stop recording** — fundamental
- [ ] **Live audio level indicator** — required for confidence the mic is working
- [ ] **Model download with progress** — Whisper large must be present; blocking download = unusable app
- [ ] **Transcription with word-level timestamps** — core value
- [ ] **Transcript view** — must see the output
- [ ] **Transcript-audio sync** — click word, see/hear position (users expect this)
- [ ] **Time-range annotations** (image, voice comment, clipboard) — the differentiator
- [ ] **Annotation edit/move/remove** — annotations without edit = frustrating
- [ ] **Non-overlapping annotation enforcement** — correctness requirement
- [ ] **CSS anchor dialog for annotation entry** — the intended UX
- [ ] **Markdown export** — the final deliverable
- [ ] **Session save/resume** — data loss = unacceptable

### Add After Validation (v1.x)

- Search/filter within transcript
- Playback speed control (0.5x, 1x, 1.5x, 2x)
- Keyboard shortcuts for annotation workflow

### Future Consideration (v2+)

- Multiple concurrent sessions
- Custom Whisper model selection (medium, small for speed)
- Export to additional formats (HTML, DOCX)
- Batch transcription of existing audio files

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
| ------- | ---------- | ------------------- | -------- |
| Recording (device select + start/stop) | HIGH | LOW | P1 |
| Live level indicator | HIGH | LOW | P1 |
| Model download + progress | HIGH | MEDIUM | P1 |
| Transcription (word timestamps) | HIGH | HIGH | P1 |
| Transcript view | HIGH | LOW | P1 |
| Transcript-audio sync | HIGH | MEDIUM | P1 |
| Annotations CRUD | HIGH | HIGH | P1 |
| Non-overlapping enforcement | MEDIUM | LOW | P1 |
| CSS anchor dialog | MEDIUM | MEDIUM | P1 |
| Markdown export | HIGH | MEDIUM | P1 |
| Session save/resume | HIGH | MEDIUM | P1 |
| Playback speed control | LOW | LOW | P3 |
| Search in transcript | LOW | LOW | P2 |

## Patterns from Existing Tools

### Descript
- Word-by-word transcript highlighted as audio plays
- Click any word to jump to that timestamp
- Overdub (re-record words) — not relevant here
- Timeline view below transcript with waveform

### Otter.ai
- Real-time transcription (anti-feature for Amanuensis)
- Speaker labels — not relevant here
- Highlights + comments on transcript sections

### Whisper Desktop (open source)
- Post-recording transcription only — this is the right model
- Language auto-detection — confirmed user requirement
- No annotation system — gap Amanuensis fills

### Audacity
- Visual waveform with selectable regions
- Annotations as labels on timeline
- No transcript integration

**Key insight from analysis:** No existing local/offline tool combines transcription + time-range annotation + markdown export. This is the gap Amanuensis fills.

## Sources

- Feature analysis of Descript, Otter.ai, Adobe Podcast, Audacity, Whisper Desktop
- Whisper.cpp documentation for language auto-detection and model capabilities
- UX patterns from dictation + documentation tool category

---
*Feature research for: Amanuensis — desktop audio documentation tool*
*Researched: 2026-04-12*
