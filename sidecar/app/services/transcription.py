"""
Transcription service using NVIDIA Parakeet ONNX via onnx-asr.
Model is loaded once and cached as a module-level singleton.
"""
from __future__ import annotations

import subprocess
import sys
import threading
import time
import wave
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Optional

_model: Optional[Any] = None
_model_cache_key: tuple[str, str, tuple[tuple[str, tuple[str, ...], str | None], ...]] | None = None
_model_lock = threading.Lock()
_runtime_metadata: dict[str, Any] | None = None


def _is_punctuation_token(token: str) -> bool:
    return bool(token) and all(ch in ".,!?;:" for ch in token)


def _apply_word_spacing(words: list[dict]) -> list[dict]:
    """Normalize word text so join('') keeps readable spacing."""
    for idx, word in enumerate(words):
        token = str(word.get("word", "")).strip()
        if not token:
            word["word"] = ""
            continue

        if idx == 0 or _is_punctuation_token(token):
            word["word"] = token
        else:
            word["word"] = f" {token}"

    return words


def _resolve_ffmpeg_binary() -> str:
    """Resolve ffmpeg executable from environment (default: ffmpeg)."""
    return "ffmpeg"


def _tokens_to_words(tokens: list[str], timestamps: list[float], segment_id: int, word_id_start: int) -> list[dict]:
    """Aggregate token timestamps to word-level timestamps.

    Supports both SentencePiece-style tokens (▁word) and BPE-style tokens where
    a leading space marks a new word (e.g. " A", "ch", ",", " keine").
    """
    words: list[dict] = []
    word_id = word_id_start

    if not tokens:
        return words

    current_word = ""
    current_start: Optional[float] = None

    for token, ts in zip(tokens, timestamps):
        raw = str(token)
        stripped = raw.strip()
        if not stripped:
            continue

        is_punctuation = _is_punctuation_token(stripped)
        starts_new_word = raw.startswith(" ") or stripped.startswith("▁")

        if is_punctuation:
            if current_word:
                current_word += stripped
            elif words:
                words[-1]["word"] = f"{words[-1]['word']}{stripped}"
                words[-1]["end"] = round(float(ts), 3)
            continue

        clean = stripped.replace("▁", "", 1).strip() if stripped.startswith("▁") else stripped

        if not current_word:
            current_word = clean
            current_start = float(ts)
            continue

        if starts_new_word:
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
            current_word = clean
            current_start = float(ts)
        else:
            current_word += clean

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

    return _apply_word_spacing(words)


def get_available_execution_providers() -> list[str]:
    try:
        import onnxruntime as ort  # type: ignore

        providers = [str(p) for p in ort.get_available_providers()]
        return providers or ['CPUExecutionProvider']
    except Exception:
        return ['CPUExecutionProvider']


def _runtime_candidate(provider: str, provider_order: list[str], quantization: str | None = None) -> dict[str, Any]:
    return {
        'runtimeProvider': provider,
        'providerOrder': provider_order,
        'quantization': quantization,
    }


def resolve_execution_candidates(device: str = 'auto') -> list[dict[str, Any]]:
    requested = (device or 'auto').strip().lower() or 'auto'
    available = get_available_execution_providers()
    candidates: list[dict[str, Any]] = []
    seen: set[tuple[str, tuple[str, ...], str | None]] = set()

    # Phase 26 follow-up: disable CoreML auto-selection on macOS for Parakeet.
    # In real recordings it can emit repeated CoreML partitioning warnings and
    # `Context leak detected, CoreAnalytics returned false`, while also adding
    # noticeable live-transcription delay. The app's public device contract is
    # only auto/cpu/cuda, so prefer the stable CPU path on macOS until CoreML
    # proves production-safe for this model family.

    def add(provider: str, provider_order: list[str], quantization: str | None = None) -> None:
        key = (provider, tuple(provider_order), quantization)
        if key in seen:
            return
        seen.add(key)
        candidates.append(_runtime_candidate(provider, provider_order, quantization))

    if requested == 'cpu':
        add('CPUExecutionProvider', ['CPUExecutionProvider'])
        return candidates

    if requested == 'cuda':
        if 'CUDAExecutionProvider' in available:
            add('CUDAExecutionProvider', ['CUDAExecutionProvider', 'CPUExecutionProvider'])
        add('CPUExecutionProvider', ['CPUExecutionProvider'])
        return candidates

    if 'CUDAExecutionProvider' in available:
        add('CUDAExecutionProvider', ['CUDAExecutionProvider', 'CPUExecutionProvider'])

    if 'DmlExecutionProvider' in available:
        add('DmlExecutionProvider', ['DmlExecutionProvider', 'CPUExecutionProvider'])

    add('CPUExecutionProvider', ['CPUExecutionProvider'])
    return candidates


def resolve_execution_provider_order(device: str = 'auto') -> tuple[str, list[str]]:
    candidate = resolve_execution_candidates(device)[0]
    return str(candidate['runtimeProvider']), list(candidate['providerOrder'])


def _runtime_metadata_from_candidate(
    device: str,
    candidate: dict[str, Any],
    *,
    warning: str | None = None,
    fallback_used: bool = False,
) -> dict[str, Any]:
    return {
        'deviceMode': (device or 'auto').strip().lower() or 'auto',
        'runtimeProvider': str(candidate['runtimeProvider']),
        'availableProviders': get_available_execution_providers(),
        'providerOrder': list(candidate['providerOrder']),
        'runtimeQuantization': candidate.get('quantization') or 'default',
        'runtimeFallbackUsed': fallback_used,
        'runtimeWarning': warning,
    }


def describe_runtime_provider(device: str = 'auto') -> dict[str, Any]:
    requested = (device or 'auto').strip().lower() or 'auto'
    if _runtime_metadata is not None and _runtime_metadata.get('deviceMode') == requested:
        return dict(_runtime_metadata)
    return _runtime_metadata_from_candidate(requested, resolve_execution_candidates(requested)[0])


def _model_cache_candidates_key(candidates: list[dict[str, Any]]) -> tuple[tuple[str, tuple[str, ...], str | None], ...]:
    return tuple(
        (
            str(candidate['runtimeProvider']),
            tuple(str(provider) for provider in candidate['providerOrder']),
            candidate.get('quantization'),
        )
        for candidate in candidates
    )


def get_model(model_dir: Path, device: str = 'auto') -> Any:
    """Load ONNX model once and cache it per model dir and runtime candidate set."""
    global _model, _model_cache_key, _runtime_metadata
    requested = (device or 'auto').strip().lower() or 'auto'
    candidates = resolve_execution_candidates(requested)
    cache_key = (str(model_dir.resolve()), requested, _model_cache_candidates_key(candidates))

    if _model is None or _model_cache_key != cache_key:
        with _model_lock:
            if _model is None or _model_cache_key != cache_key:
                import onnx_asr  # type: ignore

                resolved_dir = model_dir.resolve()

                required_files = [
                    'encoder-model.onnx',
                    'encoder-model.onnx.data',
                    'decoder_joint-model.onnx',
                    'vocab.txt',
                ]
                missing = [name for name in required_files if not (resolved_dir / name).exists()]
                if missing:
                    raise FileNotFoundError(
                        f"ASR model directory is missing required files: {missing} (dir={resolved_dir})"
                    )

                failures: list[tuple[dict[str, Any], Exception]] = []
                loaded_model: Any | None = None
                selected_candidate: dict[str, Any] | None = None

                for candidate in candidates:
                    try:
                        loaded = onnx_asr.load_model(
                            'nemo-parakeet-tdt-0.6b-v3',
                            str(resolved_dir),
                            quantization=candidate.get('quantization'),
                            providers=list(candidate['providerOrder']),
                        )
                        if hasattr(loaded, 'with_timestamps'):
                            loaded = loaded.with_timestamps()
                        loaded_model = loaded
                        selected_candidate = candidate
                        break
                    except Exception as exc:
                        failures.append((candidate, exc))

                if loaded_model is None or selected_candidate is None:
                    formatted_failures = '; '.join(
                        (
                            f"providers={candidate['providerOrder']} quantization={candidate.get('quantization') or 'default'}: {exc}"
                        )
                        for candidate, exc in failures
                    )
                    raise RuntimeError(
                        f"Failed to load ASR model from {resolved_dir} after trying all runtimes: {formatted_failures}"
                    )

                warning: str | None = None
                if failures:
                    attempted = failures[0][0]
                    warning = (
                        f"{attempted['runtimeProvider']} ({attempted.get('quantization') or 'default'}) "
                        f"was unavailable for Parakeet on this machine; using {selected_candidate['runtimeProvider']} "
                        f"({selected_candidate.get('quantization') or 'default'}) instead."
                    )

                _model = loaded_model
                _model_cache_key = cache_key
                _runtime_metadata = _runtime_metadata_from_candidate(
                    requested,
                    selected_candidate,
                    warning=warning,
                    fallback_used=bool(failures),
                )
    return _model


def warm_model_for_live(model_dir: Path, device: str = 'auto') -> dict[str, Any]:
    started = time.perf_counter()
    get_model(model_dir, device=device)
    metadata = describe_runtime_provider(device)
    metadata['warmupMs'] = round((time.perf_counter() - started) * 1000, 2)
    return metadata


def decode_webm_to_pcm(audio_path: Path) -> tuple[bytes, int]:
    ffmpeg_bin = _resolve_ffmpeg_binary()
    proc = subprocess.run(
        [
            ffmpeg_bin,
            '-nostdin',
            '-y',
            '-i',
            str(audio_path),
            '-f',
            's16le',
            '-ac',
            '1',
            '-ar',
            '16000',
            'pipe:1',
        ],
        capture_output=True,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or b'').decode(errors='ignore').strip()
        raise RuntimeError(f'ffmpeg conversion failed: {stderr or proc.returncode}')
    return proc.stdout, 16000


def write_pcm_to_wav(pcm_bytes: bytes, sample_rate: int, wav_path: Path) -> None:
    with wave.open(str(wav_path), 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)


def _recognition_result_to_contract(result: Any, *, duration: float) -> dict:
    text = str(getattr(result, 'text', '')).strip()
    tokens = [str(t) for t in (getattr(result, 'tokens', []) or [])]
    timestamps = [float(t) for t in (getattr(result, 'timestamps', []) or [])]

    words = _tokens_to_words(tokens, timestamps, segment_id=0, word_id_start=0)
    segment_end = round(float(words[-1]['end']), 3) if words else duration
    segments = [
        {
            'id': 0,
            'start': 0.0,
            'end': segment_end,
            'text': text,
        }
    ]

    return {
        'words': words,
        'segments': segments,
        'language': '',
        'duration': duration,
    }


def transcribe_wav_file(model_dir: Path, wav_path: Path, device: str = 'auto') -> dict:
    model = get_model(model_dir, device=device)
    result = model.recognize(str(wav_path))

    with wave.open(str(wav_path), 'rb') as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        duration = round(float(frames) / float(rate), 2) if rate else 0.0

    return _recognition_result_to_contract(result, duration=duration)


def transcribe_pcm_bytes(model_dir: Path, pcm_bytes: bytes, sample_rate: int, device: str = 'auto') -> dict:
    if sample_rate <= 0:
        raise ValueError(f'PCM sample rate must be positive, got {sample_rate}')
    if not pcm_bytes:
        return _recognition_result_to_contract(type('RecognitionResult', (), {'text': '', 'tokens': [], 'timestamps': []})(), duration=0.0)

    import numpy as np  # type: ignore

    model = get_model(model_dir, device=device)
    waveform = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
    result = model.recognize(waveform, sample_rate=sample_rate)
    duration = round(len(pcm_bytes) / float(sample_rate * 2), 2)
    return _recognition_result_to_contract(result, duration=duration)


def transcribe_file(model_dir: Path, audio_path: Path, device: str = 'auto') -> dict:
    """Transcribe a single audio file and return word/segment timestamps."""
    pcm_bytes, sample_rate = decode_webm_to_pcm(audio_path)
    with NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        wav_path = Path(tmp.name)

    try:
        write_pcm_to_wav(pcm_bytes, sample_rate, wav_path)
        return transcribe_wav_file(model_dir, wav_path, device=device)
    finally:
        wav_path.unlink(missing_ok=True)
