# Phase 2: Audio & Transcription - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

User can select an audio input device, start and stop a recording with real-time visual feedback, play back the recording, and trigger transcription via an explicit button. The app sends the audio to the local faster-whisper sidecar and displays the resulting word-level transcript as flowing paragraph text with inline progress. Phase 3 will make words clickable — this phase establishes the text foundation.

</domain>

<decisions>
## Implementation Decisions

### Level Meter
- **D-01:** Real-time audio level meter uses a **bar-graph style** — vertical bars responding to microphone amplitude during recording.
- **D-02:** The level meter lives in the toolbar alongside the record/stop controls, not as a separate strip below.

### Transcription Trigger
- **D-03:** Transcription does **not** start automatically after recording stops.
- **D-04:** After recording stops, the app shows a **"Transcribe" button** the user clicks when ready. This allows the user to review the recording (via playback, AUDIO-05) before committing to transcription.

### Transcript Layout
- **D-05:** Transcribed text is displayed as **flowing paragraph text** — words run together as a continuous document, not line-by-line or segmented by sentence.
- **D-06:** Each word must be stored with its `{id, word, start, end}` timestamps internally (required for Phase 3 clickable word spans), but the visual presentation is plain flowing text in Phase 2.

### Progress Display
- **D-07:** Transcription progress indicator is **inline inside the TranscriptPanel** — it replaces the placeholder content while transcription runs, then transitions to showing the completed transcript.
- **D-08:** The inline progress shows at minimum: a progress bar or spinner and a status message (e.g., "Transcribing… 47%" or "Transcribing, this may take a few minutes").

### Agent's Discretion
- Exact bar-graph meter implementation (number of bars, animation speed, color)
- Device selector component style (native `<select>` vs custom dropdown)
- Exact styling of the Transcribe button (placement, prominence)
- Error state handling for failed transcription
- Playback controls layout (inline play button or dedicated player bar)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project context
- `.planning/PROJECT.md` — Vision, constraints, tech stack
- `.planning/REQUIREMENTS.md` — AUDIO-01 through AUDIO-05, TRANS-01 through TRANS-04
- `.planning/research/STACK.md` — Library versions; note `python-multipart ^0.0.12` already installed for file upload
- `.planning/research/ARCHITECTURE.md` — Audio pipeline: MediaRecorder → WebM/Opus → sidecar WAV conversion → faster-whisper → word timestamps JSON; renderer calls sidecar HTTP directly (not via IPC)
- `.planning/research/PITFALLS.md` — P1 (Whisper slow on CPU, must show progress), P3 (MediaRecorder outputs WebM, must convert to WAV/16kHz mono in sidecar), P6 (macOS microphone entitlements)

### Phase 1 scaffold (integration points)
- `.planning/phases/01-foundation/01-CONTEXT.md` — Shell layout decisions; AppToolbar and TranscriptPanel are the two components this phase fills
- `src/renderer/src/components/AppToolbar.vue` — Replace placeholder with recording controls + device selector + level meter
- `src/renderer/src/components/TranscriptPanel.vue` — Replace placeholder with progress indicator → flowing paragraph transcript
- `src/renderer/src/stores/sidecar.ts` — `sidecarStore.port` needed for HTTP calls to sidecar transcription endpoint

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/stores/sidecar.ts` — `useSidecarStore` exposes `port` and `status`; transcription HTTP calls use `port` directly
- `src/renderer/src/stores/model.ts` — Pattern to follow for new `useRecordingStore` and `useTranscriptStore`
- `window.api` (contextBridge) — Pattern established; Phase 2 needs no new IPC channels for recording (Web Audio API runs in renderer), but needs a new `transcribe` IPC channel OR direct HTTP to sidecar

### Established Patterns
- Pinia store per concern (`sidecar`, `model`) — follow this pattern with `recording` and `transcript` stores
- Components are replaced in-place (e.g., `AppToolbar.vue` gets real content, not a new component layer)
- HTTP to sidecar goes directly from renderer using `window.api.getSidecarPort()`

### Integration Points
- `AppToolbar.vue` — Add: device `<select>`, Record button, Stop button, bar-graph level meter, Transcribe button (shown post-recording), playback controls
- `TranscriptPanel.vue` — Add: inline progress state → flowing word-span paragraph
- `sidecar/app/routes/` — Add `/transcribe` endpoint (POST multipart audio file → JSON word array)
- `sidecar/app/services/` — Add transcription service using faster-whisper `WhisperModel` with `word_timestamps=True`, `language="auto"`, model loaded from `userData/models/large-v3`

</code_context>

<specifics>
## Specific Ideas

- The bar-graph level meter should respond visibly to voice — it's the primary "am I being recorded?" signal
- The "Transcribe" button appearing after recording stops gives the user a natural pause to decide whether to keep the take
- Transcript panel shows progress inline (not a modal) so the layout doesn't shift when transcription completes
- Word-level data (`id`, `word`, `start`, `end`) must be stored even though only plain text is rendered in Phase 2 — Phase 3 depends on it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-audio-transcription*
*Context gathered: 2026-04-12*
