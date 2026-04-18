from __future__ import annotations

import asyncio
import threading
import time
from pathlib import Path
import sys

import pytest
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


def _fake_words(seed: str = 'hello world') -> dict:
    tokens = [token for token in seed.split(' ') if token]
    words = []
    start = 0.0
    for idx, token in enumerate(tokens):
        end = round(start + 0.4, 3)
        words.append({'id': idx, 'word': f"{token} ", 'start': start, 'end': end, 'probability': 1.0, 'segmentId': 0})
        start = end
    return {
        'words': words,
        'segments': [{'id': 0, 'start': 0.0, 'end': words[-1]['end'] if words else 0.0, 'text': seed}],
        'language': 'en',
        'duration': words[-1]['end'] if words else 0.0,
    }


def _install_fake_live_pipeline(monkeypatch, *, block_on_transcribe: threading.Event | None = None, entered: threading.Event | None = None) -> None:
    monkeypatch.setattr(live_service, 'write_pcm_to_wav', lambda pcm, _sample_rate, wav_path: wav_path.write_bytes(pcm))

    def _fake_transcribe(_model_dir: Path, wav_path: Path, _device: str) -> dict:
        if entered is not None:
            entered.set()
        if block_on_transcribe is not None:
            block_on_transcribe.wait(timeout=2)
        payload = wav_path.read_bytes().decode(errors='ignore').strip() or 'hello world'
        return _fake_words(payload)

    monkeypatch.setattr(live_service, 'transcribe_wav_file', _fake_transcribe)
    monkeypatch.setattr(transcribe_routes, 'warm_model_for_live', lambda *_args, **_kwargs: {'warmupMs': 1.0})


def _client(monkeypatch) -> TestClient:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()
    assert state.live_transcription_manager is not None
    _install_fake_live_pipeline(monkeypatch)
    return TestClient(app)


def test_live_session_state_machine(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '500',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'hello world', 'audio/webm')},
    )
    assert chunk.status_code == 200
    assert chunk.json()['state'] == 'live'

    pause = client.post('/transcribe/live/pause', json={'sessionId': session_id, 'atMs': 500})
    assert pause.status_code == 200
    assert pause.json()['state'] == 'paused'

    resume = client.post('/transcribe/live/resume', json={'sessionId': session_id, 'atMs': 650})
    assert resume.status_code == 200
    assert resume.json()['state'] == 'live'

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 1000})
    assert stop.status_code == 200
    payload = stop.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())


def test_live_endpoints_contract(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 16000, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    data = start.json()
    assert 'sessionId' in data

    status = client.get('/transcribe/live/status', params={'sessionId': data['sessionId']})
    assert status.status_code == 200
    assert set(['sessionId', 'state', 'lastSeq', 'queueDepth', 'warning', 'error']).issubset(status.json().keys())


def test_live_prepare_returns_socket_contract_and_runtime_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        transcribe_routes,
        'describe_runtime_provider',
        lambda _device: {
            'deviceMode': 'auto',
            'runtimeProvider': 'CPUExecutionProvider',
            'runtimeQuantization': 'default',
            'runtimeFallbackUsed': False,
            'availableProviders': ['CPUExecutionProvider'],
        },
    )
    client = _client(monkeypatch)

    response = client.post(
        '/transcribe/live/prepare',
        json={
            'sampleRate': 16000,
            'channels': 1,
            'pcmEncoding': 'pcm_s16le',
            'packetSamples': 2048,
            'archiveMimeType': 'audio/webm;codecs=opus',
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload['state'] == 'prepared'
    assert payload['inputSocketPath'] == '/transcribe/live/input'
    assert payload['outputSocketPath'] == '/transcribe/live/output'
    assert payload['runtimeProvider'] == 'CPUExecutionProvider'
    assert payload['runtimeQuantization'] == 'default'
    assert payload['runtimeFallbackUsed'] is False


class _FakeOutputWebSocket:
    def __init__(self, session_id: str | None) -> None:
        self.query_params = {} if session_id is None else {'sessionId': session_id}
        self.sent: list[dict] = []
        self.accepted = False
        self.closed_code: int | None = None

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, payload: dict) -> None:
        self.sent.append(payload)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed_code = code


def test_live_output_socket_emits_ready_event(monkeypatch) -> None:
    client = _client(monkeypatch)

    response = client.post(
        '/transcribe/live/prepare',
        json={
            'sampleRate': 16000,
            'channels': 1,
            'pcmEncoding': 'pcm_s16le',
            'packetSamples': 2048,
            'archiveMimeType': 'audio/webm;codecs=opus',
        },
    )
    assert response.status_code == 200
    session_id = response.json()['sessionId']
    asyncio.run(
        state.live_transcription_manager.push_output_event(
            session_id,
            {
                'type': 'complete',
                'sessionId': session_id,
                'state': 'complete',
                'words': [],
                'segments': [],
                'language': '',
                'duration': 0.0,
            },
        )
    )

    websocket = _FakeOutputWebSocket(session_id)
    asyncio.run(transcribe_routes.live_output_socket(websocket))
    assert websocket.sent[0] == {
        'type': 'ready',
        'sessionId': session_id,
        'state': 'ready',
        'queueDepth': 0,
        'workerBusy': False,
        'waitingRequests': 0,
    }


def test_live_output_socket_requires_session_id(monkeypatch) -> None:
    _client(monkeypatch)
    websocket = _FakeOutputWebSocket(None)
    asyncio.run(transcribe_routes.live_output_socket(websocket))
    assert websocket.closed_code == 1008


class _FakeInputWebSocket:
    def __init__(self, session_id: str, json_messages: list[dict], byte_messages: list[bytes]) -> None:
        self.query_params = {'sessionId': session_id}
        self._json_messages = list(json_messages)
        self._byte_messages = list(byte_messages)
        self.accepted = False
        self.closed = False

    async def accept(self) -> None:
        self.accepted = True

    async def receive_json(self) -> dict:
        if not self._json_messages:
            raise WebSocketDisconnect(code=1000)
        return self._json_messages.pop(0)

    async def receive_bytes(self) -> bytes:
        if not self._byte_messages:
            raise WebSocketDisconnect(code=1000)
        return self._byte_messages.pop(0)

    async def close(self, code: int = 1000, reason: str | None = None) -> None:
        self.closed = True


def test_live_input_socket_receives_metadata_then_receive_bytes(monkeypatch) -> None:
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
            }
        ],
        [b'hello worl'],
    )

    asyncio.run(transcribe_routes.live_input_socket(websocket))
    payload = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    assert payload['type'] == 'patch'


def test_live_input_socket_emits_fatal_error_on_malformed_pcm_size(monkeypatch) -> None:
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
                'bytes': 99,
                'pcmEncoding': 'pcm_s16le',
            }
        ],
        [b'too-short'],
    )

    asyncio.run(transcribe_routes.live_input_socket(websocket))
    payload = asyncio.run(state.live_transcription_manager.next_output_event(session_id))
    assert payload['type'] == 'error'
    assert payload['fatal'] is True


def test_live_chunk_metrics_include_ttft_and_queue_depth(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '500',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'hello world', 'audio/webm')},
    )

    assert chunk.status_code == 200
    metrics = chunk.json()['metrics']
    assert 'serverLatencyMs' in metrics
    assert 'timeToFirstTokenMs' in metrics
    assert 'queueDepth' in metrics
    assert 'updateGapMs' in metrics


def test_live_status_reports_latency_targets(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '500',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'hello world', 'audio/webm')},
    )
    assert chunk.status_code == 200

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    payload = status.json()

    assert payload['metrics']['targets']['ttftP50Ms'] == 800
    assert payload['metrics']['targets']['ttftP95Ms'] == 1500
    assert payload['metrics']['targets']['updateCadenceP50Ms'] == 600
    assert payload['metrics']['targets']['queueDepthP95'] == 1


def test_live_status_reports_worker_busy_and_waiting_requests(monkeypatch) -> None:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()

    entered = threading.Event()
    unblock = threading.Event()
    _install_fake_live_pipeline(monkeypatch, block_on_transcribe=unblock, entered=entered)

    client = TestClient(app)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk1_result: dict[str, int] = {'status': 0}

    def _chunk1() -> None:
        response = client.post(
            '/transcribe/live/chunk',
            data={
                'sessionId': session_id,
                'seq': '1',
                'chunkStartMs': '0',
                'chunkEndMs': '500',
                'isLast': 'false',
            },
            files={'audio': ('chunk.webm', b'first', 'audio/webm')},
        )
        chunk1_result['status'] = response.status_code

    t1 = threading.Thread(target=_chunk1)
    t1.start()
    assert entered.wait(timeout=1)

    t2 = threading.Thread(
        target=lambda: client.post(
            '/transcribe/live/chunk',
            data={
                'sessionId': session_id,
                'seq': '2',
                'chunkStartMs': '500',
                'chunkEndMs': '1000',
                'isLast': 'false',
            },
            files={'audio': ('chunk.webm', b'second', 'audio/webm')},
        )
    )
    t2.start()
    time.sleep(0.05)

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    payload = status.json()
    assert payload['metrics']['observed']['workerBusy'] is True
    assert payload['metrics']['observed']['waitingRequests'] >= 1
    assert payload['queueDepth'] >= 1

    unblock.set()
    t1.join(timeout=2)
    t2.join(timeout=2)
    assert chunk1_result['status'] == 200


def test_live_chunk_payload_includes_patch_metadata(monkeypatch) -> None:
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    chunk = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '500',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'hello world', 'audio/webm')},
    )

    assert chunk.status_code == 200
    finalized = chunk.json()['finalized']
    assert set(['mode', 'replaceFromWordIndex', 'words', 'segments']).issubset(finalized.keys())


def test_live_start_returns_runtime_provider_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        transcribe_routes,
        'describe_runtime_provider',
        lambda _device: {
            'deviceMode': 'auto',
            'runtimeProvider': 'CPUExecutionProvider',
            'runtimeQuantization': 'default',
            'runtimeFallbackUsed': False,
            'availableProviders': ['CPUExecutionProvider'],
        },
    )
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 16000, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    payload = start.json()
    assert set(['deviceMode', 'runtimeProvider', 'runtimeQuantization', 'runtimeFallbackUsed', 'availableProviders']).issubset(payload.keys())


def test_live_status_returns_runtime_provider_metadata(monkeypatch) -> None:
    monkeypatch.setattr(
        transcribe_routes,
        'describe_runtime_provider',
        lambda _device: {
            'deviceMode': 'auto',
            'runtimeProvider': 'CoreMLExecutionProvider',
            'runtimeQuantization': 'int8',
            'runtimeFallbackUsed': False,
            'availableProviders': ['CoreMLExecutionProvider', 'CPUExecutionProvider'],
        },
    )
    client = _client(monkeypatch)

    start = client.post('/transcribe/live/start', json={'sampleRate': 16000, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    payload = status.json()
    assert payload['runtimeProvider'] == 'CoreMLExecutionProvider'
    assert payload['runtimeQuantization'] == 'int8'
    assert payload['runtimeFallbackUsed'] is False
