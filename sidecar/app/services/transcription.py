"""
Transcription service using NVIDIA Parakeet ONNX via onnx-asr.
Model is loaded once and cached as a module-level singleton.
"""
from __future__ import annotations

import subprocess
import threading
import wave
from pathlib import Path
from typing import Any, Optional

_model: Optional[Any] = None
_model_lock = threading.Lock()


def _resolve_ffmpeg_binary() -> str:
    """Resolve ffmpeg executable from environment (default: ffmpeg)."""
    return "ffmpeg"


def _convert_to_wav(audio_path: Path) -> Path:
    """Convert uploaded audio (e.g., WebM/Opus) to 16kHz mono WAV for onnx-asr."""
    wav_path = audio_path.with_suffix(".wav")
    ffmpeg_bin = _resolve_ffmpeg_binary()
    proc = subprocess.run(
        [
            ffmpeg_bin,
            "-nostdin",
            "-y",
            "-i",
            str(audio_path),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(wav_path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        raise RuntimeError(f"ffmpeg conversion failed: {stderr or proc.returncode}")
    return wav_path


def _tokens_to_words(tokens: list[str], timestamps: list[float], segment_id: int, word_id_start: int) -> list[dict]:
    """Aggregate SentencePiece token timestamps to word-level timestamps."""
    words: list[dict] = []
    current_word = ""
    current_start: Optional[float] = None
    word_id = word_id_start

    for idx, (token, ts) in enumerate(zip(tokens, timestamps)):
        normalized = token.strip()
        starts_new_word = normalized.startswith("▁") or not current_word

        if starts_new_word and current_word:
            words.append(
                {
                    "id": word_id,
                    "word": current_word,
                    "start": round(float(current_start or 0.0), 3),
                    "end": round(float(ts), 3),
                    "probability": 1.0,
                    "segmentId": segment_id,
                }
            )
            word_id += 1

        if starts_new_word:
            clean = normalized.replace("▁", "", 1).strip()
            current_word = clean
            current_start = float(ts)
        else:
            current_word += normalized

    if current_word and current_start is not None:
        end_ts = float(timestamps[-1]) + 0.1 if timestamps else float(current_start) + 0.1
        words.append(
            {
                "id": word_id,
                "word": current_word,
                "start": round(float(current_start), 3),
                "end": round(end_ts, 3),
                "probability": 1.0,
                "segmentId": segment_id,
            }
        )

    return words


def _providers_for_device(device: str) -> list[str]:
    # Avoid onnxruntime default provider auto-selection (CoreML can fail for this model on macOS).
    if device == "cuda":
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


def get_model(model_dir: Path, device: str = "auto") -> Any:
    """Load ONNX model once and cache it."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                import onnx_asr  # type: ignore

                loaded = onnx_asr.load_model(
                    "nemo-parakeet-tdt-0.6b-v3",
                    str(model_dir),
                    providers=_providers_for_device(device),
                )
                if hasattr(loaded, "with_timestamps"):
                    loaded = loaded.with_timestamps()
                _model = loaded
    return _model


def transcribe_file(model_dir: Path, audio_path: Path, device: str = "auto") -> dict:
    """Transcribe a single audio file and return word/segment timestamps."""
    model = get_model(model_dir, device=device)

    wav_path = _convert_to_wav(audio_path)
    try:
        result = model.recognize(str(wav_path))

        text = str(getattr(result, "text", "")).strip()
        tokens = [str(t) for t in (getattr(result, "tokens", []) or [])]
        timestamps = [float(t) for t in (getattr(result, "timestamps", []) or [])]

        words = _tokens_to_words(tokens, timestamps, segment_id=0, word_id_start=0)

        with wave.open(str(wav_path), "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            duration = round(float(frames) / float(rate), 2) if rate else 0.0

        segment_end = round(float(words[-1]["end"]), 3) if words else duration
        segments = [
            {
                "id": 0,
                "start": 0.0,
                "end": segment_end,
                "text": text,
            }
        ]

        return {
            "words": words,
            "segments": segments,
            "language": "",
            "duration": duration,
        }
    finally:
        wav_path.unlink(missing_ok=True)
