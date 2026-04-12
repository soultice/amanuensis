import threading
from fastapi import APIRouter, HTTPException
import app.state as state

router = APIRouter(prefix="/model")


@router.get("/status")
async def model_status():
    """Return current model state, download progress, and any error."""
    if state.model_manager is None:
        raise HTTPException(status_code=503, detail="Model manager not initialised")
    return {
        "state": state.model_manager.state,
        "progress": state.model_manager.progress,
        "error": state.model_manager.error,
    }


@router.post("/download")
async def start_download():
    """Trigger model download in a background thread. Idempotent."""
    if state.model_manager is None:
        raise HTTPException(status_code=503, detail="Model manager not initialised")

    mgr = state.model_manager
    if mgr.state == "present":
        return {"status": "already_present"}
    if mgr.state == "downloading":
        return {"status": "already_downloading"}

    thread = threading.Thread(target=mgr.download, daemon=True)
    thread.start()
    return {"status": "started"}
