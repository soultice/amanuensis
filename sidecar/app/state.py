"""Module-level singletons shared across routes."""
from typing import Optional
from app.services.model_manager import ModelManager
from app.services.live_transcription import LiveTranscriptionManager

model_manager: Optional[ModelManager] = None

# Compute device hint for ASR runtime: "auto" | "cuda" | "cpu" (set at startup)
transcription_device: str = "auto"

# Transcription state — updated by the transcribe route
transcription_status: dict = {"state": "idle", "progress": 0, "error": None}

# Live transcription manager and status
live_transcription_manager: Optional[LiveTranscriptionManager] = None
