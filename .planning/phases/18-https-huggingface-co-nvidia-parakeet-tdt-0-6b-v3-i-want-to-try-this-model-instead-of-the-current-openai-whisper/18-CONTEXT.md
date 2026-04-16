# Phase 18: "https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 I want to try this model instead of the current openai-whisper" - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the current sidecar transcription backend (`faster-whisper large-v3`) with NVIDIA Parakeet TDT (`nvidia/parakeet-tdt-0.6b-v3` via ONNX tooling), while preserving existing Amanuensis user behavior and transcript contract needed by the renderer and annotation/export pipeline.

</domain>

<decisions>
## Implementation Decisions

### Migration strategy
- **D-01:** Use a **hard cut** migration from faster-whisper to Parakeet for this phase (no runtime feature flag, no dual-backend support).
- **D-02:** Rollback strategy is repository-level rollback via git history if needed, not in-app fallback logic.

### Transcript metadata / UI contract
- **D-03:** If detected language is not exposed by the Parakeet inference path, **hide the language field in UI** rather than showing a placeholder value.
- **D-04:** Keep transcript payload structure stable for words/segments/duration; only language display behavior may be conditional.

### Audio preprocessing + runtime dependency
- **D-05:** Use **ffmpeg-based conversion** path for uploaded recording preprocessing where required by the chosen Parakeet runtime.
- **D-06:** ffmpeg availability is an explicit prerequisite and must be installed/provisioned as part of the sidecar runtime environment.

### Model delivery behavior
- **D-07:** Keep an **explicit model download flow with progress** (do not switch to silent lazy-download-only on first transcription).

### the agent's Discretion
- Token-to-word timestamp aggregation details (boundary heuristics, punctuation handling, end-time fallback)
- Exact ffmpeg invocation flags and temporary file lifecycle
- Exact renderer condition for language badge visibility (empty string/null-based guard)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and decisions
- `.planning/ROADMAP.md` - Phase 18 boundary and sequencing dependencies
- `.planning/PROJECT.md` - product-level constraints (local-only transcription, cross-platform desktop)
- `.planning/REQUIREMENTS.md` - baseline transcription and UX requirements to preserve
- `.planning/STATE.md` - current milestone/project status context

### Phase-specific technical research
- `.planning/phases/18-https-huggingface-co-nvidia-parakeet-tdt-0-6b-v3-i-want-to-try-this-model-instead-of-the-current-openai-whisper/18-RESEARCH.md` - evaluated integration approaches, risks, and migration sketch

### Sidecar transcription implementation surfaces
- `sidecar/app/services/transcription.py` - current faster-whisper transcription service and output shape
- `sidecar/app/services/model_manager.py` - current model repo/marker/progress download logic
- `sidecar/app/routes/transcribe.py` - upload handling, transcribe endpoint, status semantics
- `sidecar/pyproject.toml` - dependency graph to be migrated from faster-whisper stack
- `sidecar/amanuensis-sidecar.spec` - PyInstaller hiddenimports/datas requiring backend migration updates

### Renderer contract / UX surfaces
- `src/renderer/src/stores/transcript.ts` - expected response schema (`words`, `segments`, `language`, `duration`)
- `src/renderer/src/components/TranscriptPanel.vue` - language badge rendering and transcribing copy
- `src/renderer/src/components/AppToolbar.vue` - transcribe button label/tooltips mentioning Whisper

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sidecar/app/services/model_manager.py` already provides stateful model download + progress callback flow that can be reused with new model repository identifiers.
- `sidecar/app/routes/transcribe.py` already enforces single-transcription concurrency and lifecycle-safe temp upload handling.
- `src/renderer/src/stores/transcript.ts` already normalizes sidecar response into app state and can preserve compatibility if payload shape remains stable.

### Established Patterns
- Sidecar work is isolated into service modules (`services/*`) and route modules (`routes/*`), with synchronous heavy work delegated off event loop.
- Transcription response currently includes word-level and segment-level timing objects consumed directly in UI and session persistence.
- Model installation is explicit, with a user-visible progress concept through model manager state.

### Integration Points
- Backend swap primarily impacts: `transcription.py`, `model_manager.py`, dependency manifests, and PyInstaller spec.
- Frontend updates are localized to language display behavior and model-name wording where surfaced.
- End-to-end contract boundary is `/transcribe` JSON response consumed by `transcript.ts` and transcript UI components.

</code_context>

<specifics>
## Specific Ideas

- "hard cut; rollback can be done with git"
- "hide field if language is not exposed"
- "can use ffmpeg but has to be installed first"
- "yes keep explicit download"

</specifics>

<deferred>
## Deferred Ideas

- Optional fallback backend toggle (faster-whisper backup mode) was intentionally deferred/out of scope for this phase.

</deferred>

---

*Phase: 18-https-huggingface-co-nvidia-parakeet-tdt-0-6b-v3-i-want-to-try-this-model-instead-of-the-current-openai-whisper*
*Context gathered: 2026-04-16*
