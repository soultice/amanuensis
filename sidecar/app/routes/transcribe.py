import asyncio
import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

import app.state as state
from app.services.transcription import transcribe_file

router = APIRouter(prefix="/transcribe")

# Ensure only one transcription runs at a time (large model; concurrent = OOM)
_transcribe_lock = asyncio.Lock()


@router.get("/status")
async def get_transcription_status():
    """Poll this endpoint while transcription is running."""
    return JSONResponse(state.transcription_status)


@router.post("")
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Accept WebM audio file, transcribe with faster-whisper large-v3.

    Returns: {"words": [{id, word, start, end, probability}], "language": str, "duration": float}

    - 503: model not ready
    - 409: transcription already in progress
    """
    if state.model_manager is None or state.model_manager.state != "present":
        raise HTTPException(status_code=503, detail="Whisper model not ready")

    if _transcribe_lock.locked():
        raise HTTPException(status_code=409, detail="Transcription already in progress")

    async with _transcribe_lock:
        state.transcription_status = {"state": "running", "progress": 0, "error": None}

        tmp_path: Path | None = None
        try:
            content = await audio.read()
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(content)
                tmp_path = Path(tmp.name)

            # Run synchronous transcription in thread pool — avoids blocking event loop
            loop = asyncio.get_event_loop()
            model_dir = state.model_manager.get_model_path()
            result = await loop.run_in_executor(
                None, transcribe_file, model_dir, tmp_path
            )

            state.transcription_status = {"state": "complete", "progress": 100, "error": None}
            return JSONResponse(result)

        except HTTPException:
            raise
        except Exception as exc:
            state.transcription_status = {
                "state": "error",
                "progress": 0,
                "error": str(exc),
            }
            raise HTTPException(status_code=500, detail=str(exc)) from exc

        finally:
            if tmp_path and tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
