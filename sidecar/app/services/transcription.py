"""
Transcription service using faster-whisper large-v3.
WhisperModel is loaded once and cached as a module-level singleton.
Subsequent calls to get_model() return the cached model instantly.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from faster_whisper import WhisperModel  # type: ignore

_model: Optional["WhisperModel"] = None
_model_lock = threading.Lock()


def _compute_type_for_device(device: str) -> str:
    """Return the best CTranslate2 compute_type for the chosen device.

    - cuda  → float16  (full GPU precision; ~2× faster than int8 on CUDA)
    - cpu   → int8     (quantised; fastest on CPU)
    - auto  → auto     (let CTranslate2 decide; falls back gracefully)
    """
    return {"cuda": "float16", "cpu": "int8"}.get(device, "auto")


def get_model(model_dir: Path, device: str = "auto") -> "WhisperModel":
    """
    Load WhisperModel once and cache it.
    Thread-safe double-checked locking pattern.
    """
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel  # type: ignore

                compute_type = _compute_type_for_device(device)
                _model = WhisperModel(
                    str(model_dir),
                    device=device,         # "auto" | "cuda" | "cpu"
                    compute_type=compute_type,
                    num_workers=1,
                )
    return _model


def transcribe_file(model_dir: Path, audio_path: Path, device: str = "auto") -> dict:
    """
    Transcribe a single audio file and return word-level results.

    Accepts WebM, WAV, or any format supported by PyAV (av 17+) —
    faster-whisper uses decode_audio internally which handles WebM/Opus natively.

    Returns:
        {
            "words": [{"id": int, "word": str, "start": float, "end": float, "probability": float}],
            "language": str,
            "duration": float
        }
    """
    model = get_model(model_dir, device=device)

    segments_result, info = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        language=None,      # auto-detect (TRANS-02)
        beam_size=5,
        vad_filter=True,    # skip silence regions
    )

    segments_list = []
    words = []
    word_id = 0
    for seg_idx, segment in enumerate(segments_result):
        segments_list.append({
            "id": seg_idx,
            "start": round(segment.start, 3),
            "end": round(segment.end, 3),
            "text": segment.text.strip(),
        })
        if segment.words:
            for w in segment.words:
                words.append({
                    "id": word_id,
                    "word": w.word,
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "probability": round(w.probability, 3),
                    "segmentId": seg_idx,
                })
                word_id += 1

    return {
        "words": words,
        "segments": segments_list,
        "language": info.language,
        "duration": round(info.duration, 2),
    }
