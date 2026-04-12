# Architecture Research

**Domain:** Rust + Tauri cross-platform desktop app — audio recording, local Whisper transcription, time-range annotations, markdown export
**Researched:** 2026-04-12
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Svelte 5 + TS)                     │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────────────┐  │
│  │ DevicePanel  │  │ RecordingPanel │  │   TranscriptPanel      │  │
│  │ (dropdown)   │  │ (rec/stop btn  │  │ (word list + waveform) │  │
│  └──────┬───────┘  │  + level meter)│  └──────────┬─────────────┘  │
│         │          └───────┬────────┘             │                 │
│         │                 │  ← Tauri Events       │                 │
│         │       ┌─────────┴──────────┐            │                 │
│         │       │  audio-level event │            │                 │
│         │       │  transcription-    │            │                 │
│         │       │  progress event    │  ┌─────────┴───────────┐     │
│         │       │  model-download    │  │  AnnotationDialog   │     │
│         │       │  event             │  │  (CSS anchor dialog)│     │
│         │       └────────────────────┘  └─────────────────────┘     │
│                                                                      │
│  ← invoke() calls ──────────────────────────────────────────────→   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │  Tauri IPC (invoke + emit)
┌──────────────────────────▼──────────────────────────────────────────┐
│                        BACKEND (Rust)                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │  Audio Engine    │  │  Transcription   │  │  Session Store  │   │
│  │  (cpal)          │  │  Engine          │  │  (SQLite via    │   │
│  │                  │  │  (whisper-rs)    │  │  tauri-plugin-  │   │
│  │  - enumerate     │  │                  │  │  sql)           │   │
│  │  - open stream   │  │  - load model    │  │                 │   │
│  │  - collect PCM   │  │  - transcribe    │  │  - sessions     │   │
│  │  - level calc    │  │  - word timestamps│  │  - words        │   │
│  └──────┬───────────┘  └──────┬───────────┘  │  - annotations  │   │
│         │                     │              └─────────────────┘   │
│  ┌──────▼──────────────────────▼──────────────────────────────┐    │
│  │                    File Manager                             │    │
│  │   (tauri-plugin-fs + hound)                                │    │
│  │   - write WAV  - read audio  - save assets  - export .md   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                     DISK (App Data Directory)                        │
│  sessions/{id}/recording.wav   sessions/{id}/assets/*.{png,wav}     │
│  sessions/{id}/transcript.json  models/whisper-large-v3.bin         │
│  exports/{id}.md                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Technology |
| --------- | -------------- | ---------- |
| Audio Engine | Device enumeration, PCM capture, level calculation, WAV writing | cpal + hound |
| Transcription Engine | Model loading, async transcription, word timestamps | whisper-rs + tokio |
| Session Store | CRUD for sessions, words, annotations; overlap validation | tauri-plugin-sql (SQLite) |
| File Manager | Audio file I/O, asset storage, markdown export | tauri-plugin-fs + comrak |
| Tauri IPC Layer | Command handlers (invoke), event emitters (emit) | Tauri v2 commands |
| Frontend UI | Device selection, recording controls, transcript display, annotation dialog | Svelte 5 |
| Waveform View | Audio timeline display, annotation region markers, playback | wavesurfer.js |

## Recommended Project Structure

```
amanuensis/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 # Tauri builder, plugin registration
│   │   ├── lib.rs                  # Command registration via generate_handler!
│   │   ├── audio/
│   │   │   ├── mod.rs
│   │   │   ├── devices.rs          # cpal device enumeration
│   │   │   ├── recorder.rs         # PCM stream, level calculation, WAV writer
│   │   │   └── player.rs           # Playback (for voice comment preview)
│   │   ├── transcription/
│   │   │   ├── mod.rs
│   │   │   ├── engine.rs           # whisper-rs wrapper, model loading
│   │   │   ├── model.rs            # Model download + progress events
│   │   │   └── types.rs            # Word { text, start_ms, end_ms }
│   │   ├── session/
│   │   │   ├── mod.rs
│   │   │   ├── store.rs            # SQLite CRUD via tauri-plugin-sql
│   │   │   ├── types.rs            # Session, Annotation structs
│   │   │   └── overlap.rs          # Annotation overlap validation
│   │   ├── export/
│   │   │   ├── mod.rs
│   │   │   └── markdown.rs         # Markdown assembly with annotation injection
│   │   └── commands.rs             # All #[tauri::command] functions
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/default.json   # Tauri v2 permission scopes
│   └── Info.plist                  # macOS: NSMicrophoneUsageDescription
├── src/                            # Svelte 5 frontend
│   ├── app.svelte
│   ├── lib/
│   │   ├── components/
│   │   │   ├── DeviceSelector.svelte
│   │   │   ├── RecordingControls.svelte
│   │   │   ├── LevelMeter.svelte
│   │   │   ├── TranscriptView.svelte
│   │   │   ├── WaveformTimeline.svelte
│   │   │   ├── AnnotationDialog.svelte
│   │   │   └── ModelStatus.svelte
│   │   ├── stores/
│   │   │   ├── session.svelte.ts   # Svelte 5 runes-based state
│   │   │   ├── recording.svelte.ts
│   │   │   └── annotations.svelte.ts
│   │   └── api/
│   │       └── tauri.ts            # Typed wrappers around invoke()
│   └── routes/
│       ├── +page.svelte            # Main editor view
│       └── sessions/
│           └── +page.svelte        # Past sessions list
├── package.json
└── vite.config.ts
```

## Architectural Patterns

### Pattern 1: Events for Streaming Data, invoke() for Request-Response

**What:** Tauri has two IPC mechanisms. `invoke()` is request-response (one answer per call). `emit()` is fire-and-forget events from Rust → frontend.

**When to use events:**
- Audio level meter: emit `audio-level` at 20-30Hz with `{ rms: f32, peak: f32 }`
- Transcription progress: emit `transcription-progress` with `{ percent: f32, stage: String }`
- Model download progress: emit `model-download-progress` with `{ bytes_downloaded: u64, total: u64 }`

**When to use invoke():**
- Get device list → returns `Vec<AudioDevice>`
- Start recording → returns `Result<SessionId>`
- Stop recording → returns `Result<AudioFilePath>`
- Trigger transcription → returns immediately (transcription runs async; progress via events)
- CRUD annotations → returns `Result<Annotation>`
- Export markdown → returns `Result<FilePath>`

**Example Rust event emission:**
```rust
app_handle.emit("audio-level", AudioLevelPayload { rms: 0.42, peak: 0.8 }).ok();
```

### Pattern 2: Async Transcription with tokio::spawn

**What:** Whisper transcription for a 5-minute recording can take 30-120 seconds. Never run this on the Tauri command handler thread.

**Pattern:**
```rust
#[tauri::command]
async fn transcribe_audio(app: tauri::AppHandle, path: String) -> Result<(), String> {
    tokio::spawn(async move {
        // Load model, run transcription, emit progress events
        app.emit("transcription-progress", ProgressPayload { percent: 0.0 }).ok();
        let result = run_whisper(&path, |progress| {
            app.emit("transcription-progress", ProgressPayload { percent: progress }).ok();
        });
        match result {
            Ok(words) => app.emit("transcription-complete", words).ok(),
            Err(e) => app.emit("transcription-error", e.to_string()).ok(),
        };
    });
    Ok(()) // Return immediately; result comes via events
}
```

### Pattern 3: SQLite as Annotation Source of Truth

**What:** All session data, word timestamps, and annotations stored in SQLite. Rust backend is the single source of truth. Frontend never writes annotations directly.

**Why:** Overlap validation must happen server-side. If frontend validates only, a race condition or bypass creates corrupted data.

**Schema:**
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    text TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    annotation_type TEXT NOT NULL,  -- 'image' | 'audio' | 'text' | 'url'
    payload TEXT NOT NULL,          -- file path or text content
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Overlap check: SELECT COUNT(*) FROM annotations 
-- WHERE session_id = ? AND NOT (end_ms <= ? OR start_ms >= ?)
```

## Data Flow

### Recording Flow
```
User selects device
    → invoke("get_devices") → Vec<AudioDevice>
    → User picks device
    → invoke("start_recording", {device_id})
        → Rust: opens cpal stream on device
        → Rust: spawns thread: collect PCM samples → write to WAV via hound
        → Rust: spawns thread: calculate RMS every 33ms → emit "audio-level"
    → invoke returns Ok(session_id)
    → User clicks Stop
    → invoke("stop_recording")
        → Rust: flushes WAV file, closes stream
        → Returns Ok(audio_file_path)
```

### Transcription Flow
```
invoke("transcribe_audio", {session_id, path})
    → Rust: returns Ok(()) immediately
    → tokio::spawn:
        → load whisper-rs model (or reuse cached)
        → run transcribe with token_timestamps: true
        → emit "transcription-progress" every ~5%
        → on complete: store words in SQLite
        → emit "transcription-complete" with {word_count}
Frontend:
    → listen for "transcription-progress" → update progress bar
    → listen for "transcription-complete" → invoke("get_words", session_id)
    → render word list in TranscriptView
```

### Annotation Flow
```
User clicks/selects word range in TranscriptView
    → Frontend calculates {start_ms, end_ms} from word timestamps
    → Opens AnnotationDialog (CSS anchor, positioned to selection)
    → User pastes image / picks file / enters text
    → invoke("create_annotation", {session_id, start_ms, end_ms, type, payload})
        → Rust: validates no overlap in SQLite
        → Rust: if image/audio, copies asset to sessions/{id}/assets/
        → Rust: inserts annotation in SQLite
        → Returns Ok(annotation) or Err("OVERLAP")
    → Frontend updates annotation markers in WaveformTimeline
```

### Markdown Export Flow
```
invoke("export_markdown", {session_id})
    → Rust: load all words + annotations from SQLite
    → Sort annotations by start_ms
    → Walk word list, inject annotation markdown at correct word positions:
        image annotation → ![](relative/path/to/asset.png)
        audio annotation → [voice comment](relative/path/to/comment.wav)
        text annotation  → footnote [^1] + footnote def at end
        url annotation   → [text](https://...)
    → Write .md file to exports/{session_id}.md
    → Return Ok(export_path)
    → Frontend opens system file picker to Save As
```

## Whisper Word-Level Timestamps

whisper-rs (wrapping whisper.cpp) returns data at **segment** level by default. Word-level timestamps require:

```rust
let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
params.set_token_timestamps(true);          // REQUIRED for word-level
params.set_language(Some("auto"));          // auto-detect
params.set_max_initial_ts(0.0);
params.set_split_on_word(true);             // split at word boundaries
```

After transcription:
```rust
let num_segments = ctx.full_n_segments();
for i in 0..num_segments {
    let num_tokens = ctx.full_n_tokens(i);
    for j in 0..num_tokens {
        let token = ctx.full_get_token_text(i, j);
        let t0 = ctx.full_get_token_t0(i, j);  // timestamp in 10ms units
        let t1 = ctx.full_get_token_t1(i, j);
        // t0 * 10 = start_ms, t1 * 10 = end_ms
    }
}
```

Note: whisper.cpp timestamps are in units of 10ms (multiply by 10 for milliseconds).

## File Organization on Disk

```
{app_data_dir}/                     # platform-specific: ~/Library/Application Support/amanuensis (macOS)
├── models/                         #                    %APPDATA%/amanuensis (Windows)
│   └── ggml-large-v3.bin           #                    ~/.local/share/amanuensis (Linux)
├── sessions/
│   └── {session-id}/               # UUID-based
│       ├── recording.wav           # The main audio recording
│       ├── transcript.json         # Backup of word timestamps (SQLite is primary)
│       └── assets/
│           ├── {ann-id}.png        # Image annotations
│           └── {ann-id}.wav        # Voice comment annotations
├── exports/
│   └── {session-id}.md             # Most recent export (not canonical — user saves elsewhere)
└── amanuensis.db                   # SQLite database (all sessions, words, annotations)
```

## Anti-Patterns

### Anti-Pattern 1: Passing Audio Buffers Over IPC

**What people do:** Send raw PCM bytes from Rust to frontend via `invoke()` return or events.

**Why it's wrong:** Tauri IPC serializes payloads as JSON. A 5-minute 44.1kHz mono recording = ~26MB of raw PCM = completely unworkable as JSON. Will OOM or timeout.

**Do this instead:** Write to WAV file in Rust. Pass file path over IPC. Frontend uses `<audio src="asset://path">` or wavesurfer.js to read the file directly.

### Anti-Pattern 2: Running Whisper on the Command Handler Thread

**What people do:** `#[tauri::command] fn transcribe() { /* blocking whisper call */ }`

**Why it's wrong:** Blocks Tauri's async runtime. UI becomes unresponsive. On some platforms, causes the window to grey out.

**Do this instead:** `tokio::spawn` inside the command handler. Return immediately. Send results via events.

### Anti-Pattern 3: Frontend-Only Overlap Validation

**What people do:** Check for annotation overlaps in JavaScript before calling `create_annotation`.

**Why it's wrong:** Race conditions if user rapidly creates annotations. No single source of truth.

**Do this instead:** Enforce overlap constraint in the SQL insert (or a pre-insert SELECT COUNT check) in Rust. Return `Err("OVERLAP")` and let frontend surface the message.

### Anti-Pattern 4: Loading Whisper Model Per-Transcription

**What people do:** Load whisper-rs model inside the transcription command, every time.

**Why it's wrong:** whisper-large-v3 takes 5-15 seconds to load into RAM. Users will wait 15 seconds before every transcription.

**Do this instead:** Load model once at app startup (or on first transcription), hold in a `Arc<Mutex<WhisperContext>>` in Tauri state. Reuse across transcriptions.

## Sources

- Tauri v2 documentation: command system, events, plugin architecture
- whisper-rs 0.16.0 crate: token_timestamps API, FullParams usage
- whisper.cpp documentation: timestamp units (10ms), token_timestamps flag
- cpal 0.17.3: device enumeration API, stream callback model
- tauri-plugin-sql README: SQLite support, platform compatibility
- Tauri v2 capabilities/permissions system documentation

---
*Architecture research for: Amanuensis — Rust + Tauri audio documentation tool*
*Researched: 2026-04-12*
