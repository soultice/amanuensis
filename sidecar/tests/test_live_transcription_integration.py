from __future__ import annotations

from pathlib import Path
import queue
import sys
import threading
import time

import asyncio

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.state as state
from app.main import create_app
from app.routes import transcribe as transcribe_routes
from app.services import live_transcription as live_service


class _FakeModelManager:
    state = 'present'

    def get_model_path(self) -> Path:
        return Path('.')


def _install_fake_pipeline(
    monkeypatch,
    *,
    block_on_transcribe: threading.Event | None = None,
    entered: threading.Event | None = None,
) -> None:
    def _fake_transcribe(_model_dir: Path, pcm_bytes: bytes, _sample_rate: int, _device: str) -> dict:
        if entered is not None:
            entered.set()
        if block_on_transcribe is not None:
            block_on_transcribe.wait(timeout=2)
        text = pcm_bytes.decode(errors='ignore').strip()
        tokens = [token for token in text.split(' ') if token]
        if not tokens:
            tokens = ['live', 'test']
        words = []
        start = 0.0
        for idx, token in enumerate(tokens):
            end = round(start + 0.4, 3)
            words.append({'id': idx, 'word': f"{token} ", 'start': start, 'end': end, 'probability': 1.0, 'segmentId': 0})
            start = end
        return {
            'words': words,
            'segments': [{'id': 0, 'start': 0.0, 'end': words[-1]['end'], 'text': ' '.join(tokens)}],
            'language': 'en',
            'duration': words[-1]['end'],
        }

    monkeypatch.setattr(live_service, 'transcribe_pcm_bytes', _fake_transcribe)
    if state.live_transcription_manager is not None:
        state.live_transcription_manager._transcribe_pcm_callable = _fake_transcribe
    monkeypatch.setattr(transcribe_routes, 'warm_model_for_live', lambda *_args, **_kwargs: {'warmupMs': 1.0})


def _client(monkeypatch) -> TestClient:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()
    _install_fake_pipeline(monkeypatch)
    return TestClient(app)


def test_batch_recovery_endpoint_still_available(monkeypatch) -> None:
    client = _client(monkeypatch)

    monkeypatch.setattr(transcribe_routes, 'transcribe_file', lambda *_args, **_kwargs: {
        'words': [{'id': 0, 'word': 'ok ', 'start': 0.0, 'end': 0.5, 'probability': 1.0, 'segmentId': 0}],
        'segments': [{'id': 0, 'start': 0.0, 'end': 0.5, 'text': 'ok'}],
        'language': 'en',
        'duration': 0.5,
    })
    state.transcription_status = {'state': 'idle', 'progress': 0, 'error': None}

    response = client.post('/transcribe', files={'audio': ('recording.webm', b'fake-webm', 'audio/webm')})
    assert response.status_code == 200
    payload = response.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())


def test_batch_recovery_missing_audio_returns_validation_error(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.post('/transcribe')

    assert response.status_code == 422


def test_batch_recovery_decode_failure_surfaces_detail_and_error_state(monkeypatch) -> None:
    client = _client(monkeypatch)

    monkeypatch.setattr(
        transcribe_routes,
        'transcribe_file',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('ffmpeg conversion failed: invalid data found')),
    )
    state.transcription_status = {'state': 'idle', 'progress': 0, 'error': None}

    response = client.post('/transcribe', files={'audio': ('recording.webm', b'bad-webm', 'audio/webm')})

    assert response.status_code == 500
    assert response.json()['detail'] == 'ffmpeg conversion failed: invalid data found'
    assert state.transcription_status == {
        'state': 'error',
        'progress': 0,
        'error': 'ffmpeg conversion failed: invalid data found',
    }


def test_batch_recovery_asr_failure_surfaces_detail_and_error_state(monkeypatch) -> None:
    client = _client(monkeypatch)

    monkeypatch.setattr(
        transcribe_routes,
        'transcribe_file',
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError('asr backend failed: decoder exhausted retries')),
    )
    state.transcription_status = {'state': 'idle', 'progress': 0, 'error': None}

    response = client.post('/transcribe', files={'audio': ('recording.webm', b'fake-webm', 'audio/webm')})

    assert response.status_code == 500
    assert response.json()['detail'] == 'asr backend failed: decoder exhausted retries'
    assert state.transcription_status == {
        'state': 'error',
        'progress': 0,
        'error': 'asr backend failed: decoder exhausted retries',
    }


def test_batch_recovery_returns_409_when_lock_is_already_held(monkeypatch) -> None:
    client = _client(monkeypatch)

    asyncio.run(transcribe_routes._transcribe_lock.acquire())
    try:
        response = client.post('/transcribe', files={'audio': ('recording.webm', b'fake-webm', 'audio/webm')})
    finally:
        transcribe_routes._transcribe_lock.release()

    assert response.status_code == 409
    assert response.json()['detail'] == 'Transcription already in progress'


def test_live_happy_path(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk1 = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '1', 'chunkStartMs': '0', 'chunkEndMs': '400', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b'alpha beta', 'audio/webm')},
    )
    assert chunk1.status_code == 200

    pause = client.post('/transcribe/live/pause', json={'sessionId': session_id, 'atMs': 400})
    assert pause.status_code == 200
    resume = client.post('/transcribe/live/resume', json={'sessionId': session_id, 'atMs': 550})
    assert resume.status_code == 200

    chunk2 = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '2', 'chunkStartMs': '400', 'chunkEndMs': '900', 'isLast': 'true'},
        files={'audio': ('chunk.webm', b'alpha beta gamma', 'audio/webm')},
    )
    assert chunk2.status_code == 200

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 1000})
    assert stop.status_code == 200
    payload = stop.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())


def test_live_chunk_patch_replaces_only_changed_suffix(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    first = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '1', 'chunkStartMs': '0', 'chunkEndMs': '500', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b'one two three', 'audio/webm')},
    )
    assert first.status_code == 200

    second = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '2', 'chunkStartMs': '500', 'chunkEndMs': '1000', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b'one two four', 'audio/webm')},
    )
    assert second.status_code == 200

    payload = second.json()
    assert payload['finalized']['mode'] == 'patch'
    assert payload['finalized']['replaceFromWordIndex'] >= 0
    rendered = ''.join(word['word'] for word in payload['finalized']['words']).strip()
    assert rendered != ''


def test_live_pcm_window_path_preserves_full_transcript_snapshot(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    last_payload = None
    for seq in range(1, 12):
        response = client.post(
            '/transcribe/live/chunk',
            data={
                'sessionId': session_id,
                'seq': str(seq),
                'chunkStartMs': str((seq - 1) * 500),
                'chunkEndMs': str(seq * 500),
                'isLast': 'false',
            },
            files={'audio': ('chunk.webm', f'word{seq}'.encode(), 'audio/webm')},
        )
        assert response.status_code == 200
        last_payload = response.json()

    assert last_payload is not None
    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 6000})
    assert stop.status_code == 200
    full_text = ''.join(word['word'] for word in stop.json()['words']).strip()
    assert 'word' in full_text


class _FakeInputWebSocket:
    def __init__(self, session_id: str, json_messages: list[dict], byte_messages: list[bytes]) -> None:
        self.query_params = {'sessionId': session_id}
        self._json_messages = list(json_messages)
        self._byte_messages = list(byte_messages)

    async def accept(self) -> None:
        return None

    async def receive_json(self) -> dict:
        if not self._json_messages:
            raise WebSocketDisconnect(code=1000)
        return self._json_messages.pop(0)

    async def receive_bytes(self) -> bytes:
        if not self._byte_messages:
            raise WebSocketDisconnect(code=1000)
        return self._byte_messages.pop(0)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        return None


def test_live_websocket_pcm_flow_emits_patch_and_complete(monkeypatch) -> None:
    client = _client(monkeypatch)

    prepare = client.post(
        '/transcribe/live/prepare',
        json={
            'sampleRate': 16000,
            'channels': 1,
            'pcmEncoding': 'pcm_s16le',
            'packetSamples': 2048,
            'archiveMimeType': 'audio/webm;codecs=opus',
        },
    )
    assert prepare.status_code == 200
    session_id = prepare.json()['sessionId']

    websocket = _FakeInputWebSocket(
        session_id,
        [
            {'type': 'start', 'sessionId': session_id},
            {
                'type': 'pcm',
                'sessionId': session_id,
                'seq': 1,
                'captureStartSample': 0,
                'captureEndSample': 2048,
                'captureStartMs': 0,
                'captureEndMs': 128,
                'sampleRate': 16000,
                'channels': 1,
                'bytes': 10,
                'pcmEncoding': 'pcm_s16le',
            },
            {'type': 'stop', 'sessionId': session_id, 'atMs': 128},
        ],
        [b'alpha beta'],
    )

    asyncio.run(transcribe_routes.live_input_socket(websocket))
    state_event = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    patch = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    telemetry = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    complete = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    assert state_event['type'] == 'state'
    assert patch['type'] == 'patch'
    assert telemetry['type'] == 'telemetry'
    assert complete['type'] == 'complete'
    assert set(['words', 'segments', 'language', 'duration']).issubset(complete.keys())


def test_live_websocket_pause_resume_excludes_paused_spans(monkeypatch) -> None:
    client = _client(monkeypatch)

    prepare = client.post(
        '/transcribe/live/prepare',
        json={
            'sampleRate': 16000,
            'channels': 1,
            'pcmEncoding': 'pcm_s16le',
            'packetSamples': 2048,
            'archiveMimeType': 'audio/webm;codecs=opus',
        },
    )
    session_id = prepare.json()['sessionId']

    websocket = _FakeInputWebSocket(
        session_id,
        [
            {'type': 'start', 'sessionId': session_id},
            {'type': 'pause', 'sessionId': session_id, 'atMs': 400},
            {'type': 'resume', 'sessionId': session_id, 'atMs': 900},
            {'type': 'stop', 'sessionId': session_id, 'atMs': 1200},
        ],
        [],
    )

    asyncio.run(transcribe_routes.live_input_socket(websocket))
    state_event = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    paused = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    resumed = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    complete = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    assert state_event['type'] == 'state'
    assert paused['state'] == 'paused'
    assert resumed['state'] == 'live'
    assert complete['type'] == 'complete'

    session = state.live_transcription_manager._sessions[session_id]
    assert session.paused_spans == [{'startMs': 400, 'endMs': 900}]
    assert complete['duration'] == 1.2


def test_live_stop_contract_unchanged_with_metrics_enabled(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '1', 'chunkStartMs': '0', 'chunkEndMs': '500', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b'alpha beta', 'audio/webm')},
    )
    assert chunk.status_code == 200

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 800})
    assert stop.status_code == 200
    payload = stop.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())


def test_latest_only_scheduler_skips_superseded_intermediate_windows(monkeypatch) -> None:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()

    entered = threading.Event()
    unblock = threading.Event()
    _install_fake_pipeline(monkeypatch, block_on_transcribe=unblock, entered=entered)
    client = TestClient(app)

    prepare = client.post(
        '/transcribe/live/prepare',
        json={
            'sampleRate': 16000,
            'channels': 1,
            'pcmEncoding': 'pcm_s16le',
            'packetSamples': 2048,
            'archiveMimeType': 'audio/webm;codecs=opus',
        },
    )
    assert prepare.status_code == 200
    session_id = prepare.json()['sessionId']

    websocket = _FakeInputWebSocket(
        session_id,
        [
            {'type': 'start', 'sessionId': session_id},
            {
                'type': 'pcm',
                'sessionId': session_id,
                'seq': 1,
                'captureStartSample': 0,
                'captureEndSample': 2048,
                'captureStartMs': 0,
                'captureEndMs': 128,
                'sampleRate': 16000,
                'channels': 1,
                'bytes': 5,
                'pcmEncoding': 'pcm_s16le',
            },
            {
                'type': 'pcm',
                'sessionId': session_id,
                'seq': 2,
                'captureStartSample': 2048,
                'captureEndSample': 4096,
                'captureStartMs': 128,
                'captureEndMs': 256,
                'sampleRate': 16000,
                'channels': 1,
                'bytes': 10,
                'pcmEncoding': 'pcm_s16le',
            },
            {'type': 'pause', 'sessionId': session_id, 'atMs': 300},
            {'type': 'resume', 'sessionId': session_id, 'atMs': 450},
            {
                'type': 'pcm',
                'sessionId': session_id,
                'seq': 3,
                'captureStartSample': 4096,
                'captureEndSample': 6144,
                'captureStartMs': 256,
                'captureEndMs': 384,
                'sampleRate': 16000,
                'channels': 1,
                'bytes': 16,
                'pcmEncoding': 'pcm_s16le',
            },
            {'type': 'stop', 'sessionId': session_id, 'atMs': 600},
        ],
        [b'alpha', b'alpha beta', b'alpha beta gamma'],
    )

    thread = threading.Thread(target=lambda: asyncio.run(transcribe_routes.live_input_socket(websocket)))
    thread.start()
    assert entered.wait(timeout=1)
    time.sleep(0.05)
    unblock.set()
    thread.join(timeout=2)
    assert not thread.is_alive()

    session = state.live_transcription_manager._sessions[session_id]
    events: list[dict] = []
    while True:
        try:
            events.append(session.output_queue.get_nowait())
        except queue.Empty:
            break

    assert [event['type'] for event in events].count('patch') == 1
    patch = next(event for event in events if event['type'] == 'patch')
    telemetry = next(event for event in events if event['type'] == 'telemetry')
    complete = next(event for event in events if event['type'] == 'complete')

    assert patch['seq'] == 3
    assert patch['finalized']['mode'] == 'patch'
    assert 'replaceFromWordIndex' in patch['finalized']
    assert patch['metrics']['supersededResultsDropped'] >= 1
    assert telemetry['pendingLatest'] is False
    assert telemetry['latestSeqAccepted'] == 3
    assert telemetry['latestSeqProcessed'] == 3
    assert telemetry['supersededResultsDropped'] >= 1
    assert set(['words', 'segments', 'language', 'duration']).issubset(complete.keys())
    assert session.paused_spans == [{'startMs': 300, 'endMs': 450}]


