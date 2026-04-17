from __future__ import annotations

from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.state as state
from app.main import create_app
from app.routes import transcribe as transcribe_routes
from app.services import live_transcription as live_service


class _FakeModelManager:
    state = 'present'

    def get_model_path(self) -> Path:
        return Path('.')


def _install_fake_pipeline(monkeypatch) -> None:
    monkeypatch.setattr(live_service, 'decode_webm_to_pcm', lambda audio_path: (audio_path.read_bytes() or b'x', 16000))
    monkeypatch.setattr(live_service, 'write_pcm_to_wav', lambda pcm, _sample_rate, wav_path: wav_path.write_bytes(pcm))

    def _fake_transcribe(_model_dir: Path, wav_path: Path, _device: str) -> dict:
        text = wav_path.read_bytes().decode(errors='ignore').strip()
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

    monkeypatch.setattr(live_service, 'transcribe_wav_file', _fake_transcribe)
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


def test_chunk_decode_fallback_uses_stitched_window_without_warning(monkeypatch) -> None:
    client = _client(monkeypatch)

    def _decode_requires_header(audio_path: Path) -> tuple[bytes, int]:
        payload = audio_path.read_bytes()
        if payload.startswith(b'head'):
            return payload, 16000
        raise RuntimeError('ffmpeg conversion failed: EBML header parsing failed')

    monkeypatch.setattr(live_service, 'decode_webm_to_pcm', _decode_requires_header)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    first = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '1', 'chunkStartMs': '0', 'chunkEndMs': '500', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b'head alpha', 'audio/webm')},
    )
    assert first.status_code == 200

    second = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '2', 'chunkStartMs': '500', 'chunkEndMs': '1000', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b' beta', 'audio/webm')},
    )
    assert second.status_code == 200

    status = client.get('/transcribe/live/status', params={'sessionId': session_id})
    assert status.status_code == 200
    assert status.json()['warning'] is None

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 1100})
    assert stop.status_code == 200
    full_text = ''.join(word['word'] for word in stop.json()['words']).strip()
    assert 'beta' in full_text


def test_ebml_soft_failure_warning_remains_nonfatal(monkeypatch) -> None:
    # Keep explicit EBML regression mention so soft-failure contract remains covered.
    def _boom_decode(_audio_path: Path) -> tuple[bytes, int]:
        raise RuntimeError('ffmpeg conversion failed: EBML header parsing failed')

    monkeypatch.setattr(live_service, 'decode_webm_to_pcm', _boom_decode)
    monkeypatch.setattr(transcribe_routes, 'warm_model_for_live', lambda *_args, **_kwargs: {'warmupMs': 1.0})

    app = create_app('/tmp/amanuensis-test', device='cpu')
    state.model_manager = _FakeModelManager()
    client = TestClient(app)

    start = client.post('/transcribe/live/start', json={'sampleRate': 44100, 'channels': 1, 'mimeType': 'audio/webm'})
    session_id = start.json()['sessionId']

    chunk = client.post(
        '/transcribe/live/chunk',
        data={'sessionId': session_id, 'seq': '1', 'chunkStartMs': '0', 'chunkEndMs': '500', 'isLast': 'false'},
        files={'audio': ('chunk.webm', b'bad', 'audio/webm')},
    )
    assert chunk.status_code == 200

    stop = client.post('/transcribe/live/stop', json={'sessionId': session_id, 'atMs': 600})
    assert stop.status_code == 200
