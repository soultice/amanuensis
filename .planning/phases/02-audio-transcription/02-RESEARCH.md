# Phase 2: Audio & Transcription - Research

*Researched: 2026-04-12*

## Goal

User can select an audio input device, record with a bar-graph level meter, stop and play back the recording, click "Transcribe", and see a word-level transcript appear inline as flowing paragraph text.

---

## 1. Audio Device Enumeration & Selection

**API:** `navigator.mediaDevices.enumerateDevices()` in the renderer (Electron renderer has access to Web APIs).

```typescript
// Returns all audioinput devices
const devices = await navigator.mediaDevices.enumerateDevices()
const audioInputs = devices.filter(d => d.kind === 'audioinput')
// [{ deviceId, label, kind: 'audioinput' }]
```

**Important:** Device labels are empty strings until the user has granted microphone permission. Must call `getUserMedia({audio: true})` at least once first to populate labels.

**Recommended pattern:**
1. On app start (or when user opens toolbar), call `getUserMedia({audio: true, video: false})` with no device constraint to trigger permission prompt and populate device labels
2. Then call `enumerateDevices()` to populate the dropdown
3. Store selected `deviceId` in Pinia store — use it in subsequent `getUserMedia` calls

**macOS entitlements (groundwork for Phase 5 packaging, start now):**
Create `build/entitlements.mac.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.device.microphone</key>
    <true/>
  </dict>
</plist>
```
Also add to `package.json` electron-builder config:
```json
"mac": {
  "extendInfo": {
    "NSMicrophoneUsageDescription": "Amanuensis needs microphone access to record audio for transcription."
  }
}
```

---

## 2. Bar-Graph Level Meter

**Approach:** `Web Audio API` — `AnalyserNode` + `getByteFrequencyData()` in a `requestAnimationFrame` loop. No library needed.

**Full implementation pattern:**

```typescript
class LevelMeter {
  private audioCtx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private rafId: number | null = null
  private dataArray: Uint8Array = new Uint8Array(0)

  start(stream: MediaStream, onLevel: (bars: number[]) => void, barCount = 12): void {
    this.audioCtx = new AudioContext()
    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 64        // 32 frequency bins
    this.source = this.audioCtx.createMediaStreamSource(stream)
    this.source.connect(this.analyser)
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)

    const tick = () => {
      this.analyser!.getByteFrequencyData(this.dataArray)
      // Average bins into barCount buckets
      const bucketSize = Math.floor(this.dataArray.length / barCount)
      const bars = Array.from({ length: barCount }, (_, i) => {
        const start = i * bucketSize
        const slice = this.dataArray.slice(start, start + bucketSize)
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length
        return Math.round(avg / 255 * 100)  // 0-100 percentage
      })
      onLevel(bars)
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  stop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    this.source?.disconnect()
    this.audioCtx?.close()
    this.audioCtx = null
    this.analyser = null
    this.rafId = null
  }
}
```

**Vue rendering:** Reactive `bars: number[]` (0-100 each) → `<div v-for="h in bars" :style="{height: h + '%'}" class="bar" />`

---

## 3. MediaRecorder Recording

**Pattern:**

```typescript
async function startRecording(deviceId: string): Promise<{ recorder: MediaRecorder; stream: MediaStream }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: deviceId },
      sampleRate: 44100,
      channelCount: 1
    }
  })

  // Prefer opus/webm — available in all Chromium-based Electron versions
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'

  const recorder = new MediaRecorder(stream, { mimeType })
  return { recorder, stream }
}
```

**Collecting chunks → Blob → ArrayBuffer:**
```typescript
const chunks: BlobPart[] = []
recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
recorder.onstop = async () => {
  const blob = new Blob(chunks, { type: 'audio/webm' })
  const arrayBuffer = await blob.arrayBuffer()
  // store arrayBuffer in Pinia for playback and upload
}
recorder.start(100)  // collect chunks every 100ms
```

**Playback after recording:**
```typescript
const url = URL.createObjectURL(blob)
const audio = new Audio(url)
await audio.play()
// On component unmount: URL.revokeObjectURL(url)
```

---

## 4. Transcription Endpoint (FastAPI + faster-whisper)

### WhisperModel singleton — load once

**Critical:** `WhisperModel("large-v3", ...)` takes 30–90s to load on first call. Load it **once** at app startup (lazy-init on first transcription request, not at sidecar start — sidecar starts quickly, model loads when first needed).

```python
# sidecar/app/services/transcription.py
from __future__ import annotations
import asyncio
import threading
from pathlib import Path
from typing import Optional
from faster_whisper import WhisperModel

_model: Optional[WhisperModel] = None
_model_lock = threading.Lock()

def get_model(model_dir: Path) -> WhisperModel:
    """Load WhisperModel once and cache it."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                _model = WhisperModel(
                    str(model_dir),
                    device="auto",          # GPU if available, else CPU
                    compute_type="auto",    # fp16 on GPU, int8 on CPU
                    num_workers=1
                )
    return _model
```

### Audio format — faster-whisper handles WebM natively

**Key finding:** faster-whisper uses `av` (PyAV 17.0.0 — already installed) internally for audio decoding via `faster_whisper.audio.decode_audio`. It can decode WebM/Opus directly — **no explicit ffmpeg conversion needed**.

```python
from faster_whisper.audio import decode_audio
# decode_audio reads WebM, WAV, MP3, etc. — returns numpy float32 array at 16kHz mono
audio = decode_audio(file_path_or_buffer)
```

### Transcription route

```python
# sidecar/app/routes/transcribe.py
import asyncio
import tempfile
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
import app.state as state

router = APIRouter(prefix="/transcribe")
_transcribe_lock = asyncio.Lock()

@router.post("")
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Accept WebM audio file, transcribe with faster-whisper large-v3.
    Returns: {words: [{id, word, start, end, probability}], language, duration}
    """
    if state.model_manager is None or state.model_manager.state != "present":
        raise HTTPException(status_code=503, detail="Model not ready")

    async with _transcribe_lock:  # one transcription at a time
        model = get_model(state.model_manager.get_model_path())

        # Write upload to temp file (faster-whisper needs file path or numpy array)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            content = await audio.read()
            tmp.write(content)
            tmp_path = tmp.name

        try:
            segments, info = model.transcribe(
                tmp_path,
                word_timestamps=True,
                language=None,          # auto-detect
                beam_size=5,
                vad_filter=True,        # skip silence
            )

            words = []
            word_id = 0
            for segment in segments:
                if segment.words:
                    for w in segment.words:
                        words.append({
                            "id": word_id,
                            "word": w.word,
                            "start": round(w.start, 3),
                            "end": round(w.end, 3),
                            "probability": round(w.probability, 3),
                        })
                        word_id += 1

            return JSONResponse({
                "words": words,
                "language": info.language,
                "duration": round(info.duration, 2),
            })

        finally:
            Path(tmp_path).unlink(missing_ok=True)
```

**Note on `vad_filter=True`:** Skips silent regions, improving accuracy and speed on recordings with silence.

---

## 5. Pinia Stores for Phase 2

### `useRecordingStore`

```typescript
// src/renderer/src/stores/recording.ts
export type RecordingState = 'idle' | 'recording' | 'stopped'

export const useRecordingStore = defineStore('recording', {
  state: () => ({
    recordingState: 'idle' as RecordingState,
    devices: [] as MediaDeviceInfo[],
    selectedDeviceId: '' as string,
    audioBlob: null as Blob | null,
    audioBlobUrl: null as string | null,
    levelBars: [] as number[],     // 0-100 per bar, updated by LevelMeter
    durationMs: 0,
  }),
  actions: {
    async loadDevices(): Promise<void> { ... },
    async startRecording(): Promise<void> { ... },
    stopRecording(): void { ... },
    clearRecording(): void { ... },
  }
})
```

### `useTranscriptStore`

```typescript
// src/renderer/src/stores/transcript.ts
export type Word = { id: number; word: string; start: number; end: number; probability: number }
export type TranscriptState = 'empty' | 'transcribing' | 'complete' | 'error'

export const useTranscriptStore = defineStore('transcript', {
  state: () => ({
    transcriptState: 'empty' as TranscriptState,
    words: [] as Word[],
    language: '',
    duration: 0,
    progress: 0,            // 0-100 (polled or estimated)
    error: null as string | null,
  }),
  getters: {
    fullText: (s) => s.words.map(w => w.word).join(''),
  },
  actions: {
    async transcribe(audioBlob: Blob): Promise<void> { ... },
  }
})
```

---

## 6. Transcription Progress — Polling Approach

faster-whisper does not stream progress natively. Since transcription runs synchronously in Python (in the `_transcribe_lock` async context), the progress endpoint should be polled from the renderer:

```python
# Add to sidecar state.py
transcription_status: dict = {"state": "idle", "progress": 0}
```

```python
# GET /transcribe/status → {"state": "idle"|"running"|"complete", "progress": 0-100}
@router.get("/status")
async def transcription_status():
    return state.transcription_status
```

Renderer polls `GET /transcribe/status` every 500ms while `transcriptState === 'transcribing'`. Since we can't get true progress from faster-whisper, show an indeterminate spinner + "Transcribing…" message. When the POST `/transcribe` responds, set progress to 100%.

**Display:** Inline in `TranscriptPanel` — replace placeholder with spinner + message, then replace with transcript text on completion.

---

## 7. IPC: Renderer → Sidecar Direct HTTP

Per the established architecture (Phase 1), the renderer calls the sidecar directly via HTTP using the port from `useSidecarStore.port`. No new IPC channels needed for transcription — multipart audio upload goes directly:

```typescript
// In useTranscriptStore.transcribe():
const port = useSidecarStore().port
const formData = new FormData()
formData.append('audio', audioBlob, 'recording.webm')
const res = await fetch(`http://localhost:${port}/transcribe`, {
  method: 'POST',
  body: formData
})
const data = await res.json()
this.words = data.words
```

---

## 8. Key Pitfall Mitigations (Phase 2 Specific)

- **P6 (macOS mic permission):** Add `entitlements.mac.plist` and `NSMicrophoneUsageDescription` now — even though packaging is Phase 5, these files should be committed in Phase 2 as groundwork.
- **P1 (Whisper slow):** No fake progress — show indeterminate spinner with honest "This may take a few minutes" message. Don't try to estimate time.
- **P3 (audio format):** faster-whisper handles WebM via PyAV natively — no ffmpeg conversion needed. Confirmed by `av 17.0.0` in poetry.lock.
- **Large model singleton:** Load once on first transcription request, not at sidecar startup. Avoids 30–90s startup delay.

## RESEARCH COMPLETE
