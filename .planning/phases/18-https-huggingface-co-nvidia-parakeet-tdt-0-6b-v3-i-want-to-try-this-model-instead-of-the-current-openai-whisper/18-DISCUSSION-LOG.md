# Phase 18: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 I want to try this model instead of the current openai-whisper" - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 18-https-huggingface-co-nvidia-parakeet-tdt-0-6b-v3-i-want-to-try-this-model-instead-of-the-current-openai-whisper
**Areas discussed:** Migration strategy, Language field contract, Audio decode path, Timestamp mapping policy, Model delivery behavior

---

## Migration strategy

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Hard cut | Replace faster-whisper with Parakeet directly in this phase | ✓ |
| Feature flag rollout | Keep both backends with runtime switch | |
| Keep fallback path | Primary Parakeet, preserve faster-whisper fallback | |

**User's choice:** Hard cut
**Notes:** User explicitly prefers clean cut and accepts git rollback as recovery path.

---

## Language field contract

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Hide field when unavailable | Suppress language display if backend cannot provide it | ✓ |
| Show placeholder | Render `UND`/`auto`/`unknown` marker | |
| Always show best-effort guess | Infer language separately and always display | |

**User's choice:** Hide field when unavailable
**Notes:** Keep UX clean; avoid exposing uncertain metadata.

---

## Audio decode path

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| ffmpeg conversion path | Convert incoming recording to required format before inference | ✓ |
| In-process decode pipeline | Decode with Python libs only (no ffmpeg dependency) | |
| Hybrid fallback chain | Try in-process first, fall back to ffmpeg | |

**User's choice:** ffmpeg conversion path
**Notes:** User explicitly accepts ffmpeg dependency and requires installation/provisioning.

---

## Timestamp mapping policy

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Discuss now | Lock detailed token→word mapping rules in discuss-phase | |
| Leave to implementation | Let planner/executor define technical policy | ✓ |

**User's choice:** Leave to implementation
**Notes:** User said this does not need discussion in this step.

---

## Model delivery behavior

| Option | Description | Selected |
| ---------- | ---------------------------------- | -------- |
| Explicit pre-download + progress | Keep explicit model install/download flow before use | ✓ |
| Lazy first-use download | Download model on first transcription request | |
| Hybrid | Pre-download if possible, lazy fallback otherwise | |

**User's choice:** Explicit pre-download + progress
**Notes:** Preserve current explicit model management UX.

---

## the agent's Discretion

- Timestamp aggregation implementation details (token boundary rules)
- ffmpeg invocation details and temp file handling
- Exact UI guard logic for conditional language display

## Deferred Ideas

- Backend fallback/feature-flag rollout was considered but deferred (out of phase scope by user choice)
