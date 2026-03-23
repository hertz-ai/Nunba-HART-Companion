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
from typing import Optional

# ── Re-export canonical types from HARTOS ─────────────────────────
from integrations.service_tools.model_orchestrator import (    # noqa: F401
    ModelOrchestrator, ModelLoader, ModelEntry,
)

# Ensure Nunba's get_catalog() (with populators) is used
from models.catalog import ModelCatalog, ModelType, get_catalog  # noqa: F401

# Access the HARTOS module for shared singleton management
import integrations.service_tools.model_orchestrator as _hartos_mod

logger = logging.getLogger('NunbaModelOrchestrator')


# ── Nunba-specific ModelLoader implementations ────────────────────

class LlamaLoader(ModelLoader):
    """Loader for LLM models via llama.cpp."""

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        try:
            from llama.llama_config import LlamaConfig, MODEL_PRESETS
            config = LlamaConfig()
            preset = None
            for i, p in enumerate(MODEL_PRESETS):
                if p.file_name == entry.files.get('model'):
                    preset = p
                    config.config['selected_model_index'] = i
                    break
            if not preset:
                for i, p in enumerate(MODEL_PRESETS):
                    if p.display_name == entry.name:
                        preset = p
                        config.config['selected_model_index'] = i
                        break
            if not preset:
                logger.error(f"LLM preset not found for catalog entry: {entry.id}")
                return False
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
            from llama.llama_installer import MODEL_PRESETS, LlamaInstaller
            installer = LlamaInstaller()
            for p in MODEL_PRESETS:
                if p.file_name == entry.files.get('model') or p.display_name == entry.name:
                    return installer.download_model(p)
            return False
        except Exception as e:
            logger.error(f"LLM download failed: {e}")
            return False

    def is_downloaded(self, entry: ModelEntry) -> bool:
        try:
            from llama.llama_installer import MODEL_PRESETS, LlamaInstaller
            installer = LlamaInstaller()
            for p in MODEL_PRESETS:
                if (p.file_name == entry.files.get('model') or
                        p.display_name == entry.name):
                    return installer.is_model_downloaded(p)
        except Exception:
            pass
        return False


class TTSLoader(ModelLoader):
    """Loader for TTS engines via tts_engine.

    Download installs pip packages + CUDA torch (via package_installer).
    Load checks if the backend is runnable (packages + CUDA + VRAM).
    """

    def download(self, entry: ModelEntry) -> bool:
        """Install TTS backend packages (pip) + CUDA torch if needed."""
        backend_name = entry.id.replace('tts-', '')
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
        try:
            from tts.tts_engine import TTSEngine
            engine = TTSEngine(prefer_gpu=(run_mode == 'gpu'), auto_init=False)
            backend_name = entry.id.replace('tts-', '')
            can_run = engine._can_run_backend(backend_name)
            if can_run:
                logger.info(f"TTS backend {backend_name} is runnable ({run_mode})")
                return True
            else:
                engine._try_auto_install_backend(backend_name)
                logger.info(f"TTS backend {backend_name} install triggered")
                return False
        except Exception as e:
            logger.error(f"TTS load check failed: {e}")
            return False

    def unload(self, entry: ModelEntry) -> None:
        pass  # TTSEngine manages its own backend lifecycle

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
            from tts.package_installer import is_cuda_torch, install_cuda_torch, has_nvidia_gpu
            # Ensure CUDA torch is available for GPU whisper
            if has_nvidia_gpu() and not is_cuda_torch():
                logger.info("STT download: installing CUDA torch for faster-whisper")
                ok, msg = install_cuda_torch()
                if not ok:
                    logger.warning(f"CUDA torch install failed: {msg}")
                    return False
            # Install faster-whisper itself
            import importlib.util
            if importlib.util.find_spec('faster_whisper') is None:
                import subprocess, sys
                logger.info("STT download: installing faster-whisper")
                result = subprocess.run(
                    [sys.executable, '-m', 'pip', 'install', 'faster-whisper', '--quiet'],
                    capture_output=True, text=True, timeout=300)
                if result.returncode != 0:
                    logger.warning(f"faster-whisper install failed: {result.stderr[:200]}")
                    return False
            logger.info("STT dependencies ready (faster-whisper + CUDA torch)")
            return True
        except Exception as e:
            logger.error(f"STT download failed: {e}")
            return False

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        logger.info(f"STT model {entry.id} will load lazily on first use")
        return True

    def is_downloaded(self, entry: ModelEntry) -> bool:
        try:
            import importlib.util
            return importlib.util.find_spec('faster_whisper') is not None
        except Exception:
            return False


class VLMLoader(ModelLoader):
    """Loader for VLM models (MiniCPM sidecar)."""

    def load(self, entry: ModelEntry, run_mode: str) -> bool:
        try:
            from integrations.vision.vision_service import VisionService
            VisionService()
            return True
        except Exception as e:
            logger.error(f"VLM load failed: {e}")
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
