"""
ModelOrchestrator — Nunba shim.

Re-exports the canonical ModelOrchestrator from HARTOS and provides
Nunba-specific ModelLoader implementations for LLM, TTS, STT, and VLM.
All existing ``from models.orchestrator import ...`` imports continue to
work unchanged.

The singleton is shared with HARTOS so that both
``integrations.service_tools.model_orchestrator.get_orchestrator()`` and
``models.orchestrator.get_orchestrator()`` return the same instance.
"""

import logging

# Access the HARTOS module for shared singleton management
import integrations.service_tools.model_orchestrator as _hartos_mod

# ── Re-export canonical types from HARTOS ─────────────────────────
from integrations.service_tools.model_orchestrator import (  # noqa: F401
    ModelEntry,
    ModelLoader,
    ModelOrchestrator,
)

# Ensure Nunba's get_catalog() (with populators) is used
from models.catalog import ModelCatalog, ModelType, get_catalog  # noqa: F401

logger = logging.getLogger('NunbaModelOrchestrator')


# ── Nunba-specific ModelLoader implementations ────────────────────


def _entry_to_preset(entry: ModelEntry):
    """Reconstruct a ModelPreset from a catalog ModelEntry.

    The catalog populator (models/catalog.py::populate_llm_presets) stores all
    download-specific fields inside ``entry.files`` and ``entry.repo_id``, so
    this helper is the single place that knows the mapping.  Callers never need
    to import MODEL_PRESETS just to get file paths or repo URLs.

    Returns a ModelPreset instance, or None if the entry lacks required fields.
    """
    from llama.llama_installer import ModelPreset
    file_name = entry.files.get('model')
    if not file_name:
        return None
    # repo_id is stored both on entry.repo_id (canonical) and files['repo']
    # (redundant copy added by populate_llm_presets for belt-and-suspenders).
    repo_id = entry.repo_id or entry.files.get('repo', '')
    has_vision = entry.capabilities.get('has_vision', False)
    mmproj_file = entry.files.get('mmproj') if has_vision else None
    mmproj_source = entry.files.get('mmproj_source') if has_vision else None
    size_mb = int(round((entry.disk_gb or 0) * 1024))
    return ModelPreset(
        display_name=entry.name,
        repo_id=repo_id,
        file_name=file_name,
        size_mb=size_mb,
        description='',          # not needed for load/download operations
        has_vision=has_vision,
        mmproj_file=mmproj_file,
        mmproj_source_file=mmproj_source,
        min_build=entry.min_build,
    )


class LlamaLoader(ModelLoader):
    """Loader for LLM models via llama.cpp.

    All operations are driven purely by the ModelCatalog entry — no direct
    import of MODEL_PRESETS is needed here.  The canonical preset data lives in
    llama_installer.py; populate_llm_presets() in models/catalog.py translates
    it into ModelEntry.files so this loader can reconstruct a ModelPreset via
    _entry_to_preset() without going back to the source list.
    """

    def _resolve_preset_and_index(self, entry: ModelEntry):
        """Return (preset, index) by matching the catalog entry against MODEL_PRESETS.

        Index is needed so LlamaConfig can persist ``selected_model_index``.
        Falls back to a catalog-reconstructed preset (index=None) if the entry
        can't be matched — e.g. a user-added model not in the built-in list.
        """
        from llama.llama_installer import MODEL_PRESETS
        file_name = entry.files.get('model', '')
        for i, p in enumerate(MODEL_PRESETS):
            if p.file_name == file_name or p.display_name == entry.name:
                return p, i
        # Not in the built-in list — reconstruct from catalog fields.
        return _entry_to_preset(entry), None

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        try:
            from llama.llama_config import LlamaConfig
            config = LlamaConfig()
            preset, idx = self._resolve_preset_and_index(entry)
            if not preset:
                logger.error(f"LLM preset not found for catalog entry: {entry.id}")
                return False
            if idx is not None:
                config.config['selected_model_index'] = idx
            config.config['use_gpu'] = (run_mode == 'gpu')
            config.config['llm_mode'] = 'local'
            config._save_config()
            return config.start_server(model_preset=preset)
        except Exception as e:
            logger.error(f"LLM load failed: {e}")
            return False

    def unload(self, entry: ModelEntry) -> None:
        try:
            from llama.llama_config import LlamaConfig
            config = LlamaConfig()
            config.stop_server()
        except Exception as e:
            logger.warning(f"LLM unload failed: {e}")

    def download(self, entry: ModelEntry) -> bool:
        try:
            from llama.llama_installer import LlamaInstaller
            installer = LlamaInstaller()
            preset, _ = self._resolve_preset_and_index(entry)
            if not preset:
                logger.error(f"LLM download: no preset for {entry.id}")
                return False
            return installer.download_model(preset)
        except Exception as e:
            logger.error(f"LLM download failed: {e}")
            return False

    def is_downloaded(self, entry: ModelEntry) -> bool:
        try:
            from llama.llama_installer import LlamaInstaller
            installer = LlamaInstaller()
            preset, _ = self._resolve_preset_and_index(entry)
            if preset:
                return installer.is_model_downloaded(preset)
        except Exception:
            pass
        return False


class TTSLoader(ModelLoader):
    """Loader for TTS engines via tts_engine + subprocess ToolWorker.

    Download installs pip packages + CUDA torch.
    Load eagerly spawns the ToolWorker subprocess so admin UI "Load"
    actually puts the model in VRAM and the catalog state reflects
    reality (not just "packages are installed").
    Unload stops the ToolWorker and releases VRAM.
    is_loaded probes the live subprocess rather than reading entry flags,
    so stale state, crashes, and idle auto-stops are visible to callers.

    The mapping backend_name → (tool module, ToolWorker attribute) lives
    in the canonical ENGINE_REGISTRY in tts_router.py. This loader reads
    those fields — no duplicate table here.
    """

    def _backend_name(self, entry: ModelEntry) -> str:
        return entry.id.replace('tts-', '')

    def _get_tool_worker(self, entry: ModelEntry):
        """Return the ToolWorker instance for this entry, or None if
        this backend is CPU-only (no subprocess needed).

        Reads tool_module + tool_worker_attr from ENGINE_REGISTRY — the
        single source of truth for TTS engine metadata.
        """
        try:
            from integrations.channels.media.tts_router import ENGINE_REGISTRY
        except ImportError:
            return None
        spec = ENGINE_REGISTRY.get(self._backend_name(entry))
        if spec is None or not spec.tool_module or not spec.tool_worker_attr:
            return None
        try:
            import importlib
            mod = importlib.import_module(spec.tool_module)
            return getattr(mod, spec.tool_worker_attr, None)
        except Exception as e:
            logger.warning(f"TTSLoader: import {spec.tool_module} failed: {e}")
            return None

    def download(self, entry: ModelEntry) -> bool:
        """Install TTS backend packages (pip) + CUDA torch if needed."""
        backend_name = self._backend_name(entry)
        try:
            from tts.package_installer import install_backend_full
            logger.info(f"TTS download: installing backend '{backend_name}'")
            ok, result = install_backend_full(backend_name)
            if ok:
                logger.info(f"TTS backend '{backend_name}' installed successfully")
            else:
                logger.warning(f"TTS backend '{backend_name}' install failed: {result}")
            return ok
        except ImportError:
            logger.warning("package_installer not available for TTS download")
            return False
        except Exception as e:
            logger.error(f"TTS download failed for '{backend_name}': {e}")
            return False

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        """Eagerly start the ToolWorker (GPU) or validate the backend (CPU).

        For GPU backends, this spawns the subprocess and waits for the
        READY handshake, so when this returns True the model really is
        resident in VRAM.
        """
        backend_name = self._backend_name(entry)

        # 1. Package availability check (shared by all backends)
        try:
            from tts.tts_engine import TTSEngine
            engine = TTSEngine(prefer_gpu=(run_mode == 'gpu'), auto_init=False)
            can_run = engine._can_run_backend(backend_name)
            if not can_run:
                engine._try_auto_install_backend(backend_name)
                logger.info(f"TTS backend {backend_name} install triggered")
                entry.loaded = False
                entry.error = f"{backend_name} packages missing"
                return False
        except Exception as e:
            logger.error(f"TTS load check failed: {e}")
            entry.loaded = False
            entry.error = str(e)
            return False

        # 2. CPU-only backends: nothing more to do, they load lazily.
        worker = self._get_tool_worker(entry)
        if worker is None:
            logger.info(f"TTS backend {backend_name} is CPU-only (no worker)")
            entry.loaded = True
            entry.device = 'cpu'
            entry.error = None
            return True

        # 3. GPU backends: eagerly spawn the ToolWorker subprocess.
        try:
            # Sync idle_timeout from the catalog entry so the admin UI's
            # "idle auto-stop" setting takes effect on this instance
            # (not just the hardcoded default in the tool module).
            idle_s = getattr(entry, 'idle_timeout_s', None)
            if idle_s is not None and hasattr(worker, 'set_idle_timeout'):
                try:
                    worker.set_idle_timeout(float(idle_s))
                except Exception:
                    pass

            worker._get_or_start()
            entry.loaded = True
            entry.device = 'cuda' if run_mode == 'gpu' else run_mode
            entry.error = None
            logger.info(f"TTS backend {backend_name} subprocess READY ({entry.device})")
            return True
        except Exception as e:
            logger.error(f"TTS worker spawn failed for {backend_name}: {e}")
            entry.loaded = False
            entry.error = f"worker spawn failed: {e}"
            return False

    def unload(self, entry: ModelEntry) -> None:
        """Stop the ToolWorker subprocess (if any) and release VRAM."""
        worker = self._get_tool_worker(entry)
        if worker is None:
            # CPU-only backend — nothing to stop
            entry.loaded = False
            entry.device = None
            return
        try:
            worker.stop()
            entry.loaded = False
            entry.device = None
            entry.error = None
            logger.info(f"TTS backend {self._backend_name(entry)} worker stopped")
        except Exception as e:
            logger.warning(f"TTS unload failed for {entry.id}: {e}")
            entry.error = str(e)

    def is_loaded(self, entry: ModelEntry) -> bool:
        """Live probe of worker subprocess, not catalog flag."""
        worker = self._get_tool_worker(entry)
        if worker is None:
            return bool(getattr(entry, 'loaded', False))  # CPU-only
        return worker.is_alive()

    def is_downloaded(self, entry: ModelEntry) -> bool:
        pkg = entry.files.get('package') or entry.repo_id
        if pkg:
            import importlib.util
            return importlib.util.find_spec(pkg.replace('-', '_')) is not None
        return False

    def validate(self, entry: ModelEntry) -> tuple:
        """Canned TTS probe: synthesize the English greeting and verify
        real audio came out (≥10KB + duration ≥0.5s).

        Delegates to ``tts.tts_handshake.run_handshake`` — the SAME code
        path that drives the first-run "Voice engine ready" banner, which
        itself delegates to ``tts.verified_synth.verify_backend_synth``.
        By reusing the canonical handshake we keep ONE definition of
        "what counts as a real TTS signal":

            install-validation here  ─┐
                                      ├─► run_handshake(engine, backend,
            first-run banner flip ────┤      lang='en', broadcast=False,
                                      │      play_audio=False)
            "Retry" + swap-backend ───┘

        Any future tightening of the bar (e.g. phonetic-similarity,
        SNR floor) lands in run_handshake once and every checkpoint
        inherits it — no parallel probe to drift.

        Deterministic input (canonical ``GREETINGS['en']`` phrase from
        ``core.constants``), runs in-process (no network egress, no user
        PII in the synth text), ``broadcast=False`` so the probe doesn't
        emit SSE events to the UI, ``play_audio=False`` so the install
        machine doesn't beep.  Invalidates any stale handshake cache for
        this backend first so a pre-install negative verdict doesn't
        spuriously fail the fresh probe.

        Returns:
            (True,  'synthesized {bytes}B, {duration:.2f}s') on pass
            (False, reason) on fail
        """
        backend_name = self._backend_name(entry)
        try:
            from tts.tts_engine import get_tts_engine
            from tts.tts_handshake import invalidate, run_handshake
        except ImportError as e:
            return (False, f'TTS imports failed: {e}')

        try:
            engine = get_tts_engine()
        except Exception as e:
            return (False, f'get_tts_engine raised: {e}')

        # Clear any stale handshake verdict for this backend so the
        # post-install probe reflects the FRESHLY-LOADED state, not a
        # pre-install cached failure (e.g. from when the backend's
        # packages weren't yet present).
        try:
            invalidate(backend_name)
        except Exception:
            pass

        try:
            result = run_handshake(
                engine, backend_name, lang='en',
                broadcast=False, play_audio=False,
                timeout_s=60,
            )
        except Exception as e:
            return (False, f'run_handshake raised: {e}')

        if not result.ok:
            return (False, f'handshake failed: {result.err}')

        logger.info(
            f"TTS validate OK for {entry.id}: "
            f"{result.n_bytes}B, {result.duration_s:.2f}s"
        )
        return (
            True,
            f'synthesized {result.n_bytes}B, {result.duration_s:.2f}s'
        )


def _levenshtein(a: str, b: str) -> int:
    """Classic iterative Levenshtein edit distance (no external dep).

    Two-row DP, O(len(a) * len(b)) time, O(min(len(a), len(b))) space.
    Used by ``STTLoader.validate`` to measure how much Whisper's
    transcript drifts from the ground-truth phrase we synthesized.  We
    deliberately keep the implementation inline rather than pulling in
    rapidfuzz / python-Levenshtein — the install-time probe runs once
    per STT install, handling a ~40-char phrase, so the native C dep
    would pay its cost (wheel size, multi-OS matrix, cx_Freeze bundle
    bloat) for no measurable win.

    Returns the minimum number of single-character insertions,
    deletions, or substitutions to turn ``a`` into ``b``.
    """
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    # Ensure `a` is the shorter string so the inner row is smaller.
    if len(a) > len(b):
        a, b = b, a
    prev = list(range(len(a) + 1))
    for j, cb in enumerate(b, 1):
        curr = [j] + [0] * len(a)
        for i, ca in enumerate(a, 1):
            cost = 0 if ca == cb else 1
            curr[i] = min(
                curr[i - 1] + 1,      # insertion
                prev[i] + 1,          # deletion
                prev[i - 1] + cost,   # substitution
            )
        prev = curr
    return prev[-1]


class STTLoader(ModelLoader):
    """Loader for STT models (faster-whisper, lazy-loaded on first use)."""

    def download(self, entry: ModelEntry) -> bool:
        """Install faster-whisper + CUDA torch if needed."""
        try:
            from tts.package_installer import has_nvidia_gpu, install_gpu_torch, is_cuda_torch
            # Ensure CUDA torch is available for GPU whisper
            if has_nvidia_gpu() and not is_cuda_torch():
                logger.info("STT download: installing CUDA torch for faster-whisper")
                ok, msg = install_gpu_torch()
                if not ok:
                    logger.warning(f"CUDA torch install failed: {msg}")
                    return False
            # Install faster-whisper itself
            import importlib.util
            if importlib.util.find_spec('faster_whisper') is None:
                import subprocess
                import sys
                logger.info("STT download: installing faster-whisper")
                _kw = dict(capture_output=True, text=True, timeout=300)
                if sys.platform == 'win32':
                    _kw['creationflags'] = subprocess.CREATE_NO_WINDOW
                result = subprocess.run(
                    [sys.executable, '-m', 'pip', 'install', 'faster-whisper', '--quiet'],
                    **_kw)
                if result.returncode != 0:
                    logger.warning(f"faster-whisper install failed: {result.stderr[:200]}")
                    return False
            logger.info("STT dependencies ready (faster-whisper + CUDA torch)")
            return True
        except Exception as e:
            logger.error(f"STT download failed: {e}")
            return False

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        """Propagate user-selected model size to the STT subprocess worker.

        Sets HEVOLVE_STT_MODEL_SIZE so the next-spawned subprocess picks
        up the right model (faster-whisper reads this env var in its
        _get_faster_whisper_model helper). If a worker is already running
        with a different size, stop it so the next transcribe call
        respawns with the new selection.
        """
        import os
        try:
            from integrations.service_tools.whisper_tool import (
                _CATALOG_ID_TO_FASTER_WHISPER_SIZE,
                _stt_tool,
            )
        except ImportError:
            logger.warning("STT load: whisper_tool not importable")
            entry.loaded = False
            return False

        size = _CATALOG_ID_TO_FASTER_WHISPER_SIZE.get(entry.id)
        if size:
            os.environ['HEVOLVE_STT_MODEL_SIZE'] = size
            logger.info(f"STT model size set to '{size}' (from {entry.id})")
            # If a worker is already running with a different size, stop
            # it so the next call respawns with the new selection.
            if _stt_tool.is_alive():
                logger.info("STT worker alive with old size — stopping for respawn")
                _stt_tool.stop()

        # Sync idle_timeout from the catalog entry so admin-UI edits
        # take effect on this instance.
        idle_s = getattr(entry, 'idle_timeout_s', None)
        if idle_s is not None and hasattr(_stt_tool, 'set_idle_timeout'):
            try:
                _stt_tool.set_idle_timeout(float(idle_s))
            except Exception:
                pass

        entry.loaded = True
        entry.device = 'cuda' if run_mode == 'gpu' else 'cpu'
        entry.error = None
        entry._lazy_stt = True  # model lazy-loads on first transcribe
        logger.info(f"STT model {entry.id} ready (lazy on first use)")
        return True

    def unload(self, entry: ModelEntry) -> None:
        """Stop the STT subprocess worker and free memory."""
        try:
            from integrations.service_tools.whisper_tool import unload_whisper
            unload_whisper()
            entry.loaded = False
            entry.device = None
            entry.error = None
        except Exception as e:
            logger.warning(f"STT unload failed: {e}")
            entry.error = str(e)

    def is_loaded(self, entry: ModelEntry) -> bool:
        try:
            from integrations.service_tools.whisper_tool import _stt_tool
            return _stt_tool.is_alive()
        except ImportError:
            return False

    def is_downloaded(self, entry: ModelEntry) -> bool:
        try:
            import importlib.util
            return importlib.util.find_spec('faster_whisper') is not None
        except Exception:
            return False

    def validate(self, entry: ModelEntry) -> tuple:
        """Round-trip probe: synth known phrase → transcribe → assert match.

        This is the L1.3 capability gate.  We synthesize the canonical
        English greeting (``core.constants.GREETINGS['en']`` — the SAME
        phrase L1.2 and first-run handshake use, keeping one source of
        truth for "what counts as a probe phrase"), run the resulting
        WAV back through ``whisper_transcribe``, and verify the
        transcript's Levenshtein distance from the source is ≤ 40% of
        the longer string's length.

        Why 40% and not zero?  Whisper normalises punctuation, drops
        sentence-final question marks, and occasionally mis-hears
        "Nunba" (novel word, not in its training corpus) as "Nomba" or
        "Namba".  The bar is "the transcript is recognisably the same
        sentence", not "byte-identical" — the latter would false-fail
        on working installs and dilute the signal.

        TTS dependency — soft-pass policy:
            If the TTS engine is unavailable or synthesis fails, we
            return ``(True, 'soft-pass: no TTS available...')`` rather
            than ``(False, ...)``.  STT install-validation must not
            fail just because TTS isn't installed yet — that would
            couple two independent checkpoints and block a perfectly
            working Whisper install whenever the user picks
            whisper-before-piper in the admin UI.  L1.2 is responsible
            for catching TTS regressions; L1.3 is responsible for
            catching STT regressions.  Keep them orthogonal.

        Returns:
            (True,  'round-trip Lev=D/L (ratio X.XX): "<transcript>"') on pass
            (True,  'soft-pass: ...') when TTS is genuinely unavailable
            (False, reason) on real STT failure (empty transcript, over-threshold)
        """
        import json
        import os
        import string
        import tempfile

        # 1. Ground-truth phrase — shared source of truth with L1.2.
        try:
            from core.constants import GREETINGS
        except ImportError as e:
            return (False, f'core.constants import failed: {e}')
        expected = GREETINGS.get('en')
        if not expected:
            return (False, "GREETINGS['en'] missing from core.constants")

        # 2. STT entry point — the canonical subprocess-isolated transcribe.
        try:
            from integrations.service_tools.whisper_tool import whisper_transcribe
        except ImportError as e:
            return (False, f'whisper_transcribe import failed: {e}')

        # 3. TTS entry point — used to produce the probe WAV.  Soft-pass
        # if TTS isn't available: STT health must not be coupled to TTS
        # install ordering.
        try:
            from tts.tts_engine import get_tts_engine
        except ImportError as e:
            return (True, f'soft-pass: TTS module unavailable ({e})')
        try:
            engine = get_tts_engine()
        except Exception as e:
            return (True, f'soft-pass: get_tts_engine raised ({e})')

        # 4. Allocate a tempfile for the synthesised WAV.  We manage it
        # ourselves (rather than reusing HandshakeResult.audio_path) so
        # the STT probe is decoupled from the handshake cache — a stale
        # cached (backend, lang) entry from a prior TTS probe mustn't
        # determine whether STT validates.
        tmp_fd, wav_path = tempfile.mkstemp(
            suffix='.wav', prefix=f'stt_validate_{entry.id}_'
        )
        os.close(tmp_fd)
        try:
            try:
                synth_path = engine.synthesize(
                    expected, wav_path, language='en'
                )
            except Exception as e:
                return (True, f'soft-pass: synthesize raised ({e})')
            if not synth_path or not os.path.exists(synth_path):
                return (True, 'soft-pass: synthesize returned no audio')

            # 5. Transcribe.  whisper_transcribe returns JSON; on error
            # it embeds an 'error' key.
            try:
                raw = whisper_transcribe(synth_path, language='en')
            except Exception as e:
                return (False, f'whisper_transcribe raised: {e}')
            try:
                payload = json.loads(raw) if isinstance(raw, str) else raw
            except (ValueError, TypeError) as e:
                return (False, f'transcript not JSON: {e}')
            if not isinstance(payload, dict):
                return (False, f'transcript shape unexpected: {type(payload).__name__}')
            if 'error' in payload:
                return (False, f'transcribe failed: {payload["error"]}')
            actual = (payload.get('text') or '').strip()
            if not actual:
                return (False, 'empty transcript')

            # 6. Normalise both strings (lowercase + strip punctuation)
            # then compute edit-distance ratio.
            trans = str.maketrans('', '', string.punctuation)
            exp_norm = expected.lower().translate(trans).strip()
            act_norm = actual.lower().translate(trans).strip()
            dist = _levenshtein(exp_norm, act_norm)
            denom = max(len(exp_norm), len(act_norm), 1)
            ratio = dist / denom
            MAX_RATIO = 0.4

            summary = (
                f'round-trip Lev={dist}/{denom} (ratio {ratio:.2f}): "{actual}"'
            )
            if ratio > MAX_RATIO:
                logger.warning(f"STT validate FAIL for {entry.id}: {summary}")
                return (False, summary)
            logger.info(f"STT validate OK for {entry.id}: {summary}")
            return (True, summary)
        finally:
            try:
                if os.path.exists(wav_path):
                    os.unlink(wav_path)
            except OSError:
                pass


class VLMLoader(ModelLoader):
    """Loader for VLM models (MiniCPM sidecar).

    VisionService owns the MiniCPM subprocess + WS server + description
    loop. It's a runtime singleton managed by hart_intelligence_entry
    (standalone mode) or by Nunba's __main__ (bundled mode). This loader
    resolves the singleton, calls .start()/.stop() on it, and reflects
    the running state on the catalog entry.
    """

    def _get_service(self):
        """Return the VisionService singleton. Creates a fresh instance
        and stashes it as the canonical one if none exists yet — matches
        hart_intelligence_entry.get_vision_service() lookup order so
        both loader and runtime see the same object."""
        try:
            import hart_intelligence_entry as _hie
            from integrations.vision.vision_service import VisionService
        except ImportError as e:
            logger.error(f"VLM imports failed: {e}")
            return None

        svc = _hie.get_vision_service()
        if svc is None:
            svc = VisionService()
            _hie._vision_service = svc  # make sure get_vision_service finds it
        return svc

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        svc = self._get_service()
        if svc is None:
            entry.loaded = False
            entry.error = 'VisionService unavailable'
            return False
        try:
            # run_mode 'gpu' → full (MiniCPM), 'cpu'/'cpu_offload' → lite
            mode = 'full' if run_mode == 'gpu' else 'lite'
            svc.start(mode=mode)
            entry.loaded = True
            entry.device = 'cuda' if mode == 'full' else 'cpu'
            entry.error = None
            logger.info(f"VLM started in {mode} mode (entry.device={entry.device})")
            return True
        except Exception as e:
            logger.error(f"VLM start failed: {e}")
            entry.loaded = False
            entry.error = str(e)
            return False

    def unload(self, entry: ModelEntry) -> None:
        svc = self._get_service()
        if svc is None:
            entry.loaded = False
            return
        try:
            svc.stop()
            entry.loaded = False
            entry.device = None
            entry.error = None
            logger.info(f"VLM stopped ({entry.id})")
        except Exception as e:
            logger.warning(f"VLM stop failed: {e}")
            entry.error = str(e)

    def is_loaded(self, entry: ModelEntry) -> bool:
        """Live probe: is the VisionService actually running?"""
        try:
            import hart_intelligence_entry as _hie
            svc = _hie.get_vision_service()
            return bool(svc is not None and getattr(svc, '_running', False))
        except Exception:
            return False

    def validate(self, entry: ModelEntry) -> tuple:
        """Canned VLM probe: describe a 32×32 red JPEG in ≤20 words.

        Proves the full path works end-to-end: catalog entry →
        VisionService → MiniCPM subprocess (or lightweight backend) →
        description string.  A healthy VLM returns non-empty text.

        Deterministic input (solid-red 32×32 JPEG, fixed prompt) so
        repeated install validations give comparable signals.
        Runs in-process, no network egress — respects the privacy
        boundary (no user PII, no telemetry).  Times out at 10s
        (VisionService._describe_frame sets the HTTP timeout itself).
        """
        svc = self._get_service()
        if svc is None:
            return (False, 'VisionService unavailable')
        try:
            import io

            from PIL import Image
            buf = io.BytesIO()
            Image.new('RGB', (32, 32), color=(220, 40, 40)).save(buf, format='JPEG')
            jpeg_bytes = buf.getvalue()
        except Exception as e:
            return (False, f'canned JPEG build failed: {e}')

        try:
            desc = svc._describe_frame(
                '__install_validation__',
                jpeg_bytes,
                prompt='describe this image in 5 words',
            )
        except Exception as e:
            return (False, f'describe_frame raised: {e}')

        if not desc or not str(desc).strip():
            return (False, 'empty description from VLM')
        logger.info(
            f"VLM validate OK for {entry.id}: {str(desc)[:60]!r}"
        )
        return (True, f'caption: {str(desc)[:60]}')


# ── Singleton (shared with HARTOS module) ─────────────────────────
_loaders_registered = False


def _register_loaders(orch: ModelOrchestrator) -> None:
    """Register all Nunba-specific loaders on the orchestrator instance."""
    global _loaders_registered
    if _loaders_registered:
        return
    orch.register_loader(ModelType.LLM, LlamaLoader())
    orch.register_loader(ModelType.TTS, TTSLoader())
    orch.register_loader(ModelType.STT, STTLoader())
    orch.register_loader(ModelType.VLM, VLMLoader())
    _loaders_registered = True


def get_orchestrator() -> ModelOrchestrator:
    """Get or create the global ModelOrchestrator singleton.

    Shares the singleton with HARTOS's model_orchestrator module so that
    both import paths return the same instance.  Registers Nunba-specific
    loaders (LLM, TTS, STT, VLM) on the instance.
    """
    if _hartos_mod._orchestrator_instance is not None:
        _register_loaders(_hartos_mod._orchestrator_instance)
        return _hartos_mod._orchestrator_instance

    with _hartos_mod._orchestrator_lock:
        if _hartos_mod._orchestrator_instance is None:
            # Use Nunba's get_catalog() which has populators registered
            catalog = get_catalog()
            inst = ModelOrchestrator(catalog=catalog)
            _register_loaders(inst)
            _hartos_mod._orchestrator_instance = inst
        else:
            _register_loaders(_hartos_mod._orchestrator_instance)
    return _hartos_mod._orchestrator_instance
