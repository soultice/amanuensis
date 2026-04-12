import argparse
import uvicorn
from fastapi import FastAPI

import app.state as state
from app.routes.health import router as health_router
from app.routes.model import router as model_router
from app.routes.transcribe import router as transcribe_router
from app.services.model_manager import ModelManager


def create_app(user_data_dir: str) -> FastAPI:
    """Create and configure the FastAPI application."""
    # Initialise shared state
    state.model_manager = ModelManager(user_data_dir)

    api = FastAPI(title="Amanuensis Sidecar", version="0.1.0")
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
    args = parser.parse_args()

    application = create_app(args.user_data)
    uvicorn.run(application, host="127.0.0.1", port=args.port, log_level="warning")
