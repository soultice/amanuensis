"""Module-level singletons shared across routes."""
from typing import Optional
from app.services.model_manager import ModelManager

model_manager: Optional[ModelManager] = None
