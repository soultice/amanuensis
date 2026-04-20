# Phase 26: live transcription architecture to avoid per-chunk temp files and expensive decode/transcribe churn by capturing PCM directly in the renderer or keeping decoding/transcription in memory/persistent across chunks - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-18T08:15:35Z
**Phase:** 26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks
**Areas discussed:** hot path location, audio boundary, fallback and compatibility behavior

---

## Todo review

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Do not fold it in | Keep tooling cleanup out of Phase 26 scope | ✓ |
| Fold it into Phase 26 anyway | Pull unrelated tooling work into this phase | |

**User's choice:** Do not fold it in.
**Notes:** Pending `.gitignore` / git-history cleanup todo was reviewed and explicitly left out of scope.

---

## Hot path location

### Q1. Primary architecture direction

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Renderer captures PCM directly and streams PCM to the sidecar | Removes repeated WebM decode from the hot path | ✓ |
| Keep renderer capture as-is; sidecar keeps persistent in-memory decode/transcription state across chunks | Lower-risk evolution from current code | |
| Hybrid | Renderer PCM target plus sidecar persistent decode compatibility path | |

**User's choice:** Renderer captures PCM directly and streams PCM to the sidecar.
**Notes:** User chose the architecture fork that most directly removes repeated decode work from the hot path.

### Q2. Rollout/default policy

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Make renderer-PCM the default architecture on all supported platforms | Cleanest target architecture | ✓ |
| Prefer renderer-PCM, but auto-fallback to the current encoded/blob path when needed | Safer rollout across platforms | |
| Ship renderer-PCM only as an optional performance mode at first | Lowest rollout risk | |

**User's choice:** Make renderer-PCM the default architecture on all supported platforms.
**Notes:** User does not want the new path hidden behind an opt-in or compatibility-first rollout.

### Q3. Ownership of live session and transcript state

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Renderer captures PCM, but sidecar remains the source of truth for live session state, transcript assembly, and inference | Keeps ML/session logic in Python | ✓ |
| Split ownership | Renderer manages chunk/window state, sidecar mainly runs inference | |
| Renderer owns most live-state orchestration | Sidecar acts like a stateless inference worker | |

**User's choice:** Sidecar remains the source of truth for live session state, transcript assembly, and inference.
**Notes:** Renderer becomes the PCM producer; Python retains session/inference authority.

---

## Audio boundary

### Q4. Transport shape for renderer PCM

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Keep the current request/response live API shape, but send PCM payloads instead of WebM blobs | Least disruptive to current structure | |
| Switch to a persistent streaming channel between renderer and sidecar | Better fit for true streaming | ✓ |
| Hybrid | Start with PCM over current API, leave room for later persistent stream | |

**User's choice:** Switch to a persistent streaming channel between renderer and sidecar.
**Notes:** User prefers a real streaming architecture over adapting the existing request/response path.

### Q5. Return path for transcript updates

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Full-duplex session stream | One connection carries PCM up and transcript down | |
| Persistent upload stream + separate update channel | Dedicated input and output channels | ✓ |
| Persistent upload stream + keep polling for updates | Lowest change on return path | |

**User's choice:** Persistent upload stream plus separate update channel.
**Notes:** User prefers separate long-lived paths rather than multiplexing everything on one channel.

### Q6. Concrete channel setup

| Option | Description | Selected |
| ------ | ----------- | -------- |
| WebSocket for PCM upload + SSE/HTTP stream for transcript updates | Split transport styles | |
| Two WebSocket channels | Stream-native both directions | ✓ |
| Desktop-specific IPC transport | Replace localhost networking path entirely | |

**User's choice:** Two WebSocket channels.
**Notes:** User chose websocket transport on both directions rather than a hybrid or custom IPC route.

### Q7. Timing metadata ownership

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Renderer sends explicit timing metadata with PCM frames/chunks | Renderer owns capture timing | ✓ |
| Sidecar derives timing from arrival order and sample counts | Simpler sender | |
| Renderer sends timing, sidecar validates/reconciles it | Strongest correctness, more complexity | |

**User's choice:** Renderer sends explicit timing metadata.
**Notes:** This keeps capture timing authoritative at the source while sidecar remains transcript authority.

---

## Fallback and compatibility behavior

### Q8. Behavior if the new PCM streaming path fails at runtime

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Automatically fall back to the legacy chunk/blob path in the same session | Preserves continuity | |
| Keep recording, but disable live transcription for the rest of that session | Simpler failure handling | |
| Fail the recording flow and ask the user to retry | Strict architecture enforcement | ✓ |

**User's choice:** Fail the recording flow and ask the user to retry.
**Notes:** This conflicted with a prior Phase 19 decision that recording must continue if live transcription fails.

### Q9. Resolve conflict with Phase 19

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Keep the Phase 19 rule | Recording continues; only live path fails/falls back | |
| Override it for Phase 26 | If PCM streaming fails, the whole recording flow should fail | ✓ |
| Partial override | Recording continues for recoverable issues, but hard failures can fail the recording flow | |

**User's choice:** Override it for Phase 26.
**Notes:** User explicitly chose to supersede the earlier non-blocking live-failure rule for this architecture migration.

### Q10. When should the app fail the recording flow?

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Fail fast before recording starts if the PCM streaming path cannot initialize | Clean startup contract | ✓ |
| Allow recording to start, but abort immediately if the streaming path fails at any point | Strictest enforcement | |
| Fail fast for startup issues; abort mid-session only for unrecoverable failures | Nuanced policy | |

**User's choice:** Fail fast before recording starts if the PCM streaming path cannot initialize.
**Notes:** User wants the recording flow blocked at startup rather than switching to compatibility behavior.

---

## the agent's Discretion

- Exact renderer implementation for direct PCM capture
- Exact websocket framing/message schema
- Exact telemetry payload details
- Exact UI wording for fail-fast startup errors

## Deferred Ideas

- Tooling cleanup todo: `Fix .gitignore and remove node_modules + build artifacts from git history` - reviewed and deferred as out of scope for Phase 26
