# Stack Research

**Domain:** Cross-platform desktop app — audio recording + local transcription + annotation + markdown export (Rust + Tauri)
**Researched:** 2026-04-12
**Confidence:** HIGH (versions verified against crates.io and npm registries)

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why Recommended |
| ---------- | ------- | ------- | --------------- |
| Tauri | 2.10.3 | Desktop app shell, IPC, OS integrations | v2 is stable (not yanked, actively released). v1 is in maintenance. New projects must use v2. |
| Rust | stable (1.77.2+ required) | Backend logic, audio, transcription | Tauri's native layer; whisper-rs requires 1.77.2+ |
| Svelte 5 | 5.55.3 | Frontend UI framework | Lightest Tauri-compatible framework. No virtual DOM. Rune-based reactivity. Smallest output bundle. Excellent with native CSS anchor + dialog primitives. |
| TypeScript | 5.x (bundled with Svelte) | Frontend type safety | Standard with Svelte 5 |
| Vite | 6.x (bundled with Tauri v2 template) | Frontend build tool | Official Tauri v2 pairing |

### Audio Layer

| Technology | Version | Purpose | Why Recommended |
| ---------- | ------- | ------- | --------------- |
| cpal | 0.17.3 | Audio device enumeration + PCM recording | 12M+ crate downloads. Only mature cross-platform Rust audio recording crate. Supports WASAPI (Windows), CoreAudio (macOS), ALSA/PipeWire (Linux). |
| hound | 3.5.1 | Write PCM samples to WAV files | Minimal, correct WAV encoder. WAV is the input format whisper-rs expects. |

### Transcription

| Technology | Version | Purpose | Why Recommended |
| ---------- | ------- | ------- | --------------- |
| whisper-rs | 0.16.0 | Rust bindings to whisper.cpp | Ships whisper.cpp as a Rust build dependency. Natively compiled — no Python runtime, no subprocess. Supports `token_timestamps: true` for word-level timing. Actively maintained (updated April 2026). |

### Persistence

| Technology | Version | Purpose | Why Recommended |
| ---------- | ------- | ------- | --------------- |
| tauri-plugin-sql | 2.4.0 | SQLite via sqlx — session + annotation storage | Official Tauri plugin, cross-platform, SQLite feature flag available. Use for structured data (sessions, words, annotations). |
| tauri-plugin-fs | 2.5.0 | File system access — audio files, assets, exports | Official Tauri v2 plugin for secure file access with scope permissions. |
| tauri-plugin-store | 2.4.2 | App settings / config persistence | JSON-backed key-value store. Use for user preferences (selected device, model path, etc.). |

### Markdown Generation

| Technology | Version | Purpose | Why Recommended |
| ---------- | ------- | ------- | --------------- |
| comrak | 0.52.0 | Markdown generation / validation in Rust | Full CommonMark + GitHub Flavored Markdown support. Active development. For Amanuensis, markdown can also be assembled as a String directly — comrak is useful for round-trip parsing if needed. |

### Frontend Visualization

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| wavesurfer.js | 7.12.6 | Waveform display + audio timeline + region markers | Use for the audio timeline view. Supports regions (annotation range markers) and WebAudio-based rendering. Works inside Tauri's webview. |
| Web Audio API | native | Real-time audio level meter during recording | Use `AudioContext` + `AnalyserNode` on the audio stream for the live level indicator. No library needed. |

### Async / Utilities

| Library | Version | Purpose | When to Use |
| ------- | ------- | ------- | ----------- |
| tokio | 1.51.1 | Async runtime for long-running tasks | Use `tokio::spawn` for Whisper transcription and model download to avoid blocking Tauri's command handler. |
| serde / serde_json | 1.0.149 | Serialization for IPC data | Standard. All Tauri commands that pass structs need serde. |

## Development Tools

| Tool | Purpose | Notes |
| ---- | ------- | ----- |
| `cargo-tauri` (tauri-cli) | Tauri build + dev server | `cargo install tauri-cli --version "^2"` |
| `pnpm` | JS package manager | Faster than npm, recommended by Tauri docs |
| LLVM / libclang | Required to build whisper-rs | whisper-rs uses bindgen. **Must install before first build.** macOS: `brew install llvm`. Windows: winget LLVM. Linux: `apt install libclang-dev`. |
| `libasound2-dev` | Linux audio headers (ALSA) | Required to compile cpal on Linux Debian/Ubuntu. `apt install libasound2-dev pkg-config`. |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
| -------- | ----------- | ----------- | ------- |
| Transcription | whisper-rs | Python faster-whisper via subprocess | Requires bundling a Python runtime or requiring users to install Python. Cross-platform packaging becomes a nightmare. Subprocess management is fragile. |
| Transcription | whisper-rs | candle (Hugging Face Rust ML) | Slower inference, less mature for Whisper specifically, word-level timestamps less reliable in practice. |
| Frontend | Svelte 5 | React / Vue | Heavier bundle, more overhead in Tauri webview. Not wrong choices, just not optimal. |
| Frontend | Svelte 5 | Vanilla TS | More work for reactive UI state. Svelte compiles to vanilla JS anyway. |
| Audio viz | wavesurfer.js | peaks.js | Less actively maintained, fewer Tauri-specific examples. |
| Persistence | tauri-plugin-sql (SQLite) | JSON files for everything | Annotations and word timestamps need relational queries. JSON files become unwieldy. |
| Markdown | comrak | pulldown-cmark | pulldown-cmark is parser-only (Markdown → HTML). comrak does both directions and supports GFM. |

## What NOT to Use

| Avoid | Why | Use Instead |
| ----- | --- | ----------- |
| rodio | Playback library only — no recording, no device selection API | cpal |
| portaudio (Rust bindings) | Requires system-level PortAudio install. Not portable. | cpal |
| Python subprocess for Whisper | Dependency hell, not bundleable, fragile on all 3 platforms | whisper-rs |
| Raw IndexedDB / localStorage | Limited storage, not accessible from Rust, no query capability | tauri-plugin-sql + SQLite |
| Tauri v1 | Maintenance mode only, security patches only. No new features. | Tauri v2 |
| Audio data over Tauri IPC | JSON serialization of PCM data hits size limits / causes OOM | Write to WAV file; pass file path over IPC |

## Cross-Platform Audio Notes

**macOS:**
- `tauri.conf.json` macOS permissions MUST include `NSMicrophoneUsageDescription` string.
- Tauri app must have `com.apple.security.device.audio-input` entitlement in `entitlements.plist`.
- Without entitlement: cpal enumerates devices but recording silently returns empty buffers. No error.
- First launch triggers macOS permission dialog — only shown once. If user denies, app cannot record.

**Windows:**
- WASAPI shared mode (cpal default) works on all modern Windows.
- Some audio interfaces default to exclusive mode — cpal will fail to open stream. Catch and surface error.
- Sample rate mismatch: cpal negotiates format automatically but log the negotiated format for debugging.

**Linux:**
- cpal uses ALSA as backend. PipeWire provides an ALSA compatibility layer (`pipewire-alsa` package).
- Systems with only PulseAudio: need `pulseaudio-alsa` bridge. Most modern distros (Ubuntu 22.04+) have PipeWire.
- Build requirement: `libasound2-dev` + `pkg-config` must be installed before `cargo build`.
- Flatpak sandboxing breaks audio — document this if distributing via Flatpak.

## Version Compatibility Matrix

| Package | Compatible With | Notes |
| ------- | --------------- | ----- |
| tauri 2.10.3 | wry 0.55.0 | wry is Tauri's webview layer |
| whisper-rs 0.16.0 | whisper.cpp (bundled) | whisper-rs bundles whisper.cpp as build dep — no separate install |
| cpal 0.17.3 | tokio 1.51.1 | cpal uses its own thread model; wrap in tokio::spawn for async |
| tauri-plugin-sql 2.4.0 | tauri 2.x | Version 2.x plugin family required for tauri 2.x |

## Sources

- crates.io API: cpal 0.17.3 (12,116,279 downloads verified)
- crates.io API: whisper-rs 0.16.0 (last updated 2026-04-08)
- crates.io API: tauri 2.10.3 (stable, not yanked)
- crates.io API: tauri-plugin-sql 2.4.0, tauri-plugin-fs 2.5.0, tauri-plugin-store 2.4.2
- npm registry: svelte 5.55.3, wavesurfer.js 7.12.6
- Tauri v2 plugin-sql README (official): SQLite support confirmed cross-platform
- whisper.cpp GitHub: token_timestamps flag confirmed for word-level timestamps

---
*Stack research for: Amanuensis — Rust + Tauri audio documentation tool*
*Researched: 2026-04-12*
