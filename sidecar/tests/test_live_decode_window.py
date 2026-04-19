from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.live_transcription import LiveSession, LiveTranscriptionManager


def _append_pcm_packet(session: LiveSession, *, seq: int, start_ms: int, end_ms: int, payload: bytes) -> None:
    byte_start = len(session.pcm_buffer)
    session.pcm_buffer.extend(payload)
    session.pcm_packet_ranges.append(
        {
            'seq': seq,
            'capture_start_ms': start_ms,
            'capture_end_ms': end_ms,
            'byte_start': byte_start,
            'byte_end': len(session.pcm_buffer),
        }
    )


def _manager() -> LiveTranscriptionManager:
    return LiveTranscriptionManager(lambda _model_dir, _pcm_bytes, _sample_rate, _device: {})


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


def test_schedule_latest_snapshot_overwrites_previous_pending_snapshot() -> None:
    manager = _manager()
    session = _session()

    _append_pcm_packet(session, seq=1, start_ms=0, end_ms=500, payload=b'alpha')
    _append_pcm_packet(session, seq=2, start_ms=500, end_ms=1000, payload=b'beta')
    _append_pcm_packet(session, seq=3, start_ms=1000, end_ms=1500, payload=b'gamma')

    manager._schedule_latest_snapshot(session=session, seq=2, capture_start_ms=500, capture_end_ms=1000, sample_rate=16000)
    manager._schedule_latest_snapshot(session=session, seq=3, capture_start_ms=1000, capture_end_ms=1500, sample_rate=16000)

    assert session.pending_latest is not None
    assert session.pending_latest.seq == 3
    assert session.latest_seq_accepted == 3
    assert bytes(session.pcm_buffer) == b'alphabetagamma'
    assert [packet['seq'] for packet in session.pcm_packet_ranges] == [1, 2, 3]


def test_stale_snapshot_result_is_dropped_before_merge() -> None:
    manager = _manager()
    session = _session()

    stale_snapshot = manager._schedule_latest_snapshot(
        session=session,
        seq=2,
        capture_start_ms=500,
        capture_end_ms=1000,
        sample_rate=16000,
    )
    manager._schedule_latest_snapshot(session=session, seq=3, capture_start_ms=1000, capture_end_ms=1500, sample_rate=16000)

    assert manager._mark_superseded_result_if_needed(session, stale_snapshot) is True
    assert session.superseded_results_dropped == 1
    assert session.latest_seq_processed == 0
    assert session.pending_latest is not None
    assert session.pending_latest.seq == 3
