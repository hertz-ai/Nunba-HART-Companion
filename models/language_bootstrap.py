"""
Language-Aware AI Bootstrapper — non-blocking model pipeline.

Given a HART language, detects hardware, selects best models for each
subsystem (LLM, TTS, STT, music, video), downloads missing ones, and
starts them — all in a background thread with status polling.

Thin wrapper around model_orchestrator.auto_load() — all selection logic
(compute budget, loaded model preference, language routing) lives in
the orchestrator. This module only adds:
  1. Background threading (non-blocking startup)
  2. Step-by-step status for frontend polling
  3. CUDA torch install for frozen builds (TTS/STT GPU)
  4. WAMP push for real-time progress updates
"""

import logging
import threading
import time
from dataclasses import dataclass, field

from models.catalog import ModelType

logger = logging.getLogger('AIBootstrap')

# ── Priority order per model type ──────────────────────────────────
BOOTSTRAP_ORDER = [ModelType.STT, ModelType.TTS, ModelType.LLM, ModelType.AUDIO_GEN, ModelType.VIDEO_GEN]

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
    """Poll current bootstrap status (called by API endpoint).

    When bootstrap is done, refreshes step statuses from the orchestrator
    so the UI always reflects reality.
    """
    with _lock:
        if _state.phase == 'done':
            _refresh_steps_from_orchestrator()
        return _state.to_dict()


def _create_plan(language: str, gpu_info: dict) -> dict:
    """Build the per-model-type bootstrap plan for ``language``.

    Pure-ish function (calls ``get_orchestrator()``, otherwise no side
    effects): returns ``{ModelType: BootstrapStep}``.  Extracted from
    ``_bootstrap_worker`` so it can be unit-tested in isolation — the
    worker then just uses the returned plan to drive execution.

    For each model_type in BOOTSTRAP_ORDER:
      - Optional types (VLM, AUDIO_GEN, VIDEO_GEN) with <6GB free VRAM
        are marked skipped up-front (avoids probing hardware we know
        won't accommodate them).
      - TTS / LLM / STT are language-routed via orchestrator.select_best;
        other types (VLM, AUDIO_GEN, VIDEO_GEN) don't filter by language.
      - If an entry is already loaded, status='ready' + device captured.
        Otherwise status='selecting' pending execution.
      - No compatible model → status='skipped'.
    """
    from models.orchestrator import get_orchestrator
    orch = get_orchestrator()
    if orch is None:
        return {}

    plan = {}
    for model_type in BOOTSTRAP_ORDER:
        step = BootstrapStep(model_type=model_type)

        # Skip optional types with low VRAM
        if model_type in OPTIONAL_TYPES and gpu_info.get('free_gb', 0) < 6.0:
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
            if entry.loaded:
                step.status = 'ready'
                step.detail = f'Already running: {entry.name} ({entry.device})'
                step.run_mode = entry.device
            else:
                step.status = 'selecting'
                step.detail = f'Selected: {entry.name}'
        else:
            step.status = 'skipped'
            step.detail = 'No compatible model found'

        plan[model_type] = step
    return plan


def _refresh_steps_from_orchestrator() -> None:
    """Update step statuses from the live orchestrator (called under _lock)."""
    try:
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        for model_type, step in _state.steps.items():
            entry = orch.get_loaded(model_type) if hasattr(orch, 'get_loaded') else None
            if not entry:
                # Fallback: scan catalog for loaded model of this type
                try:
                    for mid, ent in orch._catalog._models.items():
                        if ent.model_type == model_type and ent.loaded:
                            entry = ent
                            break
                except Exception:
                    pass
            if entry:
                step.model_id = entry.id
                step.model_name = entry.name
                step.status = 'ready'
                step.run_mode = entry.device or 'cpu'
                step.detail = f'{entry.name} ({entry.device})'
                step.vram_gb = entry.vram_gb
    except Exception:
        pass


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

    # Persist language for TTS warm-up on next startup
    try:
        _lang_path = os.path.join(
            os.path.expanduser('~'), 'Documents', 'Nunba', 'data', 'hart_language.json')
        os.makedirs(os.path.dirname(_lang_path), exist_ok=True)
        with open(_lang_path, 'w') as _f:
            json.dump({'language': language}, _f)
    except Exception:
        pass

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
    """Background worker — delegates to orchestrator for all model logic."""
    global _state
    try:
        # ── Phase 1: Detect hardware (via orchestrator's vram_manager) ──
        _update(phase='detecting')
        gpu_info = _detect_hardware()
        _update(
            gpu_name=gpu_info.get('name') or 'CPU only',
            vram_total_gb=gpu_info.get('total_gb', 0),
            vram_free_gb=gpu_info.get('free_gb', 0),
        )

        # ── Phase 2: Plan — ask orchestrator what it would select ──
        _update(phase='planning')
        plan = _create_plan(language, gpu_info)

        with _lock:
            _state.steps = plan

        # ── Phase 3: Execute — auto_load handles download + load ──
        _update(phase='running')

        for model_type in BOOTSTRAP_ORDER:
            step = plan.get(model_type)
            if not step or step.status in ('skipped', 'failed', 'ready'):
                continue

            # Ensure CUDA torch for GPU TTS/STT in frozen builds
            if model_type in (ModelType.TTS, ModelType.STT) and gpu_info.get('cuda_available', False):
                _ensure_cuda_torch(model_type)

            # Let orchestrator handle everything: download + load + VRAM + lifecycle
            _update_step(model_type, status='loading', detail=f'Starting {step.model_name}...')
            try:
                lang = language if model_type in (ModelType.TTS, ModelType.LLM, ModelType.STT) else None
                result = orch.auto_load(model_type, language=lang)

                if result:
                    _update_step(model_type, status='ready',
                                 detail=f'Running on {result.device}',
                                 run_mode=result.device)
                    _refresh_vram()
                elif model_type in OPTIONAL_TYPES:
                    _update_step(model_type, status='skipped',
                                 detail='Could not load (optional)')
                else:
                    _update_step(model_type, status='failed',
                                 detail='Load failed (insufficient resources?)')
            except Exception as e:
                _update_step(model_type, status='failed',
                             detail=f'Load error: {e}')

        _update(phase='done', finished_at=time.time())

    except Exception as e:
        logger.exception(f"Bootstrap failed: {e}")
        _update(phase='done', error=str(e), finished_at=time.time())


def _ensure_cuda_torch(model_type: str) -> None:
    """Install CUDA torch if needed (frozen build ships CPU-only stub)."""
    try:
        from tts.package_installer import has_nvidia_gpu, install_gpu_torch, is_cuda_torch
        if not is_cuda_torch() and has_nvidia_gpu():
            _update_step(model_type, status='loading',
                         detail='Installing CUDA PyTorch (one-time ~2.5GB)...')
            def _progress(msg):
                _update_step(model_type, detail=msg)
            ok, msg = install_gpu_torch(progress_cb=_progress)
            if not ok:
                logger.warning(f"CUDA torch install failed: {msg}")
    except Exception as e:
        logger.warning(f"CUDA torch check skipped: {e}")


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


def _update_step(model_type: str, **kwargs) -> None:
    with _lock:
        step = _state.steps.get(model_type)
        if step:
            for k, v in kwargs.items():
                setattr(step, k, v)
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
        vram_manager.refresh_gpu_info()
        with _lock:
            _state.vram_free_gb = vram_manager.get_free_vram()
    except Exception:
        pass
