# Phase 26: live transcription architecture to avoid per-chunk temp files and expensive decode/transcribe churn by capturing PCM directly in the renderer or keeping decoding/transcription in memory/persistent across chunks - Research

**Researched:** 2026-04-18  
**Domain:** Renderer PCM capture, websocket streaming, and in-memory live ASR session architecture  
**Confidence:** HIGH (repo findings + official API docs), MEDIUM (exact batching/resampling split)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** The primary architecture direction is **renderer-side PCM capture**. The renderer should capture PCM directly instead of relying on encoded WebM blobs as the main live-transcription input path.
- **D-02:** Renderer-side PCM capture should be the **default architecture on all supported platforms**; this phase is not scoped as an optional performance mode.
- **D-03:** Even with renderer-side PCM capture, the **sidecar remains the source of truth** for live session state, transcript assembly, boundary handling, and ASR inference.
- **D-04:** Audio should cross the renderer → sidecar boundary via a **persistent streaming transport**, not per-chunk request/response uploads.
- **D-05:** The concrete target is **two WebSocket channels**: one for PCM upload and one for transcript/telemetry return traffic.
- **D-06:** The renderer should send **explicit timing metadata** with streamed PCM so the sidecar does not infer timing purely from arrival order.
- **D-07:** Phase 26 **intentionally overrides the Phase 19 non-blocking live-failure rule** for this architecture migration.
- **D-08:** If the new PCM streaming architecture cannot initialize, the app should **fail fast before recording starts**.
- **D-09:** This phase should treat the new streaming path as the required recording architecture, not as a best-effort fallback layered on top of the legacy blob path.

### the agent's Discretion
- Exact renderer API for PCM capture (Web Audio / AudioWorklet / other browser-native approach), as long as it yields direct PCM capture.
- Exact WebSocket message schema, framing, and session lifecycle details.
- Exact telemetry fields beyond the locked timing metadata requirement.
- Exact migration strategy for existing polling/status code after the WebSocket architecture lands.
- Exact UX wording and presentation for fail-fast initialization errors.

### Deferred Ideas (OUT OF SCOPE)
- `2026-04-14-fix-gitignore-remove-node-modules-and-build-artifacts-from-git-history.md` - reviewed during discuss-phase and explicitly deferred as tooling cleanup outside Phase 26 live-transcription architecture scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Why it exists |
| --- | --- | --- |
| P26-01 | Live transcription input path must originate from renderer-captured PCM, not encoded WebM blobs | Locked D-01/D-02 |
| P26-02 | Renderer ↔ sidecar live transport must use two persistent WebSocket channels | Locked D-04/D-05 |
| P26-03 | Every uploaded PCM packet must carry explicit timing metadata from the renderer | Locked D-06 |
| P26-04 | Sidecar must remain authoritative for session state, transcript assembly, pause boundaries, and inference | Locked D-03 |
| P26-05 | Hot path must avoid per-chunk temp files and repeated ffmpeg decode/transcribe churn | Core phase goal |
| P26-06 | Recording must be blocked before start if the PCM streaming architecture cannot initialize | Locked D-07/D-08 |
| P26-07 | Final transcript contract must remain compatible with current downstream UI/session/export consumers (`words`, `segments`, `language`, `duration`) | Baseline requirements and current code contracts |
| P26-08 | Pause/resume timing must remain transcript-safe and exclude paused spans from live timing | Phase 19 continuity + recording UX continuity |
| P26-09 | Playback/session persistence must still end with a durable audio artifact for waveform/playback/restore flows | Existing app requirements outside the live hot path |
</phase_requirements>

## Summary

The current codebase still uses a **blob-upload architecture** even after Phase 24. `recording.ts` emits `MediaRecorder` WebM chunks, `transcript.ts` uploads each batch via multipart HTTP, and `live_transcription.py` still writes chunk temp files, calls ffmpeg to decode WebM to PCM, writes WAV temp files, and then invokes Parakeet. That means the live path still pays repeated encoding/decoding, file I/O, and request/response overhead on every update.

Phase 26 should therefore be treated as an **architecture replacement**, not another tuning pass. The recommended target is: **AudioWorklet-based PCM capture in the renderer, a fail-fast preflight that opens both websocket channels before recording starts, binary PCM streaming with explicit renderer timing metadata, and an in-memory sidecar session worker that appends PCM to a rolling buffer and runs bounded-window inference without temp files**.

A second important repo finding: the app still needs a final persisted audio asset for playback, waveform rendering, and session restore. `recording.ts`, `WaveformPanel.vue`, `AppToolbar.vue`, and `session.ts` all depend on a durable audio blob/file. So the clean migration is **not** “AudioWorklet only, no recording artifact”; it is **AudioWorklet for live ASR + a separate archival recording branch**. Keeping `MediaRecorder` only for the final saved audio artifact is the lowest-risk way to preserve existing product behavior while removing it from the transcription hot path.

**Primary recommendation:** implement Phase 26 as a preflighted dual-path recorder: **AudioWorklet PCM → websocket live ASR**, plus **parallel archival recording for the final playback/session file**, with the sidecar maintaining an in-memory PCM ring buffer and websocket-driven transcript/telemetry events.

## Repo Findings (direct code evidence)

### 1) Recording still starts before live architecture is ready
**Evidence:** `src/renderer/src/views/AppShellView.vue`
- `recordingStore.startRecording()` sets state to `recording`
- only then does the watcher call `transcriptStore.startLiveSession()`
- polling starts after recording has already begun

**Why it matters:** this directly conflicts with D-08. Phase 26 needs a **prepare/handshake stage before `recordingState` becomes `recording`**.

### 2) Renderer still produces encoded WebM blobs, not PCM
**Evidence:** `src/renderer/src/stores/recording.ts`
```ts
const recorder = new MediaRecorder(stream, { mimeType })
recorder.start(100)
```
Live batching is still built from `Blob` objects with MIME `audio/webm`.

**Why it matters:** this is the exact boundary the user wants replaced.

### 3) Live transport is still request/response HTTP + polling
**Evidence:** `src/renderer/src/stores/transcript.ts`
- `fetch('/transcribe/live/start')`
- `fetch('/transcribe/live/chunk')`
- `fetch('/transcribe/live/stop')`
- `setInterval(... '/transcribe/live/status' ...)`

**Why it matters:** persistent transport has not landed yet; polling should disappear once the output websocket exists.

### 4) Sidecar hot path still writes temp files and runs ffmpeg per chunk
**Evidence:** `sidecar/app/services/live_transcription.py`
- writes incoming chunk bytes to temp `.webm`
- decodes to PCM via `decode_webm_to_pcm(...)`
- writes temp `.wav`
- calls `transcribe_wav_file(...)`

**Evidence:** `sidecar/app/services/transcription.py`
```py
def decode_webm_to_pcm(audio_path: Path) -> tuple[bytes, int]:
    proc = subprocess.run([... 'ffmpeg', '-i', str(audio_path), ...])
```

**Why it matters:** Phase 24 reduced some repeated work, but the architecture still pays disk/process churn on every live step.

### 5) Sidecar session authority is already in the right place
**Evidence:** `sidecar/app/services/live_transcription.py`
- `LiveSession` holds `words`, `segments`, `language`, `duration`, boundaries, queue telemetry, and lock/worker state.

**Why it matters:** D-03 aligns with current code. Phase 26 should preserve Python-side authority and replace only the ingest/transport mechanics.

### 6) Current UI/product surface still needs a durable audio asset
**Evidence:**
- `src/renderer/src/stores/recording.ts` creates `audioBlob` and `audioBlobUrl` on stop
- `src/renderer/src/components/WaveformPanel.vue` only renders waveform when `audioBlobUrl` exists
- `src/renderer/src/components/AppToolbar.vue` playback uses `new Audio(recordingStore.audioBlobUrl)`
- `src/renderer/src/stores/session.ts` persists audio assets to session storage and reloads them later

**Why it matters:** removing the blob/file artifact would regress playback, waveform rendering, and reopen behavior even if live transcription improved.

### 7) Runtime provider selection is already dynamic; transport refactor should not disturb it
**Evidence:** `sidecar/app/services/transcription.py`
- `resolve_execution_candidates()` prefers CUDA, then DML, then CoreML (int8), then CPU based on availability
- `describe_runtime_provider()` surfaces metadata to the UI

**Why it matters:** Phase 26 is not a provider-selection phase; reuse this layer as-is.

## Standard Stack

### Core
| Library / API | Version in repo / docs | Purpose | Why standard here |
| --- | --- | --- | --- |
| `getUserMedia()` + `MediaStream` | browser platform API | microphone capture | existing capture entry point; keeps device-selection flow intact |
| `AudioContext` + `AudioWorkletNode` + `AudioWorkletProcessor` | browser platform API (MDN current) | direct PCM capture on the audio rendering thread | official low-level path for raw audio processing; avoids encoded blob path |
| `MessagePort` / transferable buffers | browser platform API | move batched PCM packets from worklet to renderer | official async bridge for AudioWorklet communication |
| native `WebSocket` in renderer | browser platform API | persistent upload + output channels | satisfies locked two-websocket decision with no extra dependency |
| FastAPI / Starlette websocket endpoints | `fastapi >=0.115,<0.116`, `uvicorn[standard] >=0.32,<0.33` | server-side websocket accept/send/receive | already in stack; official support for text/binary/json frames |
| Pinia stores | `pinia ^2.2.6` | renderer orchestration state | current app architecture already centralizes recording/transcript logic here |
| Parakeet ONNX sidecar | existing Phase 18+ stack | ASR inference | already integrated and should stay authoritative |

### Supporting
| Library / API | Version | Purpose | When to use |
| --- | --- | --- | --- |
| `MediaRecorder` | browser platform API | archival recording only | keep only for final saved audio artifact unless Phase 26 explicitly replaces that path too |
| `AnalyserNode` | browser platform API | level meter | existing meter can remain independent of PCM streaming |
| existing runtime provider metadata layer | repo code | provider/runtime reporting | preserve UI diagnostics without redesign |

### Alternatives Considered
| Instead of | Could use | Tradeoff |
| --- | --- | --- |
| AudioWorklet PCM capture | MediaRecorder blobs | rejected by locked D-01 and keeps encode/decode churn |
| WebSocket channels | HTTP chunk uploads + polling | rejected by locked D-04/D-05 |
| renderer-side transcript authority | sidecar session authority | rejected by locked D-03 |
| sidecar temp-file decode | in-memory PCM append/ring buffer | ring buffer is the architecture this phase is supposed to land |

**Installation:** no new npm package is required for the core transport/capture design. The platform/browser/FastAPI primitives already exist in the repo stack.

## Architecture Patterns

### Recommended Project Structure
```text
src/renderer/src/
├── stores/
│   ├── recording.ts          # recording lifecycle + preflight + archival branch
│   └── transcript.ts         # websocket session orchestration + patch application
├── worklets/
│   └── pcm-capture.worklet.ts  # AudioWorkletProcessor for PCM batching
└── services/
    └── live-websocket.ts     # optional thin wrapper if socket code grows

sidecar/app/
├── routes/
│   └── transcribe.py         # add websocket endpoints / prepare route
└── services/
    ├── live_transcription.py # session authority + PCM ring buffer + worker
    └── transcription.py      # model loading / runtime metadata / batch recovery path
```

### Pattern 1: Fail-fast preflight before recording state flips
**What:** create a `prepareLiveSession()` phase that runs **before** the user is considered to be recording.

**Recommended flow:**
1. Acquire microphone stream
2. Create/resume `AudioContext`
3. Load AudioWorklet module
4. Ask sidecar to allocate a live session and return session id / route info / runtime metadata
5. Open upload websocket
6. Open output websocket
7. Exchange ready/ack control messages
8. Only then set `recordingState = 'recording'`

**Why:** D-08 requires failure before recording starts, and the current watcher-based flow violates that.

### Pattern 2: AudioWorklet as PCM producer, but batched before leaving the worklet
**What:** capture PCM in an `AudioWorkletProcessor`, but do **not** send one renderer message per `process()` callback.

**Official fact:** MDN documents that `process()` receives channel `Float32Array`s in blocks of **128 samples**. At 44.1kHz that is roughly **2.9ms** of audio per callback, which is far too chatty for renderer message passing or websocket framing.

**Recommendation:**
- batch multiple `process()` blocks inside the worklet
- emit transport-sized PCM packets (for example 20–60ms) through `port.postMessage()` with a transferred `ArrayBuffer`
- convert to **mono PCM16** before sending over the websocket transport

**Why:** this keeps the hot path in PCM without flooding the renderer thread.

### Pattern 3: Explicit renderer timing metadata should be sample-clock based
**What:** the renderer, not the sidecar, owns capture timing metadata.

**Recommended per-packet metadata:**
- `seq`
- `captureStartSample`
- `captureEndSample`
- `captureStartMs`
- `captureEndMs`
- `sampleRate`
- `channels`
- `pausedSpanSeq` or boundary marker messages for pause/resume

**Recommendation:** derive canonical timing from **captured sample counts** and maintain a separate wall-clock field only for diagnostics/UI. Sample-count timing is safer across pauses and websocket jitter.

### Pattern 4: Two websocket channels, split by responsibility
**What:** use separate websocket channels as explicitly requested.

**Recommended split:**
- **Input socket:** renderer → sidecar PCM/control upload (`pcm`, `pause`, `resume`, `stop`)
- **Output socket:** sidecar → renderer transcript patches, telemetry, warnings, lifecycle events

**Recommendation:** keep the framing simple:
- text JSON control/metadata messages
- binary PCM frames on the input socket
- JSON messages on the output socket

Do **not** base64-encode PCM unless forced by tooling; it adds avoidable overhead.

### Pattern 5: Sidecar session worker should append PCM in memory and infer on bounded windows
**What:** replace temp-file decode with a persistent in-memory PCM session buffer.

**Recommended sidecar model:**
- session owns a PCM append buffer/ring buffer
- upload socket appends PCM packets and timing metadata
- one inference worker per session operates on a bounded tail window
- if a newer tail supersedes pending work, keep only the latest pending inference request
- transcript assembly remains in Python and emits patch events

**Why:** this is the smallest change that removes temp files while preserving D-03 session authority.

### Pattern 6: Preserve archival recording, but demote it out of the hot path
**What:** the app still needs a final audio asset.

**Recommendation:** keep a parallel archival recording branch in Phase 26 unless the phase explicitly budgets a replacement file-writer:
- `AudioWorklet` supplies PCM for live ASR
- `MediaRecorder` (or equivalent final writer) supplies the durable `audioBlob/audioBlobUrl`

This is **not** a fallback live path. It is a separate output artifact path needed for playback, waveform, and saved sessions.

### Anti-patterns to Avoid
- **Starting recording before the websocket/session handshake succeeds:** violates D-08.
- **Posting every 128-sample worklet block to the main thread:** creates renderer/message overhead and defeats the performance win.
- **Inferring timing from packet arrival order:** violates D-06 and will drift under jitter.
- **Keeping `/live/status` polling after the output websocket exists:** unnecessary duplicated transport.
- **Using the legacy WebM blob path as hidden live fallback:** violates D-09.
- **Dropping final audio artifact creation:** regresses waveform/playback/session persistence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Persistent live transport | custom Electron-only socket/IPC protocol | native WebSocket + FastAPI websocket endpoints | already supported on both sides and fits locked architecture |
| PCM capture | ad-hoc `ScriptProcessorNode` / MediaRecorder hacks | AudioWorklet | current browser-standard low-level processing path |
| Timing reconstruction | server-side “arrival time ~= capture time” guesses | explicit renderer sample/timestamp metadata | preserves correct pause/resume and avoids jitter drift |
| Transcript updates | full transcript replace on every live event | patch/delta events from sidecar | Phase 24 already moved toward patch semantics |
| In-memory audio conversion in Python | `audioop`-based resampling plan | renderer-side PCM16 transport or a non-stdlib resampler | `audioop` was removed in Python 3.13; this repo runs Python 3.14 |
| Hot-path audio persistence | temp `.webm` + ffmpeg + temp `.wav` per update | append PCM in memory and transcribe bounded windows | directly removes the cost center the phase targets |

**Key insight:** the work here is mostly **deletion of conversion layers**, not addition of new product behavior.

## Runtime State Inventory

> Migration phase: checked for runtime state that would complicate transport replacement.

| Category | Items Found | Action Required |
| --- | --- | --- |
| Stored data | Session files store final audio asset paths and final transcript JSON, not live transport internals | none for historical session data; preserve final audio artifact output |
| Live service config | None found; live transport is repo-owned localhost sidecar behavior | code edit only |
| OS-registered state | None specific to the live chunk transport | none |
| Secrets/env vars | `AMANUENSIS_ASR_DEVICE`, `AMANUENSIS_LIVE_SPEED_MODE` still relevant; no websocket-specific secret/config layer found | preserve existing env handling |
| Build artifacts | sidecar binary and renderer bundle will both need rebuilds; AudioWorklet module must be emitted in packaged app | code edit + packaging verification |

## Common Pitfalls

### Pitfall 1: AudioWorklet module path works in dev but not in packaged Electron
**What goes wrong:** the worklet script loads from a dev URL but is missing after bundling.
**Why it happens:** worklet files are separate assets and need explicit bundler-compatible loading.
**How to avoid:** treat the worklet as a first-class renderer asset and load it through a Vite/Electron-compatible URL strategy; verify both `npm run dev` and packaged builds.
**Warning signs:** `audioWorklet.addModule(...)` throws only in production.

### Pitfall 2: Renderer thread gets flooded by tiny PCM messages
**What goes wrong:** live latency improves on paper but UI stutters or websocket overhead spikes.
**Why it happens:** `process()` is called per 128-frame block; forwarding each block directly is too granular.
**How to avoid:** batch blocks inside the worklet and transfer larger PCM packets.
**Warning signs:** many thousands of messages per minute, GC churn, or unstable update cadence.

### Pitfall 3: Pause/resume causes transcript timing drift
**What goes wrong:** words after resume shift or overlap pause boundaries.
**Why it happens:** timing derived from wall-clock arrival time instead of explicit sample ranges.
**How to avoid:** keep canonical timing in sample counts and send explicit boundary events.
**Warning signs:** transcript duration exceeds actual non-paused recording duration or boundary markers land incorrectly.

### Pitfall 4: Architecture migration accidentally breaks playback/session restore
**What goes wrong:** live transcription works, but waveform/playback/export/session reopen break.
**Why it happens:** planner optimizes only the live hot path and forgets the durable recording artifact path.
**How to avoid:** preserve a final audio file/blob output contract while moving live ASR to PCM streaming.
**Warning signs:** `audioBlobUrl` is null after stop, session save writes no audio path, waveform panel stays empty.

### Pitfall 5: Websocket disconnects leak orphaned live sessions
**What goes wrong:** renderer reconnects or closes, but sidecar keeps session buffers/workers alive.
**Why it happens:** two-channel protocols need explicit lifecycle cleanup and ownership rules.
**How to avoid:** define who owns shutdown, how disconnect maps to session state, and a timeout/GC policy in the sidecar manager.
**Warning signs:** increasing memory after repeated record attempts or sessions stuck in `live/finalizing`.

### Pitfall 6: Planning Python-side PCM resampling around removed stdlib modules
**What goes wrong:** implementation plan assumes `audioop` exists.
**Why it happens:** older Python guidance is stale.
**How to avoid:** do not plan around `audioop`; this environment is Python 3.14 where it is removed.
**Warning signs:** import failures or plans referencing deprecated stdlib audio helpers.

## Code Examples

Verified patterns from official sources:

### AudioWorklet loading and node creation
```ts
// Source: MDN Using AudioWorklet
const audioContext = new AudioContext({ latencyHint: 'interactive' })
await audioContext.audioWorklet.addModule(workletUrl)
const pcmNode = new AudioWorkletNode(audioContext, 'pcm-capture')
sourceNode.connect(pcmNode)
```
Source: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet

### AudioWorklet `process()` input model
```ts
// Source: MDN AudioWorkletProcessor.process()
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    const channel0 = input[0] // Float32Array of samples for this block
    // batch/convert here
    return true
  }
}
```
Source: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process

### FastAPI websocket endpoint shape
```py
# Source: FastAPI websocket docs
from fastapi import WebSocket

@router.websocket('/transcribe/live/ws/input/{session_id}')
async def live_input(websocket: WebSocket, session_id: str):
    await websocket.accept()
    while True:
        message = await websocket.receive()
        # handle text control frames and binary pcm frames
```
Source: https://fastapi.tiangolo.com/advanced/websockets/

## State of the Art

| Old Approach | Current Approach | Impact on Phase 26 |
| --- | --- | --- |
| `MediaRecorder` as live source | AudioWorklet / direct PCM capture | removes encode/decode churn |
| HTTP multipart `/live/chunk` | persistent websocket upload | removes request/response overhead |
| polling `/live/status` | push telemetry on output websocket | simpler lifecycle and lower overhead |
| temp `.webm` + ffmpeg + temp `.wav` | in-memory PCM append + bounded inference windows | removes disk/process hot-path overhead |
| wall-clock-ish chunk boundaries | explicit renderer timing metadata | safer pause/resume and jitter handling |

**Deprecated/outdated for this phase:**
- `recording.ts`’s blob-based live pipeline (`_livePendingChunks`, `_flushLiveChunks`, `pushLiveChunk(...)`) as the primary live architecture
- `transcript.ts` live status polling once websocket output events exist
- per-live-update temp-file decode/write in `live_transcription.py`

## Open Questions

1. **What should produce the final durable audio artifact?**
   - What we know: current app requires a saved audio file/blob.
   - What's unclear: whether Phase 26 should keep `MediaRecorder` in parallel or replace it with a PCM→WAV writer.
   - Recommendation: keep `MediaRecorder` for the final artifact in Phase 26 unless the user explicitly wants a full recording-stack rewrite.

2. **Where should sample-rate conversion happen?**
   - What we know: the model path wants compact mono PCM; current code requests 44.1kHz input and uses ffmpeg to get 16kHz PCM.
   - What's unclear: whether Chromium reliably honoring a 16k `AudioContext` is sufficient across all target machines, or whether a custom/internal resampler is still needed.
   - Recommendation: make the wire format PCM16 mono; if renderer-side 16k conversion is reliable, prefer it, otherwise use an in-memory resampler that does **not** depend on `audioop`.

3. **How should input websocket framing pair metadata with binary PCM?**
   - What we know: base64 is wasteful and custom binary protocols add complexity.
   - What's unclear: whether the cleanest implementation is alternating JSON metadata + binary payload frames or a compact fixed binary header.
   - Recommendation: start with ordered JSON control/metadata frames plus raw binary PCM frames on the same websocket; only compress framing further if profiling proves it necessary.

4. **What is the mid-session failure policy once recording has already started?**
   - What we know: startup must fail fast before recording; CONTEXT.md does not lock the exact mid-session disconnect UX.
   - What's unclear: whether websocket loss after start should stop recording immediately or allow a controlled finalize/abort path.
   - Recommendation: planner should define an explicit hard-failure lifecycle so two-channel disconnects do not leave half-open sessions.

## Environment Availability

| Dependency | Required By | Available | Version / Status | Fallback |
| --- | --- | --- | --- | --- |
| Node.js | Electron/Vite renderer work | ✓ | `v22.14.0` | — |
| npm | renderer/build workflows | ✓ | `11.2.0` | — |
| Python | sidecar websocket/session work | ✓ | `3.14.3` | — |
| ffmpeg | current batch/bulk audio conversion | ✓ | `8.1` | keep for batch recovery path if needed |
| FastAPI + Uvicorn standard | websocket endpoints in sidecar | ✓ | present in `sidecar/pyproject.toml` | — |
| browser AudioWorklet/WebSocket APIs | renderer PCM capture/transport | ✓ | modern Electron 33 / Chromium stack in repo | — |
| Python `audioop` stdlib | potential PCM helper temptation | ✗ | removed in Python 3.13+ | do not plan around it |

**Missing dependencies with no fallback:**
- None identified for the recommended architecture.

**Missing dependencies with fallback:**
- `audioop` is unavailable, but Phase 26 does not need it if renderer-side PCM conversion or a non-stdlib resampler is used.

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md`
- `.planning/phases/21-increase-speed-of-live-transcription/21-CONTEXT.md`
- `.planning/phases/24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc/24-RESEARCH.md`
- `src/renderer/src/stores/recording.ts`
- `src/renderer/src/stores/transcript.ts`
- `src/renderer/src/views/AppShellView.vue`
- `src/renderer/src/types/live-transcript.ts`
- `src/renderer/src/stores/session.ts`
- `src/renderer/src/components/WaveformPanel.vue`
- `src/renderer/src/components/AppToolbar.vue`
- `sidecar/app/routes/transcribe.py`
- `sidecar/app/services/live_transcription.py`
- `sidecar/app/services/transcription.py`
- `sidecar/app/main.py`
- `sidecar/pyproject.toml`
- MDN: AudioWorklet  
  https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- MDN: AudioWorkletProcessor `process()`  
  https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process
- MDN: Using AudioWorklet  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- MDN: MediaRecorder `start()`  
  https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/start
- MDN: AudioContext constructor  
  https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext
- FastAPI websocket docs  
  https://fastapi.tiangolo.com/advanced/websockets/
- Python removed modules / `audioop` removal  
  https://docs.python.org/3/library/removed.html  
  https://docs.python.org/3/library/audioop

### Secondary (MEDIUM confidence)
- Web research on AudioWorklet adoption for real-time browser transcription patterns (used only to sanity-check direction; official docs remained primary)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all core recommendations are existing platform APIs or already-present repo dependencies.
- Architecture: HIGH — repo evidence clearly identifies the current hot-path costs, and locked user decisions strongly constrain the target design.
- Exact renderer batching/resampling split: MEDIUM — the architecture is clear, but the final boundary between browser-side and sidecar-side sample-rate conversion still needs implementation-time validation.
- Pitfalls: HIGH — all major pitfalls were derived from current code structure plus official API behavior.

**Research date:** 2026-04-18  
**Valid until:** 2026-05-18
