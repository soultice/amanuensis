# Phase 27: Reduce Live Transcription Delay with Latest-Only Inference Scheduling - Research

**Researched:** 2026-04-18
**Domain:** Live PCM streaming ASR scheduling inside the existing FastAPI + WebSocket + Parakeet/ONNX sidecar
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Inference scheduling policy
- **D-01:** The sidecar should **prefer the newest useful PCM tail** instead of processing every intermediate inference window in order.
- **D-02:** Superseded intermediate windows should be treated as **stale work that can be skipped** when a newer useful tail is available.

#### Responsiveness vs interim stability
- **D-03:** The phase may accept **any level of interim transcript churn** if that materially improves live responsiveness.
- **D-04:** Final transcript correctness and the existing finalized contract must still be preserved.

#### Catch-up behavior
- **D-05:** The system should **prioritize catching up to current speech** over rendering every obsolete intermediate partial state.
- **D-06:** When backlog exists, scheduler behavior should optimize for “what is most useful now” rather than “finish all queued work.”

#### Telemetry and UX surface
- **D-07:** Keep telemetry **lightweight**. Preserve the current lightweight latency/queue/runtime visibility rather than adding major new UI complexity.

### Claude's Discretion
- Exact scheduler architecture (single worker with latest-only pending slot, cancellation/coalescing mechanism, or equivalent)
- Exact thresholds for stale-window dropping and handoff from “latest-only” to final settle behavior
- Exact telemetry field names beyond the lightweight visibility requirement
- Exact tests/benchmarks used to prove TTFT and settle-lag improvements

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- See `.planning/PROJECT.md` for project overview.
- This project uses GSD (Get Shit Done) for structured development. Run `/gsd-help` to see available commands.

## Summary

Phase 27 should **change scheduling, not architecture**. The repo already reflects the Phase 26 direction: renderer-side PCM capture, `/transcribe/live/prepare`, dual WebSocket channels, sidecar-owned transcript assembly, patch-based transcript updates, and lightweight status telemetry. The remaining latency problem is in `sidecar/app/services/live_transcription.py`: `ingest_pcm()` still performs per-accepted-packet inference inline under `session.lock`, so later packets queue behind earlier work and transcript updates trail current speech.

The prescriptive fix is to keep the existing PCM + WebSocket + patch contract, but replace the implicit FIFO/lock-contention scheduler with a **single in-flight worker plus one overwriteable latest-pending snapshot**. Every packet should still append PCM to the canonical session buffer and advance sequencing, but only the **newest useful tail** should be eligible for the next inference once the current inference finishes. Intermediate windows become stale work and should be skipped. Final transcript correctness, `replaceFromWordIndex` patch semantics, and the finalized `words` / `segments` / `language` / `duration` contract must remain unchanged.

`REQUIREMENTS.md` contains **no formal requirement IDs for live transcription latency** and still marks real-time transcription as historically out of scope. For Phase 27, the controlling scope comes from the roadmap, Phase 26/27 context, and the implemented live pipeline already present in the repo.

**Primary recommendation:** Implement latest-only scheduling inside `sidecar/app/services/live_transcription.py` using one per-session worker, one overwriteable pending-latest slot, and generation/seq guards that drop stale completions before they emit patches.

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| Python `asyncio` | stdlib in Python `>=3.10,<3.15` | Per-session worker orchestration, event signaling, task lifecycle | Standard library tool for exactly this kind of single-worker async scheduling; no new dependency needed |
| FastAPI | `0.115.14` | Existing live HTTP + WebSocket endpoints | Already owns `/transcribe/live/prepare`, `/live/input`, `/live/output`; Phase 27 should stay inside this contract |
| Starlette / websockets | `0.46.2` / `16.0` | WebSocket transport and testing behavior | Existing transport stack already supports live event streaming |
| `onnx-asr` + `onnxruntime` | `0.11.0` / `1.24.3` | Current ASR inference and provider selection | Existing backend ASR stack; Phase 27 changes scheduling around it, not the model/runtime |
| `sidecar/app/services/live_transcription.py` | repo module | Canonical live session state, PCM buffer, patch emission, telemetry | Main hotspot where latest-only scheduling belongs with minimal surface change |

### Supporting
| Library / Module | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| Vue | `3.5.13` | Renderer status consumption and transcript UX | Keep existing live UI contract; only small telemetry additions if needed |
| Pinia | `2.2.6` | `recording.ts` / `transcript.ts` live state | Expose new lightweight scheduler telemetry without redesigning stores |
| Electron | `33.2.1` | Desktop runtime around renderer/sidecar | No Phase 27 architectural change required |
| pytest | `8.4.2` | Backend contract/integration tests | Extend current live pipeline tests for stale-work dropping and bounded backlog |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Single worker + overwriteable latest slot | `asyncio.Queue` FIFO with all windows | Wrong behavior: preserves stale work and allows backlog growth |
| Sidecar-authoritative scheduling | Renderer-side aggressive dropping | Renderer lacks transcript merge context and should not become source of truth |
| Existing patch contract | New full-snapshot protocol | Unnecessary product-surface churn and more UI traffic |
| Existing telemetry channel | New observability subsystem | Overkill for this phase; locked scope requires lightweight visibility |

**Installation:**
```bash
# No new packages are recommended for Phase 27.
# Reuse the repository's existing pinned stack.
```

**Version verification:** Phase 27 should add **no new dependencies**. Versions above were verified from `package.json`, `sidecar/pyproject.toml`, and `sidecar/poetry.lock` on 2026-04-18. Use the repo-pinned versions rather than introducing new packages for scheduling.

## Architecture Patterns

### Recommended Project Structure
```text
sidecar/app/services/live_transcription.py   # per-session latest-only scheduler, PCM buffer, patch + telemetry emission
sidecar/app/routes/transcribe.py             # keep websocket intake thin; do not block on inference here
src/renderer/src/stores/transcript.ts        # consume patch/telemetry contract; expose small new scheduler fields if added
src/renderer/src/stores/recording.ts         # keep existing PCM producer/coalescing; no major changes
src/renderer/src/components/AppStatusBar.vue # optional lightweight scheduler visibility
sidecar/tests/test_live_decode_window.py
sidecar/tests/test_live_transcription_routes.py
sidecar/tests/test_live_transcription_integration.py
```

### Pattern 1: Fast Intake, Slow Work in a Per-Session Worker
**What:** `live_input_socket()` should accept metadata + PCM quickly, append PCM into the session buffer, update a single pending-latest scheduling slot, and return to reading the socket. Model inference should run in a dedicated per-session worker, not inline in the socket handler.

**When to use:** For every live PCM packet on the Phase 26 WebSocket path.

**Why:** Current code awaits `ingest_pcm()` directly from the input socket and `ingest_pcm()` holds `session.lock` across append → window selection → temp WAV write → inference → merge → event enqueue. That serializes the hot path and turns packet arrival into a backlog amplifier.

**Example:**
```python
# Source: Python asyncio Task/Event docs + current repo structure in
# sidecar/app/services/live_transcription.py and sidecar/app/routes/transcribe.py
class LiveSession:
    scheduler_event: asyncio.Event
    worker_task: asyncio.Task | None
    pending_latest_seq: int | None
    pending_latest_capture_end_ms: int | None

async def ingest_pcm(...):
    async with session.lock:
        append_pcm_to_session_buffer(...)
        session.pending_latest_seq = seq
        session.pending_latest_capture_end_ms = capture_end_ms
        if session.worker_task is None or session.worker_task.done():
            session.worker_task = asyncio.create_task(self._run_session_worker(session, model_dir, device))
        session.scheduler_event.set()
```

### Pattern 2: Append All PCM, Infer Only the Newest Useful Tail
**What:** Continue storing every packet's PCM bytes and packet-range metadata in order, but schedule inference only from the newest eligible tail. Keep using the existing bounded-tail helpers (`resolve_pcm_window_start_index`, `build_pcm_window_blob`, `WINDOW_OVERLAP_MS`, `FULL_RECONCILE_EVERY_N_CHUNKS`) as the transcript-context mechanism.

**When to use:** Every time the worker picks the next inference snapshot.

**Why:** Phase 27 should not drop audio data or break sequence accounting. It should drop **obsolete inference jobs**. The safest way is to preserve the canonical PCM buffer and only collapse scheduling.

**Example:**
```python
# Source: current repo helpers in sidecar/app/services/live_transcription.py
async def _run_session_worker(session, model_dir, device):
    while True:
        await session.scheduler_event.wait()
        session.scheduler_event.clear()
        async with session.lock:
            scheduled_seq = session.pending_latest_seq
            capture_end_ms = session.pending_latest_capture_end_ms
            session.pending_latest_seq = None
        if scheduled_seq is None:
            continue
        await self._process_latest_snapshot(session, scheduled_seq, capture_end_ms, model_dir, device)
```

### Pattern 3: Generation/Seq-Gated Emit
**What:** Tag each selected inference with a monotonically increasing generation or with the selected `seq`, then re-check staleness before emitting `patch` / `telemetry`. If a newer useful tail superseded the work while inference was running, drop the completion instead of publishing stale transcript state.

**When to use:** After inference completes and before `_merge_words()` / `push_output_event()` side effects escape the worker.

**Why:** Cancellation may not stop model work immediately. Stale-result discard is the correctness guard that keeps the transcript from regressing.

**Example:**
```python
# Source: Python asyncio task-cancellation guidance + current repo patch pipeline
selected_generation = session.latest_generation
result = await self._transcribe_pcm_window(...)
async with session.lock:
    if selected_generation != session.latest_generation:
        session.superseded_results_dropped += 1
        return
    replace_from_word_index, session.words = self._merge_words(...)
await self.push_output_event(session.id, patch_event)
```

### Pattern 4: Keep Patch Semantics Stable
**What:** Preserve the current patch protocol (`type: 'patch'`, `finalized.mode = 'patch'`, `replaceFromWordIndex`, `words`, `segments`) and completion contract. Phase 27 should improve how often patches are produced and how stale work is skipped, not the transcript payload shape.

**When to use:** Throughout implementation and testing.

**Example:**
```python
# Source: current repo contract in sidecar/app/services/live_transcription.py
patch_event = {
    'type': 'patch',
    'sessionId': session.id,
    'seq': scheduled_seq,
    'finalized': {
        'mode': 'patch',
        'replaceFromWordIndex': replace_from_word_index,
        'words': session.words[replace_from_word_index:],
        'segments': session.segments,
    },
}
```

### Anti-Patterns to Avoid
- **Holding `session.lock` across inference:** This is the current backlog amplifier. Limit the lock to fast state mutation and emit-gate checks.
- **FIFO queue of all accepted packets:** Wrong policy for the locked scope; it preserves stale work.
- **Dropping overlap/context with stale windows:** Keep the bounded tail and overlap logic or word boundaries will become less stable.
- **Renderer-owned scheduling policy:** The sidecar must remain the transcript assembly source of truth.
- **Changing transcript payload shape for this phase:** Existing routes/stores/components already support patch-based updates.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Live scheduling | Custom FIFO backlog of one job per PCM packet | One in-flight worker + one overwriteable latest slot | Matches locked requirement to skip stale work and keep up with current speech |
| Transcript diffing | New bespoke full-text reconciliation protocol | Existing `replaceFromWordIndex` patch contract | Already implemented and tested across backend + renderer |
| Transport | New stream protocol or extra socket types | Existing `/transcribe/live/prepare`, `/live/input`, `/live/output` flow | Phase 26 already established the transport architecture |
| Queue metrics | Complex tracing/observability stack | Lightweight counters on current telemetry channel | Fits locked scope and current AppStatusBar surface |
| Cancellation semantics | Hard-stop inference as the only correctness mechanism | Stale-result discard via generation/seq guards | Safer because model work may not stop instantly |

**Key insight:** The hard part is not receiving PCM; it is deciding which inference jobs are still useful. Keep the existing PCM buffer and transcript patch machinery, and only replace the scheduler policy.

## Common Pitfalls

### Pitfall 1: Preserving FIFO Behavior by Accident
**What goes wrong:** Implementation adds a worker but still stores every packet in a queue or processes each waiting coroutine in order.
**Why it happens:** It is tempting to wrap current `ingest_pcm()` logic in `asyncio.Queue` without changing the admission policy.
**How to avoid:** Make the pending slot overwriteable and ensure only one future snapshot survives while a worker is busy.
**Warning signs:** `waitingRequests` and emitted patch counts still scale roughly with packet count under load.

### Pitfall 2: Dropping Audio Instead of Dropping Stale Inference
**What goes wrong:** Intermediate packets are ignored entirely, causing gaps in `pcm_buffer` / `pcm_packet_ranges` and risking transcript discontinuities.
**Why it happens:** “Latest-only” is misread as “only keep the newest packet.”
**How to avoid:** Append all PCM and sequence metadata; collapse only the inference schedule.
**Warning signs:** Missing capture ranges, weird duration regressions, or clipped words at packet boundaries.

### Pitfall 3: Publishing a Stale Completion After Newer Audio Arrived
**What goes wrong:** A slow inference completes after a newer snapshot was selected and still emits a patch that rolls the transcript backward.
**Why it happens:** Emit path lacks a generation/seq staleness check.
**How to avoid:** Re-check generation under lock immediately before merge/emit; drop stale completions.
**Warning signs:** Transcript flickers backward or `seq` on patch events lags well behind the most recent accepted packet.

### Pitfall 4: Removing Too Much Context Around the Tail
**What goes wrong:** The app catches up faster but word boundaries and patch stability degrade badly.
**Why it happens:** Scheduler optimization drops `WINDOW_OVERLAP_MS` or bypasses `resolve_pcm_window_start_index()` / periodic full reconcile logic.
**How to avoid:** Reuse the existing bounded-tail window helpers; change selection cadence, not transcript context construction.
**Warning signs:** More patch churn at clause boundaries, repeated clipped first/last words, worse suffix replacement stability.

### Pitfall 5: Telemetry That Lies About Backlog
**What goes wrong:** Queue metrics look better without reflecting superseded work or pending-latest state.
**Why it happens:** Existing telemetry was built around `worker_busy + waiting_requests`, which reflects lock contention, not latest-only coalescing.
**How to avoid:** Keep current fields, but add a few scheduler-truth fields such as `pendingLatest`, `latestSeqAccepted`, `latestSeqProcessed`, and `supersededResultsDropped`.
**Warning signs:** TTFT improves but there is no visibility into how much stale work is being skipped.

## Code Examples

Verified patterns from official sources and current repo structure:

### Per-Session Worker Trigger with `asyncio.Event`
```python
# Source: Python asyncio task/event docs
async def worker(event: asyncio.Event):
    while True:
        await event.wait()
        event.clear()
        await process_latest_snapshot()
```

### Cooperative Cancellation / Stale-Work Guard
```python
# Source: Python asyncio task docs
task = asyncio.create_task(run_inference())
# Prefer generation checks even if cancellation is attempted.
task.cancel()
try:
    await task
except asyncio.CancelledError:
    pass
```

### Current Repo Contract to Preserve
```python
# Source: sidecar/app/services/live_transcription.py
telemetry_event = {
    'type': 'telemetry',
    'sessionId': session.id,
    'queueDepth': session.queue_depth,
    'workerBusy': session.worker_busy,
    'waitingRequests': session.waiting_requests,
    'timeToFirstTokenMs': session.ttft_ms,
}
```

## State of the Art

| Old Approach | Current / Recommended Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Legacy blob upload / HTTP chunk flow | Phase 26 PCM capture + `/live/prepare` + dual WebSockets | Phase 26 | Removed major transport/decode overhead and enabled persistent live state |
| Inline per-packet inference under `session.lock` | Phase 27 latest-only scheduling with one in-flight worker and one overwriteable pending slot | Phase 27 recommendation | Prevents backlog from growing with every intermediate window |
| Backlog represented only by waiting coroutines | Backlog represented as active worker + latest pending snapshot + superseded-work counters | Phase 27 recommendation | Telemetry becomes truthful for a coalescing scheduler |
| Re-emit every intermediate partial if computed | Skip superseded windows and only emit the newest useful patch | Phase 27 recommendation | Improves catch-up behavior and settle lag |

**Deprecated / outdated guidance:**
- `REQUIREMENTS.md` still says “Real-time transcription (while recording)” was out of scope. That is stale relative to the roadmap, Phase 26/27 context, and the implemented live pipeline already present in the repo.
- The legacy `/live/start` / `/live/chunk` HTTP path still exists, but the current renderer already uses the PCM + WebSocket path as the intended live hot path.

## Open Questions

1. **Should `FULL_RECONCILE_EVERY_N_CHUNKS = 8` stay fixed under a latest-only scheduler?**
   - What we know: current code periodically forces a full replay window every 8th chunk.
   - What's unclear: whether the same cadence is optimal once many intermediate windows are skipped.
   - Recommendation: keep it unchanged for the first implementation, then tune only if tests show transcript quality or settle behavior issues.

2. **Should `stop_session()` force one final newest-tail pass even if a stale inference is still running?**
   - What we know: final transcript correctness must be preserved.
   - What's unclear: whether current stop/finalize behavior already guarantees the best final snapshot under a coalescing scheduler.
   - Recommendation: add an integration test for “rapid packets followed by stop” before changing semantics.

3. **Which new telemetry fields are worth surfacing in `AppStatusBar.vue`?**
   - What we know: lightweight visibility is allowed; major UI complexity is out of scope.
   - What's unclear: whether `pendingLatest` / `supersededResultsDropped` / `latestSeqProcessed` are more useful than current queue-only metrics.
   - Recommendation: keep backend fields cheap, then surface at most one or two additional values in the status bar.

## Sources

### Primary (HIGH confidence)
- `./CLAUDE.md` - project workflow constraints
- `.planning/PROJECT.md` - product promise and live pipeline summary
- `.planning/ROADMAP.md` - official statement of the Phase 27 goal
- `.planning/REQUIREMENTS.md` - confirms no formal live-transcription requirement IDs and documents stale scope mismatch
- `.planning/STATE.md` - confirms current phase/history and relation to Phase 26
- `.planning/phases/21-increase-speed-of-live-transcription/21-CONTEXT.md` - speed-priority decisions
- `.planning/phases/24-it-seems-there-are-too-many-chunks-coming-in-the-longer-the-spoken-text-the-worse-the-delay-becomes-and-the-longer-the-queue-seems-to-be-find-optimizations-and-implement-them-optimizations-can-include-running-on-the-gpu-having-less-chunks-etc/24-RESEARCH.md` - backlog/problem framing and prior optimization recommendations
- `.planning/phases/26-live-transcription-architecture-to-avoid-per-chunk-temp-files-and-expensive-decode-transcribe-churn-by-capturing-pcm-directly-in-the-renderer-or-keeping-decoding-transcription-in-memory-persistent-across-chunks/26-CONTEXT.md` - locked Phase 26 architecture scope
- `.planning/phases/27-reduce-live-transcription-delay-with-latest-only-inference-scheduling/27-CONTEXT.md` - locked Phase 27 scheduling scope and user decisions
- `sidecar/app/services/live_transcription.py` - current scheduler, windowing, merge, telemetry, output contract
- `sidecar/app/routes/transcribe.py` - current live HTTP + WebSocket routes and prepare contract
- `sidecar/app/services/transcription.py` - current ASR runtime/provider path
- `src/renderer/src/stores/recording.ts` - PCM producer cadence and fail-fast startup behavior
- `src/renderer/src/stores/transcript.ts` - live WebSocket patch/telemetry consumption
- `src/renderer/src/components/AppStatusBar.vue` - current lightweight telemetry surface
- `sidecar/tests/test_live_decode_window.py` - bounded-tail decode window tests
- `sidecar/tests/test_live_transcription_routes.py` - route/telemetry contract tests
- `sidecar/tests/test_live_transcription_integration.py` - end-to-end live patch/complete contract tests
- Python docs: `https://docs.python.org/3.12/library/asyncio-task.html` - task lifecycle and cancellation semantics
- Python docs: `https://docs.python.org/3/library/asyncio-queue.html` - queue semantics showing why FIFO is the wrong primitive here
- FastAPI docs: `https://fastapi.tiangolo.com/advanced/websockets/` - WebSocket handling model

### Secondary (MEDIUM confidence)
- `https://github.com/ufal/whisper_streaming` - streaming ASR backlog/stability framing and local-agreement discussion
- `https://github.com/ufal/whisper_streaming/issues/63` - concrete report that processing time grows with current buffer length and long waits are expected in some streaming policies

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - All recommended components are already pinned in the repo; no new dependencies are needed.
- Architecture: **HIGH** - Recommendation is directly anchored in current code hotspots (`live_transcription.py`, `transcribe.py`, renderer stores) plus official asyncio/FastAPI behavior.
- Pitfalls: **MEDIUM-HIGH** - Strong repo evidence plus external streaming-ASR reports support them, but exact numeric gains still require local benchmark/test validation.

**Research date:** 2026-04-18
**Valid until:** 2026-05-18

**Notes:**
- `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`, so the `Validation Architecture` section is intentionally omitted.
- `Environment Availability` is intentionally omitted because Phase 27 is a code/config scheduler change within the repo's existing stack and introduces no new external dependencies.
