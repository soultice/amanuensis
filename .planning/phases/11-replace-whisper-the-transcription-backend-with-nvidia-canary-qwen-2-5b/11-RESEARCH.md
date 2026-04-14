# Phase 11 Research: Replace Transcription Backend with NVIDIA Canary-Qwen-2.5B

**Date:** 2026-04-14  
**Researcher:** pi  
**Status:** RESEARCH COMPLETE

---

## Executive Summary

**⚠️ Three hard blockers prevent a drop-in replacement of faster-whisper with Canary-Qwen-2.5B for this app as-is.** The model is technically excellent for English ASR, but it (1) does not produce word-level timestamps, (2) does not run on macOS/Apple Silicon, and (3) introduces a 5 GB+ NeMo dependency stack incompatible with the current PyInstaller packaging strategy. The research below details both the blockers and two viable paths forward.

---

## 1. What is NVIDIA Canary-Qwen-2.5B?

| Property | Value |
|---|---|
| Architecture | SALM (Speech-Augmented Language Model) — FastConformer encoder + Qwen3-1.7B LLM decoder |
| Parameters | 2.5 billion |
| Model file size | **5.12 GB** (`model.safetensors`) |
| RTFx (speed) | 418× real-time (NVIDIA A100) |
| WER (mean, OpenASR leaderboard) | **5.63%** (vs Whisper large-v3 ~7.4%) |
| Languages | **English only** |
| Max audio length | **40 seconds** per call |
| Input format | WAV or FLAC, 16 kHz, mono |
| Output | Text transcript (punctuated, capitalised) |
| Word timestamps | ❌ **Not supported** |
| License | CC-BY-4.0 |
| Framework | NVIDIA NeMo 2.5.0+ (requires CUDA) |

**Primary API (ASR mode):**
```python
from nemo.collections.speechlm2.models import SALM

model = SALM.from_pretrained('nvidia/canary-qwen-2.5b')
answer_ids = model.generate(
    prompts=[[{
        "role": "user",
        "content": f"Transcribe the following: {model.audio_locator_tag}",
        "audio": ["speech.wav"]
    }]],
    max_new_tokens=128,
)
text = model.tokenizer.ids_to_text(answer_ids[0].cpu())
```

---

## 2. Hard Blockers

### 2.1 No Word-Level Timestamps ❌ CRITICAL

The app's core UX — click-to-seek, waveform annotation anchoring — requires per-word `start`/`end` timestamps. Canary-Qwen-2.5B **cannot produce them**:

- The `generate()` API returns only token IDs, no timing data
- Canary-Qwen uses an AED (Attention Encoder-Decoder) decoder; NeMo's `timestamps=True` flag is only supported for CTC and TDT models (parakeet family), **not AED/SALM**
- The HuggingFace model discussions confirm: when asked about `"timestamp": "yes"`, the NVIDIA team replied simply **"No"**
- A May 2025 NVIDIA research paper (arXiv:2505.15646) proposes a data-driven timestamp training approach for Canary models, but this is research, not shipped in canary-qwen-2.5b

**Workaround:** Run NeMo Forced Aligner (NFA) as a second pass on the Canary transcript — but NFA also requires CUDA, doubles inference time, and is a 400 MB+ additional dependency.

### 2.2 No macOS / Apple Silicon Support ❌ CRITICAL

NeMo requires NVIDIA CUDA. The current app targets macOS ARM64 (Apple Silicon) as primary platform:

- `nemo_toolkit` installs PyTorch with CUDA dependency; MPS (Metal) is **not supported** by NeMo's transformer attention paths
- The NeMo `SALM` model class uses `torch.cuda` directly in several code paths
- No official macOS builds or workaround exist for `nemo_toolkit[asr]` as of April 2026

### 2.3 Maximum 40-Second Audio Duration ❌ SIGNIFICANT

Canary-Qwen-2.5B was trained with a max 40s audio clip. The app records open-ended interviews and meetings — typically 5–30 minutes. Chunking is required:

- No built-in chunked/streaming inference in the SALM API
- Chunking without overlap causes sentence-boundary errors; overlap stitching is non-trivial
- The GitHub issue [#14313 — "ASR chunked inference with canary-qwen-2.5b?"](https://github.com/NVIDIA-NeMo/NeMo/issues/14313) was closed as `not_planned`

### 2.4 Packaging Complexity ❌ SIGNIFICANT

Phase 10 (Packaging & Distribution) targets PyInstaller-bundled sidecar with no external runtimes:

- `nemo_toolkit[asr]` installs ~3 GB of wheels (including `torch`, `pytorch-lightning`, `hydra-core`, CUDA libs, NLP tokenisers…)
- PyInstaller does not reliably bundle NeMo's dynamic imports, Hydra configs, or HF model downloads
- Current `faster-whisper` + `huggingface-hub` stack is ~400 MB frozen

---

## 3. Implementation Approaches (if proceeding)

### Approach A: Canary-Qwen-2.5B + NFA timestamps (CUDA Linux only)

Only viable on a machine with an NVIDIA GPU running Linux.

**Architecture change:**
```
                    ┌──────────────────────────────┐
WebM audio ──WAV──► │ Canary-Qwen-2.5B (SALM)      │ ──► raw text
                    └──────────────────────────────┘
                    ┌──────────────────────────────┐
WAV audio  ──────► │ NeMo Forced Aligner (NFA)     │ ──► word timestamps
                    └──────────────────────────────┘
                              │ merge
                              ▼
                    word-level transcript (word + start + end)
```

**Required changes in `sidecar/`:**
1. `pyproject.toml` — add `nemo-toolkit[asr] @ git+https://github.com/NVIDIA/NeMo.git` and `nemo-forced-aligner`
2. `services/model_manager.py` — rewrite to load SALM model + NFA model separately (two HF repos)
3. `services/transcription.py` — rewrite to: 
   - Convert WebM→WAV→16kHz mono (ffmpeg or `soundfile`)
   - Chunk audio into ≤35s segments with 2s overlap
   - Run `model.generate()` per chunk, collect text
   - Run NFA on each chunk to get word timestamps
   - Stitch chunks: offset timestamps by chunk start time, deduplicate overlap words
4. `routes/transcribe.py` — no changes needed
5. `app/state.py` — add `nfa_model` singleton

**Known unknowns:**
- Chunk-stitch timestamp accuracy at boundaries
- NFA accuracy on Canary transcripts vs original audio alignment
- Memory: SALM (2.5B) + NFA simultaneously could require 16+ GB VRAM

### Approach B: parakeet-tdt-0.6b-v2 (recommended NeMo alternative)

If the goal is "better accuracy than Whisper with word timestamps", NVIDIA's **parakeet-tdt-0.6b-v2** is a superior fit for this app:

| Property | parakeet-tdt-0.6b-v2 | canary-qwen-2.5b |
|---|---|---|
| Word timestamps | ✅ Native (`timestamps=True`) | ❌ None |
| macOS MPS | ⚠️ Partial (NeMo installs, MPS inference untested) | ❌ No |
| Model size | ~1.2 GB | 5.12 GB |
| WER (mean, OpenASR) | 6.32% | 5.63% |
| Audio duration limit | None (streaming/buffered) | 40s |
| Framework | NeMo (CTC/TDT) | NeMo (SALM) |

```python
import nemo.collections.asr as nemo_asr

model = nemo_asr.models.ASRModel.from_pretrained("nvidia/parakeet-tdt-0.6b-v2")
hypotheses = model.transcribe(["audio.wav"], timestamps=True)
word_timestamps = hypotheses[0].timestamp['word']
# [{"word": "hello", "start": 0.24, "end": 0.56}, ...]
```

Still requires NeMo and CUDA for full performance, but:
- The timestamp problem is solved natively
- No chunking required for long audio
- 4× smaller model

---

## 4. Alternative: Stay with faster-whisper, Upgrade Model

If macOS support and packaging simplicity must be preserved, the fastest path to accuracy improvement is upgrading the current Whisper model:

| Model | WER (mean) | Speed | Size | macOS ARM |
|---|---|---|---|---|
| faster-whisper large-v3 (current) | 7.44% | ~60× | 1.5 GB | ✅ |
| faster-whisper large-v3-turbo | ~7.5% | ~120× | 800 MB | ✅ |
| mlx-whisper large-v3 (Apple MLX) | 7.44% | ~200× on M-series | 1.5 GB | ✅ Native |
| parakeet-tdt-0.6b-v2 (NeMo) | 6.32% | 600× (CUDA) | 1.2 GB | ⚠️ CUDA |
| canary-qwen-2.5b (NeMo) | 5.63% | 418× (CUDA) | 5.12 GB | ❌ |

**mlx-whisper** is worth investigating as an easy macOS win: same Whisper model, runs natively on Apple Neural Engine, no CUDA, word timestamps preserved, drop-in faster-whisper replacement for macOS-only builds.

---

## 5. Recommendation

| Scenario | Recommendation |
|---|---|
| App stays macOS-only, keep packaging easy | **Do not replace with Canary-Qwen-2.5B.** Consider `mlx-whisper` for macOS speed, or `faster-whisper large-v3-turbo` for smaller download. |
| App targets CUDA Linux server / NVIDIA machine | Use **parakeet-tdt-0.6b-v2** — native timestamps, smaller, no chunking — rather than Canary-Qwen-2.5B |
| Absolute best accuracy regardless of constraints | Canary-Qwen-2.5B via Approach A above, but budget significant engineering time for the timestamp/chunking/packaging problems |

**Recommended Phase 11 scope revision:** Replace the phase goal with a more precise target:

> *Evaluate and integrate an alternative ASR backend that improves on Whisper large-v3's accuracy for English, while preserving word-level timestamps, macOS ARM64 support, and PyInstaller packagability. Canary-Qwen-2.5B is NOT compatible with these constraints; evaluate `mlx-whisper` and/or `parakeet-tdt-0.6b-v2` instead.*

---

## 6. Key Files to Modify (for any backend swap)

| File | Role | Change required |
|---|---|---|
| `sidecar/pyproject.toml` | Dependencies | Replace `faster-whisper`, add new backend |
| `sidecar/app/services/transcription.py` | Core inference | Full rewrite per backend API |
| `sidecar/app/services/model_manager.py` | Download/cache | New repo ID, model marker filename, download method |
| `sidecar/app/routes/transcribe.py` | HTTP endpoint | No structural change; verify response format compatibility |
| `sidecar/app/state.py` | Singletons | Model type annotation |
| `sidecar/amanuensis-sidecar.spec` | PyInstaller spec | Add new hidden imports, data files |

**Response shape must remain identical:**
```json
{
  "words": [{"id": 0, "word": "Hello", "start": 0.24, "end": 0.56, "probability": 0.98}],
  "segments": [...],
  "language": "en",
  "duration": 12.34
}
```

---

## 7. Open Questions for Planning

1. **What hardware does the target user have?** If macOS only → Canary-Qwen-2.5B is a no-go.
2. **Is accuracy improvement the primary goal, or speed?** Canary is more accurate; mlx-whisper is faster on Apple Silicon.
3. **Is "Canary" the name of a model family or specifically Canary-Qwen-2.5B?** `nvidia/canary-1b-flash` does support timestamps (with `"timestamp": "yes"` in its generation prompt) and runs on more modest hardware — worth checking.
4. **Acceptable model download size?** 5 GB on first launch vs current 1.5 GB.
5. **Long-form audio?** Canary's 40s limit needs a chunking strategy.

---

## References

- [nvidia/canary-qwen-2.5b on HuggingFace](https://huggingface.co/nvidia/canary-qwen-2.5b)
- [HF discussion: "How to get timestamps" → "No"](https://huggingface.co/nvidia/canary-qwen-2.5b/discussions/4)
- [arXiv:2505.15646 — Word-Level Timestamp Generation for Canary (research)](https://arxiv.org/pdf/2505.15646)
- [nvidia/parakeet-tdt-0.6b-v2 on HuggingFace](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2)
- [NeMo ASR docs — timestamps=True for TDT models](https://docs.nvidia.com/nemo-framework/user-guide/25.07/nemotoolkit/asr/intro.html)
- [GitHub issue: chunked inference not planned for Canary-Qwen](https://github.com/NVIDIA-NeMo/NeMo/issues/14313)
- [Parakeet v3 vs Whisper benchmark on Apple Silicon](https://whispernotes.app/blog/parakeet-v3-default-mac-model)
