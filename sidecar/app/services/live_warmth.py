from __future__ import annotations

import threading

import app.state as state
from app.services.transcription import warm_model_for_live


def spawn_live_warmup_if_possible(trigger: str) -> bool:
    if state.model_manager is None or state.model_manager.state != 'present':
        state.skip_live_warmup(trigger=trigger, reason='ASR model not present')
        return False
    if not state.begin_live_warmup(trigger):
        return False

    def _warm() -> None:
        try:
            metadata = warm_model_for_live(
                state.model_manager.get_model_path(),
                device=state.transcription_device,
            )
            state.finish_live_warmup(trigger=trigger, metadata=metadata)
        except Exception as exc:
            # Warmup is an optimization only. Keep startup fail-open.
            state.fail_live_warmup(trigger=trigger, error=str(exc))

    threading.Thread(target=_warm, name='amanuensis-live-warmup', daemon=True).start()
    return True
