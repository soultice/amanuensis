# Phase 21: "increase speed of live transcription" - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 21-increase-speed-of-live-transcription
**Areas discussed:** latency target & user-perceived responsiveness, accuracy vs speed tradeoff policy, optimization focus area, hardware/performance mode strategy, validation criteria for “faster”

---

## Latency target & user-perceived responsiveness

| Option | Description | Selected |
| --- | --- | --- |
| First-token speed priority | Minimize delay before first visible interim text appears | ✓ |
| Balanced onset + steady cadence | Split effort equally between start delay and ongoing cadence | |
| Steady cadence priority | Focus more on sustained updates than first-token delay | |

**User's choice:** First-token speed priority.
**Notes:** User reports live transcription feels slightly delayed at startup; no concrete ms target provided.

---

## Accuracy vs speed tradeoff policy

| Option | Description | Selected |
| --- | --- | --- |
| Speed-first (high bias) | Prioritize maximum speed, accept more interim instability | ✓ |
| Balanced | Keep moderate speed/stability tradeoff | |
| Stability-first | Prefer fewer interim corrections even if slower | |

**User's choice:** Speed-first with roughly 90% weight toward maximum speed.
**Notes:** User explicitly accepted high-speed bias.

---

## Optimization focus area

| Option | Description | Selected |
| --- | --- | --- |
| Renderer-first | Tune chunk flush/cadence and UI polling first | |
| Sidecar-first then renderer | Optimize backend ingest/transcribe path first, then frontend tuning | ✓ |
| Parallel both at once | Optimize both simultaneously from start | |

**User's choice:** Sidecar-first then renderer.
**Notes:** User asked to follow recommendation.

---

## Hardware/performance mode strategy

| Option | Description | Selected |
| --- | --- | --- |
| Safe auto default | Keep reliable auto behavior across environments | ✓ |
| Manual performance mode default | Require user-selected mode for best speed | |
| Aggressive default mode | Push performance by default, tolerate higher risk | |

**User's choice:** Safe auto default.
**Notes:** User asked to follow recommendation.

---

## Validation criteria for “faster”

| Option | Description | Selected |
| --- | --- | --- |
| Explicit fixed ms targets now | Lock numeric latency thresholds immediately | |
| Research-derived “natural feel” targets | Derive thresholds from human-perception research | ✓ |
| Qualitative only | No metrics, rely on subjective checks | |

**User's choice:** Research-derived natural-feel targets.
**Notes:** User does not want explicit metrics now; asked for research on human-natural responsiveness.

---

## the agent's Discretion

- Exact numeric latency thresholds and measurement protocol after research.
- Exact chunk-size/window tuning values.
- Whether to expose an optional aggressive performance mode in UI or keep it internal.

## Deferred Ideas

None.
