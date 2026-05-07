"""Regression: `check_backend_runnable` routes venv-quarantined engines to
the venv interpreter, not python-embed.

Bug seen 2026-05-07: probe_chatterbox_turbo.err showed
`python-embed/Lib/site-packages/chatterbox/__init__.py` failing on
`import omegaconf` even though omegaconf IS installed in the
chatterbox_turbo venv (244 packages on disk).  The probe at
`_torch_probe.check_backend_runnable` was running `_run_in_embed` for ALL
engines, including those with `install_target='venv'`, so the import
was tested against the WRONG interpreter.

Fix: when the engine's HARTOS spec says `install_target='venv'`,
route the probe through `tts.backend_venv.invoke_in_venv` so the
import is tested against the venv's python.exe.
"""

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import pytest

NUNBA_ROOT = Path(__file__).resolve().parents[1]
if str(NUNBA_ROOT) not in sys.path:
    sys.path.insert(0, str(NUNBA_ROOT))


@pytest.fixture(autouse=True)
def _reset_probe_cache():
    """Each test starts with an empty probe cache."""
    from tts import _torch_probe as _tp

    _tp._backend_cache.clear()
    yield
    _tp._backend_cache.clear()


def test_venv_engine_uses_invoke_in_venv_not_embed(monkeypatch, tmp_path):
    """`install_target='venv'` engines must call `invoke_in_venv`,
    NOT `_run_in_embed`. Without this routing the probe is testing
    the wrong interpreter and produces misleading probe_<x>.err."""
    from tts import _torch_probe as _tp

    # Stub HARTOS spec — chatterbox_turbo declares install_target='venv'
    fake_spec = SimpleNamespace(
        engine_id='chatterbox_turbo',
        install_target='venv',
    )
    fake_registry = {'chatterbox_turbo': fake_spec}
    monkeypatch.setattr(
        'integrations.channels.media.tts_router.ENGINE_REGISTRY',
        fake_registry,
        raising=False,
    )

    # _resolve_paths and _tlib both must succeed for the fast-path
    # guards to NOT short-circuit before our routing check.
    monkeypatch.setattr(_tp, '_resolve_paths', lambda: True)
    monkeypatch.setattr(_tp, '_tlib', str(tmp_path), raising=False)
    monkeypatch.setattr(_tp.os.path, 'isdir', lambda p: True)

    # Force "venv exists" so we don't short-circuit at the
    # is_venv_healthy guard.
    captured = {}

    def _fake_invoke_in_venv(backend, import_name, args, timeout=120,
                              _probe_mode=False):
        captured['backend'] = backend
        captured['import_name'] = import_name
        captured['_probe_mode'] = _probe_mode
        captured['timeout'] = timeout
        return (0, '', '')  # rc=0 = importable

    def _fake_is_venv_healthy(backend, probe_module=None):
        return True

    monkeypatch.setattr('tts.backend_venv.invoke_in_venv',
                        _fake_invoke_in_venv, raising=False)
    monkeypatch.setattr('tts.backend_venv.is_venv_healthy',
                        _fake_is_venv_healthy, raising=False)

    # Sentinel: assert _run_in_embed is NOT called for this engine.
    embed_called = []

    def _embed_sentinel(*a, **kw):
        embed_called.append(True)
        raise AssertionError(
            'venv-quarantined engine fell through to _run_in_embed — '
            'probe is hitting the wrong interpreter'
        )

    monkeypatch.setattr(_tp, '_run_in_embed', _embed_sentinel)

    ok = _tp.check_backend_runnable('chatterbox_turbo', 'chatterbox')
    assert ok is True
    assert captured.get('backend') == 'chatterbox_turbo'
    assert captured.get('import_name') == 'chatterbox'
    assert captured.get('_probe_mode') is True, (
        'venv probe must use _probe_mode=True so invoke_in_venv runs '
        'python -c "import X" instead of python -m X'
    )
    assert not embed_called, (
        'Bug regression: _run_in_embed was called for a venv-quarantined '
        'engine — the probe is testing python-embed instead of the venv'
    )

    # Single-source-of-truth: probe timeout MUST match the canonical
    # _IMPORT_PROBE_TIMEOUT in backend_venv (90s default,
    # NUNBA_TTS_IMPORT_PROBE_TIMEOUT env-overridable).  Otherwise we
    # have a parallel timeout for the same logical operation
    # ("verify import in venv") — the reason chatterbox_turbo's
    # 30s probe failed before #81 raised the install-time timeout
    # to 90s.  No reverting here.
    from tts.backend_venv import _IMPORT_PROBE_TIMEOUT
    assert captured.get('timeout') == _IMPORT_PROBE_TIMEOUT, (
        f'venv probe timeout drifted from canonical '
        f'tts.backend_venv._IMPORT_PROBE_TIMEOUT ({_IMPORT_PROBE_TIMEOUT}); '
        f'got {captured.get("timeout")!r}'
    )


def test_main_engine_still_uses_run_in_embed(monkeypatch, tmp_path):
    """`install_target='main'` (the default) must continue to use
    `_run_in_embed` — the venv routing is opt-in via spec."""
    from tts import _torch_probe as _tp

    fake_spec = SimpleNamespace(
        engine_id='kokoro',
        install_target='main',
    )
    fake_registry = {'kokoro': fake_spec}
    monkeypatch.setattr(
        'integrations.channels.media.tts_router.ENGINE_REGISTRY',
        fake_registry,
        raising=False,
    )

    monkeypatch.setattr(_tp, '_resolve_paths', lambda: True)
    monkeypatch.setattr(_tp, '_tlib', str(tmp_path), raising=False)
    monkeypatch.setattr(_tp.os.path, 'isdir', lambda p: True)

    embed_called = []

    def _fake_run_in_embed(snippet, extra_argv=None, timeout=20):
        embed_called.append(True)
        return SimpleNamespace(returncode=0, stdout='OK\n', stderr='')

    monkeypatch.setattr(_tp, '_run_in_embed', _fake_run_in_embed)

    # Sentinel: assert invoke_in_venv is NOT called for main engines.
    def _venv_sentinel(*a, **kw):
        raise AssertionError(
            'main-target engine routed to invoke_in_venv — venv routing '
            'should be opt-in for install_target=venv only'
        )

    monkeypatch.setattr('tts.backend_venv.invoke_in_venv',
                        _venv_sentinel, raising=False)

    ok = _tp.check_backend_runnable('kokoro', 'kokoro')
    assert ok is True
    assert embed_called, (
        'main-target engine must still use _run_in_embed — that is the '
        'existing behavior the regression must preserve'
    )


def test_venv_engine_with_no_venv_dir_fails_fast(monkeypatch, tmp_path):
    """If install_target='venv' AND the venv directory doesn't exist,
    return False without spawning a subprocess. Avoids the previous
    behavior of writing misleading probe_<backend>.err lines that
    point at the WRONG interpreter."""
    from tts import _torch_probe as _tp

    fake_spec = SimpleNamespace(
        engine_id='chatterbox_turbo',
        install_target='venv',
    )
    monkeypatch.setattr(
        'integrations.channels.media.tts_router.ENGINE_REGISTRY',
        {'chatterbox_turbo': fake_spec},
        raising=False,
    )
    monkeypatch.setattr(_tp, '_resolve_paths', lambda: True)
    monkeypatch.setattr(_tp, '_tlib', str(tmp_path), raising=False)
    monkeypatch.setattr(_tp.os.path, 'isdir', lambda p: True)

    # Venv NOT healthy → short-circuit
    monkeypatch.setattr('tts.backend_venv.is_venv_healthy',
                        lambda backend, probe_module=None: False,
                        raising=False)

    # Both probe paths should be untouched.
    spawn_count = []

    def _spawn_sentinel(*a, **kw):
        spawn_count.append(True)
        raise AssertionError(
            'No subprocess should spawn when venv is missing; just '
            'return False'
        )

    monkeypatch.setattr('tts.backend_venv.invoke_in_venv',
                        _spawn_sentinel, raising=False)
    monkeypatch.setattr(_tp, '_run_in_embed', _spawn_sentinel)

    ok = _tp.check_backend_runnable('chatterbox_turbo', 'chatterbox')
    assert ok is False
    assert not spawn_count


def test_venv_probe_failure_writes_diagnostic_err_file(
    monkeypatch, tmp_path,
):
    """When the venv probe returns rc!=0, the stderr MUST land in
    probe_<backend>.err — that's what operators grep when triaging
    a broken engine."""
    from tts import _torch_probe as _tp

    fake_spec = SimpleNamespace(
        engine_id='chatterbox_turbo',
        install_target='venv',
    )
    monkeypatch.setattr(
        'integrations.channels.media.tts_router.ENGINE_REGISTRY',
        {'chatterbox_turbo': fake_spec},
        raising=False,
    )
    monkeypatch.setattr(_tp, '_resolve_paths', lambda: True)
    monkeypatch.setattr(_tp, '_tlib', str(tmp_path), raising=False)
    monkeypatch.setattr(_tp.os.path, 'isdir', lambda p: True)
    monkeypatch.setattr('tts.backend_venv.is_venv_healthy',
                        lambda backend, probe_module=None: True,
                        raising=False)
    monkeypatch.setattr('tts.backend_venv.invoke_in_venv',
                        lambda backend, mod, args, timeout=30,
                        _probe_mode=False: (
                            1, '', "ModuleNotFoundError: No module named 'foo'",
                        ),
                        raising=False)

    # Redirect probe_*.err writes to tmp_path
    fake_logs = tmp_path / 'logs'
    fake_logs.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(
        os.path, 'expanduser',
        lambda p: str(tmp_path) if p == '~' else os.path.expanduser(p),
    )

    ok = _tp.check_backend_runnable('chatterbox_turbo', 'chatterbox')
    assert ok is False

    err_file = fake_logs / 'probe_chatterbox_turbo.err'
    # The err file lives at ~/Documents/Nunba/logs by the function's
    # construction; with our expanduser monkeypatch, '~' resolves to
    # tmp_path.  The full path is then tmp_path/Documents/Nunba/logs/.
    full_err = tmp_path / 'Documents' / 'Nunba' / 'logs' / 'probe_chatterbox_turbo.err'
    assert full_err.exists(), (
        f'venv probe failure must write probe_<backend>.err for triage; '
        f'expected at {full_err}'
    )
    content = full_err.read_text()
    assert 'venv probe rc=1' in content
    assert "ModuleNotFoundError" in content


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
