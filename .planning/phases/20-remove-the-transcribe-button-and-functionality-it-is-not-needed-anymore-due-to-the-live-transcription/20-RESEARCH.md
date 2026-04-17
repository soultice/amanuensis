# Phase 20: Remove Transcribe Button - Research

**Researched:** 2026-04-17  
**Domain:** Electron/Vue transcript-flow cleanup across renderer, Pinia store, and FastAPI sidecar  
**Confidence:** HIGH

<user_constraints>
## User Constraints

No Phase 20 `CONTEXT.md` exists. Planning constraints below are inferred from `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, and Phase 19 artifacts.

### Locked / effectively locked constraints
- Phase 20 scope is to remove the **legacy manual Transcribe affordance** because **live transcription now owns the recording-to-transcript flow**. (`.planning/ROADMAP.md:387-392`)
- Preserve the Phase 19 live-transcription decisions:
  - low-latency live updates
  - interim text during recording
  - finalized text replaces interim text
  - word timestamps only after finalization
  - pause/resume boundaries preserved
  - stop auto-finalizes remaining interim text
  - recording must continue if live transcription fails
  - UI must show a visible warning when live transcription fails
  (`.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md`)
- Preserve transcript contract requirements used elsewhere in the product:
  - automatic/local transcription
  - full transcript view
  - progress/finalization feedback
  - word-level timestamps
  - click-to-seek, playback highlighting, and word-range selection for annotations
  (`.planning/REQUIREMENTS.md:18-27`, `.planning/PROJECT.md:22-24,48-49`)

### Planner discretion
- Whether Phase 20 should remove only the **UI affordance**, or also delete the **manual batch backend/store path**.
- Whether to keep the current batch path as an **internal fallback** when live transcription is unavailable or fails.
- Whether to add a recovery path for **saved audio with missing transcript** before deleting batch transcription code.

### Out of scope
- Redesigning annotation UX
- Changing transcript data model
- Replacing Parakeet ONNX / local-ASR architecture
- Reworking session persistence format beyond cleanup needed for this phase
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 20 is not explicitly mapped to unique requirement IDs in `ROADMAP.md`, but it directly affects these existing requirements:

| ID | Description | Research Support |
| --- | --- | --- |
| TRANS-01 | App automatically transcribes the recording after the user stops it | Manual button removal is safe only if live finalization or hidden fallback still guarantees transcript completion |
| TRANS-03 | App displays a transcription progress indicator while transcription is running | Replace manual `transcribing` UX with live/finalizing feedback; do not regress visible status |
| TRANS-04 | User can view the full transcribed text after transcription completes | Preserve transcript completion path and error recovery |
| NAV-01 | User can click transcript words to seek audio | Preserve finalized word/timestamp contract |
| NAV-02 | Current word highlights during playback | Preserve segment/word timing output |
| NAV-03 | User can select word ranges for annotation | Preserve finalized transcript structure and segment IDs |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Follow the GSD workflow used by this repository.
- Use `.planning/PROJECT.md` as the primary project overview.
- No additional project-specific coding rules were found in `GEMINI.md` or local skills folders.

## Summary

Phase 20 is **not just a button cleanup** if the intent is to remove manual transcription entirely. The current codebase still contains a fully active end-to-end manual batch path: renderer button → `AppShellView.handleTranscribe()` → `transcriptStore.transcribe(audioBlob)` → sidecar `POST /transcribe` → shared Python `transcribe_file(...)`. Live transcription was added in Phase 19, but it did **not** replace all recovery and compatibility roles served by the batch path.

The biggest planning risk is that the manual path currently acts as the **fallback** when live transcription is unavailable, fails to start, errors during chunk ingestion, or fails during stop-time finalization. The code explicitly keeps recording alive when live transcription fails and surfaces a warning, which means removing the manual path without a replacement would create valid recordings that have **no transcript recovery path**.

**Primary recommendation:** Remove the visible Transcribe UI in Phase 20, but do **not** delete the batch transcription capability unless the phase also introduces an internal fallback policy for live-start/live-stop failures and the audio-without-transcript recovery case.

## Standard Stack

Versions below are the versions declared in this repository today; Phase 20 is a cleanup phase and does not require adding new dependencies.

### Core
| Library | Version | Purpose | Why Standard |
| --- | --- | --- | --- |
| Vue | `^3.5.13` | Renderer UI cleanup | Existing app UI layer; all affordance removal happens here |
| Pinia | `^2.2.6` | Transcript/recording/session state | Manual and live transcript flows share Pinia stores |
| Electron | `^33.2.1` | Desktop shell | Renderer gets sidecar port/status through preload + main |
| electron-vite | `^2.3.0` | Electron build/runtime setup | Existing packaging/dev pipeline |
| FastAPI | `>=0.115,<0.116` | Sidecar HTTP routes | Both live and manual transcription routes live here |

### Supporting
| Library | Version | Purpose | When to Use |
| --- | --- | --- | --- |
| TypeScript | `^5.7.2` | Renderer typing and cleanup safety | Refactoring component/store wiring |
| onnx-asr | `>=0.8` | Shared ASR engine wrapper | Keep; live and batch both use the same transcription service |
| python-multipart | `>=0.0.12` | Sidecar upload handling | Still required for `/transcribe/live/chunk`; do not remove with batch cleanup |
| huggingface-hub | `>=0.26` | Local model acquisition | Keep; unrelated to button cleanup |
| pytest | `^8` | Sidecar verification | Existing automated coverage is backend-heavy |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
| --- | --- | --- |
| Delete manual batch path immediately | Keep batch path as hidden/internal fallback | Safer for live-failure recovery; less cleanup now |
| Keep visible Transcribe button | Remove UI but keep backend/store fallback | Matches product direction while preserving operational recovery |
| Remove batch endpoints now | Defer endpoint deletion to later cleanup phase | Avoids coupling UI cleanup to failure-policy redesign |

**Installation:**
```bash
# No new packages expected for Phase 20
```

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── renderer/src/components/   # Toolbar, transcript, annotation, status UI
├── renderer/src/stores/       # recording.ts, transcript.ts, session.ts, sidecar.ts
├── main/                      # preload IPC handlers and sidecar lifecycle
└── preload/                   # sidecar port/status bridge

sidecar/
├── app/routes/                # /transcribe and /transcribe/live endpoints
├── app/services/              # shared transcription + live session manager
└── tests/                     # live route/integration coverage
```

### Pattern 1: Recorder-driven live transcript lifecycle
**What:** Recording state changes drive live session start/pause/resume/stop automatically.
**When to use:** Keep this as the primary recording-to-transcript flow.
**Example:**
```ts
// Source: src/renderer/src/stores/transcript.ts:233-244
async stopLiveSession(atMs: number): Promise<void> {
  const sidecarStore = useSidecarStore()
  if (!sidecarStore.port || !this.liveSessionId) return

  this.transcriptState = 'finalizing'

  const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe/live/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId: this.liveSessionId, atMs: Math.max(0, Math.floor(atMs)) }),
  })
}
```

### Pattern 2: Direct renderer → sidecar HTTP, not transcription IPC
**What:** The renderer fetches `http://localhost:${port}` directly; Electron IPC only exposes sidecar port/status.
**When to use:** Preserve this architecture during cleanup; do not invent a new IPC layer just to remove a button.
**Example:**
```ts
// Source: src/renderer/src/stores/transcript.ts:79-86
const formData = new FormData()
formData.append('audio', audioBlob, 'recording.webm')

const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe`, {
  method: 'POST',
  body: formData,
})
```

### Pattern 3: Shared ASR service beneath live and batch flows
**What:** Live transcription and manual batch transcription both depend on the same Python `transcribe_file(...)` implementation.
**When to use:** Preserve this shared service even if manual UI is removed.
**Example:**
```py
# Source: sidecar/app/routes/transcribe.py:41-52
@router.post('')
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Accept WebM audio file, transcribe with the local Parakeet ONNX model.
    Returns: {"words": [...], "segments": [...], "language": str, "duration": float}
    """
```

### Anti-Patterns to Avoid
- **Equating button removal with backend dead code:** `sidecar/app/services/transcription.py` is still required by live transcription.
- **Deleting the batch path before deciding fallback behavior:** current live failure semantics depend on recording continuing even when transcription warns/fails.
- **Adding a bespoke IPC transcription transport:** the project already standardizes on direct localhost HTTP.
- **Breaking transcript contract while cleaning state names:** downstream navigation/annotation logic still needs finalized words, segments, timestamps, and duration.

## What Is Still Implementing Manual Transcription

### Renderer UI
| File | Finding | Status |
| --- | --- | --- |
| `src/renderer/src/components/AppToolbar.vue` | Visible `Transcribe` button guarded by `recordingStore.hasRecording`; emits `transcribe` | Active |
| `src/renderer/src/views/AppShellView.vue` | Handles `@transcribe` and calls `transcriptStore.transcribe(recordingStore.audioBlob)` | Active |
| `src/renderer/src/components/TranscriptPanel.vue` | Empty-state copy says “Record audio and click Transcribe…”; shows `transcribing` progress branch | Active/manual-specific |
| `src/renderer/src/components/AnnotationPanel.vue` | Tooltip copy says “Transcribe first…” | Active/manual-centric copy |
| `src/renderer/src/components/AppStatusBar.vue` | Labels shared transcript state as `Live:` even when state is `transcribing` | Mixed/stale semantics |

### Stores / state
| File | Finding | Status |
| --- | --- | --- |
| `src/renderer/src/stores/transcript.ts` | Contains `transcribe(audioBlob)`, `transcriptState = 'transcribing'`, `/transcribe` POST, `/transcribe/status` polling | Active manual path |
| `src/renderer/src/stores/transcript.ts` | Also contains `startLiveSession()`, `pushLiveChunk()`, `pauseLiveSession()`, `resumeLiveSession()`, `stopLiveSession()` | Active live path |
| `src/renderer/src/stores/recording.ts` | Holds final `audioBlob` and drives live chunk flush/finalization | Compatibility-sensitive |
| `src/renderer/src/stores/session.ts` | Persists transcript only when state is `complete`; audio can be persisted separately | Important recovery edge case |
| `src/renderer/src/stores/sidecar.ts` | Supplies sidecar port/status used for direct HTTP calls | Preserve |

### Preload / IPC / main
| File | Finding | Status |
| --- | --- | --- |
| `src/preload/index.ts` | Only exposes `getSidecarPort()` / `getSidecarStatus()` | Confirms no transcribe IPC exists |
| `src/renderer/src/env.d.ts` | Types only the sidecar bridge | Preserve |
| `src/main/index.ts` | Allows `connect-src http://localhost:*`; registers sidecar port/status IPC | Preserve |
| `src/main/sidecar.ts` | Starts and monitors the sidecar process | Preserve |

### Sidecar / backend
| File | Finding | Status |
| --- | --- | --- |
| `sidecar/app/routes/transcribe.py` | `POST /transcribe` and `GET /transcribe/status` batch/manual endpoints | Active manual path |
| `sidecar/app/routes/transcribe.py` | `/transcribe/live/*` endpoints for Phase 19 | Active live path |
| `sidecar/app/state.py` | `transcription_status` state used by batch/manual endpoints | Removable if batch path is deleted |
| `sidecar/app/services/transcription.py` | Shared `transcribe_file(...)` and token/word normalization | Must preserve |
| `sidecar/app/services/live_transcription.py` | Live session manager injected with `transcribe_file` | Must preserve |

## Removal Strategy

### Can remove immediately if Phase 20 is at least a UI cleanup
| File | Remove | Why |
| --- | --- | --- |
| `src/renderer/src/components/AppToolbar.vue` | Transcribe button markup, `isTranscribing` prop usage, `emit('transcribe')`, related styles | This is the legacy affordance |
| `src/renderer/src/views/AppShellView.vue` | `@transcribe` wiring, `handleTranscribe()`, `:is-transcribing=` prop pass-through | No longer needed once button is gone |
| `src/renderer/src/components/TranscriptPanel.vue` | Manual-transcribe empty-state copy and `transcribing`-specific progress copy if batch state is removed | UX should reflect live-first flow |
| `src/renderer/src/components/AnnotationPanel.vue` | “Transcribe first” wording | Copy is now inaccurate |

### Remove only if product explicitly accepts no hidden batch fallback
| File | Remove | Why risky |
| --- | --- | --- |
| `src/renderer/src/stores/transcript.ts` | `transcribe(audioBlob)`, `transcriptState: 'transcribing'`, polling helpers, `/transcribe` fetches | This is the current recovery path for live failures |
| `sidecar/app/routes/transcribe.py` | `POST /transcribe`, `GET /transcribe/status`, batch lock | Deleting this removes same-process recompute of final audio blob |
| `sidecar/app/state.py` | `transcription_status` | Safe only after batch route removal |
| `src/renderer/src/stores/recording.ts` | `hasRecording` getter | Safe only after toolbar no longer uses it |

### Must preserve
| File | Preserve | Why |
| --- | --- | --- |
| `sidecar/app/services/transcription.py` | `transcribe_file(...)` and normalization helpers | Live transcription depends on it |
| `sidecar/app/services/live_transcription.py` | Live session manager | Phase 19 primary flow |
| `src/renderer/src/stores/recording.ts` | final audio blob/url handling and live chunk flush | Needed for playback, save/restore, and live finalization |
| `src/renderer/src/stores/session.ts` | transcript/audio persistence | Required for reopening sessions |
| `src/main/index.ts`, `src/preload/index.ts`, `src/main/sidecar.ts` | sidecar bridge and CSP | Core renderer-to-sidecar architecture |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Fallback transcription after live failure | A second ASR implementation or different transcript format | Existing Python `transcribe_file(...)` service | It already produces the contract the renderer expects |
| Renderer/backend bridge | New Electron IPC channel for transcription data | Existing port/status IPC + direct localhost HTTP | The app already standardizes on this pattern |
| Transcript recomputation for saved audio | A new parallel session/transcript format | Existing session/audio asset model, or explicitly add an asset-based batch path | Avoids splitting transcript persistence contracts |

**Key insight:** The manual button is UI debt, but the batch path behind it is currently operational resilience.

## Common Pitfalls

### Pitfall 1: Removing the button and assuming the system is now live-only
**What goes wrong:** Live-start, chunk, or stop-time failures leave the user with a recording but no way to recover a transcript.  
**Why it happens:** Phase 19 kept recording alive on transcription failure and never replaced the manual recovery path.  
**How to avoid:** Decide fallback policy before deleting `transcriptStore.transcribe()` and `POST /transcribe`.  
**Warning signs:** `liveWarning` is shown, `audioBlob` exists, transcript is empty or partial.

### Pitfall 2: Deleting shared transcription code accidentally
**What goes wrong:** Live transcription stops working after “manual cleanup.”  
**Why it happens:** Batch/manual and live share `sidecar/app/services/transcription.py`.  
**How to avoid:** Delete only route/store/UI code proven to be batch-only. Preserve `transcribe_file(...)`.  
**Warning signs:** `/transcribe/live/*` still exists but sidecar can no longer finalize words/segments.

### Pitfall 3: Leaving manual-centric copy and state names behind
**What goes wrong:** UI tells users to click a button that no longer exists, or shows `Live: transcribing` for a batch-only state.  
**Why it happens:** Copy and status UI are spread across multiple components.  
**How to avoid:** Audit toolbar, transcript panel, annotation panel, and status bar together.  
**Warning signs:** Empty-state/tooltips still mention “Transcribe,” or status labels mismatch actual lifecycle.

### Pitfall 4: Ignoring the audio-without-transcript persistence gap
**What goes wrong:** A session can save audio but not transcript if finalization has not completed; reopening offers playback but no transcript recovery path.  
**Why it happens:** `session.ts` persists transcript only when state is `complete`, while restored sessions do not rebuild `audioBlob`.  
**How to avoid:** Either keep a hidden batch fallback or explicitly accept/document this limitation.  
**Warning signs:** Reopened session has `audioBlobUrl` but missing transcript and no retrigger path.

## Code Examples

Verified patterns from the repository:

### Legacy manual affordance still exists
```vue
// Source: src/renderer/src/components/AppToolbar.vue:71-80
<button
  v-if="recordingStore.hasRecording"
  class="toolbar__btn toolbar__btn--transcribe"
  :disabled="props.isTranscribing"
  title="Transcribe recording with local ASR model"
  @click="emit('transcribe')"
>
  {{ props.isTranscribing ? 'Transcribing…' : 'Transcribe' }}
</button>
```

### Manual path still posts the final blob to `/transcribe`
```ts
// Source: src/renderer/src/stores/transcript.ts:79-86
const formData = new FormData()
formData.append('audio', audioBlob, 'recording.webm')

const res = await fetch(`http://localhost:${sidecarStore.port}/transcribe`, {
  method: 'POST',
  body: formData,
})
```

### Live-start failure currently degrades to warning + continued recording
```ts
// Source: src/renderer/src/stores/transcript.ts:139-155
if (!res.ok) {
  const detail = await res.text()
  if (res.status === 404) {
    this.liveFeatureAvailable = false
    this.liveWarning = 'Live transcription unavailable in running sidecar build (restart app or rebuild sidecar).'
    return
  }
  throw new Error(`Live start failed (${res.status}): ${detail}`)
}
...
} catch (err) {
  this.liveWarning = `Live transcription failed — recording continues (${String(err)})`
}
```

### Sidecar still exposes the manual batch route
```py
# Source: sidecar/app/routes/transcribe.py:41-52
@router.post('')
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Accept WebM audio file, transcribe with the local Parakeet ONNX model.
    Returns: {"words": [...], "segments": [...], "language": str, "duration": float}
    """
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| Record, stop, then click **Transcribe** | Live transcript starts with recording and finalizes on stop | Phase 19 / 2026-04 | Manual UI is now redundant for the happy path |
| Batch path as primary transcript generation | Batch path as fallback/recovery behind live path | Phase 19 / 2026-04 | Removing it requires an explicit failure-policy decision |
| Transcript progress shown as `transcribing` | Transcript lifecycle now includes `live` and `finalizing` | Phase 19 / 2026-04 | UI/status copy must be updated consistently |

**Deprecated/outdated:**
- Visible **Transcribe** button in `AppToolbar.vue`
- Manual-transcribe empty-state copy in `TranscriptPanel.vue`
- “Transcribe first” tooltip copy in `AnnotationPanel.vue`
- `package.json` Linux package description still mentioning local Whisper

## Open Questions

1. **Should Phase 20 remove only the visible affordance, or the batch capability too?**
   - What we know: UI button removal is straightforward; backend/store deletion removes the current fallback path.
   - What's unclear: whether the product accepts recordings with no transcript recovery when live fails.
   - Recommendation: plan Phase 20 around **UI removal + hidden fallback preservation** unless product explicitly chooses otherwise.

2. **What is the intended behavior when live transcription is unavailable or an older sidecar build is running?**
   - What we know: `startLiveSession()` handles `404` by warning and returning; recording continues.
   - What's unclear: whether the app should auto-run batch transcription on stop, block recording, or accept no transcript.
   - Recommendation: make this an explicit planning decision before deleting `POST /transcribe`.

3. **Do we need a recovery path for saved sessions that have audio but no completed transcript?**
   - What we know: sessions can restore audio playback without restoring `audioBlob`; transcript persistence requires `complete` state.
   - What's unclear: whether this limitation is acceptable after manual cleanup.
   - Recommendation: either keep hidden batch capability or add a future asset-based transcript recovery phase.

4. **Has Phase 19 been human-validated enough to remove the fallback?**
   - What we know: roadmap/state artifacts disagree on whether human verification is fully complete.
   - What's unclear: operational confidence of live-only behavior in real recordings.
   - Recommendation: treat live-only deletion as higher risk until that discrepancy is resolved.

## Sources

### Primary (HIGH confidence)
- `.planning/ROADMAP.md` - Phase 20 scope and dependency on Phase 19
- `.planning/REQUIREMENTS.md` - transcript/navigation requirements affected by cleanup
- `.planning/PROJECT.md` - product and architecture constraints for local ASR + transcript-first UX
- `.planning/STATE.md` - roadmap/state context and validation-status discrepancy
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-CONTEXT.md` - locked Phase 19 live-transcription decisions
- `.planning/phases/19-transcription-should-be-live-from-now-on/19-RESEARCH.md` - prior live-transcription architecture guidance
- `src/renderer/src/components/AppToolbar.vue` - visible Transcribe affordance
- `src/renderer/src/views/AppShellView.vue` - manual transcribe wiring
- `src/renderer/src/components/TranscriptPanel.vue` - manual-progress/empty-state copy
- `src/renderer/src/components/AnnotationPanel.vue` - manual-centric tooltips
- `src/renderer/src/components/AppStatusBar.vue` - mixed transcript status labeling
- `src/renderer/src/stores/transcript.ts` - live + manual store logic and failure semantics
- `src/renderer/src/stores/recording.ts` - chunk flow, final blob creation, live session coupling
- `src/renderer/src/stores/session.ts` - transcript/audio persistence edge cases
- `src/renderer/src/stores/sidecar.ts` - sidecar port/status state
- `src/preload/index.ts` - sidecar bridge surface
- `src/main/index.ts` - CSP and sidecar IPC handlers
- `src/main/sidecar.ts` - sidecar lifecycle
- `sidecar/app/routes/transcribe.py` - batch + live route definitions
- `sidecar/app/services/transcription.py` - shared ASR service contract
- `sidecar/app/services/live_transcription.py` - live session manager
- `sidecar/app/state.py` - batch-state field candidates for removal
- `sidecar/tests/test_live_transcription_routes.py` - live route automated coverage
- `sidecar/tests/test_live_transcription_integration.py` - live integration coverage
- `sidecar/tests/test_transcription_spacing.py` - shared transcript formatting coverage
- `package.json` - frontend stack versions and stale metadata
- `sidecar/pyproject.toml` - sidecar stack versions and test tooling
- `.planning/config.json` - `workflow.nyquist_validation=false`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly read from `package.json` and `sidecar/pyproject.toml`
- Architecture: HIGH - based on inspected renderer/store/main/sidecar code paths
- Pitfalls: MEDIUM - strongly supported by code semantics, but some failure impacts still need human runtime validation

**Research date:** 2026-04-17  
**Valid until:** 2026-05-17  
**Note:** Validation Architecture section intentionally omitted because `.planning/config.json` sets `workflow.nyquist_validation` to `false`.
