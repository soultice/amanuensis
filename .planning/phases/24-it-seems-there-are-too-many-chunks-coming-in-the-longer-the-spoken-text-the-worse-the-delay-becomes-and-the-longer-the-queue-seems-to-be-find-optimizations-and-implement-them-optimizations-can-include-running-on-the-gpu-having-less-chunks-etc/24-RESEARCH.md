# Phase 24: Long-Recording Live Transcription Backlog & Throughput Optimisation - Research

**Researched:** 2026-04-17  
**Domain:** Live ASR throughput, backlog control, hardware acceleration, and steady-state latency  
**Confidence:** HIGH (repo findings), MEDIUM (external performance guidance)

<user_constraints>
## User Constraints (derived from roadmap phase text)

### Locked Intent
- The current problem is **not just first-token speed**; it is **steady-state degradation**: the longer recording runs, the worse delay becomes.
- User suspects **too many chunks** and wants the system to find and implement optimisations.
- Acceptable optimisation categories explicitly include:
  - fewer chunks
  - GPU / hardware acceleration
  - any other optimisations that reduce queue buildup and delay
- Scope remains within current product capability: improve live transcription throughput without breaking the final transcript/navigation/annotation contracts.

### Implied Non-Negotiables
- Recording must remain reliable even if live transcription slows or fails.
- Final transcript contract must stay compatible with existing downstream features.
- Cross-platform packaging still matters; optimisations cannot assume a single OS-only runtime.
</user_constraints>

<phase_requirements>
## Phase Requirements (derived from user request + existing Phase 19/21 contracts)

| ID | Description | Why it exists |
| --- | --- | --- |
| P24-01 | Live latency must stay bounded as recording length grows | User reports worsening delay over time |
| P24-02 | Backlog/queue growth must be explicitly controlled, not merely observed | User reports queue appears to grow |
| P24-03 | System should process fewer unnecessary chunks/results when newer chunks supersede older work | User suspects too many chunks |
| P24-04 | App should use the best safe local execution provider available, with fallback to CPU | User explicitly suggested GPU |
| P24-05 | Existing final transcript contract (`words`, `segments`, `language`, `duration`) must remain intact | Required by transcript navigation/annotations/export |
| P24-06 | Failure behavior remains non-blocking: recording continues if live ASR degrades | Locked in Phase 19/20/21 |
| P24-07 | Telemetry must distinguish true backlog from in-flight work so tuning is evidence-based | Current queue metric is insufficient |
</phase_requirements>

## Project Constraints (from project docs + current code)

- Stack is Electron + Vue + Pinia + FastAPI + Python sidecar + Parakeet ONNX.
- Current app state already includes Phase 21 live telemetry and bounded decode windows.
- Current sidecar is still file/ffmpeg based per live chunk; no native streaming decoder path exists.
- Current dependency set installs `onnx-asr` with the **`cpu` extra only** in `sidecar/pyproject.toml`.
- Phase 24 should improve throughput **without introducing a new transport architecture**.

## Summary

Phase 21 improved initial live responsiveness, but the repo still contains several structural causes of **steady-state throughput collapse** during longer recordings:

1. **Capture is overly chatty at the source**: `MediaRecorder.start(100)` emits blobs every 100ms.
2. **Client upload backpressure is weak**: `_flushLiveChunks()` can start a new `fetch()` while a previous `/live/chunk` upload is still in flight.
3. **Sidecar still processes every chunk** even though newer live chunks supersede older ones.
4. **Each chunk still incurs file write + ffmpeg conversion + ASR invocation**.
5. **Each chunk returns a full transcript snapshot**, so response payloads and renderer store replacement cost grow with transcript length.
6. **"auto" does not currently mean hardware acceleration**. In practice it resolves to CPU-only behavior.
7. **Current queue metric understates real backlog**, because `queue_depth` is incremented only after acquiring the per-session lock.

**Primary recommendation:** treat Phase 24 as a **steady-state throughput** phase, not a micro-latency phase. The highest-ROI sequence is:

1. **Add latest-only coalescing + one-in-flight upload/backpressure**
2. **Stop returning full transcript snapshots on every chunk; move to deltas/patches**
3. **Reduce source chunk count via request-driven flushing or larger recorder slices**
4. **Enable runtime-selected hardware acceleration where available**
5. **Replace repeated per-chunk full file decode with a decode-once / PCM-window strategy**

That order directly targets the user's observed symptom: the longer the recording runs, the more stale work accumulates.

## Natural Success Metrics for Phase 24

These are recommended planning targets for this phase:

- **Steady-state update cadence:** p50 <= **0.8s**, p95 <= **1.8s** during a 3-5 minute continuous recording
- **Latency drift over session length:** median live update latency in minute 5 should be no more than **20% worse** than minute 1
- **Client outstanding live uploads:** max **1** active upload per session
- **Superseded work bound:** max **1** pending coalesced live job per session worker
- **Observed backlog telemetry:** expose both `uploadInFlight` and `coalescedPending`/`droppedSupersededChunks`
- **Hardware provider use:** automatically prefer usable accelerator EP when installed/available; otherwise safe CPU fallback
- **Stop/final payload contract:** unchanged

## Repo Findings (direct code evidence)

### 1) Source chunk count is still very high
**Evidence:** `src/renderer/src/stores/recording.ts`
```ts
recorder.start(100)
```
This means the renderer receives roughly **10 blobs/sec** before any batching logic. Even though `_flushLiveChunks()` combines them into larger uploads, the app still pays repeated `Blob` creation, array pushes, and ondataavailable churn.

**External support:** MDN documents that `MediaRecorder.start(timeslice)` creates a new blob for each slice and that `timeslice` is **not exact**; real intervals may be longer due to pending tasks. MDN also notes `requestData()` as the alternative way to control chunking.

**Implication:** 100ms source slices are too aggressive for this app’s current sidecar cost profile.

### 2) Client-side uploads are not explicitly serialized
**Evidence:** `src/renderer/src/stores/recording.ts`
```ts
void this._flushLiveChunks(false)
```
`_flushLiveChunks()` clears the pending buffer and then awaits `transcriptStore.pushLiveChunk(...)`, but there is **no `_liveFlushInFlight` guard**. If the sidecar is slower than the recorder, multiple uploads can overlap.

**Evidence:** `src/renderer/src/stores/transcript.ts`
```ts
const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/chunk`, {
  method: 'POST',
  body: formData,
})
```
No client-side backpressure token, abort/cancel, or stale-request dropping exists.

**Implication:** when the server slows down, the client can keep generating more work than the sidecar can retire.

### 3) Sidecar processes all chunks, including stale ones
**Evidence:** `sidecar/app/services/live_transcription.py`
- every live chunk calls `ingest_chunk(...)`
- every `ingest_chunk(...)` transcribes its window immediately
- no "latest wins" pending slot or stale-job replacement exists

This is a structural mismatch for live ASR: **chunk N+1 usually subsumes chunk N**, so finishing N after N+1 has arrived is often wasted work.

**Implication:** backlog grows because the system insists on processing stale interim work.

### 4) Every chunk still pays temp-file + ffmpeg conversion cost
**Evidence:** `sidecar/app/services/transcription.py`
```py
proc = subprocess.run([
    ffmpeg_bin,
    '-nostdin',
    '-y',
    '-i',
    str(audio_path),
    '-ac',
    '1',
    '-ar',
    '16000',
    str(wav_path),
], capture_output=True, text=True)
```
**Evidence:** `sidecar/app/services/live_transcription.py`
```py
with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
    tmp.write(blob)
```
Even after bounded windows, each live chunk still triggers:
- blob assembly
- temp file write
- ffmpeg process startup
- ffmpeg full conversion of the window
- model inference

**Implication:** the per-chunk fixed cost is still high enough that long sessions can outproduce the sidecar.

### 5) Live response payload size still grows with transcript length
**Evidence:** `src/renderer/src/stores/transcript.ts`
```ts
// Live chunk responses provide a full committed snapshot (not append-only delta).
this.words = data.finalized.words
this.segments = data.finalized.segments
```
**Evidence:** `sidecar/app/services/live_transcription.py`
```py
'finalized': {
    'words': session.words,
    'segments': session.segments,
}
```
Even when ASR compute is bounded, the network and renderer still pay an ever-growing **JSON serialization + transfer + parse + reactive replacement** cost.

**Implication:** delay worsening with transcript length is partly caused by payload growth, not only model inference.

### 6) Auto mode is CPU-only today
**Evidence:** `sidecar/pyproject.toml`
```toml
onnx-asr = {version = ">=0.8", extras = ["cpu", "hub"]}
```
**Evidence:** `sidecar/app/services/transcription.py`
```py
def _providers_for_device(device: str) -> list[str]:
    if device == "cuda":
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]
```
**Evidence:** `src/main/sidecar.ts`
```ts
args = ['run', 'python', '-m', 'app.main', '--port', String(port), '--user-data', userDataDir]
```
The main process does not pass `--device`, so the sidecar uses default `auto`, which currently resolves to **CPU provider list only**.

**Implication:** the app is not using GPU / accelerator inference today, even when the user asks for it and the machine may support it.

### 7) Current queue metric is not true backlog
**Evidence:** `sidecar/app/services/live_transcription.py`
```py
async with session.lock:
    ...
    session.queue_depth += 1
```
Because `queue_depth` is incremented **after** the coroutine acquires the session lock, requests waiting for the lock are invisible to this metric.

**Implication:** the status bar’s queue indicator can under-report backlog and therefore mislead tuning decisions.

## External Research Notes

### MediaRecorder timing caveat
MDN: `timeslice` is not exact; intervals may be longer due to pending tasks, and `requestData()` is the supported alternative to explicit slice timing.

**Why it matters here:** a 100ms slice target is both aggressive and not guaranteed. For latency-sensitive control, the app should own cadence more directly.

### ONNX Runtime execution providers
Official ONNX Runtime docs show that provider priority is explicitly configured via `providers=[...]` and can target CUDA, DirectML, CoreML, CPU, etc. Python API docs expose `get_available_providers()` and `get_device()`.

**Why it matters here:** the repo currently hardcodes CPU for `auto`. Runtime provider detection should replace that.

## Recommended Architecture Patterns

### Pattern 1: Latest-only live work coalescing (highest ROI)
**What:** Introduce a session worker with at most:
- 1 active inference
- 1 pending coalesced job (latest wins)

If a newer live chunk arrives while inference is running, replace the pending job instead of appending another full unit of work.

**Why:** newer live chunks supersede older interim chunks. Processing all of them is wasted.

**Expected result:** backlog stays bounded even under slower hardware.

**Best placement:** sidecar first, client second.

### Pattern 2: Client one-in-flight upload guard
**What:** Add `_liveFlushInFlight` in `recording.ts`. While upload is in flight, keep buffering locally; when the upload returns, flush the latest aggregated buffer.

**Why:** prevents fetch storms and aligns producer rate to consumer capacity.

**Expected result:** fewer overlapping `/live/chunk` requests and more stable pacing.

### Pattern 3: Delta protocol instead of full snapshots
**What:** Replace per-chunk full `words[]`/`segments[]` with a patch model such as:
- `replaceFromWordId` or `replaceFromTimeS`
- `appendWords[]`
- optional `segmentsPatch[]`
- keep `/live/stop` final full payload unchanged

**Why:** current payload size grows with transcript length.

**Expected result:** long recordings no longer pay linearly growing JSON cost on every update.

### Pattern 4: Request-driven chunking / larger source slices
**What:** Prefer one of:
1. `MediaRecorder.start()` with no tiny timeslice + adaptive `requestData()`
2. Increase recorder timeslice to **250-500ms** minimum

**Why:** 100ms source slices are far too chatty relative to the sidecar’s fixed cost.

**Expected result:** fewer blobs, less renderer churn, fewer multipart boundaries, fewer temp-file inputs.

### Pattern 5: Runtime hardware-provider selection
**What:** Detect usable execution providers at runtime and choose priority order by platform.

Recommended precedence:
- **Linux / Windows + NVIDIA:** `CUDAExecutionProvider`, then CPU
- **Windows non-NVIDIA / generic accelerator path:** `DmlExecutionProvider`, then CPU
- **macOS:** `CoreMLExecutionProvider`, then CPU
- Always end with CPU fallback

**Why:** current `auto` does not accelerate at all.

**Important packaging note:** the current Poetry dependency set installs CPU-only extras. Hardware acceleration requires dependency and packaging work, not only code changes.

### Pattern 6: Decode-once / PCM windowing
**What:** Decode incoming live chunk once to PCM, then maintain a rolling PCM buffer (or decoded WAV fragments) for inference windows.

**Why:** current architecture repeatedly launches ffmpeg and re-converts overlapping audio.

**Expected result:** significantly lower per-chunk fixed cost and fewer soft WebM window failures.

## Ranked Recommendations

### Tier A — Do first
1. **Client one-in-flight upload guard + buffered coalescing**
2. **Sidecar latest-only worker / stale chunk replacement**
3. **Recorder cadence change: stop 100ms source chunking**
4. **Backlog telemetry that includes client-side pending state**

These four directly attack the user-visible queue-growth symptom.

### Tier B — Do next
5. **Patch/delta live protocol instead of full snapshots**
6. **True provider auto-detection + hardware acceleration path**

These reduce steady-state cost as transcript length and model cost rise.

### Tier C — High upside, larger change
7. **Decode-once / PCM buffer architecture**
8. **Background/full reconcile only on stop or on sparse cadence, not frequently on hot path**

These likely unlock the largest sustained gains, but require more invasive refactoring.

## Don’t Hand-Roll

| Problem | Don’t build | Use instead | Why |
| --- | --- | --- | --- |
| Queue control | Unbounded client fetch fan-out | One-in-flight guard + latest-only coalescing | Bounded work beats reactive warning handling |
| GPU selection | Custom OS heuristics only | `onnxruntime.get_available_providers()` + provider precedence | Runtime truth is better than platform guesswork |
| Long-session updates | Full transcript replace on every chunk | Patch/delta protocol | Prevents linear payload growth |
| Recorder pacing | Tiny arbitrary 100ms timeslice forever | Adaptive `requestData()` or >=250ms slices | Reduces pointless blob churn |

## Common Pitfalls

### Pitfall 1: Only tuning flush window values
You can tweak 150/250/400/650ms forever and still lose if stale chunk work is never dropped.

### Pitfall 2: Calling it “queue depth” without measuring actual backlog
The current metric is not the real waiting work. Add explicit metrics for:
- upload in flight
- pending coalesced chunk present
- dropped superseded jobs
- end-to-end live update latency

### Pitfall 3: Adding GPU code without packaging support
Today the installed dependency path is CPU-only. Hardware acceleration requires dependency selection and packaged-app validation.

### Pitfall 4: Keeping full snapshots while ASR cost drops
Even if inference becomes faster, renderer/network costs will still grow with transcript length until the protocol changes.

### Pitfall 5: Letting “retry full accumulated blob” become the steady-state path
Recent fixes preserve continuity on soft decode errors, but if fallback-to-full-history happens often it can reintroduce long-session slowdown. Decode architecture should make the fallback rare, not normal.

## Candidate Measurement Plan

Before implementation, add or verify telemetry for:
- client buffered audio ms
- client buffered bytes
- upload in flight boolean
- sidecar worker busy boolean
- sidecar pending coalesced job present boolean
- superseded chunks dropped count
- per-update response payload bytes
- minute-1 vs minute-5 median update latency
- provider chosen at model load (`CPUExecutionProvider`, `CUDAExecutionProvider`, etc.)

## Suggested Plan Shape for Phase 24

### Wave 1: Measure and bound backlog
- add client upload-in-flight guard
- add true backlog telemetry
- add larger/request-driven recorder chunking

### Wave 2: Eliminate stale work
- implement latest-only coalescing in live sidecar path
- keep stop/finalization semantics intact

### Wave 3: Reduce long-session payload cost
- migrate live chunk response to patch/delta protocol
- renderer applies patches instead of full replace

### Wave 4: Hardware acceleration
- runtime EP detection
- package/provider selection changes
- startup/status reporting of chosen provider

### Wave 5: Deeper decode optimisation (if still needed)
- decode-once PCM ring buffer or persistent decoder path

## Open Questions

1. **Hardware scope:** should Phase 24 enable only CUDA initially, or also CoreML/DirectML where packaging allows?
2. **Protocol migration:** can the live chunk API change to delta patches in this phase, or should that be staged behind compatibility handling?
3. **Recorder control model:** use larger `timeslice` only, or switch to `requestData()` for full cadence ownership?
4. **Decode architecture:** is a PCM buffer acceptable in memory for expected recording lengths, or should decoded fragments spill to disk?
5. **Fallback policy:** if hardware provider exists but fails at runtime, should the session auto-downgrade to CPU silently or surface a warning?

## Environment Availability

| Dependency | Required By | Available | Repo Status | Notes |
| --- | --- | --- | --- | --- |
| Node / Electron renderer | client pacing | ✓ | present | no issue |
| Python / FastAPI | sidecar worker changes | ✓ | present | no issue |
| ffmpeg | current decode path | ✓ | present | still a hotspot |
| onnxruntime CPU | current inference | ✓ | present via `onnx-asr[cpu]` | current default |
| onnxruntime GPU/accelerator EPs | hardware acceleration | ? | **not wired** | requires dependency + runtime validation |

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/21-increase-speed-of-live-transcription/21-CONTEXT.md`
- `.planning/phases/21-increase-speed-of-live-transcription/21-RESEARCH.md`
- `src/renderer/src/stores/recording.ts`
- `src/renderer/src/stores/transcript.ts`
- `src/main/sidecar.ts`
- `sidecar/app/main.py`
- `sidecar/app/routes/transcribe.py`
- `sidecar/app/services/live_transcription.py`
- `sidecar/app/services/transcription.py`
- `sidecar/pyproject.toml`
- `sidecar/poetry.lock`

### Secondary (MEDIUM confidence)
- MDN `MediaRecorder.start()` — timeslice behavior and `requestData()` alternative  
  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start
- MDN `MediaRecorder.dataavailable`  
  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event
- ONNX Runtime execution providers overview  
  https://onnxruntime.ai/docs/execution-providers/
- ONNX Runtime Python API (`InferenceSession`, `get_available_providers`, provider precedence)  
  https://www.onnxruntime.ai/docs/api/python/api_summary.html

## Metadata

**Confidence breakdown:**
- Code-path bottlenecks: HIGH
- Chunk/backlog diagnosis: HIGH
- Hardware acceleration path: MEDIUM (depends on package/runtime compatibility)
- Exact provider choice across all packaged targets: MEDIUM
- Decode-once PCM redesign benefit: MEDIUM-HIGH

**Research date:** 2026-04-17  
**Valid until:** 2026-05-17
