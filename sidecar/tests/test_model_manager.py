from __future__ import annotations

from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.model_manager import ModelManager


def _write_markers(model_dir: Path) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    for marker in ModelManager.MODEL_MARKERS:
        (model_dir / marker).write_text('ok')


def test_state_revalidates_marker_presence_on_read(tmp_path: Path) -> None:
    manager = ModelManager(str(tmp_path))
    model_dir = tmp_path / 'models' / 'parakeet-tdt-0.6b-v3'

    assert manager.state == 'missing'

    _write_markers(model_dir)
    assert manager.state == 'present'

    (model_dir / ModelManager.MODEL_MARKERS[0]).unlink()
    assert manager.state == 'missing'


def test_get_model_path_requires_all_marker_files(tmp_path: Path) -> None:
    manager = ModelManager(str(tmp_path))
    model_dir = tmp_path / 'models' / 'parakeet-tdt-0.6b-v3'
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / ModelManager.MODEL_MARKERS[0]).write_text('partial')

    assert manager.state == 'missing'

    try:
        manager.get_model_path()
        raise AssertionError('expected get_model_path() to fail when model markers are missing')
    except FileNotFoundError as exc:
        assert 'expected markers' in str(exc)

    _write_markers(model_dir)
    assert manager.get_model_path() == model_dir
