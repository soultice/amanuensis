# Phase 21: "increase speed of live transcription" - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve live transcription speed and perceived responsiveness during active recording, while preserving the existing Phase 19 live-transcription contracts (interim/final behavior, finalized timestamp integrity, pause/resume boundary handling, and non-blocking failure behavior).

</domain>

<decisions>
## Implementation Decisions

### Responsiveness priority
- **D-01:** Prioritize **first-token speed** over all other speed dimensions. The current issue is perceived startup delay before users see live text.
- **D-02:** No fixed millisecond target is locked yet; speed goals should be calibrated from human-perception research and then turned into concrete verification thresholds during research/planning.

### Speed-vs-stability policy
- **D-03:** Optimize with a strong speed bias (**~90% toward maximum speed**), accepting higher interim-text churn if needed, as long as finalized transcript quality/contracts are preserved.

### Optimization order
- **D-04:** Follow a staged optimization order: **sidecar pipeline first**, then renderer chunk/flush tuning.
- **D-05:** Keep scope focused on speed within current live-transcription capability; do not add new product capabilities in this phase.

### Hardware/runtime strategy
- **D-06:** Default strategy should remain **safe auto mode** across environments.
- **D-07:** If needed for speed goals, planner may add an optional faster/aggressive mode as a secondary path, but default behavior should remain reliable without manual tuning.

### Success framing
- **D-08:** Success should be judged by how “natural” live transcription feels to humans (fast visible onset + continuous updates) using evidence-backed thresholds from UX/HCI/speech research, not arbitrary hardcoded numbers.

### the agent's Discretion
- Exact numeric latency targets (p50/p95 and phase-specific budgets) after research.
- Exact chunk window/size heuristics and buffering policy changes.
- Whether to expose any explicit performance mode toggle in Phase 21 or keep it internal.
- Detailed benchmark harness and profiling instrumentation design.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope + continuity anchors
- `.planning/ROADMAP.md` - Phase 21 scope and dependency chain.
- `.planning/PROJECT.md` - product constraints and local-ASR goals.
- `.planning/REQUIREMENTS.md` - baseline transcript/navigation contracts that speed work must not break.
- `.planning/STATE.md` - current milestone/phase continuity context.
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md` - locked live transcription behavior contracts.
- `.planning/phases/20-remove-the-transcribe-button-and-functionality-it-is-not-needed-anymore-due-to-the-live-transcription/20-RESEARCH.md` - fallback/risk context from live-first migration.

### Renderer live-path hotspots
- `src/renderer/src/stores/recording.ts` - MediaRecorder chunking, flush windows, live push cadence, stop/fallback behavior.
- `src/renderer/src/stores/transcript.ts` - live session orchestration, status polling, finalize/recovery flow, run invalidation guards.
- `src/renderer/src/views/AppShellView.vue` - recording-state watcher that starts/stops live lifecycle hooks.
- `src/renderer/src/components/TranscriptPanel.vue` - live/finalizing/transcribing state UX and perceived responsiveness surface.
- `src/renderer/src/components/AppStatusBar.vue` - transcript state/warning presentation relevant for perceived liveness.

### Sidecar live-path hotspots
- `sidecar/app/routes/transcribe.py` - live route contracts (`/live/start`, `/live/chunk`, `/live/stop`, `/live/status`).
- `sidecar/app/services/live_transcription.py` - chunk ingest pipeline, cumulative decode behavior, queue/warning/error state.
- `sidecar/app/services/transcription.py` - ffmpeg conversion + Parakeet transcription path shared by live processing.
- `sidecar/app/state.py` - live manager and transcription status state wiring.

No external ADR/spec beyond repository docs were referenced for this phase.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recording.ts` already exposes flush constants (`LIVE_FLUSH_WINDOW_MS`, `LIVE_FLUSH_MIN_BYTES`) and buffered chunk controls that can be tuned.
- `transcript.ts` already tracks live lifecycle (`live`, `finalizing`) and has stale-run guards (`_runId`) to protect cross-session correctness while optimizing.
- `live_transcription.py` returns per-chunk latency metrics (`serverLatencyMs`) and queue depth/status data useful for profiling feedback loops.

### Established Patterns
- Renderer performs direct localhost HTTP calls to sidecar routes; no new transport layer should be introduced for speed work.
- Transcript contracts are schema-stable (`words`, `segments`, finalized timestamps) and downstream features depend on this shape.
- Failure policy is non-blocking: recording continues when live transcription fails; speed work must not regress this.

### Integration Points
- Frontend timing knobs: chunk aggregation and flush timing in `recording.ts`.
- Orchestration knobs: polling frequency/session transitions in `transcript.ts` and `AppShellView.vue`.
- Backend hotspots: cumulative chunk handling and repeated decode/transcribe cost in `live_transcription.py` + `transcription.py`.

</code_context>

<specifics>
## Specific Ideas

- “First token speed matters most.”
- Current behavior feels “slightly too delayed” at live start.
- Strong preference for speed over interim stability (~90% max speed bias).
- Research should determine what latency feels natural to humans, then anchor plan verification against that.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 21-increase-speed-of-live-transcription*
*Context gathered: 2026-04-17*
