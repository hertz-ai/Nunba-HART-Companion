"""
Language-Aware AI Bootstrapper — non-blocking model pipeline.

Given a HART language, detects hardware, selects best models for each
subsystem (LLM, TTS, STT, music, video), downloads missing ones, and
starts them — all in a background thread with status polling.

Reuses: model_catalog, model_orchestrator, vram_manager.
"""

import logging
import threading
import time
from dataclasses import dataclass, field

from models.catalog import ModelType

logger = logging.getLogger('AIBootstrap')

# ── Priority order per model type ──────────────────────────────────
# Which model types to bootstrap, in load-order (smallest first so
# they don't block VRAM for the big ones)
# Uses canonical MODEL_TYPES keys from model_catalog.py:
# llm, tts, stt, vlm, image_gen, video_gen, audio_gen, embedding
BOOTSTRAP_ORDER = [ModelType.STT, ModelType.TTS, ModelType.LLM, ModelType.AUDIO_GEN, ModelType.VIDEO_GEN]

# Model types that are always loaded vs on-demand
ESSENTIAL_TYPES = {ModelType.LLM, ModelType.TTS, ModelType.STT}
OPTIONAL_TYPES = {ModelType.AUDIO_GEN, ModelType.VIDEO_GEN}


@dataclass
class BootstrapStep:
    model_type: str
    model_id: str | None = None
    model_name: str = ''
    status: str = 'pending'       # pending | selecting | downloading | loading | ready | skipped | failed
    detail: str = ''
    vram_gb: float = 0.0
    run_mode: str = ''            # gpu | cpu | cpu_offload


@dataclass
class BootstrapState:
    """Global bootstrap state — polled by frontend."""
    language: str = 'en'
    phase: str = 'idle'           # idle | detecting | planning | running | done
    gpu_name: str = ''
    vram_total_gb: float = 0.0
    vram_free_gb: float = 0.0
    steps: dict[str, BootstrapStep] = field(default_factory=dict)
    error: str | None = None
    started_at: float = 0.0
    finished_at: float = 0.0

    def to_dict(self) -> dict:
        return {
            'language': self.language,
            'phase': self.phase,
            'gpu_name': self.gpu_name,
            'vram_total_gb': round(self.vram_total_gb, 1),
            'vram_free_gb': round(self.vram_free_gb, 1),
            'steps': {
                k: {
                    'model_type': s.model_type,
                    'model_id': s.model_id,
                    'model_name': s.model_name,
                    'status': s.status,
                    'detail': s.detail,
                    'vram_gb': round(s.vram_gb, 1),
                    'run_mode': s.run_mode,
                }
                for k, s in self.steps.items()
            },
            'error': self.error,
            'elapsed_s': round(
                (self.finished_at or time.time()) - self.started_at, 1
            ) if self.started_at else 0,
        }


# ── Singleton state ───────────────────────────────────────────────
_state = BootstrapState()
_lock = threading.Lock()
_thread: threading.Thread | None = None


def get_status() -> dict:
    """Poll current bootstrap status (called by API endpoint)."""
    with _lock:
        return _state.to_dict()


def start_bootstrap(language: str = 'en') -> dict:
    """Kick off the bootstrap pipeline in a background thread.

    Returns immediately with the initial plan. Frontend polls
    /api/ai/bootstrap/status for progress.
    """
    global _thread, _state

    with _lock:
        if _state.phase == 'running':
            return _state.to_dict()

        _state = BootstrapState(
            language=language,
            phase='detecting',
            started_at=time.time(),
        )

    _thread = threading.Thread(
        target=_bootstrap_worker,
        args=(language,),
        daemon=True,
        name='ai-bootstrap',
    )
    _thread.start()

    # Give detection a moment so first poll has GPU info
    time.sleep(1.0)
    with _lock:
        return _state.to_dict()


def _bootstrap_worker(language: str) -> None:
    """Background worker — detects hardware, plans, downloads, loads."""
    global _state
    try:
        # ── Phase 1: Detect hardware ──────────────────────────
        _update(phase='detecting')
        gpu_info = _detect_hardware()
        _update(
            gpu_name=gpu_info.get('name') or 'CPU only',
            vram_total_gb=gpu_info.get('total_gb', 0),
            vram_free_gb=gpu_info.get('free_gb', 0),
        )

        # ── Phase 2: Plan — select best model per type ────────
        _update(phase='planning')
        plan = _create_plan(language, gpu_info)
        with _lock:
            _state.steps = plan

        # ── Phase 3: Execute — download + load each ───────────
        _update(phase='running')
        _execute_plan(language, gpu_info)

        _update(phase='done', finished_at=time.time())

    except Exception as e:
        logger.exception(f"Bootstrap failed: {e}")
        _update(phase='done', error=str(e), finished_at=time.time())


def _update(**kwargs) -> None:
    with _lock:
        for k, v in kwargs.items():
            setattr(_state, k, v)


def _detect_hardware() -> dict:
    """Use vram_manager to detect GPU."""
    try:
        from integrations.service_tools.vram_manager import vram_manager
        return vram_manager.detect_gpu()
    except Exception as e:
        logger.warning(f"GPU detection failed: {e}")
        return {'name': None, 'total_gb': 0, 'free_gb': 0,
                'cuda_available': False}


def _create_plan(language: str, gpu_info: dict) -> dict[str, BootstrapStep]:
    """Select best model for each type given language + hardware."""
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
    except Exception as e:
        logger.error(f"Cannot get orchestrator: {e}")
        return {}

    plan = {}
    for model_type in BOOTSTRAP_ORDER:
        step = BootstrapStep(model_type=model_type)

        # Optional types only if we have enough VRAM
        if model_type in OPTIONAL_TYPES:
            vram_free = gpu_info.get('free_gb', 0)
            if vram_free < 6.0:
                step.status = 'skipped'
                step.detail = 'Insufficient VRAM for optional model'
                plan[model_type] = step
                continue

        lang = language if model_type in (ModelType.TTS, ModelType.LLM, ModelType.STT) else None
        entry = orch.select_best(model_type, language=lang)

        if entry:
            step.model_id = entry.id
            step.model_name = entry.name
            step.vram_gb = entry.vram_gb
            step.status = 'selecting'
            step.detail = f'Selected: {entry.name}'
        else:
            step.status = 'skipped'
            step.detail = 'No compatible model found'

        plan[model_type] = step

    return plan


def _execute_plan(language: str, gpu_info: dict) -> None:
    """Download and load each planned model sequentially."""
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
    except Exception:
        return

    with _lock:
        steps = dict(_state.steps)

    for model_type in BOOTSTRAP_ORDER:
        step = steps.get(model_type)
        if not step or step.status in ('skipped', 'failed'):
            continue
        if not step.model_id:
            continue

        entry = orch._catalog.get(step.model_id)
        if not entry:
            _update_step(model_type, status='failed', detail='Model not in catalog')
            continue

        # Already loaded?
        if entry.loaded:
            _update_step(model_type, status='ready',
                         detail=f'Already running ({entry.device})',
                         run_mode=entry.device)
            continue

        # Check if downloaded
        loader = orch._loaders.get(model_type)
        is_downloaded = False
        if loader:
            try:
                is_downloaded = loader.is_downloaded(entry)
            except Exception:
                pass

        # Download if needed
        if not is_downloaded and not entry.downloaded:
            _update_step(model_type, status='downloading',
                         detail=f'Downloading {entry.name}...')
            try:
                success = orch.download(step.model_id)
                if not success:
                    _update_step(model_type, status='failed',
                                 detail='Download failed')
                    continue
            except Exception as e:
                _update_step(model_type, status='failed',
                             detail=f'Download error: {e}')
                continue

        # Ensure CUDA torch is available for GPU models (TTS, STT)
        # The frozen build ships with a stub torch. If the model needs GPU
        # and CUDA torch isn't installed, use the existing package_installer.
        if model_type in (ModelType.TTS, ModelType.STT) and gpu_info.get('cuda_available', False):
            try:
                from tts.package_installer import has_nvidia_gpu, install_cuda_torch, is_cuda_torch
                if not is_cuda_torch() and has_nvidia_gpu():
                    _update_step(model_type, status='loading',
                                 detail='Installing CUDA PyTorch (one-time ~2.5GB)...')
                    def _progress(msg):
                        _update_step(model_type, detail=msg)
                    ok, msg = install_cuda_torch(progress_cb=_progress)
                    if not ok:
                        logger.warning(f"CUDA torch install failed: {msg}")
            except ImportError:
                pass

        # Load
        _update_step(model_type, status='loading',
                     detail=f'Starting {entry.name}...')
        try:
            result = orch.load(step.model_id)
            if result:
                _update_step(model_type, status='ready',
                             detail=f'Running on {result.device}',
                             run_mode=result.device)
                # Service tool registration + VRAM accounting handled
                # by orchestrator.load() → _register_service_tool()
                _refresh_vram()
            else:
                # Not fatal for optional types
                if model_type in OPTIONAL_TYPES:
                    _update_step(model_type, status='skipped',
                                 detail='Could not load (optional)')
                else:
                    _update_step(model_type, status='failed',
                                 detail='Load failed (insufficient resources?)')
        except Exception as e:
            _update_step(model_type, status='failed',
                         detail=f'Load error: {e}')


def _update_step(model_type: str, **kwargs) -> None:
    with _lock:
        step = _state.steps.get(model_type)
        if step:
            for k, v in kwargs.items():
                setattr(step, k, v)
        user_id = _state.language  # bootstrapper doesn't track user — use broadcast
    # Push via WAMP so frontend SetupProgressCard updates in real-time
    try:
        from integrations.social.realtime import publish_event
        publish_event('setup_progress', {
            'type': 'setup_progress',
            'job_type': str(model_type),
            'model_name': kwargs.get('detail', ''),
            'status': kwargs.get('status', ''),
            'message': kwargs.get('detail', ''),
        })
    except Exception:
        pass


def _refresh_vram() -> None:
    """Update VRAM readings after a model load."""
    try:
        from integrations.service_tools.vram_manager import vram_manager
        info = vram_manager.refresh_gpu_info()
        with _lock:
            _state.vram_free_gb = vram_manager.get_free_vram()
    except Exception:
        pass
