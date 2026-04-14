# Phase 11: Fish Audio S2 Pro Transcription Backend — Research

**Researched:** 2026-04-13
**Status:** Complete

---

## 1. Fish Audio ASR API — Definitive Reference

### Endpoint

```
POST https://api.fish.audio/v1/asr
Authorization: Bearer <API_KEY>
Content-Type: multipart/form-data

Fields:
  audio            — audio file (binary)
  language         — BCP-47 string, omit for auto-detect
  ignore_timestamps — boolean, default true
                      false = return segment-level timestamps
```

### Response schema

```json
{
  "text": "Full transcript string",
  "duration": 42.3,
  "segments": [
    { "text": " Hello big world", "start": 0.0, "end": 1.8 }
  ]
}
```

**Key constraints:**
- Segments only — no word-level timestamps (closed as "not_planned" upstream)
- `ignore_timestamps=false` returns segment boundaries, not word boundaries
- BETA endpoint — API stability not guaranteed

### Pricing

| Model | Rate |
|---|---|
| `transcribe-1` (ASR) | **$0.36 / audio hour** = $0.006 / minute |

For a typical 10-minute session: **$0.06 per transcription run**. Trivial cost for personal use. No subscription or monthly minimum.

### Supported Audio Formats

Official docs list: **MP3, WAV, M4A, OGG, FLAC, AAC** (max 20 MB, max 60 min, min 1 s).

**⚠️ WebM/Opus is NOT in the official list.** Amanuensis records in `audio/webm;codecs=opus` via MediaRecorder. Two options:

**Option A — Try WebM directly (test first).** Fish Audio runs on Chromium-based transcription infrastructure; Opus/WebM is natively understood by most ASR engines. Worth testing empirically before adding conversion.

**Option B — Convert WebM → WAV in renderer before IPC.** Use the Web Audio API:
```typescript
async function webmToWav(blob: Blob): Promise<ArrayBuffer> {
  const ctx = new AudioContext()
  const arrayBuf = await blob.arrayBuffer()
  const audioData = await ctx.decodeAudioData(arrayBuf)
  return encodeWav(audioData)   // encode PCM to WAV container
}
```
WAV encoding is ~30 lines of TypeScript (write RIFF header + raw PCM samples). The renderer passes the resulting `ArrayBuffer` over IPC to the main process.

**Recommendation:** Try WebM first. If Fish Audio rejects it, add the WAV conversion step. The conversion is pure JS with no external deps.

---

## 2. Architecture — Detailed Design

### 2a. IPC flow (replaces sidecar HTTP calls)

```
Renderer                   Main process              Fish Audio API
───────                    ────────────              ──────────────
blob.arrayBuffer()
  │
  ▼
window.api.transcribe(buf)
  │ IPC: 'transcribe:run'
  │──────────────────────►
                          fetch('https://api.fish.audio/v1/asr', {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${apiKey}` },
                            body: formData(audio=buf)
                          })
                            │──────────────────────────────────────►
                            │                           { text, duration, segments }
                            │◄──────────────────────────────────────
                          adaptToWords(segments)
                            │──────────────────────►
                                                   return { words, segments, language, duration }
  │◄──────────────────────
  transcriptStore.words = words
```

**Why main process?** Node 18 `fetch` is available. No CSP change needed in the renderer. The audio `ArrayBuffer` is small enough for IPC (typical 5-min recording ≈ 2 MB as WebM).

### 2b. Word adapter — uniform distribution

```typescript
function adaptSegmentsToWords(
  segments: Array<{ text: string; start: number; end: number }>,
  language: string,
  duration: number
): { words: Word[]; segments: Segment[] } {
  const words: Word[] = []
  const adaptedSegments: Segment[] = []
  let wordId = 0

  segments.forEach((seg, segIdx) => {
    // Normalise: strip leading/trailing whitespace, split on whitespace
    const tokens = seg.text.trim().split(/\s+/).filter(Boolean)
    if (tokens.length === 0) return

    const segDuration = seg.end - seg.start
    const wordDuration = segDuration / tokens.length

    tokens.forEach((token, i) => {
      words.push({
        id: wordId++,
        word: (i === 0 ? '' : ' ') + token,   // preserve inter-word spacing
        start: Math.round((seg.start + i * wordDuration) * 1000) / 1000,
        end:   Math.round((seg.start + (i + 1) * wordDuration) * 1000) / 1000,
        probability: 1.0,   // Fish Audio doesn't provide per-word confidence
        segmentId: segIdx,
      })
    })

    adaptedSegments.push({
      id: segIdx,
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    })
  })

  return { words, segments: adaptedSegments }
}
```

**Accuracy note:** Seek precision is bounded by segment duration. Fish Audio segments are typically 2–8 s. For a 5 s segment with 10 words, each word gets 500 ms precision — adequate for annotation use. Users notice this less than they would with a broken UX.

### 2c. API key storage via `safeStorage`

```typescript
// src/main/apiKey.ts
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const KEY_FILE = join(app.getPath('userData'), 'fish-api-key.enc')

export function getApiKey(): string | null {
  if (!existsSync(KEY_FILE)) return null
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    const enc = readFileSync(KEY_FILE)
    return safeStorage.decryptString(enc)
  } catch {
    return null
  }
}

export function setApiKey(plaintext: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store plaintext in file (unlikely on desktop OS)
    writeFileSync(KEY_FILE, plaintext, 'utf8')
    return
  }
  const enc = safeStorage.encryptString(plaintext)
  writeFileSync(KEY_FILE, enc)
}

export function clearApiKey(): void {
  if (existsSync(KEY_FILE)) require('fs').unlinkSync(KEY_FILE)
}
```

`safeStorage` uses DPAPI on Windows, Keychain on macOS, libsecret/kwallet on Linux. Available in Electron 15+, present in Electron 33 (current).

**IPC handlers to add:**
```typescript
ipcMain.handle('api-key:get', () => !!getApiKey())       // returns boolean, never the key
ipcMain.handle('api-key:set', (_e, key: string) => setApiKey(key))
ipcMain.handle('api-key:clear', () => clearApiKey())
ipcMain.handle('api-key:test', async () => {             // validates key with a tiny request
  const key = getApiKey()
  if (!key) return { ok: false, error: 'No key stored' }
  try {
    const res = await fetch('https://api.fish.audio/v1/asr', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: new FormData(),   // empty → expect 422, not 401
    })
    return res.status === 422 ? { ok: true } : { ok: false, error: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})
```

Note: "Test connection" sends an empty form; Fish Audio returns 422 (missing audio field) for a valid key, 401 for an invalid key. This validates auth without consuming credits.

### 2d. Transcription IPC handler

```typescript
// In src/main/index.ts
ipcMain.handle('transcribe:run', async (_e, audioBuffer: Buffer, language?: string) => {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Fish Audio API key configured')

  const formData = new FormData()
  formData.append('audio', new Blob([audioBuffer], { type: 'audio/webm' }), 'recording.webm')
  formData.append('ignore_timestamps', 'false')
  if (language) formData.append('language', language)

  const res = await fetch('https://api.fish.audio/v1/asr', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Fish Audio ASR failed (${res.status}): ${detail}`)
  }

  const data = await res.json() as {
    text: string
    duration: number
    segments: Array<{ text: string; start: number; end: number }>
  }

  return adaptSegmentsToWords(data.segments, language ?? '', data.duration)
})
```

### 2e. `transcriptStore` — minimal change

Replace the sidecar `fetch` with the new IPC call:

```typescript
// src/renderer/src/stores/transcript.ts
async transcribe(audioBlob: Blob): Promise<void> {
  this.transcriptState = 'transcribing'
  this.words = []
  this.segments = []
  this.language = ''
  this.duration = 0
  this.error = null

  try {
    const arrayBuffer = await audioBlob.arrayBuffer()
    const result = await window.api.transcribe(Buffer.from(arrayBuffer))
    this.words     = result.words
    this.segments  = result.segments
    this.language  = result.language
    this.duration  = result.duration
    this.transcriptState = 'complete'
  } catch (err) {
    this.error = String(err)
    this.transcriptState = 'error'
  }
}
```

The polling loop (`_startPolling` / `_stopPolling`) is removed entirely — Fish Audio is a synchronous request/response.

---

## 3. What to Remove

| File / Code | Action |
|---|---|
| `src/main/sidecar.ts` | **Delete entirely** |
| `sidecar/` directory | **Delete entirely** (Python FastAPI + faster-whisper) |
| `src/renderer/src/stores/sidecar.ts` | **Delete** |
| `src/renderer/src/stores/model.ts` | **Delete** |
| `src/renderer/src/components/SidecarErrorDialog.vue` | **Delete** |
| `src/renderer/src/views/OnboardingView.vue` | **Rewrite** (API key setup) |
| `src/renderer/src/App.vue` | Remove sidecar/model imports; gate on `apiKeyStore.hasKey` |
| `src/main/index.ts` | Remove sidecar start/kill, model download IPC handlers |
| `src/preload/index.ts` | Remove sidecar/model API surface; add transcribe/api-key |
| `src/renderer/src/env.d.ts` | Remove sidecar/model types; add new types |
| `src/renderer/src/components/AppStatusBar.vue` | Remove "Sidecar: ready" — show API key status instead |
| `AppShellView.vue` startup | Remove sidecar wait logic |

---

## 4. New Pinia Store — `apiKeyStore`

Replaces `modelStore` + `sidecarStore`:

```typescript
// src/renderer/src/stores/apiKey.ts
export const useApiKeyStore = defineStore('apiKey', {
  state: () => ({
    hasKey: false,
    testing: false,
    testResult: null as null | { ok: boolean; error?: string },
  }),
  actions: {
    async refresh(): Promise<void> {
      this.hasKey = await window.api.apiKeyHasKey()
    },
    async save(key: string): Promise<void> {
      await window.api.apiKeySet(key)
      this.hasKey = true
    },
    async test(): Promise<void> {
      this.testing = true
      this.testResult = null
      this.testResult = await window.api.apiKeyTest()
      this.testing = false
    },
    async clear(): Promise<void> {
      await window.api.apiKeyClear()
      this.hasKey = false
    },
  },
})
```

---

## 5. Onboarding View — Redesign

```
┌──────────────────────────────────────────────────┐
│              Amanuensis                          │
│         Audio transcription and annotation       │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Fish Audio API Key                        │  │
│  │                                            │  │
│  │  Enter your Fish Audio API key to enable   │  │
│  │  transcription. Get one at fish.audio      │  │
│  │                                            │  │
│  │  [sk-fa-••••••••••••••••••••] [Test] [Save]│  │
│  │                                            │  │
│  │  ✓ Connection verified            [Enter →]│  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  Pricing: $0.36 / audio hour — pay as you go     │
└──────────────────────────────────────────────────┘
```

The "Enter →" / continue button is enabled only after a successful test result.

---

## 6. `AppStatusBar` Update

Currently shows "Sidecar: ready". After this phase:

```
Transcription: Fish Audio S2 Pro
```

Or show the key status:
- `API Key: configured` (green)
- `API Key: not set` (red, with link to settings)

Simple swap — no sidecar polling needed.

---

## 7. File Size & Latency

Typical 5-minute WebM/Opus recording:
- File size: **~1–3 MB** (well within 20 MB limit)
- Upload time (50 Mbps): ~0.5 s
- Fish Audio processing: ~5–15 s (comparable to local Whisper on CPU)
- Total latency: similar to or faster than local Whisper large-v3 on CPU

No streaming support needed — Fish Audio ASR is synchronous, like the existing `/transcribe` call. The transcript arrives in one response. The progress indicator can remain as a spinner.

---

## 8. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebM/Opus rejected by Fish Audio | Medium | High | Fallback: Web Audio API WAV conversion (pure JS) |
| `ignore_timestamps=false` returns no timestamps | Low | Low | Fall back to even distribution across full `duration` |
| Fish Audio API outage / 5xx | Medium | High | Clear error state with Retry button (D-05) |
| API key stolen from disk | Low | Medium | `safeStorage` OS encryption; key never crosses IPC as plaintext |
| Segment too coarse (10+ s segments) | Low | Medium | Word-click seek stays within segment; acceptable precision |
| safeStorage unavailable (Linux headless) | Low | Low | Fallback: store plaintext JSON in userData |

---

## 9. Implementation Order (suggested plan sequence)

1. **Plan 11-01:** Remove sidecar infrastructure (sidecar.ts, Python, model store, SidecarErrorDialog)
2. **Plan 11-02:** Add `apiKeyStore`, `api-key:*` IPC handlers, `safeStorage` — rewrite OnboardingView
3. **Plan 11-03:** Add `transcribe:run` IPC handler with word adapter — update `transcriptStore`
4. **Plan 11-04:** Update preload/env.d.ts types, AppStatusBar, App.vue routing

Each plan is independently committable and verifiable.

---

## 10. Open Questions (for discussion before planning)

1. **WebM support:** Test empirically against Fish Audio before committing to WAV conversion. A quick `curl` with a sample WebM file would answer this definitively.
2. **`ignore_timestamps` behaviour:** What exactly does Fish Audio return with `ignore_timestamps=false` vs `true`? The response schema is identical in the docs — only "latency" differs per the description. Worth testing if segments are finer-grained with `false`.
3. **AppStatusBar fate:** Remove entirely or repurpose to show Fish Audio connection status?
4. **Settings UI:** Should there be a persistent Settings panel (accessible from toolbar) to update the API key post-onboarding, or only accessible by clearing the key and restarting onboarding?
5. **Error UX for 402 (quota exceeded):** What message to show? Link to fish.audio account page?
