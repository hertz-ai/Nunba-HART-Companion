"""Tests for models/orchestrator.py — Nunba ModelOrchestrator shim.

Covers: re-exports from HARTOS, _entry_to_preset, LlamaLoader, TTSLoader,
STTLoader, VLMLoader, _register_loaders, get_orchestrator singleton.
"""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from integrations.service_tools.model_orchestrator import (
    ModelEntry,
    ModelLoader,
    ModelOrchestrator,
)

from models.orchestrator import (
    LlamaLoader,
    STTLoader,
    TTSLoader,
    VLMLoader,
    _entry_to_preset,
    _levenshtein,
    _register_loaders,
    get_orchestrator,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_entry(**overrides):
    defaults = dict(
        id='llm-test-model',
        name='Test Model',
        model_type='llm',
        source='huggingface',
        repo_id='user/repo',
        files={'model': 'model.gguf', 'repo': 'user/repo'},
        vram_gb=4.0,
        ram_gb=5.0,
        disk_gb=4.0,
        backend='llama.cpp',
        supports_gpu=True,
        supports_cpu=True,
        supports_cpu_offload=False,
        idle_timeout_s=0,
        min_build=None,
        capabilities={'has_vision': False},
        quality_score=0.85,
        speed_score=0.7,
        priority=90,
        tags=['local'],
        auto_load=False,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


# ===========================================================================
# 1. RE-EXPORTS
# ===========================================================================

class TestReExports:
    def test_model_entry_reexported(self):
        from models.orchestrator import ModelEntry as ME
        assert ME is ModelEntry

    def test_model_loader_reexported(self):
        from models.orchestrator import ModelLoader as ML
        assert ML is ModelLoader

    def test_model_orchestrator_reexported(self):
        from models.orchestrator import ModelOrchestrator as MO
        assert MO is ModelOrchestrator

    def test_model_type_reexported(self):
        from models.orchestrator import ModelType
        assert ModelType is not None

    def test_get_catalog_reexported(self):
        from models.orchestrator import get_catalog
        assert callable(get_catalog)


# ===========================================================================
# 2. _entry_to_preset
# ===========================================================================

class TestEntryToPreset:
    def test_basic_conversion(self):
        entry = _make_entry()
        mock_preset_cls = MagicMock()
        with patch('models.orchestrator.ModelPreset', mock_preset_cls, create=True):
            from llama.llama_installer import ModelPreset
            result = _entry_to_preset(entry)
        assert result is not None

    def test_returns_none_when_no_model_file(self):
        entry = _make_entry(files={'repo': 'user/repo'})  # no 'model' key
        result = _entry_to_preset(entry)
        assert result is None

    def test_vision_model_includes_mmproj(self):
        entry = _make_entry(
            files={'model': 'model.gguf', 'repo': 'user/repo',
                   'mmproj': 'mmproj.gguf', 'mmproj_source': 'mmproj-F16.gguf'},
            capabilities={'has_vision': True},
        )
        result = _entry_to_preset(entry)
        assert result is not None
        assert result.has_vision is True
        assert result.mmproj_file == 'mmproj.gguf'
        assert result.mmproj_source_file == 'mmproj-F16.gguf'

    def test_non_vision_model_no_mmproj(self):
        entry = _make_entry(capabilities={'has_vision': False})
        result = _entry_to_preset(entry)
        assert result.has_vision is False
        assert result.mmproj_file is None

    def test_disk_gb_to_size_mb(self):
        entry = _make_entry(disk_gb=4.0)
        result = _entry_to_preset(entry)
        assert result.size_mb == 4096

    def test_repo_id_from_entry(self):
        entry = _make_entry(repo_id='custom/repo')
        result = _entry_to_preset(entry)
        assert result.repo_id == 'custom/repo'

    def test_repo_id_fallback_from_files(self):
        entry = _make_entry(repo_id=None, files={'model': 'model.gguf', 'repo': 'fallback/repo'})
        result = _entry_to_preset(entry)
        assert result.repo_id == 'fallback/repo'

    def test_min_build_propagated(self):
        entry = _make_entry(min_build='b3456')
        result = _entry_to_preset(entry)
        assert result.min_build == 'b3456'


# ===========================================================================
# 3. LlamaLoader
# ===========================================================================

class TestLlamaLoader:
    def test_is_model_loader_subclass(self):
        assert issubclass(LlamaLoader, ModelLoader)

    def test_load_success(self):
        loader = LlamaLoader()
        entry = _make_entry()
        mock_config = MagicMock()
        mock_config.start_server.return_value = True
        mock_presets = [SimpleNamespace(
            display_name='Test Model', file_name='model.gguf',
            repo_id='user/repo', size_mb=4000, has_vision=False,
            mmproj_file=None, mmproj_source_file=None, min_build=None,
            description='',
        )]
        with patch('models.orchestrator.LlamaConfig', return_value=mock_config, create=True):
            with patch('models.orchestrator.MODEL_PRESETS', mock_presets, create=True):
                mock_mod = MagicMock()
                mock_mod.LlamaConfig = MagicMock(return_value=mock_config)
                mock_mod2 = MagicMock()
                mock_mod2.MODEL_PRESETS = mock_presets
                mock_mod2.ModelPreset = type(mock_presets[0])
                with patch.dict('sys.modules', {
                    'llama.llama_config': mock_mod,
                    'llama.llama_installer': mock_mod2,
                }):
                    result = loader.load(entry, 'gpu')
        assert result is True

    def test_load_handles_exception(self):
        loader = LlamaLoader()
        entry = _make_entry()
        with patch.dict('sys.modules', {'llama.llama_config': None}):
            result = loader.load(entry, 'gpu')
        assert result is False

    def test_unload_calls_stop_server(self):
        loader = LlamaLoader()
        entry = _make_entry()
        mock_config = MagicMock()
        mock_mod = MagicMock()
        mock_mod.LlamaConfig = MagicMock(return_value=mock_config)
        with patch.dict('sys.modules', {'llama.llama_config': mock_mod}):
            loader.unload(entry)
        mock_config.stop_server.assert_called_once()

    def test_unload_handles_exception(self):
        loader = LlamaLoader()
        entry = _make_entry()
        with patch.dict('sys.modules', {'llama.llama_config': None}):
            # Should not raise
            loader.unload(entry)

    def test_download_calls_installer(self):
        loader = LlamaLoader()
        entry = _make_entry()
        mock_installer = MagicMock()
        mock_installer_inst = MagicMock()
        mock_installer_inst.download_model.return_value = True
        mock_installer.LlamaInstaller = MagicMock(return_value=mock_installer_inst)
        mock_installer.MODEL_PRESETS = [SimpleNamespace(
            display_name='Test Model', file_name='model.gguf',
            repo_id='user/repo', size_mb=4000, has_vision=False,
            mmproj_file=None, mmproj_source_file=None, min_build=None,
            description='',
        )]
        mock_installer.ModelPreset = type(mock_installer.MODEL_PRESETS[0])
        with patch.dict('sys.modules', {'llama.llama_installer': mock_installer}):
            result = loader.download(entry)
        assert result is True

    def test_download_handles_exception(self):
        loader = LlamaLoader()
        entry = _make_entry()
        with patch.dict('sys.modules', {'llama.llama_installer': None}):
            result = loader.download(entry)
        assert result is False

    def test_is_downloaded_calls_installer(self):
        loader = LlamaLoader()
        entry = _make_entry()
        mock_installer = MagicMock()
        mock_installer_inst = MagicMock()
        mock_installer_inst.is_model_downloaded.return_value = True
        mock_installer.LlamaInstaller = MagicMock(return_value=mock_installer_inst)
        mock_installer.MODEL_PRESETS = [SimpleNamespace(
            display_name='Test Model', file_name='model.gguf',
            repo_id='user/repo', size_mb=4000, has_vision=False,
            mmproj_file=None, mmproj_source_file=None, min_build=None,
            description='',
        )]
        mock_installer.ModelPreset = type(mock_installer.MODEL_PRESETS[0])
        with patch.dict('sys.modules', {'llama.llama_installer': mock_installer}):
            result = loader.is_downloaded(entry)
        assert result is True

    def test_is_downloaded_returns_false_on_error(self):
        loader = LlamaLoader()
        entry = _make_entry()
        with patch.dict('sys.modules', {'llama.llama_installer': None}):
            result = loader.is_downloaded(entry)
        assert result is False


# ===========================================================================
# 4. TTSLoader
# ===========================================================================

class TestTTSLoader:
    def test_is_model_loader_subclass(self):
        assert issubclass(TTSLoader, ModelLoader)

    def test_download_success(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-chatterbox-turbo')
        mock_pkg = MagicMock()
        mock_pkg.install_backend_full = MagicMock(return_value=(True, 'ok'))
        with patch.dict('sys.modules', {'tts.package_installer': mock_pkg}):
            result = loader.download(entry)
        assert result is True

    def test_download_failure(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-chatterbox-turbo')
        mock_pkg = MagicMock()
        mock_pkg.install_backend_full = MagicMock(return_value=(False, 'error'))
        with patch.dict('sys.modules', {'tts.package_installer': mock_pkg}):
            result = loader.download(entry)
        assert result is False

    def test_download_import_error(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-chatterbox-turbo')
        with patch.dict('sys.modules', {'tts.package_installer': None}):
            result = loader.download(entry)
        assert result is False

    def test_load_when_runnable(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-piper')
        mock_engine = MagicMock()
        mock_engine._can_run_backend.return_value = True
        mock_tts = MagicMock()
        mock_tts.TTSEngine = MagicMock(return_value=mock_engine)
        with patch.dict('sys.modules', {'tts.tts_engine': mock_tts}):
            result = loader.load(entry, 'gpu')
        assert result is True

    def test_load_when_not_runnable_triggers_install(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-f5-tts')
        mock_engine = MagicMock()
        mock_engine._can_run_backend.return_value = False
        mock_tts = MagicMock()
        mock_tts.TTSEngine = MagicMock(return_value=mock_engine)
        with patch.dict('sys.modules', {'tts.tts_engine': mock_tts}):
            result = loader.load(entry, 'gpu')
        assert result is False
        mock_engine._try_auto_install_backend.assert_called_once()

    def test_unload_is_noop(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-piper')
        loader.unload(entry)  # Should not raise

    def test_is_downloaded_with_package(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-test', files={'package': 'chatterbox'})
        with patch('importlib.util.find_spec', return_value=MagicMock()):
            result = loader.is_downloaded(entry)
        assert result is True

    def test_is_downloaded_missing_package(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-test', files={'package': 'nonexistent_pkg'})
        with patch('importlib.util.find_spec', return_value=None):
            result = loader.is_downloaded(entry)
        assert result is False

    def test_strips_tts_prefix_for_backend_name(self):
        loader = TTSLoader()
        entry = _make_entry(id='tts-chatterbox-turbo')
        mock_engine = MagicMock()
        mock_engine._can_run_backend.return_value = True
        mock_tts = MagicMock()
        mock_tts.TTSEngine = MagicMock(return_value=mock_engine)
        with patch.dict('sys.modules', {'tts.tts_engine': mock_tts}):
            loader.load(entry, 'gpu')
        mock_engine._can_run_backend.assert_called_with('chatterbox-turbo')

    # ── validate() — L1.2 capability probe ──────────────────────────
    def _mock_handshake_modules(self, handshake_result, engine=None):
        """Wire mocked tts.tts_engine and tts.tts_handshake into sys.modules.

        Returns (mock_tts_engine, mock_handshake) so assertions can
        introspect invalidate() calls and run_handshake() call args.
        """
        mock_tts_engine = MagicMock()
        mock_tts_engine.get_tts_engine = MagicMock(return_value=engine or MagicMock())
        mock_handshake = MagicMock()
        mock_handshake.run_handshake = MagicMock(return_value=handshake_result)
        mock_handshake.invalidate = MagicMock()
        return (
            mock_tts_engine,
            mock_handshake,
            {
                'tts.tts_engine': mock_tts_engine,
                'tts.tts_handshake': mock_handshake,
            },
        )

    def test_validate_success_passes_bytes_and_duration(self):
        """A successful handshake → (True, 'synthesized NB, Ns')."""
        loader = TTSLoader()
        entry = _make_entry(id='tts-piper', model_type='tts')
        result = SimpleNamespace(ok=True, n_bytes=24_576, duration_s=1.23, err='')
        _, mock_hs, modules = self._mock_handshake_modules(result)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is True
        assert '24576' in reason
        assert '1.23' in reason
        mock_hs.run_handshake.assert_called_once()
        # The probe MUST use the canonical handshake — broadcast=False
        # so no SSE event fires, play_audio=False so install machine
        # doesn't beep, lang='en' per probe contract.
        kwargs = mock_hs.run_handshake.call_args.kwargs
        assert kwargs.get('lang') == 'en'
        assert kwargs.get('broadcast') is False
        assert kwargs.get('play_audio') is False

    def test_validate_failure_surfaces_handshake_err(self):
        """A failed handshake → (False, 'handshake failed: <err>')."""
        loader = TTSLoader()
        entry = _make_entry(id='tts-f5-tts', model_type='tts')
        result = SimpleNamespace(
            ok=False, n_bytes=0, duration_s=0.0,
            err='synthesis produced no audio',
        )
        _, _, modules = self._mock_handshake_modules(result)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'synthesis produced no audio' in reason

    def test_validate_invalidates_cache_before_run(self):
        """Install-validation must clear any stale handshake cache first,
        so a pre-install negative verdict doesn't spuriously fail the
        freshly-loaded backend's probe.
        """
        loader = TTSLoader()
        entry = _make_entry(id='tts-chatterbox-turbo', model_type='tts')
        result = SimpleNamespace(ok=True, n_bytes=12_345, duration_s=0.6, err='')
        _, mock_hs, modules = self._mock_handshake_modules(result)
        with patch.dict('sys.modules', modules):
            loader.validate(entry)
        mock_hs.invalidate.assert_called_once_with('chatterbox-turbo')

    def test_validate_returns_false_on_import_failure(self):
        """tts.tts_handshake missing → (False, 'TTS imports failed: ...')."""
        loader = TTSLoader()
        entry = _make_entry(id='tts-piper', model_type='tts')
        # Block the import entirely.
        import builtins
        real_import = builtins.__import__

        def _broken(name, *a, **kw):
            if name == 'tts.tts_handshake':
                raise ImportError('module missing')
            return real_import(name, *a, **kw)

        with patch.object(builtins, '__import__', _broken):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'TTS imports failed' in reason

    def test_validate_returns_false_on_handshake_raising(self):
        """run_handshake raising → (False, 'run_handshake raised: ...')."""
        loader = TTSLoader()
        entry = _make_entry(id='tts-f5-tts', model_type='tts')
        mock_tts_engine = MagicMock()
        mock_tts_engine.get_tts_engine = MagicMock(return_value=MagicMock())
        mock_hs = MagicMock()
        mock_hs.run_handshake = MagicMock(side_effect=RuntimeError('boom'))
        mock_hs.invalidate = MagicMock()
        modules = {
            'tts.tts_engine': mock_tts_engine,
            'tts.tts_handshake': mock_hs,
        }
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'run_handshake raised' in reason
        assert 'boom' in reason

    def test_validate_uses_backend_name_without_tts_prefix(self):
        """The handshake gets the stripped backend name, matching the
        ENGINE_REGISTRY keys (e.g. 'piper', not 'tts-piper')."""
        loader = TTSLoader()
        entry = _make_entry(id='tts-indic-parler', model_type='tts')
        result = SimpleNamespace(ok=True, n_bytes=15_000, duration_s=0.8, err='')
        _, mock_hs, modules = self._mock_handshake_modules(result)
        with patch.dict('sys.modules', modules):
            loader.validate(entry)
        args, kwargs = mock_hs.run_handshake.call_args
        # backend is the 2nd positional arg to run_handshake(engine, backend, ...)
        assert args[1] == 'indic-parler'


# ===========================================================================
# 5. STTLoader
# ===========================================================================

class TestSTTLoader:
    def test_is_model_loader_subclass(self):
        assert issubclass(STTLoader, ModelLoader)

    def test_load_returns_true_lazy(self):
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper')
        result = loader.load(entry, 'gpu')
        assert result is True

    def test_is_downloaded_true_when_importable(self):
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper')
        with patch('importlib.util.find_spec', return_value=MagicMock()):
            assert loader.is_downloaded(entry) is True

    def test_is_downloaded_false_when_not_importable(self):
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper')
        with patch('importlib.util.find_spec', return_value=None):
            assert loader.is_downloaded(entry) is False

    def test_download_installs_faster_whisper(self):
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper')
        mock_pkg = MagicMock()
        mock_pkg.has_nvidia_gpu.return_value = False
        mock_pkg.is_cuda_torch.return_value = True
        with patch.dict('sys.modules', {'tts.package_installer': mock_pkg}):
            with patch('importlib.util.find_spec', return_value=MagicMock()):
                result = loader.download(entry)
        assert result is True

    def test_download_handles_exception(self):
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper')
        with patch.dict('sys.modules', {'tts.package_installer': None}):
            result = loader.download(entry)
        assert result is False

    # ── validate() — L1.3 round-trip STT probe ───────────────────────
    def _stub_validate_env(self, *, transcript_json='', transcribe_raises=None,
                           synth_return='path', synth_raises=None,
                           greetings=None):
        """Wire mocked core.constants, tts.tts_engine, and whisper_tool into
        sys.modules so STTLoader.validate exercises the real round-trip
        logic (Levenshtein + punctuation normalization) against a
        controllable TTS+STT surface.

        ``synth_return`` controls what ``engine.synthesize`` returns:
            - 'path': returns the wav_path argument (default — file exists)
            - None:   simulates a synth that produced no audio
            - 'missing': returns a path that doesn't exist on disk
        ``transcript_json`` is the raw JSON string whisper_transcribe
        returns, OR an Exception instance if ``transcribe_raises`` is set.
        """
        import os

        # Mocked TTS engine that actually creates the wav file on synth
        # so the `os.path.exists` gate in validate() passes.
        engine = MagicMock()
        def _fake_synth(text, output_path, language=None, **kw):
            if synth_raises:
                raise synth_raises
            if synth_return == 'path':
                # Touch the file so os.path.exists returns True
                with open(output_path, 'wb') as f:
                    f.write(b'RIFF\x00\x00\x00\x00WAVE')
                return output_path
            if synth_return == 'missing':
                # Return a path that doesn't exist
                return os.path.join(
                    os.path.dirname(output_path), 'does_not_exist.wav'
                )
            return None  # synth_return == 'none' / None
        engine.synthesize = MagicMock(side_effect=_fake_synth)

        mock_tts_engine = MagicMock()
        mock_tts_engine.get_tts_engine = MagicMock(return_value=engine)

        mock_whisper_tool = MagicMock()
        if transcribe_raises:
            mock_whisper_tool.whisper_transcribe = MagicMock(
                side_effect=transcribe_raises
            )
        else:
            mock_whisper_tool.whisper_transcribe = MagicMock(
                return_value=transcript_json
            )

        mock_core_constants = MagicMock()
        mock_core_constants.GREETINGS = greetings or {
            'en': "Hey, I'm Nunba. Can you hear me?",
        }

        return engine, mock_whisper_tool, {
            'tts.tts_engine': mock_tts_engine,
            'integrations.service_tools.whisper_tool': mock_whisper_tool,
            'core.constants': mock_core_constants,
        }

    def test_validate_exact_match_passes(self):
        """Byte-identical transcript → (True, ratio 0.00)."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        transcript = json.dumps({
            'text': "Hey, I'm Nunba. Can you hear me?",
            'language': 'en',
        })
        _, _, modules = self._stub_validate_env(transcript_json=transcript)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is True
        assert 'Lev=0/' in reason
        assert 'ratio 0.00' in reason

    def test_validate_whisper_punctuation_drift_still_passes(self):
        """Whisper drops the '?' and the apostrophe — that's within tolerance."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        transcript = json.dumps({
            'text': 'Hey Im Nunba Can you hear me',
            'language': 'en',
        })
        _, _, modules = self._stub_validate_env(transcript_json=transcript)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is True, reason
        # After normalisation, exp="hey im nunba can you hear me",
        # act="hey im nunba can you hear me" → Lev=0 (punctuation is stripped).
        assert 'Lev=0/' in reason

    def test_validate_minor_word_substitution_passes(self):
        """Whisper mis-hears 'Nunba' → 'Namba' — 2 edits out of ~26 chars."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        transcript = json.dumps({
            'text': "Hey, I'm Namba. Can you hear me?",
            'language': 'en',
        })
        _, _, modules = self._stub_validate_env(transcript_json=transcript)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is True, reason
        # 2 substitutions (u→a, n→m): ratio ≈ 2/27 ≈ 0.07
        assert 'Lev=2/' in reason

    def test_validate_over_threshold_fails(self):
        """Transcript is unrelated gibberish → ratio > 0.4 → fail."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        transcript = json.dumps({
            'text': 'The quick brown fox jumps over a lazy dog',
            'language': 'en',
        })
        _, _, modules = self._stub_validate_env(transcript_json=transcript)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'ratio' in reason
        # The reported ratio should exceed 0.4
        import re
        m = re.search(r'ratio (\d+\.\d+)', reason)
        assert m and float(m.group(1)) > 0.4

    def test_validate_empty_transcript_fails(self):
        """Whisper returns empty text → hard fail, not soft-pass."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        transcript = json.dumps({'text': '', 'language': 'en'})
        _, _, modules = self._stub_validate_env(transcript_json=transcript)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'empty transcript' in reason

    def test_validate_whisper_error_payload_fails(self):
        """Whisper returns {'error': '...'} → hard fail with that message."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        transcript = json.dumps({'error': 'model file missing'})
        _, _, modules = self._stub_validate_env(transcript_json=transcript)
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'model file missing' in reason

    def test_validate_transcribe_raises_fails(self):
        """whisper_transcribe blowing up → (False, 'whisper_transcribe raised: ...')."""
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        _, _, modules = self._stub_validate_env(
            transcribe_raises=RuntimeError('ctranslate2 segfault'),
        )
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is False
        assert 'whisper_transcribe raised' in reason
        assert 'ctranslate2 segfault' in reason

    def test_validate_soft_pass_when_tts_unavailable(self):
        """TTS module missing → STT probe soft-passes (True), not fails."""
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        # Stub core.constants + whisper_tool, leave tts.tts_engine unset.
        mock_whisper_tool = MagicMock()
        mock_core_constants = MagicMock()
        mock_core_constants.GREETINGS = {'en': "Hey, I'm Nunba. Can you hear me?"}

        import builtins
        real_import = builtins.__import__

        def _broken(name, *a, **kw):
            if name == 'tts.tts_engine':
                raise ImportError('tts package missing')
            return real_import(name, *a, **kw)

        modules = {
            'integrations.service_tools.whisper_tool': mock_whisper_tool,
            'core.constants': mock_core_constants,
        }
        with patch.dict('sys.modules', modules), \
             patch.object(builtins, '__import__', _broken):
            ok, reason = loader.validate(entry)
        assert ok is True
        assert 'soft-pass' in reason
        assert 'TTS module unavailable' in reason

    def test_validate_soft_pass_when_synth_returns_none(self):
        """engine.synthesize → None (no audio): soft-pass, not hard fail."""
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        _, _, modules = self._stub_validate_env(
            synth_return=None, transcript_json='{}',
        )
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is True
        assert 'soft-pass' in reason

    def test_validate_soft_pass_when_synth_raises(self):
        """engine.synthesize raising: soft-pass (TTS engine broken, not STT)."""
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        _, _, modules = self._stub_validate_env(
            synth_raises=RuntimeError('piper binary missing'),
            transcript_json='{}',
        )
        with patch.dict('sys.modules', modules):
            ok, reason = loader.validate(entry)
        assert ok is True
        assert 'soft-pass' in reason
        assert 'piper binary missing' in reason

    def test_validate_cleans_up_tempfile(self):
        """The tempfile synth wrote is deleted regardless of pass/fail."""
        import json
        loader = STTLoader()
        entry = _make_entry(id='stt-whisper', model_type='stt')
        # Capture the path that synthesize was called with.
        captured = {}
        engine = MagicMock()
        def _synth(text, output_path, language=None, **kw):
            captured['path'] = output_path
            with open(output_path, 'wb') as f:
                f.write(b'RIFF')
            return output_path
        engine.synthesize = MagicMock(side_effect=_synth)

        mock_tts_engine = MagicMock(get_tts_engine=MagicMock(return_value=engine))
        mock_whisper_tool = MagicMock(
            whisper_transcribe=MagicMock(
                return_value=json.dumps({'text': "Hey, I'm Nunba. Can you hear me?"})
            ),
        )
        mock_core_constants = MagicMock(
            GREETINGS={'en': "Hey, I'm Nunba. Can you hear me?"},
        )
        modules = {
            'tts.tts_engine': mock_tts_engine,
            'integrations.service_tools.whisper_tool': mock_whisper_tool,
            'core.constants': mock_core_constants,
        }
        with patch.dict('sys.modules', modules):
            loader.validate(entry)

        import os
        assert captured.get('path')
        assert not os.path.exists(captured['path']), (
            'probe tempfile should be cleaned up after validate()'
        )


# ── _levenshtein helper (L1.3) ───────────────────────────────────────

class TestLevenshtein:
    def test_equal_strings_zero_distance(self):
        assert _levenshtein('hello', 'hello') == 0

    def test_empty_both_zero(self):
        assert _levenshtein('', '') == 0

    def test_empty_one_returns_other_length(self):
        assert _levenshtein('', 'kitten') == 6
        assert _levenshtein('sitting', '') == 7

    def test_single_substitution(self):
        assert _levenshtein('cat', 'car') == 1

    def test_single_insertion(self):
        assert _levenshtein('cat', 'cart') == 1

    def test_single_deletion(self):
        assert _levenshtein('cart', 'cat') == 1

    def test_classic_kitten_sitting(self):
        # The canonical textbook example — 3 edits.
        assert _levenshtein('kitten', 'sitting') == 3

    def test_order_independent(self):
        assert _levenshtein('abc', 'xyz') == _levenshtein('xyz', 'abc')


# ===========================================================================
# 6. VLMLoader
# ===========================================================================

class TestVLMLoader:
    def test_is_model_loader_subclass(self):
        assert issubclass(VLMLoader, ModelLoader)

    def test_load_success(self):
        # VLMLoader.load() invokes self._get_service() which imports
        # hart_intelligence_entry — that pulls HARTOS Redis + channel
        # registry which we don't want to exercise here.  Patch
        # _get_service at the VLMLoader class level so the unit test
        # stays hermetic regardless of prior sys.modules mutations.
        from unittest.mock import patch as _patch
        loader = VLMLoader()
        entry = _make_entry(id='vlm-minicpm')
        mock_vision = MagicMock()
        with _patch.object(VLMLoader, '_get_service', return_value=mock_vision):
            result = loader.load(entry, 'gpu')
        assert result is True

    def test_load_handles_exception(self):
        loader = VLMLoader()
        entry = _make_entry(id='vlm-minicpm')
        with patch.dict('sys.modules', {'integrations.vision.vision_service': None}):
            result = loader.load(entry, 'gpu')
        assert result is False


# ===========================================================================
# 7. _register_loaders
# ===========================================================================

class TestRegisterLoaders:
    def test_registers_four_loaders(self):
        import models.orchestrator as mod
        old = mod._loaders_registered
        mod._loaders_registered = False
        try:
            orch = MagicMock(spec=ModelOrchestrator)
            _register_loaders(orch)
            assert orch.register_loader.call_count == 4
        finally:
            mod._loaders_registered = old

    def test_registers_only_once(self):
        import models.orchestrator as mod
        old = mod._loaders_registered
        mod._loaders_registered = False
        try:
            orch = MagicMock(spec=ModelOrchestrator)
            _register_loaders(orch)
            _register_loaders(orch)
            assert orch.register_loader.call_count == 4  # not 8
        finally:
            mod._loaders_registered = old


# ===========================================================================
# 8. get_orchestrator SINGLETON
# ===========================================================================

class TestGetOrchestrator:
    def test_returns_model_orchestrator_instance(self):
        orch = get_orchestrator()
        assert isinstance(orch, ModelOrchestrator)

    def test_returns_same_instance(self):
        o1 = get_orchestrator()
        o2 = get_orchestrator()
        assert o1 is o2

    def test_shared_with_hartos_module(self):
        import integrations.service_tools.model_orchestrator as hartos_mod
        orch = get_orchestrator()
        assert hartos_mod._orchestrator_instance is orch
