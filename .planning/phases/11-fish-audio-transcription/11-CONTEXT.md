# Phase 11: Fish Audio S2 Pro Transcription Backend — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the local faster-whisper sidecar transcription engine with Fish Audio's cloud
ASR API (`POST https://api.fish.audio/v1/asr`). The user provides their own Fish Audio
API key; Amanuensis sends the recorded audio to Fish Audio, receives a transcript, and
maps the response to the internal `Word[]` / `Segment[]` schema the rest of the app
already depends on.

### What is Fish Audio S2 Pro

Fish Audio S2 Pro is a cloud ASR (Automatic Speech Recognition) service operated by
Fish Audio (fish.audio). It is accessed via `POST /v1/asr` with a Bearer API key.
The model supports 50+ languages with auto-detection and returns segment-level
timestamps. It is currently in BETA.

**API response schema:**
```json
{
  "text": "full transcript",
  "duration": 42.3,
  "segments": [
    { "text": " Hello world", "start": 0.0, "end": 1.2 }
  ]
}
```

### The word-timestamp problem

Amanuensis is built around **word-level** timestamps — every clickable span in the
transcript represents one word with its own `start` / `end` time. The Fish Audio API
returns **segment-level** timestamps only. Word-level timestamps were closed as
"not planned" on their GitHub tracker.

**Adapter strategy:** tokenise each segment's text into individual words, then
distribute the segment's time range uniformly across them.

```
segment: { text: " Hello big world", start: 0.0, end: 1.8 }
→ words : [
    { word: " Hello", start: 0.0,  end: 0.6 },
    { word: " big",   start: 0.6,  end: 1.2 },
    { word: " world", start: 1.2,  end: 1.8 },
  ]
```

This approximation preserves the full word-click UX. Seek precision is bounded by
segment duration (typically 2-8 s), which is acceptable for annotation use. The
`ignore_timestamps=false` flag is set to request the finest granularity Fish Audio
provides.

### Architectural changes

| Concern | Before (Whisper) | After (Fish Audio) |
|---|---|---|
| Model location | Local (downloaded to userData) | Cloud (api.fish.audio) |
| Internet required | No | Yes |
| API key | None | User-supplied Fish Audio key |
| Transcription call | HTTP to local sidecar on dynamic port | HTTPS to api.fish.audio |
| Timestamp granularity | Word-level (native) | Segment-level → word-adapted |
| Onboarding flow | Model download progress | API key entry |
| Sidecar process | Python FastAPI + faster-whisper | Removed (transcription only) |

### What stays the same

- All Electron IPC, Pinia stores, Vue components are unchanged
- `Word` and `Segment` interfaces are unchanged
- The sidecar **may** still exist for health-check IPC pattern (or is removed entirely)
- Session persistence, annotation, export, playback — all unchanged

### Sidecar fate

Two options:
- **Remove the sidecar entirely** — transcription moves to a direct HTTPS fetch in the
  renderer or via a new main-process IPC handler. Simpler, fewer moving parts.
- **Keep a minimal sidecar** — acts as a local proxy to Fish Audio (useful if CSP or
  auth handling is easier server-side).

Decision: **Remove the sidecar.** Make the Fish Audio call directly from the main
process via IPC, avoiding CSP complications (the renderer's connect-src would need to
include `https://api.fish.audio`).

</domain>

<decisions>
## Implementation Decisions

### D-01: Transcription via main-process IPC (not renderer fetch)
The renderer calls `window.api.transcribe(audioBuffer)` via IPC. The main process
performs the HTTPS POST to Fish Audio using Node's built-in `fetch` (Node 18+). This
avoids adding `https://api.fish.audio` to the renderer CSP.

### D-02: API key storage via Electron safeStorage
The Fish Audio API key is stored with `safeStorage.encryptString` / `decryptString`
(OS keychain-backed). Stored in a JSON file in `app.getPath('userData')`. The renderer
can read/write it via new IPC handlers `api-key:get` and `api-key:set`.

### D-03: Onboarding repurposed for API key setup
The existing `OnboardingView.vue` currently gates on `modelStore.isReady`. It is
repurposed to gate on `apiKeyStore.hasKey`. The model-download UI is replaced with
an API key input form and a "Test connection" button.

### D-04: Word adapter — uniform distribution within segment
Each segment's words are tokenised by splitting on whitespace. Segment duration is
divided equally across words. Word `id` continues to be a global 0-based counter.

### D-05: Offline/error handling
If the Fish Audio call fails (network error, 401, 402, 4xx, 5xx), the transcription
store transitions to `error` state with a human-readable message. A "Retry" button is
shown. No silent failures.

### D-06: Language parameter forwarded
The user's existing language auto-detection is preserved. `language` param is omitted
(empty string) for auto-detect, or set to BCP-47 code if the user specifies one.

### D-07: Remove model store and model manager
`modelStore`, `model_manager.py`, the `/health` and `/model` sidecar routes, and
`OnboardingView`'s download-progress UI are deleted. The `sidecarStore` may be
simplified or removed.

### D-08: CSP update
`connect-src` in both `src/renderer/index.html` and `src/main/index.ts` gains
`https://api.fish.audio` only if a renderer fetch is used. With D-01 (main-process
fetch), no CSP change is needed.

</decisions>
