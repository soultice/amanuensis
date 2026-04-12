"""
Model manager for Whisper large-v3.
Checks presence, downloads via huggingface_hub, reports progress via callback.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Callable, Literal, Optional

ModelState = Literal["present", "downloading", "missing", "error"]


class ModelManager:
    MODEL_REPO = "Systran/faster-whisper-large-v3"
    MODEL_MARKER = "model.bin"  # File whose existence confirms a complete download

    def __init__(self, user_data_dir: str) -> None:
        self._model_dir = Path(user_data_dir) / "models" / "large-v3"
        self._state: ModelState = "missing"
        self._progress: int = 0
        self._error: Optional[str] = None
        self._lock = threading.Lock()
        self._progress_callback: Optional[Callable[[int], None]] = None
        self._refresh_state()

    def _refresh_state(self) -> None:
        """Check filesystem to determine current model state."""
        if (self._model_dir / self.MODEL_MARKER).exists():
            self._state = "present"
        else:
            self._state = "missing"

    @property
    def state(self) -> ModelState:
        return self._state

    @property
    def progress(self) -> int:
        return self._progress

    @property
    def error(self) -> Optional[str]:
        return self._error

    def get_model_path(self) -> Path:
        return self._model_dir

    def set_progress_callback(self, cb: Callable[[int], None]) -> None:
        self._progress_callback = cb

    def download(self) -> None:
        """Download model synchronously. Must be called in a background thread."""
        with self._lock:
            if self._state == "present":
                return
            self._state = "downloading"
            self._progress = 0
            self._error = None

        try:
            from huggingface_hub import snapshot_download  # type: ignore

            self._model_dir.mkdir(parents=True, exist_ok=True)

            # snapshot_download handles resumption if interrupted
            snapshot_download(
                repo_id=self.MODEL_REPO,
                local_dir=str(self._model_dir),
                local_dir_use_symlinks=False,
            )

            with self._lock:
                self._state = "present"
                self._progress = 100

            if self._progress_callback:
                self._progress_callback(100)

        except Exception as exc:
            with self._lock:
                self._state = "error"
                self._error = str(exc)
