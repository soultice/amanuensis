"""Module-level singletons shared across routes."""
from typing import Optional
from app.services.model_manager import ModelManager

model_manager: Optional[ModelManager] = None

# Transcription state — updated by the transcribe route
transcription_status: dict = {"state": "idle", "progress": 0, "error": None}
