from __future__ import annotations

import asyncio
import os
import queue
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Callable

from app.services.transcription import transcribe_wav_file, write_pcm_to_wav

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
PCM_SAMPLE_WIDTH_BYTES = 2


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
class PendingSnapshot:
    seq: int
    capture_start_ms: int
    capture_end_ms: int
    sample_rate: int
    generation: int


@dataclass
class LiveSession:
    id: str
    sample_rate: int
    channels: int
    mime_type: str
    created_at: str
    state: str = 'live'
    last_seq: int = 0
    next_expected_seq: int = 1
    interim_text: str = ''
    words: list[dict[str, Any]] = field(default_factory=list)
    segments: list[dict[str, Any]] = field(default_factory=list)
    language: str = ''
    duration: float = 0.0
    warning: str | None = None
    error: str | None = None
    queue_depth: int = 0
    worker_busy: bool = False
    waiting_requests: int = 0
    speed_mode: str = LIVE_SPEED_MODE_SAFE_AUTO
    first_chunk_received_at: float | None = None
    first_result_emitted_at: float | None = None
    last_result_emitted_at: float | None = None
    ttft_ms: int | None = None
    update_gap_ms_samples: list[int] = field(default_factory=list)
    chunk_latency_ms_samples: list[int] = field(default_factory=list)
    boundaries: list[dict[str, Any]] = field(default_factory=list)
    paused_spans: list[dict[str, int]] = field(default_factory=list)
    _pause_started_at_ms: int | None = None
    pcm_sample_rate: int = 16000
    pcm_buffer: bytearray = field(default_factory=bytearray)
    pcm_packet_ranges: list[dict[str, Any]] = field(default_factory=list)
    pending_latest: PendingSnapshot | None = None
    worker_task: asyncio.Task[None] | None = None
    worker_wakeup: asyncio.Event = field(default_factory=asyncio.Event)
    latest_seq_accepted: int = 0
    latest_seq_processed: int = 0
    superseded_results_dropped: int = 0
    _latest_generation: int = 0
    last_patch_event: dict[str, Any] | None = None
    input_ready: bool = False
    output_ready: bool = False
    output_queue: queue.Queue[dict[str, Any]] = field(default_factory=queue.Queue)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class LiveTranscriptionManager:
    def __init__(self, transcribe_callable: Callable[[Path, Path, str], dict[str, Any]]) -> None:
        self._transcribe_callable = transcribe_callable
        self._sessions: dict[str, LiveSession] = {}
        self._sessions_lock = asyncio.Lock()

    async def _create_session_payload(
        self,
        *,
        sample_rate: int,
        channels: int,
        mime_type: str,
        state_name: str,
    ) -> dict[str, Any]:
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
            state=state_name,
            speed_mode=resolved_speed_mode,
            warning=warning,
            pcm_sample_rate=sample_rate,
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

    async def start_session(self, sample_rate: int, channels: int, mime_type: str) -> dict[str, Any]:
        return await self._create_session_payload(
            sample_rate=sample_rate,
            channels=channels,
            mime_type=mime_type,
            state_name='live',
        )

    async def prepare_session(self, sample_rate: int, channels: int, mime_type: str) -> dict[str, Any]:
        return await self._create_session_payload(
            sample_rate=sample_rate,
            channels=channels,
            mime_type=mime_type,
            state_name='prepared',
        )

    async def _require_session(self, session_id: str) -> LiveSession:
        async with self._sessions_lock:
            session = self._sessions.get(session_id)
        if session is None:
            raise LiveSessionNotFound(f'Live session not found: {session_id}')
        return session

    @staticmethod
    def _update_queue_metrics(session: LiveSession) -> None:
        session.waiting_requests = 1 if session.pending_latest is not None else 0
        session.queue_depth = int(session.worker_busy) + session.waiting_requests

    @staticmethod
    def _scheduler_metrics(session: LiveSession) -> dict[str, Any]:
        return {
            'pendingLatest': session.pending_latest is not None,
            'latestSeqAccepted': session.latest_seq_accepted,
            'latestSeqProcessed': session.latest_seq_processed,
            'supersededResultsDropped': session.superseded_results_dropped,
        }

    def _build_patch_event(
        self,
        *,
        session: LiveSession,
        seq: int,
        replace_from_word_index: int,
        elapsed_ms: int | None,
        update_gap_ms: int | None,
    ) -> dict[str, Any]:
        metrics: dict[str, Any] = {
            'serverLatencyMs': elapsed_ms,
            'timeToFirstTokenMs': session.ttft_ms,
            'queueDepth': session.queue_depth,
            'workerBusy': session.worker_busy,
            'waitingRequests': session.waiting_requests,
            'updateGapMs': update_gap_ms,
            'speedMode': session.speed_mode,
        }
        metrics.update(self._scheduler_metrics(session))
        return {
            'type': 'patch',
            'sessionId': session.id,
            'seq': seq,
            'interimText': session.interim_text,
            'finalized': {
                'mode': 'patch',
                'replaceFromWordIndex': replace_from_word_index,
                'words': session.words[replace_from_word_index:],
                'segments': session.segments,
            },
            'metrics': metrics,
        }

    def _build_telemetry_event(
        self,
        *,
        session: LiveSession,
        elapsed_ms: int | None,
        update_gap_ms: int | None,
    ) -> dict[str, Any]:
        telemetry_event: dict[str, Any] = {
            'type': 'telemetry',
            'sessionId': session.id,
            'queueDepth': session.queue_depth,
            'workerBusy': session.worker_busy,
            'waitingRequests': session.waiting_requests,
            'updateGapMs': update_gap_ms,
            'serverLatencyMs': elapsed_ms,
            'timeToFirstTokenMs': session.ttft_ms,
            'speedMode': session.speed_mode,
        }
        telemetry_event.update(self._scheduler_metrics(session))
        return telemetry_event

    def _build_immediate_chunk_response(self, *, session: LiveSession, seq: int) -> dict[str, Any]:
        return self._build_patch_event(
            session=session,
            seq=seq,
            replace_from_word_index=len(session.words),
            elapsed_ms=None,
            update_gap_ms=None,
        )

    def _schedule_latest_snapshot(
        self,
        *,
        session: LiveSession,
        seq: int,
        capture_start_ms: int,
        capture_end_ms: int,
        sample_rate: int,
    ) -> PendingSnapshot:
        session._latest_generation += 1
        snapshot = PendingSnapshot(
            seq=seq,
            capture_start_ms=capture_start_ms,
            capture_end_ms=capture_end_ms,
            sample_rate=sample_rate,
            generation=session._latest_generation,
        )
        session.pending_latest = snapshot
        session.latest_seq_accepted = seq
        self._update_queue_metrics(session)
        return snapshot

    def _snapshot_is_superseded(self, session: LiveSession, snapshot: PendingSnapshot) -> bool:
        return snapshot.generation != session._latest_generation or snapshot.seq < session.latest_seq_accepted

    def _mark_superseded_result_if_needed(self, session: LiveSession, snapshot: PendingSnapshot) -> bool:
        if not self._snapshot_is_superseded(session, snapshot):
            return False
        session.superseded_results_dropped += 1
        return True

    async def mark_input_ready(self, session_id: str) -> LiveSession:
        session = await self._require_session(session_id)
        session.input_ready = True
        self._update_queue_metrics(session)
        return session

    async def mark_output_ready(self, session_id: str) -> LiveSession:
        session = await self._require_session(session_id)
        session.output_ready = True
        self._update_queue_metrics(session)
        return session

    async def push_output_event(self, session_id: str, event: dict[str, Any]) -> None:
        session = await self._require_session(session_id)
        await asyncio.to_thread(session.output_queue.put, event)

    async def next_output_event(self, session_id: str) -> dict[str, Any]:
        session = await self._require_session(session_id)
        return await asyncio.to_thread(session.output_queue.get)

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

    def resolve_pcm_window_start_index(
        self,
        *,
        session: LiveSession,
        chunk_start_ms: int,
        chunk_end_ms: int,
        seq: int,
    ) -> int:
        ranges = session.pcm_packet_ranges
        if not ranges:
            return 0
        if seq % FULL_RECONCILE_EVERY_N_CHUNKS == 0:
            return 0

        max_window_ms = (
            SAFE_AUTO_MAX_WINDOW_MS if session.speed_mode == LIVE_SPEED_MODE_SAFE_AUTO else AGGRESSIVE_MAX_WINDOW_MS
        )
        target_start_ms = max(0, int(chunk_end_ms - (max_window_ms + WINDOW_OVERLAP_MS)))
        for idx, packet in enumerate(ranges):
            if int(packet['capture_end_ms']) >= target_start_ms:
                return idx
        return max(0, len(ranges) - 1)

    def build_pcm_window_blob(
        self,
        *,
        session: LiveSession,
        chunk_start_ms: int,
        chunk_end_ms: int,
        seq: int,
    ) -> bytes:
        if not session.pcm_packet_ranges:
            return b''
        start_index = self.resolve_pcm_window_start_index(
            session=session,
            chunk_start_ms=chunk_start_ms,
            chunk_end_ms=chunk_end_ms,
            seq=seq,
        )
        start_offset = int(session.pcm_packet_ranges[start_index]['byte_start'])
        return bytes(session.pcm_buffer[start_offset:])

    @staticmethod
    def _shift_words(words: list[dict[str, Any]], offset_s: float) -> list[dict[str, Any]]:
        shifted: list[dict[str, Any]] = []
        for idx, word in enumerate(words):
            shifted.append(
                {
                    'id': idx,
                    'word': str(word.get('word', '')),
                    'start': round(float(word.get('start', 0.0)) + offset_s, 3),
                    'end': round(float(word.get('end', 0.0)) + offset_s, 3),
                    'probability': float(word.get('probability', 1.0)),
                    'segmentId': int(word.get('segmentId', 0)),
                }
            )
        return shifted

    @staticmethod
    def _merge_words(
        existing_words: list[dict[str, Any]],
        window_words: list[dict[str, Any]],
        *,
        replace_from_s: float,
    ) -> tuple[int, list[dict[str, Any]]]:
        prefix = [dict(word) for word in existing_words if float(word.get('end', 0.0)) <= replace_from_s]
        merged = prefix + [dict(word) for word in window_words]
        for idx, word in enumerate(merged):
            word['id'] = idx
        return len(prefix), merged

    @staticmethod
    def _rebuild_segments_from_words(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not words:
            return []
        return [
            {
                'id': 0,
                'start': float(words[0].get('start', 0.0)),
                'end': float(words[-1].get('end', 0.0)),
                'text': ''.join(str(word.get('word', '')) for word in words).strip(),
            }
        ]

    async def _transcribe_pcm_window(self, *, model_dir: Path, pcm_bytes: bytes, sample_rate: int, device: str) -> dict[str, Any]:
        with NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
            wav_path = Path(tmp.name)
        try:
            write_pcm_to_wav(pcm_bytes, sample_rate, wav_path)
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, transcribe_wav_file, model_dir, wav_path, device)
        finally:
            wav_path.unlink(missing_ok=True)

    def _ensure_session_worker(self, *, session: LiveSession, model_dir: Path, device: str) -> None:
        if session.worker_task is None or session.worker_task.done():
            session.worker_task = asyncio.create_task(self._run_session_worker(session=session, model_dir=model_dir, device=device))

    async def _run_session_worker(self, *, session: LiveSession, model_dir: Path, device: str) -> None:
        try:
            while True:
                async with session.lock:
                    snapshot = session.pending_latest
                    if snapshot is None:
                        session.worker_wakeup.clear()
                        session.worker_task = None
                        self._update_queue_metrics(session)
                        return

                    session.pending_latest = None
                    session.worker_busy = True
                    session.worker_wakeup.clear()
                    self._update_queue_metrics(session)

                    window_start_index = self.resolve_pcm_window_start_index(
                        session=session,
                        chunk_start_ms=snapshot.capture_start_ms,
                        chunk_end_ms=snapshot.capture_end_ms,
                        seq=snapshot.seq,
                    )
                    window_packet = session.pcm_packet_ranges[window_start_index]
                    decode_window_start_ms = int(window_packet['capture_start_ms'])
                    decode_window_start_s = float(decode_window_start_ms) / 1000.0
                    pcm_window_blob = self.build_pcm_window_blob(
                        session=session,
                        chunk_start_ms=snapshot.capture_start_ms,
                        chunk_end_ms=snapshot.capture_end_ms,
                        seq=snapshot.seq,
                    )

                started = time.perf_counter()
                try:
                    result = await self._transcribe_pcm_window(
                        model_dir=model_dir,
                        pcm_bytes=pcm_window_blob,
                        sample_rate=snapshot.sample_rate,
                        device=device,
                    )
                    new_words, _new_segments, new_language, new_duration = self._normalize_full_result(result)
                    shifted_words = self._shift_words(new_words, decode_window_start_s)
                except Exception as exc:
                    async with session.lock:
                        session.error = str(exc)
                        session.warning = str(exc)
                        session.state = 'error'
                        session.worker_busy = False
                        self._update_queue_metrics(session)
                        session.worker_task = None
                    await self.push_output_event(
                        session.id,
                        {
                            'type': 'error',
                            'sessionId': session.id,
                            'state': 'error',
                            'fatal': True,
                            'message': str(exc),
                        },
                    )
                    return

                patch_event: dict[str, Any] | None = None
                telemetry_event: dict[str, Any] | None = None
                async with session.lock:
                    if self._mark_superseded_result_if_needed(session, snapshot):
                        session.worker_busy = False
                        self._update_queue_metrics(session)
                        continue

                    replace_from_word_index = len(session.words)
                    if shifted_words:
                        if window_start_index == 0:
                            session.words = shifted_words
                            replace_from_word_index = 0
                        else:
                            replace_from_s = float(shifted_words[0].get('start', decode_window_start_s))
                            replace_from_word_index, session.words = self._merge_words(
                                session.words,
                                shifted_words,
                                replace_from_s=replace_from_s,
                            )

                    session.segments = self._rebuild_segments_from_words(session.words)
                    session.interim_text = ''
                    session.language = new_language
                    session.duration = max(
                        session.duration,
                        new_duration + decode_window_start_s,
                        float(snapshot.capture_end_ms) / 1000.0,
                    )
                    session.latest_seq_processed = snapshot.seq

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
                    session.worker_busy = False
                    self._update_queue_metrics(session)

                    patch_event = self._build_patch_event(
                        session=session,
                        seq=snapshot.seq,
                        replace_from_word_index=replace_from_word_index,
                        elapsed_ms=elapsed_ms,
                        update_gap_ms=update_gap_ms,
                    )
                    telemetry_event = self._build_telemetry_event(
                        session=session,
                        elapsed_ms=elapsed_ms,
                        update_gap_ms=update_gap_ms,
                    )
                    session.last_patch_event = patch_event

                await self.push_output_event(session.id, patch_event)
                await self.push_output_event(session.id, telemetry_event)
        finally:
            async with session.lock:
                session.worker_busy = False
                self._update_queue_metrics(session)
                if session.pending_latest is None or session.state in {'complete', 'error'}:
                    session.worker_task = None

    async def _wait_for_requested_progress(self, *, session: LiveSession, requested_seq: int) -> dict[str, Any]:
        while True:
            async with session.lock:
                if session.state == 'error' and session.error:
                    raise LiveTransitionError(session.error)

                if session.latest_seq_processed >= requested_seq and session.last_patch_event is not None:
                    return dict(session.last_patch_event)

                if (
                    session.latest_seq_accepted > requested_seq
                    and session.latest_seq_processed >= session.latest_seq_accepted
                    and session.last_patch_event is not None
                ):
                    return dict(session.last_patch_event)

            await asyncio.sleep(0.01)

    async def ingest_pcm(
        self,
        *,
        session_id: str,
        seq: int,
        capture_start_sample: int,
        capture_end_sample: int,
        capture_start_ms: float,
        capture_end_ms: float,
        sample_rate: int,
        channels: int,
        pcm_bytes: bytes,
        model_dir: Path,
        device: str,
        await_result: bool = False,
    ) -> dict[str, Any]:
        session = await self._require_session(session_id)

        async with session.lock:
            if session.state not in {'prepared', 'live', 'finalizing'}:
                raise LiveTransitionError(f'Cannot ingest pcm while session is {session.state}')
            if seq != session.next_expected_seq:
                raise LiveSequenceError(
                    f'PCM packet sequence must match next_expected_seq={session.next_expected_seq}: got {seq}'
                )
            if channels != session.channels:
                raise LiveTransitionError(f'PCM packet channel mismatch: expected {session.channels}, got {channels}')

            started = time.perf_counter()
            if session.first_chunk_received_at is None:
                session.first_chunk_received_at = started

            if session.state != 'finalizing':
                session.state = 'live'
            session.pcm_sample_rate = sample_rate
            byte_start = len(session.pcm_buffer)
            session.pcm_buffer.extend(pcm_bytes)
            byte_end = len(session.pcm_buffer)
            session.pcm_packet_ranges.append(
                {
                    'seq': seq,
                    'capture_start_sample': capture_start_sample,
                    'capture_end_sample': capture_end_sample,
                    'capture_start_ms': int(capture_start_ms),
                    'capture_end_ms': int(capture_end_ms),
                    'byte_start': byte_start,
                    'byte_end': byte_end,
                }
            )
            session.last_seq = seq
            session.next_expected_seq = seq + 1
            self._schedule_latest_snapshot(
                session=session,
                seq=seq,
                capture_start_ms=int(capture_start_ms),
                capture_end_ms=int(capture_end_ms),
                sample_rate=sample_rate,
            )
            self._ensure_session_worker(session=session, model_dir=model_dir, device=device)
            session.worker_wakeup.set()
            immediate_response = self._build_immediate_chunk_response(session=session, seq=seq)

        if not await_result:
            return immediate_response
        return await self._wait_for_requested_progress(session=session, requested_seq=seq)

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
        await_result: bool = True,
    ) -> dict[str, Any]:
        session = await self._require_session(session_id)
        capture_start_sample = int(chunk_start_ms * session.pcm_sample_rate / 1000)
        capture_end_sample = int(chunk_end_ms * session.pcm_sample_rate / 1000)
        result = await self.ingest_pcm(
            session_id=session_id,
            seq=seq,
            capture_start_sample=capture_start_sample,
            capture_end_sample=capture_end_sample,
            capture_start_ms=float(chunk_start_ms),
            capture_end_ms=float(chunk_end_ms),
            sample_rate=session.pcm_sample_rate,
            channels=session.channels,
            pcm_bytes=audio_bytes,
            model_dir=model_dir,
            device=device,
            await_result=await_result,
        )
        if is_last:
            async with session.lock:
                session.state = 'finalizing'
        result['state'] = session.state
        return result

    async def pause_session(self, session_id: str, at_ms: int) -> dict[str, Any]:
        session = await self._require_session(session_id)
        async with session.lock:
            if session.state != 'live':
                raise LiveTransitionError(f'Cannot pause session while state is {session.state}')
            session.state = 'paused'
            session._pause_started_at_ms = at_ms
            session.boundaries.append({'type': 'pause-start', 'atMs': at_ms})
            event = {'type': 'state', 'sessionId': session.id, 'state': 'paused'}
            await self.push_output_event(session.id, event)
            return {'sessionId': session.id, 'state': session.state}

    async def resume_session(self, session_id: str, at_ms: int) -> dict[str, Any]:
        session = await self._require_session(session_id)
        async with session.lock:
            if session.state != 'paused':
                raise LiveTransitionError(f'Cannot resume session while state is {session.state}')
            if session._pause_started_at_ms is not None:
                session.paused_spans.append({'startMs': session._pause_started_at_ms, 'endMs': at_ms})
                session._pause_started_at_ms = None
            session.state = 'live'
            session.boundaries.append({'type': 'pause-end', 'atMs': at_ms})
            event = {'type': 'state', 'sessionId': session.id, 'state': 'live'}
            await self.push_output_event(session.id, event)
            return {'sessionId': session.id, 'state': session.state}

    async def _wait_until_session_idle(self, session: LiveSession) -> None:
        while True:
            async with session.lock:
                if not session.worker_busy and session.pending_latest is None and session.latest_seq_processed >= session.latest_seq_accepted:
                    return
                session.worker_wakeup.set()
            await asyncio.sleep(0.01)

    async def stop_session(self, session_id: str, at_ms: int) -> dict[str, Any]:
        session = await self._require_session(session_id)

        async with session.lock:
            if session.state not in {'prepared', 'live', 'paused', 'finalizing'}:
                raise LiveTransitionError(f'Cannot stop session while state is {session.state}')
            if session.state == 'paused' and session._pause_started_at_ms is not None:
                session.paused_spans.append({'startMs': session._pause_started_at_ms, 'endMs': at_ms})
                session._pause_started_at_ms = None
            session.state = 'finalizing'
            session.interim_text = ''
            session.duration = max(session.duration, float(at_ms) / 1000.0)
            worker_task = session.worker_task
            needs_drain = session.pending_latest is not None or session.worker_busy
            if worker_task is not None:
                session.worker_wakeup.set()

        if needs_drain:
            await self._wait_until_session_idle(session)

        async with session.lock:
            session.state = 'complete'
            payload = {
                'words': session.words,
                'segments': session.segments,
                'language': session.language,
                'duration': round(session.duration, 3),
                'session': {
                    'id': session.id,
                    'state': 'complete',
                },
            }
            await self.push_output_event(
                session.id,
                {
                    'type': 'complete',
                    'sessionId': session.id,
                    'state': 'complete',
                    'words': session.words,
                    'segments': session.segments,
                    'language': session.language,
                    'duration': round(session.duration, 3),
                },
            )
            worker_task = session.worker_task
            if worker_task is not None:
                session.worker_wakeup.set()

        if worker_task is not None:
            try:
                await asyncio.wait_for(worker_task, timeout=1)
            except Exception:
                pass

        return payload

    async def status(self, session_id: str) -> dict[str, Any]:
        session = await self._require_session(session_id)
        last_chunk_latency_ms = session.chunk_latency_ms_samples[-1] if session.chunk_latency_ms_samples else None
        self._update_queue_metrics(session)
        scheduler_metrics = self._scheduler_metrics(session)
        return {
            'sessionId': session.id,
            'state': session.state,
            'lastSeq': session.last_seq,
            'queueDepth': session.queue_depth,
            'warning': session.warning,
            'error': session.error,
            **scheduler_metrics,
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
                    'workerBusy': session.worker_busy,
                    'waitingRequests': session.waiting_requests,
                    'inputReady': session.input_ready,
                    'outputReady': session.output_ready,
                    **scheduler_metrics,
                },
            },
        }
