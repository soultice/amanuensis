from __future__ import annotations

from pathlib import Path
import sys
import asyncio
import threading
import time

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.state as state
from app.main import create_app


class _FakeModelManager:
    state = 'present'

    def get_model_path(self) -> Path:
        return Path('.')


def _fake_transcribe(_model_dir: Path, _audio_path: Path, _device: str) -> dict:
    return {
        'words': [
            {'id': 0, 'word': 'hello ', 'start': 0.0, 'end': 0.4, 'probability': 1.0, 'segmentId': 0},
            {'id': 1, 'word': 'world ', 'start': 0.4, 'end': 0.9, 'probability': 1.0, 'segmentId': 0},
        ],
        'segments': [{'id': 0, 'start': 0.0, 'end': 0.9, 'text': 'hello world'}],
        'language': 'en',
        'duration': 0.9,
    }


def _client() -> TestClient:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()
    assert state.live_transcription_manager is not None
    state.live_transcription_manager._transcribe_callable = _fake_transcribe
    return TestClient(app)


def test_live_session_state_machine() -> None:
    client = _client()

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
        files={'audio': ('chunk.webm', b'123', 'audio/webm')},
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


def test_live_endpoints_contract() -> None:
    client = _client()

    start = client.post('/transcribe/live/start', json={'sampleRate': 16000, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    data = start.json()
    assert 'sessionId' in data

    status = client.get('/transcribe/live/status', params={'sessionId': data['sessionId']})
    assert status.status_code == 200
    assert set(['sessionId', 'state', 'lastSeq', 'queueDepth', 'warning', 'error']).issubset(status.json().keys())


def test_live_chunk_metrics_include_ttft_and_queue_depth() -> None:
    client = _client()

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
        files={'audio': ('chunk.webm', b'abc', 'audio/webm')},
    )

    assert chunk.status_code == 200
    metrics = chunk.json()['metrics']
    assert 'serverLatencyMs' in metrics
    assert 'timeToFirstTokenMs' in metrics
    assert 'queueDepth' in metrics
    assert 'updateGapMs' in metrics


def test_live_status_reports_latency_targets() -> None:
    client = _client()

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
        files={'audio': ('chunk.webm', b'abc', 'audio/webm')},
    )
    assert chunk.status_code == 200

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    payload = status.json()

    assert payload['metrics']['targets']['ttftP50Ms'] == 800
    assert payload['metrics']['targets']['ttftP95Ms'] == 1500
    assert payload['metrics']['targets']['updateCadenceP50Ms'] == 600
    assert payload['metrics']['targets']['queueDepthP95'] == 1


def test_live_status_reports_worker_busy_and_waiting_requests() -> None:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()

    release_first_chunk = threading.Event()
    first_chunk_started = threading.Event()

    def _blocking_transcribe(_model_dir: Path, _audio_path: Path, _device: str) -> dict:
        first_chunk_started.set()
        release_first_chunk.wait(timeout=5)
        return _fake_transcribe(_model_dir, _audio_path, _device)

    assert state.live_transcription_manager is not None
    state.live_transcription_manager._transcribe_callable = _blocking_transcribe

    status_client = TestClient(app)
    first_chunk_client = TestClient(app)

    start = status_client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    results: dict[str, object] = {}

    def _post_chunk(name: str, seq: int, client: TestClient) -> None:
        try:
            response = client.post(
                '/transcribe/live/chunk',
                data={
                    'sessionId': session_id,
                    'seq': str(seq),
                    'chunkStartMs': str((seq - 1) * 500),
                    'chunkEndMs': str(seq * 500),
                    'isLast': 'false',
                },
                files={'audio': (f'chunk-{seq}.webm', b'abc', 'audio/webm')},
            )
            results[name] = response
        except Exception as exc:  # pragma: no cover - defensive path
            results[name] = exc

    def _ingest_chunk(name: str, seq: int) -> None:
        async def _run() -> dict:
            assert state.live_transcription_manager is not None
            return await state.live_transcription_manager.ingest_chunk(
                session_id=session_id,
                seq=seq,
                chunk_start_ms=(seq - 1) * 500,
                chunk_end_ms=seq * 500,
                audio_bytes=b'abc',
                model_dir=Path('.'),
                device='cpu',
                is_last=False,
            )

        try:
            results[name] = asyncio.run(_run())
        except Exception as exc:  # pragma: no cover - defensive path
            results[name] = exc

    first_thread = threading.Thread(target=_post_chunk, args=('first', 1, first_chunk_client), daemon=True)
    second_thread = threading.Thread(target=_ingest_chunk, args=('second', 2), daemon=True)

    first_thread.start()
    assert first_chunk_started.wait(timeout=2), 'first chunk did not enter transcribe callback'

    second_thread.start()

    payload = None
    for _ in range(30):
        status = status_client.get('/transcribe/live/status', params={'sessionId': session_id})
        assert status.status_code == 200
        candidate = status.json()
        if candidate['metrics']['observed']['workerBusy'] and candidate['metrics']['observed']['waitingRequests'] >= 1:
            payload = candidate
            break
        time.sleep(0.05)

    assert payload is not None, 'live status never reported worker busy + waiting backlog'
    assert payload['metrics']['observed']['workerBusy'] is True
    assert payload['metrics']['observed']['waitingRequests'] >= 1
    assert payload['queueDepth'] >= 1

    release_first_chunk.set()

    first_thread.join(timeout=5)
    second_thread.join(timeout=5)

    assert not first_thread.is_alive()
    assert 'first' in results
    assert getattr(results['first'], 'status_code', 500) == 200


def test_live_speed_mode_defaults_to_safe_auto(monkeypatch) -> None:
    client = _client()
    monkeypatch.delenv('AMANUENSIS_LIVE_SPEED_MODE', raising=False)

    start = client.post('/transcribe/live/start', json={'sampleRate': 16000, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    assert start.json()['speedMode'] == 'safe_auto'


def test_live_speed_mode_env_aggressive_internal(monkeypatch) -> None:
    client = _client()
    monkeypatch.setenv('AMANUENSIS_LIVE_SPEED_MODE', 'aggressive_internal')

    start = client.post('/transcribe/live/start', json={'sampleRate': 16000, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    assert start.json()['speedMode'] == 'aggressive_internal'


def test_live_failure_does_not_abort_session(monkeypatch) -> None:
    client = _client()
    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    def _boom(_model_dir: Path, _audio_path: Path, _device: str) -> dict:
        raise RuntimeError('forced live failure')

    assert state.live_transcription_manager is not None
    monkeypatch.setattr(state.live_transcription_manager, '_transcribe_callable', _boom)

    chunk = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '200',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'123', 'audio/webm')},
    )
    assert chunk.status_code == 500

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    payload = status.json()
    assert payload['error'] is not None
    assert payload['warning'] is not None

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 300})
    assert stop.status_code == 200
    assert set(['words', 'segments', 'language', 'duration']).issubset(stop.json().keys())
