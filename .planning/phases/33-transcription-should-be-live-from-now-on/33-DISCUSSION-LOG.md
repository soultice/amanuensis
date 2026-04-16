# Phase 33: "transcription should be live from now on" - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 33-transcription-should-be-live-from-now-on
**Areas discussed:** Live update cadence, Interim/final text behavior, Timestamp finalization policy, Recording control interaction, Failure fallback behavior

---

## Live update cadence

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Low-latency stream | Frequent near real-time transcript updates while recording | ✓ |
| Timed chunk updates | Update every fixed N seconds | |
| Phrase/pause updates | Update only on detected speech boundaries | |

**User's choice:** Low-latency stream
**Notes:** User explicitly prefers low-latency streaming UX.

---

## Interim vs finalized text behavior

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Interim hidden | Show only finalized transcript | |
| Show interim + replace with final | Display unstable text, then reconcile | ✓ |
| Dual panes | Separate interim and finalized areas | |

**User's choice:** Show interim + replace with final
**Notes:** User wants immediate visibility with later correction.

---

## Timestamp finalization policy

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Timestamps for interim text | Attempt provisional timestamps live | |
| Timestamps only after finalization | Attach stable word timings when chunk is finalized | ✓ |
| Mixed mode | Approximate interim, refine later | |

**User's choice:** Timestamps only after finalization
**Notes:** Keeps navigation/annotation contract stable.

---

## Recording controls interaction

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Pause recording only | Live transcription continues in background | |
| Pause recording + transcription | Both pause/resume together, maintain boundaries | ✓ |
| Pause transcription only | Recording continues without live updates | |

**User's choice:** Pause recording + transcription
**Notes:** User also requested transcript boundary markers at pause points and auto-finalization of remaining interim text on stop.

---

## Failure fallback behavior

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Abort recording on live-ASR failure | Stop capture when transcription breaks | |
| Continue recording + show warning | Keep capture reliable and notify user | ✓ |
| Silent retry only | Keep running without explicit user warning | |

**User's choice:** Continue recording + show warning
**Notes:** Recording reliability is prioritized over live-ASR continuity.

---

## the agent's Discretion

- Exact chunk buffering strategy
- Interim text visual styling
- Retry/backoff internals
- Boundary marker serialization format

## Deferred Ideas

None.
