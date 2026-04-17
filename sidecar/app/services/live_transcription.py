from __future__ import annotations

import asyncio
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable


TTFT_P50_TARGET_MS = 800
TTFT_P95_TARGET_MS = 1500
UPDATE_CADENCE_P50_TARGET_MS = 600
QUEUE_DEPTH_P95_TARGET = 1
FINALIZE_P95_TARGET_MS = 2500

LIVE_SPEED_MODE_SAFE_AUTO = 'safe_auto'
LIVE_SPEED_MODE_AGGRESSIVE_INTERNAL = 'aggressive_internal'
LIVE_SPEED_MODE_ENV_VAR = 'AMANUENSIS_LIVE_SPEED_MODE'

SAFE_AUTO_MAX_WINDOW_MS = 6000
AGGRESSIVE_MAX_WINDOW_MS = 2500
WINDOW_OVERLAP_MS = 200
FULL_RECONCILE_EVERY_N_CHUNKS = 8


def resolve_live_speed_mode() -> str:
    configured = (os.getenv(LIVE_SPEED_MODE_ENV_VAR) or '').strip().lower()
    if configured in {LIVE_SPEED_MODE_SAFE_AUTO, LIVE_SPEED_MODE_AGGRESSIVE_INTERNAL}:
        return configured
    return LIVE_SPEED_MODE_SAFE_AUTO


class LiveSessionError(Exception):
    pass


class LiveSessionNotFound(LiveSessionError):
    pass


class LiveTransitionError(LiveSessionError):
    pass


class LiveSequenceError(LiveSessionError):
    pass


@dataclass
class LiveSession:
    id: str
    sample_rate: int
    channels: int
    mime_type: str
    created_at: str
    state: str = 'live'
    last_seq: int = 0
    interim_text: str = ''
    words: list[dict[str, Any]] = field(default_factory=list)
    segments: list[dict[str, Any]] = field(default_factory=list)
    language: str = ''
    duration: float = 0.0
    warning: str | None = None
    error: str | None = None
    queue_depth: int = 0
    speed_mode: str = LIVE_SPEED_MODE_SAFE_AUTO
    first_chunk_received_at: float | None = None
    first_result_emitted_at: float | None = None
    last_result_emitted_at: float | None = None
    ttft_ms: int | None = None
    update_gap_ms_samples: list[int] = field(default_factory=list)
    chunk_latency_ms_samples: list[int] = field(default_factory=list)
    boundaries: list[dict[str, Any]] = field(default_factory=list)
    accumulated_chunks: list[bytes] = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class LiveTranscriptionManager:
    def __init__(self, transcribe_callable: Callable[[Path, Path, str], dict[str, Any]]) -> None:
        self._transcribe_callable = transcribe_callable
        self._sessions: dict[str, LiveSession] = {}
        self._sessions_lock = asyncio.Lock()

    async def start_session(self, sample_rate: int, channels: int, mime_type: str) -> dict[str, Any]:
        session_id = str(uuid.uuid4())
        configured_speed_mode = (os.getenv(LIVE_SPEED_MODE_ENV_VAR) or '').strip().lower()
        resolved_speed_mode = resolve_live_speed_mode()
        warning: str | None = None
        if configured_speed_mode and configured_speed_mode not in {
            LIVE_SPEED_MODE_SAFE_AUTO,
            LIVE_SPEED_MODE_AGGRESSIVE_INTERNAL,
        }:
            warning = 'Unknown AMANUENSIS_LIVE_SPEED_MODE, using safe_auto'

        session = LiveSession(
            id=session_id,
            sample_rate=sample_rate,
            channels=channels,
            mime_type=mime_type,
            created_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            speed_mode=resolved_speed_mode,
            warning=warning,
        )

        async with self._sessions_lock:
            self._sessions[session_id] = session

        payload: dict[str, Any] = {
            'sessionId': session.id,
            'state': session.state,
            'createdAt': session.created_at,
            'speedMode': session.speed_mode,
            'defaults': {
                'chunkWindowMs': 500,
                'statusPollMs': 500,
                'overlapMs': 200,
            },
        }
        if warning:
            payload['warning'] = warning
        return payload

    async def _require_session(self, session_id: str) -> LiveSession:
        async with self._sessions_lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise LiveSessionNotFound(f'Live session not found: {session_id}')
        return session

    @staticmethod
    def _is_soft_chunk_decode_error(exc: Exception) -> bool:
        msg = str(exc)
        return 'EBML header parsing failed' in msg or 'Invalid data found when processing input' in msg

    @staticmethod
    def _normalize_full_result(result: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str, float]:
        words_raw = result.get('words', []) or []
        segments_raw = result.get('segments', []) or []

        segments: list[dict[str, Any]] = []
        for idx, seg in enumerate(segments_raw):
            segments.append(
                {
                    'id': idx,
                    'start': round(float(seg.get('start', 0.0)), 3),
                    'end': round(float(seg.get('end', 0.0)), 3),
                    'text': str(seg.get('text', '')),
                }
            )

        words: list[dict[str, Any]] = []
        for idx, w in enumerate(words_raw):
            words.append(
                {
                    'id': idx,
                    'word': str(w.get('word', '')),
                    'start': round(float(w.get('start', 0.0)), 3),
                    'end': round(float(w.get('end', 0.0)), 3),
                    'probability': float(w.get('probability', 1.0)),
                    'segmentId': int(w.get('segmentId', 0)),
                }
            )

        language = str(result.get('language', '') or '')
        duration = float(result.get('duration', 0.0) or 0.0)
        return words, segments, language, duration

    def build_decode_window_blob(
        self,
        *,
        session: LiveSession,
        chunk_start_ms: int,
        chunk_end_ms: int,
        seq: int,
    ) -> bytes:
        if seq % FULL_RECONCILE_EVERY_N_CHUNKS == 0:
            return b''.join(session.accumulated_chunks)

        max_window_ms = (
            SAFE_AUTO_MAX_WINDOW_MS
            if session.speed_mode == LIVE_SPEED_MODE_SAFE_AUTO
            else AGGRESSIVE_MAX_WINDOW_MS
        )
        chunk_span_ms = max(1, chunk_end_ms - chunk_start_ms)
        window_span_ms = max_window_ms + WINDOW_OVERLAP_MS
        window_chunk_count = max(1, int(window_span_ms / chunk_span_ms))
        return b''.join(session.accumulated_chunks[-window_chunk_count:])

    async def ingest_chunk(
        self,
        *,
        session_id: str,
        seq: int,
        chunk_start_ms: int,
        chunk_end_ms: int,
        audio_bytes: bytes,
        model_dir: Path,
        device: str,
        is_last: bool = False,
    ) -> dict[str, Any]:
        session = await self._require_session(session_id)

        async with session.lock:
            if session.state != 'live':
                raise LiveTransitionError(f'Cannot ingest chunk while session is {session.state}')

            if seq <= session.last_seq:
                raise LiveSequenceError(f'Chunk sequence must increase: got {seq}, last={session.last_seq}')

            started = time.perf_counter()
            if session.first_chunk_received_at is None:
                session.first_chunk_received_at = started
            session.queue_depth += 1
            tmp_path: Path | None = None
            try:
                session.accumulated_chunks.append(audio_bytes)

                decode_blob = self.build_decode_window_blob(
                    session=session,
                    chunk_start_ms=chunk_start_ms,
                    chunk_end_ms=chunk_end_ms,
                    seq=seq,
                )
                with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp:
                    tmp.write(decode_blob)
                    tmp_path = Path(tmp.name)

                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    self._transcribe_callable,
                    model_dir,
                    tmp_path,
                    device,
                )

                new_words, new_segments, new_language, new_duration = self._normalize_full_result(result)

                session.words = new_words
                session.segments = new_segments
                session.interim_text = ''
                session.last_seq = seq
                session.language = new_language
                session.duration = max(new_duration, float(chunk_end_ms) / 1000.0)
                if is_last:
                    session.state = 'finalizing'

                elapsed_ms = int((time.perf_counter() - started) * 1000)
                session.chunk_latency_ms_samples.append(elapsed_ms)

                emitted_at = time.perf_counter()
                if session.first_result_emitted_at is None:
                    session.first_result_emitted_at = emitted_at
                    if session.first_chunk_received_at is not None:
                        session.ttft_ms = int((emitted_at - session.first_chunk_received_at) * 1000)

                update_gap_ms: int | None = None
                if session.last_result_emitted_at is not None:
                    update_gap_ms = int((emitted_at - session.last_result_emitted_at) * 1000)
                    session.update_gap_ms_samples.append(update_gap_ms)
                session.last_result_emitted_at = emitted_at

                session.warning = None
                session.error = None

                return {
                    'sessionId': session.id,
                    'seq': seq,
                    'state': session.state if not is_last else 'finalizing',
                    'interimText': session.interim_text,
                    'finalized': {
                        # Full snapshot each tick; cumulative decode can re-segment prior words.
                        'words': session.words,
                        'segments': session.segments,
                    },
                    'metrics': {
                        'serverLatencyMs': elapsed_ms,
                        'timeToFirstTokenMs': session.ttft_ms,
                        'queueDepth': session.queue_depth,
                        'updateGapMs': update_gap_ms,
                        'speedMode': session.speed_mode,
                    },
                }
            except Exception as exc:
                # Soft-fail for known small/partial WebM decode errors and keep recording alive
                if self._is_soft_chunk_decode_error(exc):
                    session.warning = f'Live chunk processing warning: {exc}'
                    session.error = None
                    session.last_seq = seq
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    session.chunk_latency_ms_samples.append(elapsed_ms)
                    return {
                        'sessionId': session.id,
                        'seq': seq,
                        'state': session.state,
                        'interimText': session.interim_text,
                        'finalized': {
                            'words': [],
                            'segments': [],
                        },
                        'metrics': {
                            'serverLatencyMs': elapsed_ms,
                            'timeToFirstTokenMs': session.ttft_ms,
                            'queueDepth': session.queue_depth,
                            'updateGapMs': None,
                            'speedMode': session.speed_mode,
                        },
                    }

                session.warning = f'Live chunk processing error: {exc}'
                session.error = str(exc)
                raise
            finally:
                session.queue_depth = max(0, session.queue_depth - 1)
                if tmp_path and tmp_path.exists():
                    tmp_path.unlink(missing_ok=True)

    async def pause_session(self, session_id: str, at_ms: int) -> dict[str, Any]:
        session = await self._require_session(session_id)
        async with session.lock:
            if session.state != 'live':
                raise LiveTransitionError(f'Cannot pause session while state is {session.state}')
            session.state = 'paused'
            session.boundaries.append({'type': 'pause-start', 'atMs': at_ms})
            return {'sessionId': session.id, 'state': session.state}

    async def resume_session(self, session_id: str, at_ms: int) -> dict[str, Any]:
        session = await self._require_session(session_id)
        async with session.lock:
            if session.state != 'paused':
                raise LiveTransitionError(f'Cannot resume session while state is {session.state}')
            session.state = 'live'
            session.boundaries.append({'type': 'pause-end', 'atMs': at_ms})
            return {'sessionId': session.id, 'state': session.state}

    async def stop_session(self, session_id: str, at_ms: int) -> dict[str, Any]:
        session = await self._require_session(session_id)
        async with session.lock:
            if session.state not in {'live', 'paused', 'finalizing'}:
                raise LiveTransitionError(f'Cannot stop session while state is {session.state}')

            session.state = 'finalizing'
            session.interim_text = ''
            session.duration = max(session.duration, float(at_ms) / 1000.0)
            session.state = 'complete'

            return {
                'words': session.words,
                'segments': session.segments,
                'language': session.language,
                'duration': round(session.duration, 3),
                'session': {
                    'id': session.id,
                    'state': 'complete',
                },
            }

    async def status(self, session_id: str) -> dict[str, Any]:
        session = await self._require_session(session_id)
        last_chunk_latency_ms = session.chunk_latency_ms_samples[-1] if session.chunk_latency_ms_samples else None
        return {
            'sessionId': session.id,
            'state': session.state,
            'lastSeq': session.last_seq,
            'queueDepth': session.queue_depth,
            'warning': session.warning,
            'error': session.error,
            'metrics': {
                'targets': {
                    'ttftP50Ms': TTFT_P50_TARGET_MS,
                    'ttftP95Ms': TTFT_P95_TARGET_MS,
                    'updateCadenceP50Ms': UPDATE_CADENCE_P50_TARGET_MS,
                    'queueDepthP95': QUEUE_DEPTH_P95_TARGET,
                },
                'observed': {
                    'ttftMs': session.ttft_ms,
                    'lastChunkLatencyMs': last_chunk_latency_ms,
                },
                'targets.ttftP50Ms': TTFT_P50_TARGET_MS,
                'targets.ttftP95Ms': TTFT_P95_TARGET_MS,
                'targets.updateCadenceP50Ms': UPDATE_CADENCE_P50_TARGET_MS,
                'targets.queueDepthP95': QUEUE_DEPTH_P95_TARGET,
                'observed.ttftMs': session.ttft_ms,
                'observed.lastChunkLatencyMs': last_chunk_latency_ms,
            },
        }
