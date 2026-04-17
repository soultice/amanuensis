# Phase 21: Increase Speed of Live Transcription - Research

**Researched:** 2026-04-17  
**Domain:** Live ASR latency optimization (Electron/Vue renderer + FastAPI sidecar + onnx-asr)  
**Confidence:** HIGH (code-path findings), MEDIUM (external latency heuristics)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements (derived from locked decisions)

Roadmap still marks Phase 21 requirements as `TBD`; use these locked-decision IDs as execution anchors.

| ID | Description | Research Support |
| --- | --- | --- |
| D-01 | First-token speed is top priority | Sidecar cold-start + cumulative decode hotspots identified; first-token budget proposed |
| D-02 | Targets must be research-derived | Human-perception latency bands mapped to measurable p50/p95 thresholds |
| D-03 | Strong speed bias accepted | Recommendations favor lower latency even with interim churn |
| D-04 | Sidecar-first, renderer-second | Plan split explicitly follows this sequence |
| D-05 | No new product capabilities | Recommendations stay within existing live session contracts |
| D-06 | Safe auto remains default | Optimization strategy keeps default path reliable and automatic |
| D-07 | Optional aggressive mode allowed | Optional advanced tuning path scoped as secondary |
| D-08 | “Natural feel” success criteria | Verification metrics include time-to-first-visible-text + cadence smoothness |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Project uses GSD workflow and planning artifacts under `.planning/`.
- No additional coding/security constraints were specified beyond GSD + project docs.
- Keep continuity with existing phase artifacts rather than introducing a parallel architecture.

## Summary

Phase 21 performance is currently limited by a sidecar design that recomputes too much work per chunk. In `live_transcription.py`, each incoming chunk appends bytes to `session.accumulated_chunks`, rebuilds a full cumulative blob, writes a temp file, and runs `transcribe_file(...)` over the entire cumulative audio. This creates O(n²)-style growth over session length for repeated decode/transcribe work. The same path also returns a full `finalized.words`/`segments` snapshot every chunk, which increases payload size over time.

First-token latency is also penalized by startup behavior: the model is loaded lazily on first actual inference (`get_model` in `transcription.py`), and first visible text depends on both renderer buffering (`LIVE_FLUSH_WINDOW_MS = 500`, min 8KB) and first sidecar inference completion.

**Primary recommendation:** Implement a sidecar-first latency pass that (1) warms inference path before first chunk decode, (2) caps per-chunk recompute to a bounded rolling window instead of full cumulative re-transcription, and (3) adds explicit latency telemetry (TTFT + per-chunk end-to-end + queue depth) consumed by renderer adaptive flushing. Then apply renderer tuning for first flush and cadence control.

## Natural-Feel Latency Budgets (research-derived)

These are **planning-time targets** (not yet locked product requirements):

- **Time-to-first-visible-text (TTFT):** p50 <= **0.8s**, p95 <= **1.5s**
- **Steady update cadence (while recording):** p50 <= **0.6s** between visible updates
- **Chunk queue depth during normal speech:** p95 <= **1** (avoid backlog growth)
- **Finalization delay on stop (unchanged contract):** p95 <= **2.5s** for typical short recordings

Rationale:
- UX response-time heuristics (NN/g): 0.1s feels instantaneous; ~1s keeps user flow; >1s becomes noticeably delayed.
- Existing app currently aims at low-latency live updates (Phase 19) and now prioritizes first-token speed.

## Standard Stack

No mandatory new dependencies are required for Phase 21.

### Core
| Library / Platform | Version in repo | Purpose | Why Standard |
| --- | --- | --- | --- |
| Vue | `^3.5.13` | Transcript/live UI rendering | Existing renderer stack |
| Pinia | `^2.2.6` | Recording/transcript state orchestration | Existing store boundary for cadence tuning |
| FastAPI | `>=0.115,<0.116` | Live transcription endpoints | Existing sidecar API surface |
| onnx-asr | `>=0.8` | Parakeet inference backend | Existing ASR runtime |
| ffmpeg CLI | system binary | WebM→WAV conversion in sidecar | Existing conversion path |

### Supporting
| Tool | Version observed | Purpose |
| --- | --- | --- |
| Node | `v22.14.0` | Renderer build/runtime |
| npm | `11.2.0` | Frontend package management |
| Python | `3.14.3` | Sidecar runtime |
| Poetry | `2.3.4` | Sidecar env/deps |
| ffmpeg | `8.1` | Audio conversion |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Full cumulative re-transcribe each chunk | Bounded rolling decode window + periodic reconciliation | Much faster per chunk, but requires merge logic and churn tolerance |
| No warmup | Model/load path warmup on live-start | Better TTFT, small extra complexity |
| Fixed flush cadence | Adaptive flush by observed latency/queue depth | Better responsiveness under variable CPU load |

## Current Hotspots (repo evidence)

### 1) Sidecar cumulative recompute dominates latency growth
- `live_transcription.py` appends each chunk to `session.accumulated_chunks`
- Builds `cumulative_blob = b''.join(...)`
- Writes temp `.webm`
- Calls `transcribe_file` over cumulative audio each chunk

Impact: as session duration grows, per-chunk processing cost grows.

### 2) Repeated ffmpeg conversion per chunk
`transcription.py` converts every incoming file to WAV using a fresh `ffmpeg` subprocess (`_convert_to_wav`).

Impact: process startup + full-file conversion repeats for each live chunk path.

### 3) First-token waits on both client buffer and sidecar cold path
- Renderer flush window default: 500ms + 8KB threshold (`recording.ts`)
- Model load is lazy in first inference (`get_model`)

Impact: TTFT can exceed “natural feel” especially on cold start.

### 4) Client does not consume sidecar latency telemetry for adaptation
`pushLiveChunk` receives `metrics.serverLatencyMs`, but no adaptive tuning uses it in `recording.ts` / `transcript.ts`.

Impact: flush strategy remains static regardless of current sidecar load.

## Architecture Patterns (recommended)

### Pattern 1: Sidecar bounded-work ingest (sidecar-first)
**What:** Replace per-chunk full-history recompute with bounded decode scope (rolling window + overlap), while preserving final schema contract.
**When:** Every live chunk ingestion path.
**Why:** Keeps per-chunk cost roughly stable instead of increasing with session length.

### Pattern 2: Warm path before first user-visible chunk
**What:** Preload inference/model path at live session start (or immediately before first chunk).
**When:** `POST /transcribe/live/start` and first chunk boundary.
**Why:** Reduces cold-start TTFT spikes.

### Pattern 3: Telemetry-driven renderer cadence
**What:** Use `serverLatencyMs` + `queueDepth` to adjust flush window dynamically.
**When:** During active recording after first chunk response.
**Why:** Prevent queue buildup while prioritizing first-token speed.

### Pattern 4: Speed-safe defaults + optional aggressive mode
**What:** Keep current safe auto behavior by default; expose optional aggressive internals only if needed.
**When:** Only after baseline optimization if targets still missed.
**Why:** Aligns with D-06/D-07.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| New transport protocol | Custom socket/messaging layer | Existing `/transcribe/live/*` HTTP contracts | Keeps scope in Phase 21 speed focus |
| New transcript schema | Separate live-only data model | Existing `{words, segments, language, duration}` final contract | Avoids regressions in NAV/annotation flows |
| UI-only “fake speed” | Placeholder text unbound to pipeline | Real latency instrumentation + measured budgets | Ensures actual responsiveness gain |

## Common Pitfalls

### Pitfall 1: Optimizing renderer cadence before sidecar cost curve
**What goes wrong:** More frequent flushes increase queue backlog instead of improving responsiveness.
**Avoid by:** Sidecar bounded-work + warmup first (D-04).

### Pitfall 2: Breaking finalized transcript contract while reducing work
**What goes wrong:** NAV/click-to-seek and annotation selection regress.
**Avoid by:** Keep final payload schema unchanged; confine speed changes to live ingest strategy and cadence.

### Pitfall 3: Chasing mean latency only
**What goes wrong:** P95 spikes still feel laggy to users.
**Avoid by:** Track p50 and p95 TTFT and update cadence.

### Pitfall 4: Ignoring sequence/backpressure interactions
**What goes wrong:** Out-of-order chunk handling and growing queue depth create warning storms.
**Avoid by:** Explicit queue-depth limits and adaptive client pacing.

## Code Examples (current hotspots)

### Renderer first flush policy
```ts
// src/renderer/src/stores/recording.ts
const LIVE_FLUSH_WINDOW_MS = 500
const LIVE_FLUSH_MIN_BYTES = 8 * 1024
```

### Sidecar full cumulative recompute per chunk
```py
# sidecar/app/services/live_transcription.py
session.accumulated_chunks.append(audio_bytes)
cumulative_blob = b''.join(session.accumulated_chunks)
...
result = await loop.run_in_executor(None, self._transcribe_callable, model_dir, tmp_path, device)
```

### Per-chunk ffmpeg conversion before recognition
```py
# sidecar/app/services/transcription.py
wav_path = _convert_to_wav(audio_path)
result = model.recognize(str(wav_path))
```

### Telemetry currently available but underused
```ts
// src/renderer/src/types/live-transcript.ts
metrics?: { serverLatencyMs?: number }
```

## State of the Art (for this codebase)

| Current (Phase 19/20) | Phase 21 target |
| --- | --- |
| Static flush cadence + full cumulative decode each chunk | Adaptive cadence + bounded per-chunk compute |
| First-token latency depends on cold model path | Warmed inference path before first meaningful chunk |
| Latency metric returned but not used for control | Telemetry-driven pacing and verification |

## Open Questions

1. **Bounded decode merge policy:** should sidecar return append-only deltas or still full snapshots during migration?
2. **Warmup strategy:** warm on app start, live start, or first chunk preflight?
3. **Aggressive mode exposure:** internal flag only vs user-visible toggle if targets are still missed.
4. **Stop-time behavior:** keep current `stopLiveSession` finalize path or trigger explicit recovery pass for highest accuracy after fast live mode.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
| --- | --- | --- | --- | --- |
| Node | Renderer | ✓ | v22.14.0 | — |
| npm | Renderer scripts | ✓ | 11.2.0 | — |
| Python | Sidecar | ✓ | 3.14.3 | — |
| Poetry | Sidecar env | ✓ | 2.3.4 | — |
| ffmpeg | Sidecar conversion | ✓ | 8.1 | none practical |

Missing dependencies with no fallback: None identified.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/21-increase-speed-of-live-transcription/21-CONTEXT.md`
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md`
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-RESEARCH.md`
- `src/renderer/src/stores/recording.ts`
- `src/renderer/src/stores/transcript.ts`
- `src/renderer/src/types/live-transcript.ts`
- `sidecar/app/routes/transcribe.py`
- `sidecar/app/services/live_transcription.py`
- `sidecar/app/services/transcription.py`
- `sidecar/tests/test_live_transcription_integration.py`
- `sidecar/tests/test_live_transcription_routes.py`
- `.planning/config.json`

### Secondary (MEDIUM confidence)
- NN/g response-time guidance: https://www.nngroup.com/articles/response-times-3-important-limits/
- MDN MediaRecorder timing caveats: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start and https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event
- FastAPI WebSocket reference (transport comparison context): https://fastapi.tiangolo.com/advanced/websockets/

## Metadata

**Confidence breakdown:**
- Hotspot analysis: HIGH (direct code evidence)
- Recommended architecture: HIGH (fits existing boundaries and constraints)
- Human-perception target bands: MEDIUM (heuristic guidance, should be validated with local measurement)

**Research date:** 2026-04-17  
**Valid until:** 2026-05-17  
**Note:** Validation Architecture intentionally omitted because `workflow.nyquist_validation=false` in `.planning/config.json`.
