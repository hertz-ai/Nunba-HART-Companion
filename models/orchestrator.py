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
                _CATALOG_ID_TO_FASTER_WHISPER_SIZE, _stt_tool,
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
            from integrations.vision.vision_service import VisionService
            import hart_intelligence_entry as _hie
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
