# Phase 33: "transcription should be live from now on" - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Add live transcription during active recording so transcript text appears in near real-time, while preserving existing recording reliability and post-finalized timestamp contracts used by navigation and annotation flows.

</domain>

<decisions>
## Implementation Decisions

### Live update cadence
- **D-01:** Live transcription should use a **low-latency stream** (frequent updates, near real-time feel).

### Interim vs finalized text behavior
- **D-02:** Show **interim text** while recording.
- **D-03:** Replace interim text with **finalized text** as final chunks become available.

### Timestamp contract in live mode
- **D-04:** Word-level timestamps are required **only after chunk finalization** (not for interim tokens).

### Recording controls + live transcription coupling
- **D-05:** Pausing recording should also **pause live transcription processing**.
- **D-06:** Resume should continue processing and preserve **transcript boundaries** at pause/resume transitions.
- **D-07:** Stopping recording should **auto-finalize remaining interim transcript**.

### Failure behavior
- **D-08:** If live transcription fails mid-recording, **recording must continue**.
- **D-09:** Surface a visible warning in UI when live transcription fails.

### the agent's Discretion
- Chunk segmentation heuristic and exact stream buffering strategy
- Interim text styling details (visual treatment while unstable)
- Retry/backoff strategy details for live transcription worker failures
- Exact boundary marker representation in transcript state/store

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements anchors
- `.planning/ROADMAP.md` - Phase 33 scope, sequencing, and planning target
- `.planning/PROJECT.md` - product constraints and local ASR expectations
- `.planning/REQUIREMENTS.md` - baseline transcription/navigation contracts to preserve
- `.planning/STATE.md` - current milestone/phase continuity context

### Existing transcription + recording architecture
- `src/renderer/src/stores/recording.ts` - recording state machine (`idle/recording/paused/stopped`), chunk flow from MediaRecorder
- `src/renderer/src/stores/transcript.ts` - current post-stop transcription request flow and transcript state handling
- `src/renderer/src/views/AppShellView.vue` - current transcribe trigger integration from toolbar/session flow
- `sidecar/app/routes/transcribe.py` - current transcribe endpoint behavior and lock semantics
- `sidecar/app/services/transcription.py` - current ASR service implementation and output contract
- `sidecar/app/state.py` - sidecar shared transcription status state

### UI/UX touchpoints for live mode
- `src/renderer/src/components/AppToolbar.vue` - record/pause/resume/stop control flow and transcribe affordance
- `src/renderer/src/components/TranscriptPanel.vue` - transcript rendering/progress/error states where live updates/warnings must appear

No external ADR/spec docs were provided for this phase; requirements are captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `recording.ts` already provides pause/resume-aware recording lifecycle suitable for coupling to live transcription lifecycle.
- `transcript.ts` already centralizes transcript state (`empty/transcribing/complete/error`) and is the natural extension point for live interim/final chunk handling.
- `transcribe.py` + `transcription.py` already expose single-flight transcription backend contract that can be extended for live chunk/finalization paths.

### Established Patterns
- Renderer uses Pinia stores as contract boundary between UI components and backend calls.
- Transcript UI behavior is driven from store state and supports explicit progress/error display states.
- Sidecar routes keep explicit status objects and conservative lock-based concurrency control.

### Integration Points
- Add live transcription orchestration where recording stream chunks are produced (recording store / AppShell flow).
- Extend transcript store with interim/finalized chunk model and pause-boundary markers.
- Extend sidecar API contract for low-latency chunk ingestion/finalization, while preserving final timestamped contract for navigation/annotation.

</code_context>

<specifics>
## Specific Ideas

- "low latency stream"
- "show interim and replace with final"
- "only after finalization" for timestamps
- "pause transcription processing too"
- "mark transcript boundaries"
- "auto finalize on stop"
- "keep recording and show warning"

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 33-transcription-should-be-live-from-now-on*
*Context gathered: 2026-04-16*
