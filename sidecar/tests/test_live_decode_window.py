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


def test_build_decode_window_blob_keeps_first_chunk_header_prefix() -> None:
    manager = _manager()
    session = _session()

    session.accumulated_chunks = [b'HEADER', *[f'C{i}'.encode() for i in range(1, 20)]]

    blob = manager.build_decode_window_blob(
        session=session,
        chunk_start_ms=0,
        chunk_end_ms=500,
        seq=13,  # non-reconcile chunk
    )

    assert blob == b''.join([session.accumulated_chunks[0], *session.accumulated_chunks[-12:]])
    assert blob.startswith(b'HEADER')


def test_build_decode_window_blob_uses_full_reconcile_interval() -> None:
    manager = _manager()
    session = _session()

    session.accumulated_chunks = [b'HEADER', b'C1', b'C2', b'C3']

    blob = manager.build_decode_window_blob(
        session=session,
        chunk_start_ms=0,
        chunk_end_ms=500,
        seq=8,  # FULL_RECONCILE_EVERY_N_CHUNKS
    )

    assert blob == b''.join(session.accumulated_chunks)


def test_build_decode_window_blob_does_not_duplicate_header_when_window_covers_all_chunks() -> None:
    manager = _manager()
    session = _session()

    session.accumulated_chunks = [b'HEADER', b'C1', b'C2']

    blob = manager.build_decode_window_blob(
        session=session,
        chunk_start_ms=0,
        chunk_end_ms=500,
        seq=1,
    )

    assert blob == b'HEADERC1C2'
