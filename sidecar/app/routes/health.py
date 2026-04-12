from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health():
    """Sidecar health check — Electron polls this before marking sidecar as ready."""
    return {"status": "ok"}
