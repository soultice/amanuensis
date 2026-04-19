"""Module-level singletons shared across routes."""
from __future__ import annotations

import threading
import time
from typing import Any, Optional

from app.services.live_transcription import LiveTranscriptionManager
from app.services.model_manager import ModelManager

model_manager: Optional[ModelManager] = None

# Compute device hint for ASR runtime: "auto" | "cuda" | "cpu" (set at startup)
transcription_device: str = "auto"

# Transcription state — updated by the transcribe route
transcription_status: dict = {"state": "idle", "progress": 0, "error": None}

# Live transcription manager and status
live_transcription_manager: Optional[LiveTranscriptionManager] = None

_live_warm_lock = threading.Lock()
live_warm_status: dict[str, Any] = {
    'state': 'idle',
    'trigger': None,
    'startedAt': None,
    'updatedAt': None,
    'warmupMs': None,
    'error': None,
    'runtimeProvider': None,
    'runtimeQuantization': None,
}


def _timestamp() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def get_live_warm_status() -> dict[str, Any]:
    with _live_warm_lock:
        return dict(live_warm_status)


def begin_live_warmup(trigger: str) -> bool:
    with _live_warm_lock:
        if live_warm_status['state'] == 'warming':
            return False
        if live_warm_status['state'] == 'warm':
            return False
        live_warm_status.update(
            {
                'state': 'warming',
                'trigger': trigger,
                'startedAt': _timestamp(),
                'updatedAt': _timestamp(),
                'warmupMs': None,
                'error': None,
            }
        )
        return True


def finish_live_warmup(*, trigger: str, metadata: dict[str, Any]) -> None:
    with _live_warm_lock:
        live_warm_status.update(
            {
                'state': 'warm',
                'trigger': trigger,
                'updatedAt': _timestamp(),
                'warmupMs': metadata.get('warmupMs'),
                'error': None,
                'runtimeProvider': metadata.get('runtimeProvider'),
                'runtimeQuantization': metadata.get('runtimeQuantization'),
            }
        )


def fail_live_warmup(*, trigger: str, error: str) -> None:
    with _live_warm_lock:
        live_warm_status.update(
            {
                'state': 'failed',
                'trigger': trigger,
                'updatedAt': _timestamp(),
                'error': error,
            }
        )


def skip_live_warmup(*, trigger: str, reason: str) -> None:
    with _live_warm_lock:
        if live_warm_status['state'] == 'warm':
            return
        live_warm_status.update(
            {
                'state': 'skipped',
                'trigger': trigger,
                'updatedAt': _timestamp(),
                'error': reason,
            }
        )
