from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.live_transcription import LiveSession, LiveTranscriptionManager


def _manager() -> LiveTranscriptionManager:
    return LiveTranscriptionManager(lambda _model_dir, _audio_path, _device: {})


def _session() -> LiveSession:
    return LiveSession(
        id='session-1',
        sample_rate=44100,
        channels=1,
        mime_type='audio/webm',
        created_at='2026-04-17T00:00:00Z',
    )


def test_build_pcm_window_blob_uses_full_reconcile_interval() -> None:
    manager = _manager()
    session = _session()

    session.pcm_chunks = [b'A', b'B', b'C', b'D']
    session.pcm_chunk_ranges_ms = [(0, 500), (500, 1000), (1000, 1500), (1500, 2000)]

    blob = manager.build_pcm_window_blob(
        session=session,
        chunk_start_ms=0,
        chunk_end_ms=500,
        seq=8,
    )

    assert blob == b'ABCD'


def test_build_pcm_window_blob_limits_to_bounded_tail() -> None:
    manager = _manager()
    session = _session()

    session.pcm_chunks = [b'H', *[f'C{i}'.encode() for i in range(1, 20)]]
    session.pcm_chunk_ranges_ms = [(i * 500, (i + 1) * 500) for i in range(20)]

    blob = manager.build_pcm_window_blob(
        session=session,
        chunk_start_ms=0,
        chunk_end_ms=500,
        seq=13,
    )

    assert blob.endswith(b'C19')
    assert len(blob) < len(b''.join(session.pcm_chunks))
