# Features Research: Amanuensis

*Researched: 2026-04-12*
*Reference tools: Descript, oTranscribe, ELAN, Adobe Podcast, Audacity, Reaper*

## Table Stakes

Features users expect in any audio transcription tool. Missing these causes immediate rejection.

### Audio Capture

| Feature | Complexity | Notes |
|---|---|---|
| Input device selection | Low | All reference tools support this |
| Record / Stop controls | Low | Bare minimum |
| Real-time audio level indicator | Low | Without this, users think it's broken |
| Playback of recorded audio | Low | Essential for verification |

### Transcription

| Feature | Complexity | Notes |
|---|---|---|
| Automatic transcription after recording stops | Medium | Descript, Adobe Podcast — expected in 2025 |
| Display full transcript text | Low | — |
| Language auto-detection | Low | Whisper handles this natively |
| Transcription progress indicator | Low | Large model is slow — feedback required |

### Transcript Navigation

| Feature | Complexity | Notes |
|---|---|---|
| Click word → seek audio to that position | Medium | oTranscribe, Descript — core feature |
| Highlight current word during playback | Medium | Standard in modern tools |
| Select range of words | Low | Needed for annotation target |

### Session

| Feature | Complexity | Notes |
|---|---|---|
| Auto-save | Low | Critical — recordings are irreplaceable |
| Restore session on reopen | Medium | Users expect to pick up where they left off |
| Save on close | Low | Complement to auto-save |

## Differentiators

Features that set tools apart. Users won't leave without them, but they create strong preference.

### Annotation System

| Feature | Complexity | Notes |
|---|---|---|
| Attach images to word ranges | Medium | Unique to this tool — documentation use case |
| Attach clipboard content | Medium | Fast workflow — no file picking required |
| Attach audio clips | Medium | Secondary use case |
| Non-overlapping annotation constraint | Low | Prevents logical errors in export |
| Edit/move/remove annotations | Medium | Standard CRUD |
| CSS-anchored annotation dialog | Medium | Modern, polished UX |

### Export

| Feature | Complexity | Notes |
|---|---|---|
| Rich Markdown export with assets folder | Medium | Core differentiator — documentation workflow |
| Images exported as `![]()` with relative paths | Low | Standard Markdown convention |
| Hyperlinks as `[text](url)` | Low | — |
| Annotations injected at transcript position | Medium | Key to the value proposition |

## Anti-Features

Deliberately avoid these. They add complexity without serving the stated use case.

| Feature | Why Avoid |
|---|---|
| Speaker diarization | Adds ML complexity; single-speaker workflow assumed |
| Real-time transcription (while recording) | Whisper large model too slow for streaming; post-recording is fine |
| Cloud sync / sharing | Stated use case is local → email/share `.md` file |
| Video recording | Out of stated scope |
| In-app screen capture | Explicitly excluded by user |
| Collaboration / comments | Document tool, not a review tool |
| Multiple concurrent sessions | Explicitly excluded by user |
| Translation | Out of scope; auto-detect is sufficient |
| Waveform editing (cut/splice) | This is a documentation tool, not a DAW |

## Feature Complexity Notes

**Word-level timestamp alignment** — Medium-High. faster-whisper produces word timestamps natively, but rendering them as clickable spans in the transcript (with synchronized waveform region highlighting) requires careful state management. The transcript must store word objects with `{word, start, end}` rather than plain text.

**Non-overlapping annotations** — Low complexity if enforced at selection time (disable selection that overlaps existing annotation spans).

**Markdown export** — Medium. The main challenge is determining annotation injection order (annotations at same text position) and correct relative asset paths. Images must be copied to `assets/` folder.

**CSS Anchor Positioning for dialog** — Low-Medium. Supported natively in Electron's Chromium. The dialog needs a `position-anchor` pointing to the selected text span. The tricky part is scroll offset compensation.

## Dependency Map

```
Audio capture
  └─ Recording file
       └─ Whisper transcription
            └─ Word objects {word, start, end}
                 ├─ Transcript view (clickable words)
                 ├─ Waveform regions (highlight on click)
                 └─ Annotation spans (attach to word range)
                      └─ Markdown export (inject at position)
```

Each layer depends on the previous. Build order follows this dependency chain.
