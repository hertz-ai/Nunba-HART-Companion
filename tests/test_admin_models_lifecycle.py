"""Integration tests for admin Model Management lifecycle endpoints.

Exercises the full control plane end-to-end against the HARTOS
subprocess worker pattern, without needing any real GPU libs:

  POST /api/admin/models/<id>/load    → eagerly spawns worker subprocess
  POST /api/admin/models/<id>/unload  → stops the worker, releases VRAM
  GET  /api/admin/models              → reconciled catalog state
  GET  /api/admin/models/health       → reports drift if worker died
  DEL  /api/admin/models/<id>         → unloads first, then removes entry
  POST /api/admin/models/swap         → evicts old + loads new

These tests patch ENGINE_REGISTRY and the TTSLoader to use the no-GPU
echo worker (integrations.service_tools._test_echo_worker), so they
run on CI without any model libraries installed.
"""
import json
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

# Make HARTOS + Nunba importable
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)
_HARTOS = os.path.normpath(os.path.join(_ROOT, '..', 'HARTOS'))
if _HARTOS not in sys.path and os.path.isdir(_HARTOS):
    sys.path.insert(0, _HARTOS)


# ════════════════════════════════════════════════════════════════
# Shared helpers
# ════════════════════════════════════════════════════════════════

@pytest.fixture
def echo_tool_worker():
    """Build a real ToolWorker wired to the no-GPU echo worker.

    We can't spawn the real F5/Chatterbox etc. workers in tests, but
    the echo worker speaks the same JSON-line protocol and lives in
    the same ENGINE_REGISTRY-compatible API surface, so TTSLoader can
    work against it as if it were a real engine.
    """
    from integrations.service_tools.gpu_worker import ToolWorker
    tw = ToolWorker(
        tool_name='echo_admin_test',
        tool_module='integrations.service_tools._test_echo_worker',
        vram_budget='tts_f5',
        output_subdir='echo_admin_test',
        engine='echo',
        startup_timeout=10.0,
        request_timeout=5.0,
        idle_timeout=0,
    )
    yield tw
    try:
        tw.stop()
    except Exception:
        pass


# ════════════════════════════════════════════════════════════════
# E1: TTSLoader.load() eagerly spawns the worker subprocess
# ════════════════════════════════════════════════════════════════

def test_e1_ttsloader_load_spawns_worker(echo_tool_worker):
    """Calling TTSLoader.load() on a GPU entry must trigger
    _get_or_start() on the underlying ToolWorker — the admin UI's
    'Load' button really puts the model in memory."""
    from models.orchestrator import TTSLoader
    from integrations.service_tools.model_catalog import ModelEntry, ModelType

    entry = ModelEntry(
        id='tts-f5_tts',
        name='F5-TTS',
        model_type=ModelType.TTS,
        source='huggingface',
        vram_gb=1.3,
        ram_gb=2.0,
        backend='torch',
        supports_gpu=True,
        supports_cpu=False,
    )

    # Patch _get_tool_worker to return the echo worker instead of
    # looking up the real F5 worker in the registry
    loader = TTSLoader()
    with patch.object(loader, '_get_tool_worker', return_value=echo_tool_worker):
        # Stub the can_run check so it doesn't try to install F5
        with patch('tts.tts_engine.TTSEngine._can_run_backend', return_value=True):
            ok = loader.load(entry, run_mode='gpu')

    assert ok is True
    assert entry.loaded is True
    assert entry.device == 'cuda'
    assert entry.error is None
    assert echo_tool_worker.is_alive(), "worker should be running after load"


# ════════════════════════════════════════════════════════════════
# E2: TTSLoader.unload() stops the worker subprocess
# ════════════════════════════════════════════════════════════════

def test_e2_ttsloader_unload_stops_worker(echo_tool_worker):
    """Unload button must actually stop the worker subprocess and
    release VRAM — previously it was a pass/no-op."""
    from models.orchestrator import TTSLoader
    from integrations.service_tools.model_catalog import ModelEntry, ModelType

    echo_tool_worker._get_or_start()
    assert echo_tool_worker.is_alive()

    entry = ModelEntry(
        id='tts-f5_tts',
        name='F5-TTS',
        model_type=ModelType.TTS,
        source='huggingface',
        vram_gb=1.3,
        ram_gb=2.0,
        backend='torch',
        supports_gpu=True,
        supports_cpu=False,
    )
    entry.loaded = True
    entry.device = 'cuda'

    loader = TTSLoader()
    with patch.object(loader, '_get_tool_worker', return_value=echo_tool_worker):
        loader.unload(entry)

    assert entry.loaded is False
    assert entry.device is None
    assert not echo_tool_worker.is_alive(), "worker should be stopped after unload"


# ════════════════════════════════════════════════════════════════
# E3: idle auto-stop reflects in the catalog via is_loaded probe
# ════════════════════════════════════════════════════════════════

def test_e3_idle_stop_shows_in_is_loaded(echo_tool_worker):
    """When the ToolWorker's idle timer stops the subprocess, the
    loader's is_loaded() probe must return False so the catalog's
    stale loaded:True flag is corrected on the next refresh."""
    from models.orchestrator import TTSLoader
    from integrations.service_tools.model_catalog import ModelEntry, ModelType

    # Shrink idle timeout and spawn
    echo_tool_worker.idle_timeout = 1.0
    echo_tool_worker.call({'op': 'echo'})
    assert echo_tool_worker.is_alive()

    # Wait past idle timeout
    time.sleep(1.5)
    assert not echo_tool_worker.is_alive()

    # Catalog is lying — says loaded:True
    entry = ModelEntry(
        id='tts-f5_tts', name='F5-TTS', model_type=ModelType.TTS,
        source='huggingface', vram_gb=1.3, ram_gb=2.0,
        backend='torch', supports_gpu=True, supports_cpu=False,
    )
    entry.loaded = True

    loader = TTSLoader()
    with patch.object(loader, '_get_tool_worker', return_value=echo_tool_worker):
        live = loader.is_loaded(entry)
    assert live is False, "is_loaded must reflect actual subprocess state"


# ════════════════════════════════════════════════════════════════
# E4: crash during request surfaces via is_loaded probe
# ════════════════════════════════════════════════════════════════

def test_e4_crash_shows_in_is_loaded(echo_tool_worker):
    """A subprocess crash mid-request must make is_loaded() return
    False so the catalog can reconcile away the stale flag."""
    from models.orchestrator import TTSLoader
    from integrations.service_tools.model_catalog import ModelEntry, ModelType

    echo_tool_worker.call({'op': 'echo'})
    assert echo_tool_worker.is_alive()

    # Crash the worker
    result = echo_tool_worker.call({'op': 'crash'})
    assert result.get('transient') is True

    entry = ModelEntry(
        id='tts-f5_tts', name='F5-TTS', model_type=ModelType.TTS,
        source='huggingface', vram_gb=1.3, ram_gb=2.0,
        backend='torch', supports_gpu=True, supports_cpu=False,
    )
    entry.loaded = True  # stale flag

    loader = TTSLoader()
    with patch.object(loader, '_get_tool_worker', return_value=echo_tool_worker):
        live = loader.is_loaded(entry)
    assert live is False, "crashed worker must not report loaded"


# ════════════════════════════════════════════════════════════════
# E5: STT model size propagates to subprocess via env var
# ════════════════════════════════════════════════════════════════

def test_e5_stt_model_size_propagates_via_env_var():
    """STTLoader.load() must set HEVOLVE_STT_MODEL_SIZE so the next-
    spawned subprocess picks up the user's selection. Previously it
    only mutated a parent-process global which the subprocess never
    saw."""
    from models.orchestrator import STTLoader
    from integrations.service_tools.model_catalog import ModelEntry, ModelType

    loader = STTLoader()
    entry = ModelEntry(
        id='stt-whisper-medium',
        name='Whisper Medium',
        model_type=ModelType.STT,
        source='huggingface',
        vram_gb=1.5,
        ram_gb=2.0,
        backend='torch',
        supports_gpu=True,
        supports_cpu=True,
    )

    # Mock the HARTOS whisper_tool module and its _stt_tool singleton
    fake_stt_tool = MagicMock()
    fake_stt_tool.is_alive.return_value = False
    fake_module = MagicMock()
    fake_module._stt_tool = fake_stt_tool
    fake_module._CATALOG_ID_TO_FASTER_WHISPER_SIZE = {
        'stt-whisper-medium': 'medium',
    }

    with patch.dict(
        'sys.modules',
        {'integrations.service_tools.whisper_tool': fake_module},
    ):
        # Clear any prior value
        os.environ.pop('HEVOLVE_STT_MODEL_SIZE', None)
        ok = loader.load(entry, run_mode='cpu')

    assert ok is True
    assert os.environ.get('HEVOLVE_STT_MODEL_SIZE') == 'medium'
    assert entry.loaded is True


def test_e5b_stt_load_stops_running_worker_with_old_size():
    """If a whisper worker is already running with the old size,
    STTLoader.load() with a new size must stop it so the next call
    respawns with the new HEVOLVE_STT_MODEL_SIZE env var."""
    from models.orchestrator import STTLoader
    from integrations.service_tools.model_catalog import ModelEntry, ModelType

    loader = STTLoader()
    entry = ModelEntry(
        id='stt-whisper-large',
        name='Whisper Large v3',
        model_type=ModelType.STT,
        source='huggingface',
        vram_gb=3.0,
        ram_gb=4.0,
        backend='torch',
        supports_gpu=True,
        supports_cpu=True,
    )

    fake_stt_tool = MagicMock()
    fake_stt_tool.is_alive.return_value = True  # worker running with OLD size
    fake_module = MagicMock()
    fake_module._stt_tool = fake_stt_tool
    fake_module._CATALOG_ID_TO_FASTER_WHISPER_SIZE = {
        'stt-whisper-large': 'large-v3',
    }

    with patch.dict(
        'sys.modules',
        {'integrations.service_tools.whisper_tool': fake_module},
    ):
        loader.load(entry, run_mode='gpu')

    # Must have called stop() on the running worker so next call respawns
    fake_stt_tool.stop.assert_called_once()
