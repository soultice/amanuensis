# Phase 26: live transcription architecture to avoid per-chunk temp files and expensive decode/transcribe churn by capturing PCM directly in the renderer or keeping decoding/transcription in memory/persistent across chunks - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the live-transcription hot path so it no longer depends on per-chunk temp files and repeated decode/transcribe churn. This phase should move the architecture toward renderer-captured PCM with persistent streaming into the sidecar, while preserving the existing live transcript product surface unless explicitly overridden below.

</domain>

<decisions>
## Implementation Decisions

### Capture architecture
- **D-01:** The primary architecture direction is **renderer-side PCM capture**. The renderer should capture PCM directly instead of relying on encoded WebM blobs as the main live-transcription input path.
- **D-02:** Renderer-side PCM capture should be the **default architecture on all supported platforms**; this phase is not scoped as an optional performance mode.
- **D-03:** Even with renderer-side PCM capture, the **sidecar remains the source of truth** for live session state, transcript assembly, boundary handling, and ASR inference.

### Streaming protocol
- **D-04:** Audio should cross the renderer → sidecar boundary via a **persistent streaming transport**, not per-chunk request/response uploads.
- **D-05:** The concrete target is **two WebSocket channels**: one for PCM upload and one for transcript/telemetry return traffic.
- **D-06:** The renderer should send **explicit timing metadata** with streamed PCM so the sidecar does not infer timing purely from arrival order.

### Failure and compatibility policy
- **D-07:** Phase 26 **intentionally overrides the Phase 19 non-blocking live-failure rule** for this architecture migration.
- **D-08:** If the new PCM streaming architecture cannot initialize, the app should **fail fast before recording starts**.
- **D-09:** This phase should treat the new streaming path as the required recording architecture, not as a best-effort fallback layered on top of the legacy blob path.

### the agent's Discretion
- Exact renderer API for PCM capture (Web Audio / AudioWorklet / other browser-native approach), as long as it yields direct PCM capture.
- Exact WebSocket message schema, framing, and session lifecycle details.
- Exact telemetry fields beyond the locked timing metadata requirement.
- Exact migration strategy for existing polling/status code after the WebSocket architecture lands.
- Exact UX wording and presentation for fail-fast initialization errors.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and product continuity
- `.planning/ROADMAP.md` - Phase 26 scope anchor and dependency placement.
- `.planning/PROJECT.md` - product constraints, desktop architecture, and local-ASR expectations.
- `.planning/REQUIREMENTS.md` - baseline transcript/navigation/export/session requirements that must remain compatible unless explicitly overridden.
- `.planning/STATE.md` - current milestone continuity and planning position.

### Prior live-transcription decisions
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md` - locked live-transcription behavior contract that this phase partly preserves and partly overrides.
- `.planning/phases/21-increase-speed-of-live-transcription/21-CONTEXT.md` - speed priorities, safe_auto default, and human-perceived responsiveness constraints.
- `.planning/phases/24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc/24-RESEARCH.md` - evidence for current backlog/decode/temp-file bottlenecks and architecture candidates.

### Renderer live-capture and orchestration
- `src/renderer/src/stores/recording.ts` - current MediaRecorder chunking, flush timing, pause/resume timing, and recording lifecycle.
- `src/renderer/src/stores/transcript.ts` - current live session orchestration, patch application, fallback behavior, and status polling.
- `src/renderer/src/views/AppShellView.vue` - recording-state watchers that start/stop live session status handling.
- `src/renderer/src/types/live-transcript.ts` - current live protocol shapes and telemetry contracts that will need to evolve.

### Sidecar live pipeline and startup
- `sidecar/app/services/live_transcription.py` - current live session manager, boundary handling, metrics, and PCM-window logic.
- `sidecar/app/services/transcription.py` - cached model loading, runtime provider selection, ffmpeg decode helpers, and WAV transcription helpers.
- `sidecar/app/routes/transcribe.py` - current HTTP live route contract and transition handling.
- `src/main/sidecar.ts` - sidecar startup contract, runtime device argument wiring, and localhost process model.
- `sidecar/pyproject.toml` - current ASR/runtime dependency constraints relevant to the new transport and provider story.

No external ADR/spec documents were referenced for this phase; the canonical references are repository docs and source files above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/renderer/src/stores/recording.ts` already owns the recording clock, pause/resume accounting, and live-capture lifecycle; it is the natural place to replace blob emission with PCM production.
- `src/renderer/src/stores/transcript.ts` already owns live session state, transcript patch application, and telemetry ingestion; it can remain the renderer-side consumer of sidecar transcript updates after the transport changes.
- `sidecar/app/services/live_transcription.py` already acts as authoritative live-session state and already stores in-memory transcript/PCM-related state; this fits the decision to keep session truth in Python.
- `sidecar/app/services/transcription.py` already centralizes cached model loading and runtime-provider metadata; this should remain the inference/runtime integration layer.

### Established Patterns
- Renderer-to-backend coordination is currently centralized in Pinia stores rather than scattered across components.
- The sidecar remains a localhost companion process launched by Electron main, so the new streaming design should still fit the Electron + FastAPI sidecar split.
- The transcript contract is schema-stable around `words`, `segments`, `language`, and `duration`; planners should preserve that contract even if transport and capture architecture change.

### Integration Points
- `src/renderer/src/stores/recording.ts` and `src/renderer/src/stores/transcript.ts` are the main integration seam for replacing chunk uploads/polling with websocket lifecycle management.
- `src/renderer/src/views/AppShellView.vue` currently starts live status polling from recording-state transitions; this logic will need to migrate to websocket session lifecycle management.
- `sidecar/app/routes/transcribe.py` and `sidecar/app/services/live_transcription.py` are the main seam for introducing persistent session-oriented websocket handling while preserving session ownership in the sidecar.
- `src/main/sidecar.ts` remains the bootstrapping boundary; health/startup expectations still matter even if live transport stops being request/response HTTP.

</code_context>

<specifics>
## Specific Ideas

- “Renderer captures PCM directly and streams PCM to the sidecar.”
- “This should be the default architecture on all supported platforms.”
- “Use two WebSocket channels.”
- “Renderer sends explicit timing metadata.”
- “If the PCM streaming path cannot initialize, fail fast before recording starts.”

</specifics>

<deferred>
## Deferred Ideas

### Reviewed Todos (not folded)
- `2026-04-14-fix-gitignore-remove-node-modules-and-build-artifacts-from-git-history.md` - reviewed during discuss-phase and explicitly deferred as tooling cleanup outside Phase 26 live-transcription architecture scope.

None beyond the reviewed todo above.

</deferred>

---

*Phase: 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks*
*Context gathered: 2026-04-18*