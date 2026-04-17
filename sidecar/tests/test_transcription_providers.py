from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import transcription


def test_resolve_execution_provider_order_prefers_cuda_then_dml_then_cpu(monkeypatch) -> None:
    monkeypatch.setattr(
        transcription,
        'get_available_execution_providers',
        lambda: ['CPUExecutionProvider', 'CoreMLExecutionProvider', 'CUDAExecutionProvider'],
    )

    selected, order = transcription.resolve_execution_provider_order('auto')

    assert selected == 'CUDAExecutionProvider'
    assert order == ['CUDAExecutionProvider', 'CPUExecutionProvider']


def test_resolve_execution_provider_order_cpu_mode_is_cpu_only() -> None:
    selected, order = transcription.resolve_execution_provider_order('cpu')

    assert selected == 'CPUExecutionProvider'
    assert order == ['CPUExecutionProvider']


def test_resolve_execution_provider_order_prefers_cpu_over_coreml_in_auto_mode(monkeypatch) -> None:
    monkeypatch.setattr(
        transcription,
        'get_available_execution_providers',
        lambda: ['CPUExecutionProvider', 'CoreMLExecutionProvider'],
    )

    selected, order = transcription.resolve_execution_provider_order('auto')

    assert selected == 'CPUExecutionProvider'
    assert order == ['CPUExecutionProvider']


def test_resolve_execution_provider_order_cuda_mode_falls_back_to_cpu_when_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(transcription, 'get_available_execution_providers', lambda: ['CPUExecutionProvider'])

    selected, order = transcription.resolve_execution_provider_order('cuda')

    assert selected == 'CPUExecutionProvider'
    assert order == ['CPUExecutionProvider']


def test_get_model_cache_key_includes_model_dir(monkeypatch, tmp_path: Path) -> None:
    load_calls: list[tuple[str, tuple[str, ...]]] = []

    class _FakeLoadedModel:
        def __init__(self, model_dir: str) -> None:
            self.model_dir = model_dir

        def with_timestamps(self) -> '_FakeLoadedModel':
            return self

    def _fake_load_model(_name: str, model_dir: str, providers: list[str]) -> _FakeLoadedModel:
        load_calls.append((model_dir, tuple(providers)))
        return _FakeLoadedModel(model_dir)

    monkeypatch.setattr(
        transcription,
        'resolve_execution_provider_order',
        lambda _device='auto': ('CPUExecutionProvider', ['CPUExecutionProvider']),
    )
    monkeypatch.setitem(sys.modules, 'onnx_asr', SimpleNamespace(load_model=_fake_load_model))
    monkeypatch.setattr(transcription, '_model', None)
    monkeypatch.setattr(transcription, '_model_cache_key', None)

    model_dir_a = tmp_path / 'model-a'
    model_dir_b = tmp_path / 'model-b'
    model_dir_a.mkdir()
    model_dir_b.mkdir()

    # get_model() validates that a Parakeet export is present on disk.
    required = [
        'encoder-model.onnx',
        'encoder-model.onnx.data',
        'decoder_joint-model.onnx',
        'vocab.txt',
    ]
    for name in required:
        (model_dir_a / name).write_text('x')
        (model_dir_b / name).write_text('x')

    first = transcription.get_model(model_dir_a, device='cpu')
    second = transcription.get_model(model_dir_a, device='cpu')
    third = transcription.get_model(model_dir_b, device='cpu')

    assert first is second
    assert third is not first
    assert load_calls == [
        (str(model_dir_a), ('CPUExecutionProvider',)),
        (str(model_dir_b), ('CPUExecutionProvider',)),
    ]
