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


def get_model(model_dir: Path) -> "WhisperModel":
    """
    Load WhisperModel once and cache it.
    Thread-safe double-checked locking pattern.
    """
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel  # type: ignore

                _model = WhisperModel(
                    str(model_dir),
                    device="auto",        # GPU if CUDA available, else CPU
                    compute_type="auto",  # fp16 on GPU, int8 on CPU
                    num_workers=1,
                )
    return _model


def transcribe_file(model_dir: Path, audio_path: Path) -> dict:
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
    model = get_model(model_dir)

    segments, info = model.transcribe(
        str(audio_path),
        word_timestamps=True,
        language=None,      # auto-detect (TRANS-02)
        beam_size=5,
        vad_filter=True,    # skip silence regions
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

    return {
        "words": words,
        "language": info.language,
        "duration": round(info.duration, 2),
    }
