# Phase 27: reduce live transcription delay with latest-only inference scheduling - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce live transcription latency inside the existing Phase 26 PCM/websocket architecture by changing how the sidecar schedules inference on incoming PCM. The phase should make first text arrive closer to the 500ms range and stop the transcript from trailing speech by several seconds, without changing the existing product surface or transcript schema.

</domain>

<decisions>
## Implementation Decisions

### Inference scheduling policy
- **D-01:** The sidecar should **prefer the newest useful PCM tail** instead of processing every intermediate inference window in order.
- **D-02:** Superseded intermediate windows should be treated as **stale work that can be skipped** when a newer useful tail is available.

### Responsiveness vs interim stability
- **D-03:** The phase may accept **any level of interim transcript churn** if that materially improves live responsiveness.
- **D-04:** Final transcript correctness and the existing finalized contract must still be preserved.

### Catch-up behavior
- **D-05:** The system should **prioritize catching up to current speech** over rendering every obsolete intermediate partial state.
- **D-06:** When backlog exists, scheduler behavior should optimize for “what is most useful now” rather than “finish all queued work.”

### Telemetry and UX surface
- **D-07:** Keep telemetry **lightweight**. Preserve the current lightweight latency/queue/runtime visibility rather than adding major new UI complexity.

### the agent's Discretion
- Exact scheduler architecture (single worker with latest-only pending slot, cancellation/coalescing mechanism, or equivalent)
- Exact thresholds for stale-window dropping and handoff from “latest-only” to final settle behavior
- Exact telemetry field names beyond the lightweight visibility requirement
- Exact tests/benchmarks used to prove TTFT and settle-lag improvements

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and continuity
- `.planning/ROADMAP.md` - Phase 27 goal, dependency placement, and roadmap continuity.
- `.planning/PROJECT.md` - Product constraints and core value: live transcription must feel frictionless.
- `.planning/REQUIREMENTS.md` - Baseline audio/transcript/navigation/session contracts that must stay intact.
- `.planning/STATE.md` - Current milestone position and active phase tracking.

### Prior live-transcription decisions
- `.planning/phases/21-increase-speed-of-live-transcription/21-CONTEXT.md` - First-token speed priority, strong speed bias, and human-perceived responsiveness framing.
- `.planning/phases/24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc/24-RESEARCH.md` - Backlog-growth evidence and the original “latest-only coalescing” recommendation.
- `.planning/phases/26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks/26-CONTEXT.md` - Locked PCM/websocket architecture, sidecar authority, and transcript-contract continuity.

### Current implementation hotspots
- `sidecar/app/services/live_transcription.py` - Current live session scheduling, bounded-window inference triggering, queue metrics, and websocket event emission.
- `sidecar/app/routes/transcribe.py` - Websocket input/output flow and live session control wiring.
- `sidecar/app/services/transcription.py` - Runtime-provider/model loading and WAV inference path that the scheduler drives.
- `src/renderer/src/stores/recording.ts` - Renderer PCM coalescing/backpressure before packets reach the sidecar.
- `src/renderer/src/stores/transcript.ts` - Renderer-side live telemetry consumption and finalization handling.
- `src/renderer/src/components/AppStatusBar.vue` - Existing lightweight live telemetry surface that should remain lightweight.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sidecar/app/services/live_transcription.py` already owns live session state, queue metrics, PCM buffers, and websocket event emission; this phase should deepen that module rather than create a parallel scheduler elsewhere.
- `src/renderer/src/stores/recording.ts` already coalesces outgoing PCM and exposes producer backlog signals; that can remain the renderer-side producer while this phase improves sidecar scheduling.
- `src/renderer/src/stores/transcript.ts` already consumes `patch`, `telemetry`, `state`, and `complete` events, so scheduler changes can stay behind the existing event contract if possible.

### Established Patterns
- Sidecar remains the source of truth for transcript assembly and inference decisions.
- The live transport is already websocket-based and packet metadata already includes explicit timing/sample information.
- The current UI already surfaces TTFT, queue depth, worker state, and runtime in a lightweight status bar.

### Integration Points
- Main scheduling changes belong in `sidecar/app/services/live_transcription.py`.
- Any protocol adjustments should remain compatible with `sidecar/app/routes/transcribe.py` and `src/renderer/src/stores/transcript.ts`.
- Telemetry changes should stay small and integrate into `src/renderer/src/components/AppStatusBar.vue` rather than introducing new major UI.

</code_context>

<specifics>
## Specific Ideas

- “Prefer newest useful tail.”
- “Any level of churn is acceptable.”
- “Prioritize catching up to speed.”
- “Keep telemetry lightweight.”

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling*
*Context gathered: 2026-04-18*
