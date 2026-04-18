# Phase 27: reduce live transcription delay with latest-only inference scheduling - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 27-reduce-live-transcription-delay-with-latest-only-inference-scheduling
**Areas discussed:** latest-only scheduling policy, responsiveness vs transcript churn, settle behavior / completeness policy, telemetry / visibility

---

## Latest-only scheduling policy

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Prefer newest useful tail | Skip superseded intermediate inference windows when newer audio makes them obsolete | ✓ |
| Process every intermediate window | Preserve all partial states even if backlog grows | |

**User's choice:** prefer newest useful tail
**Notes:** User explicitly wants the sidecar to favor the newest useful audio rather than finish obsolete queued work.

---

## Responsiveness vs transcript churn

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Accept high interim churn | Interim text can churn heavily if responsiveness improves | ✓ |
| Limit churn | Keep interim text steadier even if latency remains higher | |

**User's choice:** any level of churn
**Notes:** User explicitly accepted any level of churn as long as speed improves.

---

## Settle behavior / completeness policy

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Prioritize catching up to current speech | Focus on reducing settle lag and staying near real-time | ✓ |
| Preserve every intermediate state | Show all partial transitions even when this keeps the transcript behind | |

**User's choice:** prioritize catching up to speed
**Notes:** User prefers live usefulness now over replaying every obsolete intermediate inference result.

---

## Telemetry / visibility

| Option | Description | Selected |
| ------ | ----------- | -------- |
| Keep lightweight telemetry | Preserve simple visibility into latency/queue/runtime without bigger UI | ✓ |
| Add richer debugging UI | Expand the live telemetry surface with more controls or detail | |

**User's choice:** keep lightweight
**Notes:** User does not want a heavier UI as part of this latency phase.

---

## the agent's Discretion

- Exact scheduler mechanism and stale-window dropping rules
- Exact test harness and measurement thresholds
- Exact telemetry field refinements that stay within the lightweight UI constraint

## Deferred Ideas

None.
