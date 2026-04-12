# Pitfalls Research

**Domain:** Rust + Tauri cross-platform desktop app — audio recording, local Whisper transcription, time-range annotations, markdown export
**Researched:** 2026-04-12
**Confidence:** HIGH

**Critical context:** This project has been attempted 3+ times by AI agents and failed every time. Apps accumulated broken pieces, core features were missing (audio recording, transcription, model downloading), and UI was unusable. These pitfalls are specifically researched to break that pattern.

---

## Critical Pitfalls

### Pitfall 1: Missing whisper-rs Build Prerequisites

**What goes wrong:**
`cargo build` fails with linker errors or bindgen errors on first build. The error messages are cryptic (`libclang not found`, `failed to run custom build command for whisper-rs`). AI agents generate the code but never verify it actually builds.

**Why it happens:**
whisper-rs uses bindgen to generate Rust bindings from whisper.cpp C headers. bindgen requires libclang/LLVM at build time. This is not a Rust-native dependency and is not automatically installed.

**How to avoid:**
Establish build prerequisites as Phase 1, Step 1 — before any other code is written:
- macOS: `brew install llvm` + set `LIBCLANG_PATH`
- Windows: Install LLVM via winget or from llvm.org; set `LLVM_PATH`
- Linux: `apt install libclang-dev pkg-config libasound2-dev`

Document these in a `PREREQUISITES.md` and verify builds on all three platforms in Phase 1.

**Warning signs:**
`error: failed to run custom build command for 'whisper-rs'` in CI or fresh clone.

**Phase to address:** Phase 1 (foundation) — must verify build succeeds before writing any feature code.

---

### Pitfall 2: macOS Microphone Permission — Silent Failure

**What goes wrong:**
On macOS, cpal successfully enumerates audio devices and opens a stream, but the recording buffer is always empty (all zeros). No error is returned. The app appears to be recording but captures nothing.

**Why it happens:**
macOS requires:
1. `NSMicrophoneUsageDescription` key in `Info.plist`
2. The `com.apple.security.device.audio-input` entitlement in `entitlements.plist`

Tauri's default project template includes neither. The permission dialog is never shown. cpal gets an empty stream.

**How to avoid:**
Add to `src-tauri/Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Amanuensis needs microphone access to record audio for transcription.</string>
```

Add to `src-tauri/entitlements.plist`:
```xml
<key>com.apple.security.device.audio-input</key>
<true/>
```

After first run: if user denies → show instructions to re-enable in System Settings → Privacy & Security → Microphone.

**Warning signs:**
Recording "works" (no error), audio file is created, but waveform is flat and transcript is empty or just silence tokens.

**Phase to address:** Phase 1 (recording setup) — test on real macOS device, not simulator.

---

### Pitfall 3: Linux Audio — Device Enumeration Succeeds, Recording Fails

**What goes wrong:**
On Linux, cpal enumerates devices (using ALSA). User selects a device. Recording starts. No error. But audio is silent or the stream immediately errors out.

**Why it happens:**
Three competing audio systems on Linux:
- **ALSA** (low-level, cpal's default backend)
- **PulseAudio** (common on Ubuntu 20.04 and older)
- **PipeWire** (default on Ubuntu 22.04+, Fedora, Arch)

PipeWire provides an ALSA compatibility layer (`pipewire-alsa`) but it must be installed separately. Systems with only PulseAudio need the `pulseaudio-alsa` bridge. If neither bridge is installed, cpal's ALSA backend can see device names but fails to open streams.

**How to avoid:**
- Test on Ubuntu 22.04+ (PipeWire) and Ubuntu 20.04 (PulseAudio) in CI or VMs
- Document Linux prerequisites: `libasound2-dev`, `pkg-config`, `pipewire-alsa` OR `pulseaudio-alsa`
- Add fallback error message: "Audio device could not be opened — ensure PipeWire or PulseAudio is running"
- cpal feature flag: add `cpal = { features = ["jack"] }` only if explicitly targeting JACK

**Warning signs:**
`Stream error` or `Device not available` from cpal on Linux. Device appears in list but recording fails immediately.

**Phase to address:** Phase 1 (recording setup) — set up Linux CI with both PipeWire and PulseAudio configurations.

---

### Pitfall 4: Whisper Token Timestamps Not Enabled — No Word-Level Sync

**What goes wrong:**
Transcription succeeds and produces text. But the application only has paragraph-level timestamps (one timestamp per segment, not per word). Clicking on a word cannot seek to the right audio position because word positions aren't known.

**Why it happens:**
whisper-rs returns **segment** timestamps by default. Word-level timestamps are opt-in via `params.set_token_timestamps(true)` AND `params.set_split_on_word(true)`. AI agents frequently forget to set these flags, transcription "works," but the word-sync feature is broken.

**How to avoid:**
Always set both flags:
```rust
params.set_token_timestamps(true);
params.set_split_on_word(true);
```

Verify after transcription: assert that each returned word has a distinct `start_ms` and `end_ms`, and that the timestamps span the full audio duration.

Write an integration test: transcribe a known 30-second audio clip and assert that >80% of words have timestamps within the audio duration.

**Warning signs:**
All words in a segment have the same `start_ms` / `end_ms`. Clicking any word in a paragraph seeks to the paragraph start instead of the word's position.

**Phase to address:** Phase 2 (transcription) — verified as part of transcription smoke test.

---

### Pitfall 5: Whisper Model Loading Blocks UI / App Appears Frozen

**What goes wrong:**
On first transcription, the app freezes for 10-30 seconds with no feedback. On slow machines or HDDs, this can be 60+ seconds. Users force-quit the app thinking it crashed.

**Why it happens:**
whisper-large-v3 is ~3GB on disk and requires loading the full model into RAM. This is a blocking operation. AI agents call model loading synchronously inside a Tauri command, blocking the async runtime.

**How to avoid:**
1. Load model asynchronously via `tokio::spawn` — never on the command handler
2. Show model status in the UI at all times: `Not Downloaded` / `Downloading (X%)` / `Loading` / `Ready`
3. Cache the loaded `WhisperContext` in Tauri state (`Arc<Mutex<Option<WhisperContext>>>`), not re-loaded per transcription
4. If model is not yet loaded when user hits Transcribe, show loading indicator and queue the request

**Warning signs:**
App hangs for >5 seconds on any user action. Tauri command takes more than a few milliseconds to return.

**Phase to address:** Phase 2 (transcription) — model loading must be async from day one.

---

### Pitfall 6: Audio Data Passed Through Tauri IPC

**What goes wrong:**
App works for short (< 10 second) recordings but crashes or hangs on longer recordings. Out-of-memory errors appear in logs.

**Why it happens:**
AI agents attempt to return raw PCM audio data from Rust via `invoke()` return value, or emit it as a Tauri event, to display a waveform. Tauri IPC serializes payloads as JSON. A 5-minute 44.1kHz mono recording is ~26MB of raw PCM. Serializing this as JSON produces ~80MB of text. This exceeds IPC limits and/or causes OOM.

**How to avoid:**
**Rule: Audio data never crosses IPC.** 
- Rust writes audio to a WAV file in the app data directory
- Frontend loads the audio via `asset://` protocol URL (Tauri's built-in file serving)
- wavesurfer.js loads the WAV file directly from disk via the URL
- For live level meters: Rust emits ONLY summary stats (`{ rms: f32, peak: f32 }`) not samples

**Warning signs:**
`invoke()` calls time out. Waveform display causes app to hang. Memory usage spikes during recording.

**Phase to address:** Phase 1 (recording) — establish correct data flow pattern from the first line of audio code.

---

### Pitfall 7: CSS Anchor Positioning — Linux WebKitGTK Compatibility

**What goes wrong:**
The annotation dialog positions correctly on macOS and Windows but appears in wrong position (or top-left of window) on Linux.

**Why it happens:**
Tauri v2 uses different webview engines per platform:
- **Windows**: WebView2 (Chromium-based) — CSS Anchor Positioning supported (Chrome 125+)
- **macOS**: WKWebView (WebKit-based) — CSS Anchor Positioning supported in Safari 18+ / macOS 15+
- **Linux**: WebKitGTK — CSS Anchor Positioning support depends on WebKitGTK version; older distros (Ubuntu 20.04 WebKitGTK 2.36) do NOT support it

**How to avoid:**
1. Use CSS anchor positioning as the primary approach (it's the user's explicit requirement)
2. Add a JavaScript fallback for Linux: detect anchor positioning support via `CSS.supports("anchor-name: --foo")`, and if unsupported, calculate position manually and set `position: fixed; top: Xpx; left: Ypx`
3. Test on Ubuntu LTS to verify

**Warning signs:**
Dialog appears at (0, 0) or in unexpected position on Linux. `CSS.supports("anchor-name: --foo")` returns `false`.

**Phase to address:** Phase 3 (annotation UI) — test on Linux immediately when implementing annotation dialog.

---

### Pitfall 8: AI Agent Feature Stub Accumulation

**What goes wrong:**
The codebase grows, tests pass (or don't exist), but the app doesn't actually work. Core features like recording, transcription, and model download show UI but do nothing. The app accumulates stubs that look complete but aren't.

**Why it happens:**
AI agents generate placeholder implementations that compile:
```rust
#[tauri::command]
async fn start_recording() -> Result<String, String> {
    Ok("recording-123".to_string()) // TODO: actually implement
}
```
Then build UI on top of these stubs. The UI looks complete. The feature isn't. This compounds over 3+ phases until the codebase is so interconnected that fixing stubs breaks everything.

**How to avoid:**
1. **Never accept a stub.** Every backend command must actually do what it says before the phase is marked done.
2. **Smoke test after every feature:** After implementing `start_recording`, actually record 5 seconds of audio and verify the WAV file exists and has non-zero content.
3. **Build order:** Backend first, UI second. Don't build the recording UI until `start_recording` actually records.
4. **Phase success criteria are behavioral:** "Recording button captures audio to WAV file" not "Recording button exists."

**Warning signs:**
Commands that return `Ok(hardcoded_value)` without doing real work. Tauri commands that don't interact with cpal/whisper-rs/SQLite at all. Features that "work" in isolation but break when connected.

**Phase to address:** All phases — this is a process requirement, not a code problem.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
| -------- | ----------------- | -------------- | --------------- |
| Skipping Linux audio testing | Faster development | Recording silently broken on Linux for all users | Never |
| Single-threaded Whisper call | Simpler code | UI freezes; app appears crashed | Never |
| Hardcoded model path | Skip download UI | App broken on clean install | Never |
| Frontend-only annotation validation | Simpler backend | Data corruption, no single source of truth | Never |
| Using `unwrap()` in Tauri commands | Faster prototyping | Silent panics that crash the Rust backend | Only in throw-away prototypes, never in shipped code |
| Loading model on every transcription | Simpler state management | 15-second delay before each transcription | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
| ----------- | -------------- | ---------------- |
| whisper-rs | Forgetting `set_token_timestamps(true)` | Always set both `token_timestamps` AND `split_on_word` |
| whisper-rs | Loading model synchronously | Load in `tokio::spawn`, hold in Tauri state |
| cpal | Not handling stream errors | Wrap stream callback in error channel, surface to UI |
| tauri-plugin-sql | Forgetting to add capability in `capabilities/default.json` | Add `"sql:allow-execute"`, `"sql:allow-select"` etc. |
| tauri-plugin-fs | Accessing paths outside scope | Define scope in `capabilities/default.json`; `$APPDATA` must be explicitly allowed |
| wavesurfer.js | Loading audio via `file://` URL | Use Tauri's `asset://` protocol for local files in Tauri v2 |
| Tauri v2 events | Listening with wrong channel name | Use a constant enum for event names shared between Rust and TS |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
| ---- | -------- | ---------- | -------------- |
| Emitting raw PCM via events | UI hangs, OOM | Never pass audio data over IPC | Immediately on recordings > 30 seconds |
| Re-loading Whisper model per transcription | 15+ second delay before each transcription | Cache model in Tauri state | Every transcription after the first |
| Storing audio as base64 in SQLite | DB grows to gigabytes | Store file path only; audio stays on disk | After ~10 recordings |
| Emitting `audio-level` at 120Hz | UI jank, excessive CPU | Cap at 20-30Hz | Immediately on slower machines |

## "Looks Done But Isn't" Checklist

These features commonly appear functional but have silent failure modes:

- [ ] **Recording:** Verify WAV file is non-empty after stop. Check file size > 1KB for a 5-second recording.
- [ ] **Audio level meter:** Verify it responds to clapping/speaking. A flat meter = silent capture.
- [ ] **Transcription:** Verify word timestamps are distinct (not all-same). Verify language detection is correct.
- [ ] **Model download:** Verify on a machine with no prior model file. Download must complete and file must be valid.
- [ ] **Annotation overlap:** Create two annotations that would overlap. Verify second one is rejected with error.
- [ ] **Markdown export:** Open exported file in a markdown renderer. Verify images display, links work, footnotes render.
- [ ] **Session resume:** Close and reopen app mid-session. Verify transcript and annotations are intact.

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
| ------- | ---------------- | ------------ |
| whisper-rs build prerequisites | Phase 1 | `cargo build` succeeds on all 3 platforms |
| macOS microphone permissions | Phase 1 | Record 5 seconds on macOS, verify non-empty WAV |
| Linux audio backend | Phase 1 | Record 5 seconds on Ubuntu, verify non-empty WAV |
| Token timestamps not enabled | Phase 2 | Assert word-level timestamps span full recording |
| Model loading blocks UI | Phase 2 | Transcription command returns in <100ms; progress via events |
| Audio data over IPC | Phase 1 | wavesurfer.js loads WAV via asset:// URL |
| CSS anchor on Linux | Phase 3 | Test annotation dialog on Linux; implement JS fallback |
| AI stub accumulation | All phases | Every command verified by actually running it |

## Sources

- whisper-rs GitHub: bindgen/libclang requirement documented in README
- whisper.cpp documentation: token_timestamps, split_on_word flags
- cpal GitHub issues: Linux PipeWire/ALSA compatibility, macOS permission patterns
- Tauri v2 documentation: capabilities system, asset:// protocol, plugin permission scopes
- CSS Anchor Positioning: caniuse.com (Chrome 125+, Safari 18+, WebKitGTK partial)
- Tauri community Discord: common Tauri v2 gotchas, IPC size limits

---
*Pitfalls research for: Amanuensis — Rust + Tauri audio documentation tool*
*Researched: 2026-04-12*
