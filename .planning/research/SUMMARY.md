# Project Research Summary

**Project:** Amanuensis
**Domain:** Cross-platform desktop audio documentation tool (Rust + Tauri)
**Researched:** 2026-04-12
**Confidence:** HIGH

---

## Executive Summary

Amanuensis is a Tauri v2 + Rust desktop application in a well-defined niche: there is no existing local/offline tool that combines audio transcription, time-range annotations, and structured markdown export. The category of "spoken documentation" tools is occupied either by cloud services (Descript, Otter) or bare-bones transcribers with no annotation layer. The stack is sound and battle-tested — cpal, whisper-rs, tauri-plugin-sql, and Svelte 5 are all production-grade choices with verified current versions.

The single biggest risk is not technical complexity — it is build order and AI-generated stub accumulation. Three previous attempts failed not because the features are technically impossible, but because the pipeline was never verified end-to-end before moving to the next feature. The solution is a strict vertical slice approach: recording must produce a real WAV file before transcription is written, transcription must return real word-level timestamps before annotation is written, annotations must be stored in SQLite before the dialog UI is built.

Cross-platform audio has real gotchas (macOS entitlement silent failure, Linux ALSA/PipeWire variability) that must be addressed in Phase 1. CSS anchor positioning on Linux WebKitGTK is a known compatibility risk requiring a JavaScript fallback. Everything else follows established Tauri patterns.

---

## Key Findings

### Recommended Stack

**Core:** Tauri v2 (2.10.3, stable) + Rust + Svelte 5 (5.55.3) + TypeScript
**Audio:** cpal 0.17.3 (device enumeration + PCM recording) + hound 3.5.1 (WAV writing)
**Transcription:** whisper-rs 0.16.0 (Rust bindings to whisper.cpp — native, no Python, word-level timestamps via `set_token_timestamps(true)`)
**Persistence:** tauri-plugin-sql 2.4.0 (SQLite — sessions, words, annotations) + tauri-plugin-fs 2.5.0 + tauri-plugin-store 2.4.2
**Frontend:** wavesurfer.js 7.12.6 (waveform + regions) + Web Audio API (live level meter)
**Markdown:** comrak 0.52.0 (Rust CommonMark + GFM)
**Build prerequisite (critical):** LLVM/libclang must be installed before first build for whisper-rs bindgen

### Expected Features

**Must have (table stakes):**
- Audio device selection — users expect to pick their mic
- Start/Stop recording — baseline
- Live audio level indicator — confirms mic is working
- Post-recording transcription — core value
- Transcript text view — see the output
- Click word → seek audio position — expected by any transcription tool
- Session save/resume — data loss is unacceptable
- Export output — the whole point

**Should have (Amanuensis differentiators):**
- Time-range annotations (image, voice comment, clipboard) — the unique value
- Type-driven markdown injection — the output quality
- Non-overlapping annotation enforcement — correctness
- CSS anchor + dialog annotation UX — workflow speed
- Model download with progress — required for first-run usability

**Defer:**
- Real-time transcription during recording — complexity without meaningful benefit
- Multi-user features, cloud sync, video recording

### Architecture Approach

Three-layer architecture: Svelte 5 frontend ↔ Tauri IPC (invoke + events) ↔ Rust backend (Audio Engine, Transcription Engine, Session Store, File Manager). Audio data never crosses IPC — WAV files are written to disk, served via `asset://` URL. Long-running operations (transcription, model download) run in `tokio::spawn` and report progress via Tauri events. SQLite is the single source of truth for sessions, word timestamps, and annotations — overlap validation enforced in Rust, not frontend.

**Major components:**
1. Audio Engine (cpal) — device enumeration, PCM recording, level calculation
2. Transcription Engine (whisper-rs) — model management, async transcription, word timestamps
3. Session Store (SQLite) — all structured data, overlap constraint enforcement
4. File Manager (tauri-plugin-fs + hound) — audio files, assets, exports
5. Frontend (Svelte 5) — UI, wavesurfer.js waveform, CSS anchor annotation dialog

### Critical Pitfalls

1. **whisper-rs build prerequisites (LLVM/libclang)** — app won't build on a fresh clone without these; must be verified in Phase 1 on all 3 platforms
2. **macOS microphone entitlement silent failure** — cpal captures empty buffers without `NSMicrophoneUsageDescription` + `audio-input` entitlement; no error reported
3. **Token timestamps not enabled** — word-level sync broken if `set_token_timestamps(true)` is forgotten; segment-only timestamps look like it works but sync is wrong
4. **Audio data over IPC** — passing PCM via invoke/events causes OOM on recordings > 30 seconds
5. **AI stub accumulation** — the root cause of all 3 previous failures; every command must be verified by actually running it before the next is written
6. **CSS anchor on Linux WebKitGTK** — annotation dialog positioning may fail on older Linux distros; JavaScript fallback required

---

## Implications for Roadmap

Based on research, suggested phase structure (coarse granularity = 3-5 phases):

### Phase 1: Foundation + Recording Pipeline
**Rationale:** The recording pipeline is the bedrock everything else depends on. Three previous attempts failed partly because this was never verified to work. Must be rock-solid before any other feature is built.
**Delivers:** Working Tauri app that records real audio to a WAV file on all 3 platforms, with live level meter and device selection.
**Addresses:** Audio device selection (FEAT), Start/Stop recording (FEAT), Live level meter (FEAT)
**Avoids:** macOS entitlement pitfall, Linux ALSA pitfall, audio-over-IPC pitfall, build prerequisite pitfall

### Phase 2: Transcription + Transcript View
**Rationale:** Transcription is the core engine. It has the highest technical complexity (model management, async long-running task, word timestamps). Must be independently solid before building annotation on top of it.
**Delivers:** Model downloads with progress indicator, recording transcribes to word-level timestamps, transcript rendered in UI with audio seek-on-click.
**Addresses:** Model download UX (FEAT), Transcription (FEAT), Transcript view (FEAT), Transcript-audio sync (FEAT)
**Avoids:** Model loading blocking UI pitfall, token timestamps pitfall

### Phase 3: Annotation System + Markdown Export
**Rationale:** Annotations build on word timestamps (Phase 2). Export is the culmination. These two are deeply coupled (annotations determine export structure) so they belong in the same phase.
**Delivers:** Full annotation CRUD (image, voice comment, clipboard content), CSS anchor dialog, overlap enforcement, markdown export with type-driven injection.
**Addresses:** Annotations (FEAT), Annotation dialog (FEAT), Non-overlap enforcement (FEAT), Markdown export (FEAT)
**Avoids:** CSS anchor Linux pitfall, frontend-only overlap validation pitfall

### Phase 4: Session Persistence + Polish
**Rationale:** Auto-save, save-on-close, and the sessions list landing page. Can be layered on top of working core.
**Delivers:** Sessions list view, current-session resume, auto-save, close-and-reopen with state intact.
**Addresses:** Session save/resume (FEAT), Auto-save (FEAT), Past sessions list (FEAT)
**Avoids:** Session persistence failure modes

### Phase Ordering Rationale

- Phases 1→2→3→4 are strictly ordered by dependency: WAV file must exist before transcription, word timestamps must exist before annotations, annotations must exist before export
- Each phase has a clear "works end-to-end" moment before moving on
- Session persistence (Phase 4) is last because it wraps everything else and is lower risk than the core pipeline

### Research Flags

- **Phase 1:** Platform-specific audio setup needs hands-on verification on real macOS + Linux hardware. Consider CI matrix.
- **Phase 3:** CSS anchor fallback for Linux needs implementation; check WebKitGTK version on target Ubuntu LTS.
- **Phase 2:** whisper-rs 0.16.0 API should be verified against crate docs before writing engine code — API has changed between versions.

Phases where standard patterns apply (lower research risk):
- **Phase 4:** Session persistence with tauri-plugin-sql + tauri-plugin-store is well-documented.

---

## Confidence Assessment

| Area | Confidence | Notes |
| ---- | ---------- | ----- |
| Stack | HIGH | All versions verified against crates.io and npm registries on 2026-04-12 |
| Features | HIGH | Based on direct analysis of comparable tools (Descript, Otter, Whisper Desktop) |
| Architecture | HIGH | Follows documented Tauri v2 patterns; whisper-rs token_timestamps verified |
| Pitfalls | HIGH | Based on known cpal/whisper-rs/Tauri community issues and project failure history |

**Overall confidence:** HIGH

### Gaps to Address

- **CSS anchor on Linux:** Exact WebKitGTK version shipped with Tauri on Ubuntu 22.04 LTS should be verified at implementation time. Fallback must be implemented.
- **whisper-rs 0.16.0 API details:** The split_on_word and token_timestamps parameter API should be verified against the 0.16.0 docs before writing transcription engine code — minor API changes between versions.
- **cpal PipeWire:** Test on a clean Ubuntu 22.04 VM to verify pipewire-alsa bridge behavior before Phase 1 is marked done.

---

## Sources

### Primary (HIGH confidence)
- crates.io API: cpal 0.17.3, whisper-rs 0.16.0, tauri 2.10.3, tauri-plugin-sql 2.4.0 (all verified 2026-04-12)
- npm registry: svelte 5.55.3, wavesurfer.js 7.12.6 (verified 2026-04-12)
- tauri-plugin-sql official README: SQLite platform support confirmed

### Secondary (MEDIUM confidence)
- whisper.cpp documentation: token_timestamps, split_on_word behavior
- CSS anchor positioning: caniuse.com Chrome 125+, Safari 18+
- Tauri v2 capabilities/permissions documentation

### Tertiary (contextual / analysis)
- Feature analysis of Descript, Otter.ai, Whisper Desktop, Audacity — used to define table stakes
- AI agent failure mode analysis — derived from project failure history and known patterns

---
*Research completed: 2026-04-12*
*Ready for roadmap: yes*
