# Phase 18 Research: Switch to NVIDIA Parakeet TDT 0.6B v3

**Goal:** Replace `faster-whisper large-v3` (CTranslate2 backend) with `nvidia/parakeet-tdt-0.6b-v3` in the Python sidecar.

---

## 1. What is Parakeet TDT?

**TDT = Token-and-Duration Transducer.** A variant of RNN-T where each decoder step predicts *both* a token and its duration — enabling non-autoregressive, parallel decoding. Result: dramatically faster inference than Whisper (encoder-decoder) with competitive or better accuracy.

Key stats:
- **0.6B parameters** (same order as faster-whisper large-v3)
- **25 European languages** (vs Whisper's 100+) — auto-detected
- **Word-level + segment-level timestamps** built in
- **Punctuation and capitalization** included in output
- **CC BY 4.0 license**
- English WER: 6.34% avg (vs Whisper large-v3 ~7-8% on same benchmarks)
- Speed on CPU: ~18–30× real-time (vs faster-whisper ~4–13× real-time on CPU)

---

## 2. Integration Approaches Compared

| Approach | Deps | PyInstaller | Word timestamps | Audio formats | Mac arm64 |
|----------|------|-------------|-----------------|---------------|-----------|
| **NeMo toolkit** | PyTorch + NeMo (5GB+) | ❌ Impractical | ✅ Native | WAV/FLAC | Partial |
| **`onnx-asr`** (ONNX Runtime) | numpy + onnxruntime (~200MB) | ✅ Feasible | ✅ Token-level → words | WAV PCM | ✅ CoreML |

**Recommendation: `onnx-asr` with ONNX Runtime.**

---

## 3. `onnx-asr` — The Right Approach

### Library
- **Package:** `onnx-asr` on PyPI ([github.com/istupakov/onnx-asr](https://github.com/istupakov/onnx-asr))
- **Install:** `pip install onnx-asr[cpu,hub]`
- **Required deps only:** `numpy`, `onnxruntime`, `huggingface-hub` (optional)
- **NO PyTorch, NO NeMo, NO Transformers, NO FFmpeg required**

### Loading the Model

```python
import onnx_asr

# Loads from HuggingFace: istupakov/parakeet-tdt-0.6b-v3-onnx
model = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3")

# With timestamps (returns TimestampedResult per segment)
model_ts = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3").with_timestamps()

# INT8 quantized (fastest, same accuracy):
model_ts = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3", quantization="int8").with_timestamps()

# Load to local dir (skip re-download):
model_ts = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3", "path/to/model/dir").with_timestamps()
```

### Model Files (HuggingFace Repo)
- **FP32:** `istupakov/parakeet-tdt-0.6b-v3-onnx`
- **INT8:** available via `quantization="int8"` parameter (downloaded from same HF repo)

### Inference API

```python
result = model_ts.recognize("audio.wav")
# result.text      → str (full transcript with punctuation)
# result.tokens    → list[str] (SentencePiece tokens)
# result.timestamps → list[float] (per-token start time in seconds)
```

⚠️ **Timestamps are token-level, not word-level.** SentencePiece tokens use `▁` (U+2581) as a word-start marker. Must aggregate tokens into words.

### Aggregating Token Timestamps → Word Timestamps

```python
def tokens_to_words(tokens, timestamps):
    """Convert SentencePiece token timestamps to word-level timestamps."""
    words = []
    current_word = ""
    current_start = None
    
    for i, (token, ts) in enumerate(zip(tokens, timestamps)):
        # ▁ prefix means start of a new word
        if token.startswith("\u2581") or not current_word:
            if current_word:
                # Close previous word
                words.append({
                    "word": current_word,
                    "start": current_start,
                    "end": ts,  # this token's start = previous word's end
                })
            current_word = token.replace("\u2581", "").strip()
            current_start = ts
        else:
            current_word += token.strip()
    
    # Close last word
    if current_word:
        end = timestamps[-1] + 0.1 if timestamps else current_start + 0.1
        words.append({"word": current_word, "start": current_start, "end": end})
    
    return words
```

### Long Audio — VAD Required

onnx-asr's max chunk length is ~20–30 seconds. For longer recordings, use VAD:

```python
import onnx_asr

vad = onnx_asr.load_vad("silero")
model = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3").with_vad(vad).with_timestamps()

# Returns iterable of SegmentResult with per-chunk TimestampedResult
for segment in model.recognize("long_audio.wav"):
    print(segment.result.text, segment.start, segment.end)
```

`SegmentResult.start` and `.end` are the VAD-detected boundaries. Timestamps within each chunk's `TimestampedResult` are relative to the chunk — must add `segment.start` offset.

---

## 4. Audio Format Constraint (Critical)

**onnx-asr accepts WAV (PCM\_U8, PCM\_16, PCM\_24, PCM\_32) only — no WebM.**

The current sidecar receives WebM from the browser. Currently faster-whisper handles WebM natively via PyAV. With onnx-asr we must explicitly convert:

**Solution:** Convert WebM → 16kHz mono WAV using a subprocess ffmpeg call before passing to onnx-asr. The current code already writes to a temp file — just add a conversion step.

```python
import subprocess, tempfile
from pathlib import Path

def convert_to_wav(audio_path: Path) -> Path:
    """Convert any audio format to 16kHz mono WAV for onnx-asr."""
    wav_path = audio_path.with_suffix(".wav")
    subprocess.run([
        "ffmpeg", "-nostdin", "-y",
        "-i", str(audio_path),
        "-ac", "1", "-ar", "16000",
        str(wav_path),
    ], check=True, capture_output=True)
    return wav_path
```

**ffmpeg availability:** The Electron app ships ffmpeg for waveform rendering. Need to verify it's on PATH or pass the bundled ffmpeg path to the sidecar.

**Alternative (no ffmpeg):** Use `soundfile` + `av` (PyAV) to decode WebM to numpy array, then pass array directly:

```python
import av, numpy as np

def decode_audio(path: Path, target_sr: int = 16000) -> tuple[np.ndarray, int]:
    """Decode any audio file to float32 numpy array."""
    with av.open(str(path)) as container:
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=target_sr)
        samples = []
        for frame in container.decode(audio=0):
            for rf in resampler.resample(frame):
                samples.append(rf.to_ndarray()[0])
        resampler.resample(None)  # flush
    return np.concatenate(samples), target_sr
```

Then: `model.recognize(audio_array, sample_rate=16000)`

---

## 5. Language Detection

The official NeMo API exposes detected language. onnx-asr's `TimestampedResult` does **not** currently expose detected language directly. 

**Options:**
1. **Skip language detection** — hardcode `"und"` (undetermined) or `"auto"` in the API response. The app currently uses it for display only (not logic).
2. **Use NeMo API** for language + onnx-asr for timestamps (two passes — not worth it).
3. **Accept the limitation** — the model auto-detects internally but onnx-asr v1.x doesn't surface it.

Check `onnx-asr` changelog/issues for language detection support before implementation.

---

## 6. Mac arm64 / CoreML

onnx-asr supports **CoreML execution provider** on Apple Silicon:

```python
model = onnx_asr.load_model(
    "nemo-parakeet-tdt-0.6b-v3",
    providers=["CoreMLExecutionProvider", "CPUExecutionProvider"]
)
```

This could give GPU-accelerated inference on M-series Macs. Worth trying.

---

## 7. PyInstaller Packaging Changes

### Remove from `hiddenimports`:
- `faster_whisper` and all sub-modules
- `ctranslate2` and all sub-modules
- `tokenizers` and sub-modules
- `av` and sub-modules (if using ffmpeg approach)

### Remove from `datas`:
- `(_ct2_path, 'ctranslate2')` entry

### Add to `hiddenimports`:
```python
'onnx_asr',
'onnx_asr.models',
'onnx_asr.models.nemo',
'onnxruntime',
'onnxruntime.capi',
'onnxruntime.capi._pybind_state',
'scipy',          # for resampling (if used)
```

### Add to `datas` (if needed):
```python
(importlib_path('onnx_asr'), 'onnx_asr'),
```

### pyproject.toml changes:
```toml
# Remove:
faster-whisper = ">=1.1,<2.0"

# Add:
onnx-asr = { extras = ["cpu", "hub"], version = ">=0.5" }
# OR if using VAD:
onnx-asr = { extras = ["cpu", "hub", "vad"], version = ">=0.5" }
```

---

## 8. Model Manager Changes

The current `model_manager.py` downloads from `Systran/faster-whisper-large-v3`.

New download target: `istupakov/parakeet-tdt-0.6b-v3-onnx` (FP32) or the INT8 quantized variant.

**However:** onnx-asr's `load_model()` handles HuggingFace download natively when given a model name + path. The simplest approach is:

```python
# In model_manager.py — just store the model dir
# onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3", path=model_dir) 
# will download to model_dir automatically if not present
```

This may conflict with the current progress-reporting download flow. Options:
1. **Keep existing download flow** using `snapshot_download("istupakov/parakeet-tdt-0.6b-v3-onnx")` directly
2. **Let onnx-asr handle download** on first `load_model()` call — simpler but no progress

### New HF repo for download:
```python
MODEL_REPO = "istupakov/parakeet-tdt-0.6b-v3-onnx"
MODEL_MARKER = "model.onnx"  # or check for multiple ONNX files
```

---

## 9. New API Response Shape

Current shape (must preserve):
```json
{
  "words": [{"id": 0, "word": "Hello", "start": 0.0, "end": 0.3, "probability": 0.99, "segmentId": 0}],
  "segments": [{"id": 0, "start": 0.0, "end": 2.5, "text": "Hello world"}],
  "language": "en",
  "duration": 2.5
}
```

With onnx-asr:
- `words` → aggregated from token timestamps (see §3)
- `segments` → from VAD segments or single segment
- `language` → hardcoded `"und"` or not available
- `duration` → from audio file duration (soundfile or ffprobe)
- `probability` → not available; use `1.0` as placeholder

---

## 10. Implementation Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Token → word aggregation is wrong at edges | Medium | Test with multi-language recordings |
| WebM conversion requires ffmpeg on PATH | Medium | Use PyAV as fallback or bundle ffmpeg |
| Long audio VAD cuts mid-word | Low | VAD has configurable thresholds |
| Language not detected | Low | Acceptable for display-only field |
| onnx-asr INT8 has different quality | Low | Benchmarks show identical WER to FP32 |
| PyInstaller missing onnxruntime natives | Medium | Use `--collect-all onnxruntime` or explicit datas |
| CoreML provider unavailable on Intel Mac | Low | Falls back to CPU automatically |

---

## 11. Recommended Implementation Plan

1. **Update `pyproject.toml`**: swap `faster-whisper` → `onnx-asr[cpu,hub]`
2. **Update `model_manager.py`**: change `MODEL_REPO` to `istupakov/parakeet-tdt-0.6b-v3-onnx`, update `MODEL_MARKER`
3. **Rewrite `transcription.py`**:
   - Load model with `onnx_asr.load_model(..., path=model_dir).with_vad(vad).with_timestamps()`
   - Convert WebM → WAV before transcription (ffmpeg subprocess or PyAV)
   - Aggregate token timestamps into words
   - Return same JSON shape
4. **Update `amanuensis-sidecar.spec`**: swap ctranslate2/faster_whisper/av entries → onnxruntime/onnx_asr
5. **Test**: short clips (< 30s), long recordings (> 5min), non-English audio

---

## 12. Reference Code (Complete Transcription Service Sketch)

```python
"""
Transcription service using onnx-asr with Parakeet TDT 0.6B v3.
"""
from __future__ import annotations

import subprocess
import threading
from pathlib import Path
from typing import Optional

import onnx_asr

_model = None
_model_lock = threading.Lock()


def get_model(model_dir: Path):
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                vad = onnx_asr.load_vad("silero", str(model_dir / "silero-vad"))
                _model = (
                    onnx_asr.load_model(
                        "nemo-parakeet-tdt-0.6b-v3",
                        str(model_dir / "parakeet-tdt-v3"),
                        quantization="int8",
                    )
                    .with_vad(vad)
                    .with_timestamps()
                )
    return _model


def _convert_to_wav(audio_path: Path) -> Path:
    wav_path = audio_path.with_suffix(".wav")
    subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-i", str(audio_path),
         "-ac", "1", "-ar", "16000", str(wav_path)],
        check=True, capture_output=True,
    )
    return wav_path


def _tokens_to_words(tokens, timestamps, seg_id):
    words = []
    current_word = ""
    current_start = None
    word_id = 0

    for i, (token, ts) in enumerate(zip(tokens, timestamps)):
        is_word_start = token.startswith("\u2581") or not current_word
        if is_word_start and current_word:
            words.append({
                "id": word_id, "word": current_word,
                "start": round(current_start, 3), "end": round(ts, 3),
                "probability": 1.0, "segmentId": seg_id,
            })
            word_id += 1
        if is_word_start:
            current_word = token.replace("\u2581", "").strip()
            current_start = ts
        else:
            current_word += token

    if current_word and current_start is not None:
        end = round(timestamps[-1] + 0.1, 3) if timestamps else round(current_start + 0.1, 3)
        words.append({
            "id": word_id, "word": current_word,
            "start": round(current_start, 3), "end": end,
            "probability": 1.0, "segmentId": seg_id,
        })
    return words


def transcribe_file(model_dir: Path, audio_path: Path, device: str = "auto") -> dict:
    model = get_model(model_dir)

    # Convert WebM → WAV (onnx-asr needs PCM WAV)
    wav_path = _convert_to_wav(audio_path)
    try:
        all_words, all_segments = [], []
        seg_id = 0
        word_id_offset = 0

        for vad_segment in model.recognize(str(wav_path)):
            result = vad_segment.result
            seg_start = vad_segment.start
            seg_end = vad_segment.end

            seg_words = _tokens_to_words(result.tokens, result.timestamps, seg_id)
            # Apply VAD offset to timestamps
            for w in seg_words:
                w["start"] = round(w["start"] + seg_start, 3)
                w["end"] = round(w["end"] + seg_start, 3)
                w["id"] += word_id_offset
            word_id_offset += len(seg_words)
            all_words.extend(seg_words)

            all_segments.append({
                "id": seg_id,
                "start": round(seg_start, 3),
                "end": round(seg_end, 3),
                "text": result.text.strip(),
            })
            seg_id += 1

        # Get duration from file
        import soundfile as sf
        info = sf.info(str(wav_path))
        duration = round(info.duration, 2)

        return {
            "words": all_words,
            "segments": all_segments,
            "language": "und",   # onnx-asr doesn't expose detected language
            "duration": duration,
        }
    finally:
        if wav_path != audio_path and wav_path.exists():
            wav_path.unlink(missing_ok=True)
```

---

## 13. Open Questions for Planning

1. **Language field**: Is `"und"` acceptable, or does the frontend display it? Check `src/renderer/src/stores/transcript.ts`.
2. **ffmpeg path**: Is ffmpeg bundled with the app, or available on PATH in the packaged sidecar?
3. **Model size**: The ONNX model (`istupakov/parakeet-tdt-0.6b-v3-onnx`) is ~1.2GB FP32, ~600MB INT8. Compare to faster-whisper large-v3 (~3GB). Smaller!
4. **`soundfile` dependency**: Need for duration + audio reading. Add to `pyproject.toml`.
5. **VAD model**: Silero VAD is a separate ~1MB ONNX model, also downloaded from HuggingFace.
6. **Fallback**: Keep faster-whisper as a fallback option? Or clean cut?
