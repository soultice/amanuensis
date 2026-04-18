from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import transcription


class _FakeLoadedModel:
    def __init__(self, model_dir: str, providers: list[str], quantization: str | None) -> None:
        self.model_dir = model_dir
        self.providers = providers
        self.quantization = quantization

    def with_timestamps(self) -> '_FakeLoadedModel':
        return self


def _write_required_model_files(model_dir: Path) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    for name in [
        'encoder-model.onnx',
        'encoder-model.onnx.data',
        'decoder_joint-model.onnx',
        'vocab.txt',
    ]:
        (model_dir / name).write_text('x')


def test_resolve_execution_candidates_prefers_cuda_then_dml_then_cpu(monkeypatch) -> None:
    monkeypatch.setattr(
        transcription,
        'get_available_execution_providers',
        lambda: ['CPUExecutionProvider', 'CoreMLExecutionProvider', 'DmlExecutionProvider', 'CUDAExecutionProvider'],
    )
    monkeypatch.setattr(transcription.sys, 'platform', 'darwin')

    candidates = transcription.resolve_execution_candidates('auto')

    assert candidates == [
        {
            'runtimeProvider': 'CUDAExecutionProvider',
            'providerOrder': ['CUDAExecutionProvider', 'CPUExecutionProvider'],
            'quantization': None,
        },
        {
            'runtimeProvider': 'DmlExecutionProvider',
            'providerOrder': ['DmlExecutionProvider', 'CPUExecutionProvider'],
            'quantization': None,
        },
        {
            'runtimeProvider': 'CPUExecutionProvider',
            'providerOrder': ['CPUExecutionProvider'],
            'quantization': None,
        },
    ]


def test_resolve_execution_provider_order_cpu_mode_is_cpu_only() -> None:
    selected, order = transcription.resolve_execution_provider_order('cpu')

    assert selected == 'CPUExecutionProvider'
    assert order == ['CPUExecutionProvider']


def test_resolve_execution_candidates_prefers_cpu_on_macos_auto(monkeypatch) -> None:
    monkeypatch.setattr(
        transcription,
        'get_available_execution_providers',
        lambda: ['CPUExecutionProvider', 'CoreMLExecutionProvider'],
    )
    monkeypatch.setattr(transcription.sys, 'platform', 'darwin')

    candidates = transcription.resolve_execution_candidates('auto')

    assert candidates == [
        {
            'runtimeProvider': 'CPUExecutionProvider',
            'providerOrder': ['CPUExecutionProvider'],
            'quantization': None,
        },
    ]


def test_resolve_execution_provider_order_cuda_mode_falls_back_to_cpu_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(transcription, 'get_available_execution_providers', lambda: ['CPUExecutionProvider'])

    selected, order = transcription.resolve_execution_provider_order('cuda')

    assert selected == 'CPUExecutionProvider'
    assert order == ['CPUExecutionProvider']


def test_get_model_cache_key_includes_model_dir(monkeypatch, tmp_path: Path) -> None:
    load_calls: list[tuple[str, tuple[str, ...], str | None]] = []

    def _fake_load_model(
        _name: str,
        model_dir: str,
        *,
        quantization: str | None = None,
        providers: list[str],
    ) -> _FakeLoadedModel:
        load_calls.append((model_dir, tuple(providers), quantization))
        return _FakeLoadedModel(model_dir, providers, quantization)

    monkeypatch.setattr(
        transcription,
        'resolve_execution_candidates',
        lambda _device='auto': [
            {
                'runtimeProvider': 'CPUExecutionProvider',
                'providerOrder': ['CPUExecutionProvider'],
                'quantization': None,
            }
        ],
    )
    monkeypatch.setitem(sys.modules, 'onnx_asr', SimpleNamespace(load_model=_fake_load_model))
    monkeypatch.setattr(transcription, '_model', None)
    monkeypatch.setattr(transcription, '_model_cache_key', None)
    monkeypatch.setattr(transcription, '_runtime_metadata', None)

    model_dir_a = tmp_path / 'model-a'
    model_dir_b = tmp_path / 'model-b'
    _write_required_model_files(model_dir_a)
    _write_required_model_files(model_dir_b)

    first = transcription.get_model(model_dir_a, device='cpu')
    second = transcription.get_model(model_dir_a, device='cpu')
    third = transcription.get_model(model_dir_b, device='cpu')

    assert first is second
    assert third is not first
    assert load_calls == [
        (str(model_dir_a), ('CPUExecutionProvider',), None),
        (str(model_dir_b), ('CPUExecutionProvider',), None),
    ]


def test_get_model_falls_back_from_cuda_to_cpu(monkeypatch, tmp_path: Path) -> None:
    load_calls: list[tuple[tuple[str, ...], str | None]] = []

    def _fake_load_model(
        _name: str,
        _model_dir: str,
        *,
        quantization: str | None = None,
        providers: list[str],
    ) -> _FakeLoadedModel:
        load_calls.append((tuple(providers), quantization))
        if providers[0] == 'CUDAExecutionProvider':
            raise RuntimeError('cuda init failed')
        return _FakeLoadedModel(_model_dir, providers, quantization)

    monkeypatch.setattr(
        transcription,
        'resolve_execution_candidates',
        lambda _device='auto': [
            {
                'runtimeProvider': 'CUDAExecutionProvider',
                'providerOrder': ['CUDAExecutionProvider', 'CPUExecutionProvider'],
                'quantization': None,
            },
            {
                'runtimeProvider': 'CPUExecutionProvider',
                'providerOrder': ['CPUExecutionProvider'],
                'quantization': None,
            },
        ],
    )
    monkeypatch.setitem(sys.modules, 'onnx_asr', SimpleNamespace(load_model=_fake_load_model))
    monkeypatch.setattr(transcription, '_model', None)
    monkeypatch.setattr(transcription, '_model_cache_key', None)
    monkeypatch.setattr(transcription, '_runtime_metadata', None)

    model_dir = tmp_path / 'model'
    _write_required_model_files(model_dir)

    loaded = transcription.get_model(model_dir, device='auto')
    metadata = transcription.describe_runtime_provider('auto')

    assert isinstance(loaded, _FakeLoadedModel)
    assert loaded.providers == ['CPUExecutionProvider']
    assert loaded.quantization is None
    assert load_calls == [
        (('CUDAExecutionProvider', 'CPUExecutionProvider'), None),
        (('CPUExecutionProvider',), None),
    ]
    assert metadata['runtimeProvider'] == 'CPUExecutionProvider'
    assert metadata['runtimeQuantization'] == 'default'
    assert metadata['runtimeFallbackUsed'] is True
    assert 'CUDAExecutionProvider' in str(metadata['runtimeWarning'])
