from __future__ import annotations

from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.state as state
from app.main import create_app
from app.routes import transcribe as transcribe_routes


class _FakeModelManager:
    state = 'present'

    def get_model_path(self) -> Path:
        return Path('.')


def _fake_transcribe(_model_dir: Path, _audio_path: Path, _device: str) -> dict:
    return {
        'words': [
            {'id': 0, 'word': 'live ', 'start': 0.0, 'end': 0.3, 'probability': 1.0, 'segmentId': 0},
            {'id': 1, 'word': 'test ', 'start': 0.3, 'end': 0.7, 'probability': 1.0, 'segmentId': 0},
        ],
        'segments': [{'id': 0, 'start': 0.0, 'end': 0.7, 'text': 'live test'}],
        'language': 'en',
        'duration': 0.7,
    }


def _client() -> TestClient:
    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()
    assert state.live_transcription_manager is not None
    state.live_transcription_manager._transcribe_callable = _fake_transcribe
    return TestClient(app)


def test_batch_recovery_endpoint_still_available(monkeypatch) -> None:
    client = _client()

    monkeypatch.setattr(transcribe_routes, 'transcribe_file', _fake_transcribe)
    state.transcription_status = {'state': 'idle', 'progress': 0, 'error': None}

    response = client.post(
        '/transcribe',
        files={'audio': ('recording.webm', b'fake-webm', 'audio/webm')},
    )

    assert response.status_code == 200
    payload = response.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())



def test_live_happy_path() -> None:
    client = _client()

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    assert start.status_code == 200
    session_id = start.json()['sessionId']

    chunk1 = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '400',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'aaa', 'audio/webm')},
    )
    assert chunk1.status_code == 200

    pause = client.post('/transcribe/live/pause', json={'sessionId': session_id, 'atMs': 400})
    assert pause.status_code == 200
    resume = client.post('/transcribe/live/resume', json={'sessionId': session_id, 'atMs': 550})
    assert resume.status_code == 200

    chunk2 = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '2',
            'chunkStartMs': '400',
            'chunkEndMs': '900',
            'isLast': 'true',
        },
        files={'audio': ('chunk.webm', b'bbb', 'audio/webm')},
    )
    assert chunk2.status_code == 200

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 1000})
    assert stop.status_code == 200
    payload = stop.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())


def test_live_stop_contract_unchanged_with_metrics_enabled() -> None:
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
        files={'audio': ('chunk.webm', b'aaa', 'audio/webm')},
    )
    assert chunk.status_code == 200
    chunk_metrics = chunk.json()['metrics']
    assert 'serverLatencyMs' in chunk_metrics
    assert 'timeToFirstTokenMs' in chunk_metrics
    assert 'queueDepth' in chunk_metrics
    assert 'updateGapMs' in chunk_metrics

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    status_payload = status.json()
    assert status_payload['metrics']['targets']['ttftP50Ms'] == 800
    assert status_payload['metrics']['targets']['ttftP95Ms'] == 1500
    assert status_payload['metrics']['targets']['updateCadenceP50Ms'] == 600
    assert status_payload['metrics']['targets']['queueDepthP95'] == 1

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 800})
    assert stop.status_code == 200
    payload = stop.json()
    assert set(['words', 'segments', 'language', 'duration']).issubset(payload.keys())


def test_live_failure_semantics_preserved_in_safe_auto_and_aggressive(monkeypatch) -> None:
    for mode in ('safe_auto', 'aggressive_internal'):
        monkeypatch.setenv('AMANUENSIS_LIVE_SPEED_MODE', mode)
        client = _client()

        start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
        assert start.status_code == 200
        session_id = start.json()['sessionId']
        assert start.json()['speedMode'] == mode

        def _boom(_model_dir: Path, _audio_path: Path, _device: str) -> dict:
            raise RuntimeError(f'forced integration failure ({mode})')

        assert state.live_transcription_manager is not None
        monkeypatch.setattr(state.live_transcription_manager, '_transcribe_callable', _boom)

        chunk = client.post(
            '/transcribe/live/chunk',
            data={
                'sessionId': session_id,
                'seq': '1',
                'chunkStartMs': '0',
                'chunkEndMs': '500',
                'isLast': 'false',
            },
            files={'audio': ('chunk.webm', b'aaa', 'audio/webm')},
        )
        assert chunk.status_code == 500

        status = client.get('/transcribe/live/status', params={'sessionId': session_id})
        assert status.status_code == 200
        status_payload = status.json()
        assert status_payload['warning'] is not None
        assert status_payload['error'] is not None

        stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 600})
        assert stop.status_code == 200
        assert set(['words', 'segments', 'language', 'duration']).issubset(stop.json().keys())


def test_live_failure_warning_nonfatal(monkeypatch) -> None:
    client = _client()

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    def _boom(_model_dir: Path, _audio_path: Path, _device: str) -> dict:
        raise RuntimeError('forced integration failure')

    assert state.live_transcription_manager is not None
    monkeypatch.setattr(state.live_transcription_manager, '_transcribe_callable', _boom)

    chunk = client.post(
        '/transcribe/live/chunk',
        data={
            'sessionId': session_id,
            'seq': '1',
            'chunkStartMs': '0',
            'chunkEndMs': '500',
            'isLast': 'false',
        },
        files={'audio': ('chunk.webm', b'aaa', 'audio/webm')},
    )
    assert chunk.status_code == 500

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    assert status.json()['warning'] is not None

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 600})
    assert stop.status_code == 200
    assert set(['words', 'segments', 'language', 'duration']).issubset(stop.json().keys())
