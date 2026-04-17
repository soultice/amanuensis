# Phase 19: transcription-should-be-live-from-now-on - Research

**Researched:** 2026-04-16  
**Domain:** Live transcription pipeline for Electron/Vue + FastAPI + onnx-asr  
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Claude's Discretion
- Chunk segmentation heuristic and exact stream buffering strategy
- Interim text styling details (visual treatment while unstable)
- Retry/backoff strategy details for live transcription worker failures
- Exact boundary marker representation in transcript state/store

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Project uses GSD workflow conventions (`/gsd-help` entrypoint).
- Project overview anchor is `.planning/PROJECT.md`.
- No additional coding/security/testing constraints were specified in `CLAUDE.md`.

## Summary

Phase 19 should be implemented as **session-based live chunk transcription** on top of the existing architecture, not as a full rewrite. The current flow is batch-only: renderer records via `MediaRecorder`, uploads one blob to `POST /transcribe`, then receives final `words/segments`. For live behavior, keep this contract for final output, but add a parallel live session protocol (`start/chunk/pause/resume/stop`) that emits interim text during recording and finalized timestamped words at chunk boundaries.

Evidence from current code shows the right extension points already exist: `recording.ts` emits frequent chunks (`recorder.start(100)`), `transcript.ts` centralizes transcript state, and sidecar already has lock/status patterns. Official docs confirm MediaRecorder `timeslice` is not exact, so chunk buffering must tolerate jitter; FastAPI natively supports WebSockets if needed, but HTTP chunk endpoints are lower-risk because the app already uses fetch/polling.

**Primary recommendation:** Implement low-latency live transcription as **HTTP session + micro-batch chunks (250–1000ms effective windows)** with interim text updates and final timestamp commit on chunk finalization; keep existing batch endpoint as fallback.

## Standard Stack

### Core
| Library / Platform | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| MediaRecorder (Web API) | Baseline (widely available; MDN) | Emit frequent audio blobs during active recording | Already in codebase; native chunking model fits live updates |
| Vue | ^3.5.13 (project), latest 3.5.32 | UI rendering for transcript/interim/error states | Existing frontend standard |
| Pinia | ^2.2.6 (project), latest 3.0.4 | Single source of truth for recording + transcript state | Existing store pattern in repo |
| FastAPI | >=0.115,<0.116 (project), latest 0.136.0 | Sidecar API for live session control and chunk ingestion | Existing backend framework and routing |
| onnx-asr | >=0.8 (project), latest 0.11.0 | ASR inference for chunk and finalize passes | Current ASR stack already migrated in prior phases |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| Uvicorn | >=0.32,<0.33 (project), latest 0.44.0 | Serve FastAPI sidecar | Existing runtime |
| ffmpeg (CLI) | 8.1 detected locally | Normalize/convert incoming audio for ASR | Required for robust codec handling |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| HTTP start/chunk/stop endpoints + status polling | WebSocket duplex stream | WebSocket gives cleaner duplex streaming but higher integration complexity in current codebase |
| Chunk finalization timestamps only | Per-token interim timestamps | Interim timestamping is unstable and violates D-04 simplicity target |

**Installation:**
```bash
# No new mandatory packages for Phase 19 baseline implementation.
# Reuse existing stack; optional websocket client package is not required.
```

**Version verification:**
- `npm view vue version` → `3.5.32` (published 2026-04-03T05:41:39.680Z)
- `npm view pinia version` → `3.0.4` (published 2025-11-05T09:25:13.853Z)
- PyPI JSON: `fastapi` latest `0.136.0` (2026-04-16)
- PyPI JSON: `uvicorn` latest `0.44.0` (2026-04-06)
- PyPI JSON: `onnx-asr` latest `0.11.0` (2026-03-23)

## Architecture Patterns

### Recommended Project Structure
```text
src/renderer/src/stores/
├── recording.ts           # capture lifecycle + chunk emission
├── transcript.ts          # interim/final transcript state machine
└── (new) liveTranscribe.ts(optional) # transport/session orchestration helper

sidecar/app/routes/
├── transcribe.py          # keep batch endpoint + add /live/* endpoints

sidecar/app/services/
├── transcription.py       # keep final schema contract
└── (new) live_transcription.py # session buffer + chunk/finalize logic
```

### Pattern 1: Session-based Live Transcription
**What:** Explicit backend session lifecycle: `start -> chunk* -> pause/resume -> stop(finalize)`.
**When to use:** Always for recording-active live mode.
**Example:**
```python
# Source: existing route style in sidecar/app/routes/transcribe.py
# plus FastAPI websockets/endpoint docs: https://fastapi.tiangolo.com/advanced/websockets/
@router.post('/live/start')
async def start_live(...):
    ...

@router.post('/live/chunk')
async def push_chunk(...):
    ...

@router.post('/live/stop')
async def stop_live(...):
    # finalize remaining interim text into timestamped words
    ...
```

### Pattern 2: Two-tier transcript state (interim vs committed)
**What:** Maintain separate buffers in store: `interimText` (unstable) and `words/segments` (committed/final).
**When to use:** Any UI frame during active recording.
**Example:**
```ts
// Source pattern: src/renderer/src/stores/transcript.ts
state: {
  transcriptState: 'empty' | 'live' | 'finalizing' | 'complete' | 'error',
  interimText: '',
  words: Word[],        // finalized only (timestamps guaranteed)
  segments: Segment[],  // finalized only
}
```

### Pattern 3: Pause boundary markers as first-class events
**What:** Emit explicit pause/resume boundaries in transcript model without fabricating timestamps for interim tokens.
**When to use:** On each D-05/D-06 transition.
**Example:**
```ts
// Source: recording lifecycle hooks in src/renderer/src/stores/recording.ts
if (recordingState === 'paused') pushBoundary({ type: 'pause-start' })
if (recordingState === 'recording' && resumed) pushBoundary({ type: 'pause-end' })
```

### Anti-Patterns to Avoid
- **Single giant live buffer with late parse:** increases latency and defeats D-01.
- **Mutating finalized words in place:** breaks navigation/annotation stability.
- **Coupling recording stop to ASR success:** violates D-08 (recording must continue regardless).
- **Using strict timeslice assumptions:** MDN notes intervals are not exact; design for jitter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Audio codec/container parsing | Custom WebM/Opus parser | ffmpeg normalization in sidecar | Handles edge cases and format quirks reliably |
| Real-time transport protocol | Custom socket framing protocol | FastAPI HTTP routes (or built-in WebSocket primitives) | Existing backend patterns already match this |
| Timestamp generation for interim text | Heuristic fake timestamps | Commit timestamps only on finalized chunks | Aligns with D-04 and avoids unstable UX |
| Concurrency guards | Ad-hoc global booleans | `asyncio.Lock` + per-session state map | Prevents race conditions across live/batch calls |

**Key insight:** In this phase, correctness of state transitions and final timestamp contract is more important than maximal stream sophistication.

## Common Pitfalls

### Pitfall 1: Assuming `timeslice` emits exact intervals
**What goes wrong:** Chunk cadence drifts; UI appears bursty or delayed.
**Why it happens:** MediaRecorder timing is best-effort, not exact.
**How to avoid:** Buffer by elapsed wall-clock and flush by size/time thresholds.
**Warning signs:** Irregular interim updates under CPU load.

### Pitfall 2: Breaking final schema compatibility
**What goes wrong:** `TranscriptPanel`, navigation, or annotation code fails after live mode.
**Why it happens:** Live path returns shape different from `{words,segments,language,duration}`.
**How to avoid:** Preserve final response schema exactly; add live metadata separately.
**Warning signs:** UI works live but seek/selection breaks after stop.

### Pitfall 3: Over-serializing with single global lock
**What goes wrong:** Live session blocks unrelated operations or deadlocks with finalize path.
**Why it happens:** Current batch lock is global and coarse.
**How to avoid:** Use per-live-session lock + clear state ownership.
**Warning signs:** 409 conflicts during normal pause/resume/stop.

### Pitfall 4: Environment drift (Python version)
**What goes wrong:** Sidecar deps fail to install/run locally.
**Why it happens:** Project requires Python >=3.10 but host has Python 3.9.6.
**How to avoid:** Run sidecar in Poetry env using a 3.10+ interpreter.
**Warning signs:** resolver/install errors for sidecar dependencies.

## Code Examples

Verified patterns from official/current sources and repository:

### MediaRecorder chunk capture
```ts
// Source: src/renderer/src/stores/recording.ts
const recorder = new MediaRecorder(stream, { mimeType })
recorder.ondataavailable = (e: BlobEvent) => {
  if (e.data.size > 0) this._chunks.push(e.data)
}
recorder.start(100)
```

### Existing transcription contract to preserve
```ts
// Source: src/renderer/src/stores/transcript.ts
const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe`, {
  method: 'POST',
  body: formData,
})
const data = await res.json() // expects { words, segments, language, duration }
```

### FastAPI websocket capability (if needed)
```python
# Source: https://fastapi.tiangolo.com/advanced/websockets/
@app.websocket('/ws')
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f'Message text was: {data}')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Post-stop full-file transcription only | Low-latency live chunk updates + final commit on stop | Phase 19 target | Faster feedback during recording without sacrificing final timestamp quality |
| Single transcript state `transcribing` | Explicit live states (`live`, `finalizing`, `complete`, `error`) | Phase 19 target | Clearer UI and safer pause/resume/stop transitions |

**Deprecated/outdated:**
- “No real-time transcription while recording” from older requirements assumptions is now intentionally superseded for this phase scope.

## Open Questions

1. **How should chunk duration be tuned (latency vs accuracy) for Parakeet in this app?**
   - What we know: Current recorder emits at 100ms; onnx-asr docs caution many models have 20–30s max window and support long-form via VAD.
   - What's unclear: Best chunk+context overlap for acceptable interim quality on target hardware.
   - Recommendation: Start with 500ms effective windows + short overlap, benchmark on CPU and iterate.

2. **HTTP chunk endpoints or WebSocket transport for v1 live implementation?**
   - What we know: FastAPI supports WebSockets; current app already uses fetch + polling.
   - What's unclear: Whether added websocket complexity yields meaningful UX gain for this desktop architecture.
   - Recommendation: Implement HTTP first (lower risk), keep transport abstraction for websocket upgrade later.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
| --- | --- | --- | --- | --- |
| Node.js | Renderer build/runtime tooling | ✓ | v22.14.0 | — |
| npm | Frontend scripts/deps | ✓ | 11.2.0 | — |
| Python | Sidecar runtime | ✓ (but low) | 3.9.6 | Use Poetry with Python >=3.10 |
| Poetry | Sidecar dependency/env management | ✓ | 2.3.4 | pip/venv (less preferred) |
| ffmpeg | Audio conversion before ASR | ✓ | 8.1 | None practical |
| Docker daemon | Optional container workflows | ✗ (daemon unavailable) | — | Local native run |
| pytest CLI | Optional automated tests | ✗ | — | `poetry run pytest` once test files exist |

**Missing dependencies with no fallback:**
- None blocking for this phase’s baseline implementation, provided sidecar runs in a Python 3.10+ Poetry environment.

**Missing dependencies with fallback:**
- Docker daemon unavailable → use native local execution.
- Global `pytest` unavailable → use Poetry-scoped pytest.

## Sources

### Primary (HIGH confidence)
- Project code:
  - `src/renderer/src/stores/recording.ts`
  - `src/renderer/src/stores/transcript.ts`
  - `src/renderer/src/components/AppToolbar.vue`
  - `src/renderer/src/components/TranscriptPanel.vue`
  - `src/renderer/src/views/AppShellView.vue`
  - `sidecar/app/routes/transcribe.py`
  - `sidecar/app/services/transcription.py`
  - `sidecar/app/state.py`
- Project planning/docs:
  - `.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md`
  - `.planning/REQUIREMENTS.md`
  - `.planning/STATE.md`
  - `.planning/config.json`
  - `CLAUDE.md`
- Official docs:
  - MDN MediaRecorder `start()` (timeslice behavior, non-exact interval): https://developer.mozilla.org/docs/Web/API/MediaRecorder/start
  - FastAPI WebSockets docs: https://fastapi.tiangolo.com/advanced/websockets/
  - onnx-asr docs: https://istupakov.github.io/onnx-asr/

### Secondary (MEDIUM confidence)
- npm registry checks (`npm view`) for latest Vue/Pinia versions and publish timestamps.
- PyPI JSON API checks for latest FastAPI/Uvicorn/onnx-asr versions and release timestamps.

### Tertiary (LOW confidence)
- General web search results for streaming ASR ecosystem patterns (used only as directional context, not as authoritative implementation contract).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — directly grounded in existing repo stack + registry checks.
- Architecture: **MEDIUM** — recommended live session protocol is prescriptive but still needs local performance tuning.
- Pitfalls: **HIGH** — derived from existing code constraints + official API behavior.

**Research date:** 2026-04-16  
**Valid until:** 2026-05-16

## Deep Dive Addendum (2026-04-16)

### 1) Recommended numeric defaults (v1)

- Renderer `MediaRecorder.start(timeslice)`: **100 ms** (keep current setting for frequent chunk availability).
- Client-side live flush window (effective micro-batch sent to sidecar): **500 ms target**.
- Min chunk payload before upload: **>= 8 KB** OR time window reached.
- Max buffered unsent audio in renderer: **2.0 s** (then force flush).
- Overlap/context per chunk for continuity: **200 ms** previous audio context.
- Status polling interval (HTTP mode): **500 ms** while live session active.
- Interim UI debounce: **100 ms** (avoid flicker under bursty arrivals).
- Pause/resume boundary insertion tolerance: **<= 150 ms** from control action.
- Live session idle timeout (no chunks after start/resume): **15 s**.
- Retry/backoff for transient chunk POST failures: **3 attempts** at **100/300/900 ms**.

### 2) Transport choice matrix (HTTP vs WebSocket)

| Dimension | HTTP session endpoints (recommended v1) | WebSocket duplex stream |
| --- | --- | --- |
| Integration with current code | **Strong fit** (`fetch`, existing FastAPI routes/status polling) | New protocol path in renderer + sidecar |
| Implementation complexity | **Lower** | Higher |
| Latency profile | Good (sub-second with 500 ms chunks) | Best possible |
| Backpressure handling | Simple via 429/409 + retry logic | Better continuous flow control, but more logic |
| Error recovery | **Easy** (idempotent request semantics) | Harder (connection lifecycle/state sync) |
| Observability/debugging | **Simple** (per-request logs) | More complex session tracing |
| Phase-19 risk | **Lower** | Higher |
| Recommendation | **Use for v1** | Revisit in v2 after baseline metrics |

### 3) v1 API contract (live session)

> Finalized transcript payload remains schema-compatible with existing consumers: **`{ words, segments, language, duration }`**.

#### `POST /transcribe/live/start`
- Purpose: open a live transcription session.
- Request:
```json
{
  "sampleRate": 44100,
  "channels": 1,
  "mimeType": "audio/webm;codecs=opus",
  "sessionHint": "optional-client-id"
}
```
- Response `200`:
```json
{
  "sessionId": "uuid",
  "state": "live",
  "createdAt": "2026-04-16T12:00:00Z",
  "defaults": {
    "chunkWindowMs": 500,
    "statusPollMs": 500,
    "overlapMs": 200
  }
}
```

#### `POST /transcribe/live/chunk`
- Purpose: append chunk audio; return interim and optionally finalized delta.
- Content-Type: `multipart/form-data` with `audio` blob + metadata fields.
- Fields: `sessionId`, `seq`, `chunkStartMs`, `chunkEndMs`, `isLast`.
- Response `200`:
```json
{
  "sessionId": "uuid",
  "seq": 17,
  "state": "live",
  "interimText": "current unstable text",
  "finalized": {
    "words": [],
    "segments": []
  },
  "metrics": {
    "serverLatencyMs": 120
  }
}
```
- Notes:
  - `finalized.words/segments` can be empty if no boundary finalized this round.
  - Word timestamps only in finalized output (D-04).

#### `POST /transcribe/live/pause`
- Purpose: pause transcription processing for session.
- Request: `{ "sessionId": "uuid", "atMs": 12345 }`
- Response `200`: `{ "sessionId": "uuid", "state": "paused" }`

#### `POST /transcribe/live/resume`
- Purpose: resume processing and preserve boundary separation.
- Request: `{ "sessionId": "uuid", "atMs": 17890 }`
- Response `200`: `{ "sessionId": "uuid", "state": "live" }`

#### `POST /transcribe/live/stop`
- Purpose: finalize remaining interim transcript and close session.
- Request: `{ "sessionId": "uuid", "atMs": 22000 }`
- Response `200` (final contract):
```json
{
  "words": [],
  "segments": [],
  "language": "",
  "duration": 22.0,
  "session": {
    "id": "uuid",
    "state": "complete"
  }
}
```

#### `GET /transcribe/live/status?sessionId=...`
- Purpose: live state + health + last processed sequence.
- Response `200`:
```json
{
  "sessionId": "uuid",
  "state": "live",
  "lastSeq": 17,
  "queueDepth": 0,
  "warning": null,
  "error": null
}
```

#### Error semantics (all live endpoints)
- `400` invalid payload/sequence.
- `404` unknown/expired session.
- `409` invalid state transition (e.g., resume when already live).
- `429` server overload/backpressure.
- `500` internal transcription error (must not force recorder stop; D-08).

### 4) Benchmark plan + acceptance thresholds

Test matrix:
1. **Short dictation** (30–60 s, clean speech)
2. **Long monologue** (10 min, normal pace)
3. **Pause-heavy session** (>= 10 pause/resume cycles)
4. **Noisy environment** (background cafe noise)
5. **Failure injection** (drop 1 of every 20 chunk requests; forced sidecar ASR exception)

Metrics and thresholds (v1 go/no-go):
- P50 interim update latency (capture→UI): **<= 700 ms**
- P95 interim update latency: **<= 1500 ms**
- Finalization delay on stop (click→final payload): **<= 2.5 s** for <=10 min recording
- Chunk loss/reorder handling: **0 unhandled crashes**, <= **0.1%** unrecoverable chunk gaps
- Pause/resume boundary correctness: **100%** explicit boundary preservation in transcript model
- Sidecar error isolation (D-08): **100%** of runs continue recording despite live ASR failure
- UI warning visibility (D-09): warning surfaced within **<= 1.0 s** from detected failure

### 5) Top 5 delivery risks mapped to D-01..D-09

1. **Latency drift under load threatens “live feel” (D-01).**  
   - Cause: non-exact MediaRecorder cadence + chunk backlog.  
   - Mitigation: force-flush at 2 s buffer, queue depth monitoring, 429 backpressure path.

2. **Interim/final replacement bugs can duplicate or regress text (D-02, D-03).**  
   - Cause: weak sequence reconciliation between interim and finalized deltas.  
   - Mitigation: monotonic `seq`, append-only finalized store, separate interim buffer.

3. **Timestamp leakage into interim path violates D-04 contract.**  
   - Cause: trying to timestamp unstable tokens early.  
   - Mitigation: strict type split: interim text only; timestamps emitted only in finalized `words`.

4. **Pause/resume transition races can merge boundaries or lose text (D-05, D-06, D-07).**  
   - Cause: control events racing with chunk in-flight processing.  
   - Mitigation: per-session lock + transition state machine + stop-triggered forced finalize.

5. **Live ASR failures may accidentally halt recording or stay invisible (D-08, D-09).**  
   - Cause: coupling recorder lifecycle to sidecar response path; missing UI surfacing.  
   - Mitigation: recorder independent from transcription transport; explicit warning state and banner/toast SLA.

### 6) Schema compatibility guarantee

For all finalized outputs (chunk finalization and stop), preserve existing shape exactly:

```json
{ "words": [], "segments": [], "language": "", "duration": 0 }
```

Any live/session metadata must be additive (nested `session`, `metrics`, `interimText`) and must not break existing consumers expecting `{words, segments, language, duration}`.
