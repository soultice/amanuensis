import argparse
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.state as state
from app.routes.health import router as health_router
from app.routes.model import router as model_router
from app.routes.transcribe import router as transcribe_router
from app.services.model_manager import ModelManager
from app.services.live_transcription import LiveTranscriptionManager
from app.services.live_warmth import spawn_live_warmup_if_possible


def create_app(user_data_dir: str, device: str = "auto") -> FastAPI:
    """Create and configure the FastAPI application."""
    # Initialise shared state
    state.model_manager = ModelManager(user_data_dir)
    state.transcription_device = device
    state.live_transcription_manager = LiveTranscriptionManager()

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        spawn_live_warmup_if_possible('startup')
        yield

    api = FastAPI(title="Amanuensis Sidecar", version="0.1.0", lifespan=lifespan)

    # Fix: CORS middleware so the Electron Chromium renderer (served from
    # file:// in production or http://localhost:<port> in dev) can fetch the
    # sidecar. Without this every fetch() call is blocked by the browser with
    # "Failed to fetch" (a CORS network-level rejection, not an HTTP error).
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],   # sidecar binds to 127.0.0.1 — safe to allow all
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

    api.include_router(health_router)
    api.include_router(model_router)
    api.include_router(transcribe_router)
    return api


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Amanuensis transcription sidecar")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument(
        "--user-data",
        type=str,
        required=True,
        help="Electron app.getPath('userData') directory for model storage",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="auto",
        choices=["auto", "cuda", "cpu"],
        help="Compute device hint for ASR runtime: 'auto' (GPU if available, else CPU), "
             "'cuda' (force GPU), 'cpu' (force CPU)",
    )
    args = parser.parse_args()

    application = create_app(args.user_data, device=args.device)
    uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")
