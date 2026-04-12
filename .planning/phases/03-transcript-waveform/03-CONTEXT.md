# Phase 3: Transcript & Waveform - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Make every transcribed word interactive: click a word to seek audio to its timestamp, shift+click a word range to select it for annotation targeting, and animate the currently-speaking word with an underline during playback. Fill the `WaveformPanel` placeholder with WaveSurfer showing the audio timeline and a region highlight for the selected word range.

</domain>

<decisions>
## Implementation Decisions

### Word Click Behavior
- **D-01:** Clicking a word **seeks only** — audio jumps to that word's `start` timestamp but stays paused. No auto-play.
- **D-02:** Click precision: clicking any part of a word's `<span>` triggers the seek. The seek offset should apply a 50ms pre-roll (`word.start - 0.05`) so the word isn't clipped.

### Word Range Selection
- **D-03:** Selection uses **shift+click** — click first word to set anchor, shift+click second word to extend selection. Clean separation from single-click seek (no drag ambiguity).
- **D-04:** Selected range is visually highlighted on the word spans (e.g., background tint). Only one range selection at a time.
- **D-05:** Clicking a word without shift clears any existing selection and seeks audio.

### Playback Highlight
- **D-06:** During audio playback, the currently-speaking word is marked with an **underline animation** — a CSS underline that appears on the active word and disappears when the next word becomes active. No background color change, no text layout shift.
- **D-07:** "Current word" is determined by polling `audioElement.currentTime` and finding the word whose `start ≤ currentTime < end` in the words array. Use `requestAnimationFrame` or a low-frequency interval (100ms) for polling.

### WaveSurfer Integration
- **D-08:** `WaveformPanel.vue` is filled with WaveSurfer displaying the recorded audio waveform. The selected word range is reflected as a WaveSurfer Regions plugin region (colored fill over the corresponding time span).
- **D-09:** WaveSurfer handles audio playback — replaces the `new Audio()` approach from Phase 2. WaveSurfer's `seekTo()` is used for word-click seek.

### Agent's Discretion
- Exact underline animation style (CSS `text-decoration`, thickness, color, transition duration)
- WaveSurfer waveform colors and region fill color
- How to handle words with missing/zero timestamps (skip highlighting, don't crash)
- Whether to show a playback cursor on the waveform (WaveSurfer default behavior)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — NAV-01 (click word → seek), NAV-02 (highlight during playback), NAV-03 (select range of words)

### Phase 2 output (integration points)
- `src/renderer/src/stores/transcript.ts` — `Word` interface `{id, word, start, end, probability}`; `words[]` array; `transcriptState`
- `src/renderer/src/components/TranscriptPanel.vue` — Replace the `<p class="transcript-panel__text">{{ transcriptStore.fullText }}</p>` with word spans; keep all other states (empty, transcribing, error) unchanged
- `src/renderer/src/components/WaveformPanel.vue` — Replace placeholder entirely with WaveSurfer
- `.planning/research/STACK.md` — `@meersagor/wavesurfer-vue ^2.0` is the prescribed WaveSurfer Vue wrapper; `wavesurfer.js ^7`

### Phase 2 context (decisions that carry forward)
- `.planning/phases/02-audio-transcription/02-CONTEXT.md` — D-05 (flowing text) is now replaced by word spans; D-06 (word timestamps stored) is the foundation for this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/stores/transcript.ts` — `useTranscriptStore.words: Word[]` with full timestamps; `hasTranscript` getter; `transcriptState`
- `src/renderer/src/stores/recording.ts` — `audioBlobUrl` holds the recorded audio URL needed to initialize WaveSurfer
- `src/renderer/src/components/TranscriptPanel.vue` — The `hasTranscript` branch (currently `<p>{{ fullText }}</p>`) is the exact target for replacement with word spans; empty/transcribing/error branches stay untouched

### Established Patterns
- Pinia store per concern — add `usePlaybackStore` for WaveSurfer instance, current time, playback state
- Component CSS uses scoped styles with BEM-ish naming (`transcript-panel__text`, `level-meter__bar`)
- `requestAnimationFrame` loop pattern already used in `LevelMeter.vue` — same approach for playback word tracking

### Integration Points
- `WaveformPanel.vue` — receives `audioBlobUrl` from `useRecordingStore` and selected word range from a new playback/selection store; renders WaveSurfer
- `TranscriptPanel.vue` — replaces `<p>` with `<span data-word-id>` per word; handles click (seek) and shift+click (selection)
- `AppShellView.vue` — may need to pass WaveSurfer instance or share store between `WaveformPanel` and `TranscriptPanel`

</code_context>

<specifics>
## Specific Ideas

- Shift+click selection is intentionally distinct from click-to-seek — no drag gesture, no ambiguity
- Seek-only (no auto-play) matches the "pause and inspect" workflow of documentation authoring
- Underline animation chosen specifically to avoid text reflow or layout shifts during playback
- 50ms pre-roll on seek (`word.start - 0.05s`) so the word isn't clipped at the start

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-transcript-waveform*
*Context gathered: 2026-04-12*
