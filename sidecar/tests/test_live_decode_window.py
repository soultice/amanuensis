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

    session.pcm_buffer = bytearray(b'ABCD')
    session.pcm_packet_ranges = [
        {'seq': 1, 'capture_start_ms': 0, 'capture_end_ms': 500, 'byte_start': 0, 'byte_end': 1},
        {'seq': 2, 'capture_start_ms': 500, 'capture_end_ms': 1000, 'byte_start': 1, 'byte_end': 2},
        {'seq': 3, 'capture_start_ms': 1000, 'capture_end_ms': 1500, 'byte_start': 2, 'byte_end': 3},
        {'seq': 4, 'capture_start_ms': 1500, 'capture_end_ms': 2000, 'byte_start': 3, 'byte_end': 4},
    ]

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

    chunks = [b'H', *[f'C{i}'.encode() for i in range(1, 20)]]
    offset = 0
    session.pcm_buffer = bytearray()
    session.pcm_packet_ranges = []
    for idx, chunk in enumerate(chunks):
        session.pcm_buffer.extend(chunk)
        session.pcm_packet_ranges.append(
            {
                'seq': idx + 1,
                'capture_start_ms': idx * 500,
                'capture_end_ms': (idx + 1) * 500,
                'byte_start': offset,
                'byte_end': offset + len(chunk),
            }
        )
        offset += len(chunk)

    blob = manager.build_pcm_window_blob(
        session=session,
        chunk_start_ms=9500,
        chunk_end_ms=10000,
        seq=13,
    )

    assert blob.endswith(b'C19')
    assert len(blob) < len(bytes(session.pcm_buffer))
