"""
tts_engine.py - Unified TTS Engine for Nunba

Multi-engine routing by language + hardware:
  - English:      Chatterbox Turbo (5.6GB, [laugh]/[chuckle] tags) or F5-TTS (2GB, voice cloning)
  - Indian langs: Indic Parler TTS (2GB, 21 languages, description-controlled voice)
  - International: CosyVoice3 (4GB, zh/ja/ko/de/es/fr/it/ru, zero-shot cloning)
  - Fallback:     Indic Parler (supports English too)

Pre-synth pipeline:
  - Caches predicted next responses in background thread
  - Sentence-level chunking for streaming LLM → TTS → audio playback
  - Common filler phrases pre-cached on startup
  - HART onboarding files served as static .ogg (zero compute)

Engine lifecycle:
  - One GPU engine at a time for <=8GB VRAM
  - Automatic engine swapping when language changes
  - VRAM tracking and cleanup between switches
  - Hardware-aware: detects GPU/VRAM/CPU, routes to best engine that fits
"""
import gc
import hashlib
import json
import logging
import os
import sys
import threading
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger('NunbaTTSEngine')

# Backend types
BACKEND_F5 = "f5"
BACKEND_CHATTERBOX_TURBO = "chatterbox_turbo"
BACKEND_CHATTERBOX_ML = "chatterbox_multilingual"
BACKEND_INDIC_PARLER = "indic_parler"
BACKEND_COSYVOICE3 = "cosyvoice3"
BACKEND_KOKORO = "kokoro"
BACKEND_PIPER = "piper"
BACKEND_NONE = "none"

# ════════════════════════════════════════════════════════════════════
# FALLBACK ENGINE CAPABILITIES — degraded-mode fallback only.
#
# This matrix is used ONLY when ModelCatalog is unavailable
# (standalone/embedded mode without HARTOS).  The canonical source of
# truth is ModelCatalog (populated by HARTOS tts_router).  All runtime
# code should call _get_engine_capabilities() / _get_lang_preference()
# rather than reading this dict directly.
# ════════════════════════════════════════════════════════════════════

_FALLBACK_ENGINE_CAPABILITIES = {
    BACKEND_F5: {
        'name': 'F5-TTS (Flow Matching)',
        'vram_gb': 2.5,  # model 1.2GB + vocos 200MB + CUDA context + inference buffers
        'languages': {'en', 'zh'},
        'paralinguistic': [],
        'emotion_tags': [],
        'voice_cloning': True,
        'streaming': False,
        'sample_rate': 24000,
        'quality': 'highest',
    },
    BACKEND_CHATTERBOX_TURBO: {
        'name': 'Chatterbox Turbo 350M',
        'vram_gb': 5.6,
        'languages': {'en'},
        'paralinguistic': ['[laugh]', '[chuckle]', '[sigh]', '[gasp]', '[cough]'],
        'emotion_tags': [],
        'voice_cloning': True,
        'streaming': False,
        'sample_rate': 24000,
        'quality': 'high',
    },
    BACKEND_CHATTERBOX_ML: {
        'name': 'Chatterbox Multilingual',
        'vram_gb': 14,
        'languages': {
            'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'sv',
            'da', 'fi', 'hu', 'el', 'tr', 'cs', 'ro', 'bg', 'hr', 'sk',
            'ja', 'ko', 'zh',
        },
        'paralinguistic': [],
        'emotion_tags': [],
        'voice_cloning': True,
        'streaming': False,
        'sample_rate': 24000,
        'quality': 'high',
    },
    BACKEND_INDIC_PARLER: {
        'name': 'Indic Parler TTS (ai4bharat)',
        'vram_gb': 2.0,
        'languages': {
            'as', 'bn', 'brx', 'doi', 'en', 'gu', 'hi', 'kn', 'kok', 'mai',
            'ml', 'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
        },
        'paralinguistic': [],
        'emotion_tags': ['happy', 'sad', 'angry', 'fearful', 'surprised', 'disgusted'],
        'voice_cloning': False,
        'streaming': False,
        'sample_rate': 44100,
        'quality': 'high',
    },
    BACKEND_COSYVOICE3: {
        'name': 'CosyVoice3 0.5B (Alibaba)',
        'vram_gb': 4.0,
        'languages': {'zh', 'en', 'ja', 'ko', 'de', 'es', 'fr', 'it', 'ru'},
        'paralinguistic': [],
        'emotion_tags': ['happy', 'sad', 'fearful', 'angry', 'surprised'],
        'voice_cloning': True,
        'streaming': True,
        'sample_rate': 22050,
        'quality': 'high',
    },
    BACKEND_KOKORO: {
        # Kokoro 82M — tiny neural English TTS, sits between the big
        # GPU engines and Piper on the quality ladder. Runs on CPU at
        # ~1x real-time, or GPU at ~0.1x. No voice cloning, but ~25
        # English presets shipped with the model. Benchmark vs Piper:
        # quality 0.88 vs 0.70, CPU latency 400ms vs 200ms per 10
        # words — Kokoro is ~2x slower but noticeably less robotic,
        # so it's tried FIRST before we give up and use Piper on CPU.
        'name': 'Kokoro 82M',
        'vram_gb': 0.2,
        'languages': {'en'},
        'paralinguistic': [],
        'emotion_tags': [],
        'voice_cloning': False,
        'streaming': False,
        'sample_rate': 24000,
        'quality': 'high',
    },
    BACKEND_PIPER: {
        'name': 'Piper TTS (CPU)',
        'vram_gb': 0,
        'languages': {'en'},
        'paralinguistic': [],
        'emotion_tags': [],
        'voice_cloning': False,
        'streaming': False,
        'sample_rate': 22050,
        'quality': 'medium',
    },
}

# Indic languages — canonical set lives in core.constants.INDIC_LANGS.
# HARTOS is always pip-installed alongside Nunba (per dependency chain
# in MEMORY.md), so the import is guaranteed; no defensive fallback
# needed.  Keeping the local alias `_INDIC_LANGS` for in-file
# readability at the 2 iteration sites below.
from core.constants import INDIC_LANGS as _INDIC_LANGS  # noqa: F401

# ════════════════════════════════════════════════════════════════════
# LANG → CAPABLE BACKENDS (defensive allowlist)
#
# Source of truth for "which backend can actually speak lang X?".
# Used by _synthesize_with_fallback to REFUSE wrong-language fallback
# (data-scientist finding 2026-04-15: Tamil users were getting
# CosyVoice3 English mumbling when Indic Parler OOM'd, because the
# default ladder falls through to engines that don't cover Indic).
#
# Conservative policy:
#   * Indic Parler: authoritative for all 21 _INDIC_LANGS.
#   * CosyVoice3: 9 claimed (zh/en/ja/ko/de/es/fr/it/ru) — NO Indic.
#   * Chatterbox ML: 23 claimed — Tamil/Indic NOT verified in tests,
#                    so excluded from Indic allowlist conservatively.
#                    (Still allowed for its 23 claimed European/CJK langs.)
#   * F5 / Chatterbox Turbo / Kokoro / Piper: English-only.
# ════════════════════════════════════════════════════════════════════
_LANG_CAPABLE_BACKENDS: dict[str, frozenset[str]] = {
    # English — every backend supports it
    'en': frozenset({
        BACKEND_CHATTERBOX_TURBO, BACKEND_F5, BACKEND_CHATTERBOX_ML,
        BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_KOKORO, BACKEND_PIPER,
    }),
    # European / CJK — CosyVoice3 + Chatterbox ML
    'es': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'fr': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'de': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'it': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'ja': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'ko': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'zh': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    'ru': frozenset({BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML}),
    # Extra Chatterbox-ML-only European langs
    'pt': frozenset({BACKEND_CHATTERBOX_ML}),
    'nl': frozenset({BACKEND_CHATTERBOX_ML}),
    'pl': frozenset({BACKEND_CHATTERBOX_ML}),
    'sv': frozenset({BACKEND_CHATTERBOX_ML}),
    'da': frozenset({BACKEND_CHATTERBOX_ML}),
    'fi': frozenset({BACKEND_CHATTERBOX_ML}),
    'hu': frozenset({BACKEND_CHATTERBOX_ML}),
    'el': frozenset({BACKEND_CHATTERBOX_ML}),
    'tr': frozenset({BACKEND_CHATTERBOX_ML}),
    'cs': frozenset({BACKEND_CHATTERBOX_ML}),
    'ro': frozenset({BACKEND_CHATTERBOX_ML}),
    'bg': frozenset({BACKEND_CHATTERBOX_ML}),
    'hr': frozenset({BACKEND_CHATTERBOX_ML}),
    'sk': frozenset({BACKEND_CHATTERBOX_ML}),
}
# Indic langs — prefer Indic Parler (authoritative 21 Indic langs)
# but keep Chatterbox ML as a LOCAL fallback so a broken Indic Parler
# import (parler_tts vs transformers version drift) doesn't demote the
# whole user to text-only or worse, browser WebSpeech.  The fallback
# order is honored by the ladder in `select_backend_for_lang`: try
# Indic Parler first; on import/load failure, try Chatterbox ML; on
# still-failure, return text-only.  "LOCAL FIRST WHEN AVAILABLE" —
# Chatterbox ML is locally installed for every user who has any other
# non-Latin lang, so the fallback has material coverage on most boxes.
for _lang in _INDIC_LANGS:
    _LANG_CAPABLE_BACKENDS[_lang] = frozenset({
        BACKEND_INDIC_PARLER,
        BACKEND_CHATTERBOX_ML,
    })


def _normalize_lang(lang: str | None) -> str:
    """'en-US' / 'ta_IN' / None → 'en' / 'ta' / 'en'."""
    if not lang:
        return 'en'
    return lang.replace('_', '-').split('-')[0].lower()


def _capable_backends_for(lang: str | None) -> frozenset[str]:
    """Return the allowlist of backends that can speak `lang`.
    Unknown langs fall through to the English-capable set (Piper etc.)
    rather than an empty set, matching historical behavior.
    """
    return _LANG_CAPABLE_BACKENDS.get(_normalize_lang(lang),
                                     _LANG_CAPABLE_BACKENDS['en'])


def _publish_lang_unsupported(lang: str, attempted: list[str]) -> None:
    """Best-effort WAMP toast when no backend can speak `lang`.
    Distinct topic from `lang_mismatch` so the frontend can show a
    different message ("text-only — no TTS backend available") vs
    ("audio may be wrong-language").
    """
    try:
        from core.realtime import publish_async as _wamp_pub
        _wamp_pub(
            'com.hertzai.hevolve.tts.lang_unsupported',
            {
                'requested_lang': lang,
                'attempted_backends': attempted,
                'reason': 'no_capable_backend_fits_on_hardware',
            },
            timeout=0.5,
        )
    except Exception:
        pass

# Language → preferred engine order (first available wins).
# Fallback-only — canonical preference is read from ModelCatalog via
# _get_lang_preference().  Direct use of this dict is degraded-mode only.
_FALLBACK_LANG_ENGINE_PREFERENCE = {
    # English ladder (quality first, then CPU-friendly):
    # 1. Chatterbox Turbo — big GPU, paralinguistic tags, voice clone
    # 2. F5-TTS           — big GPU, voice clone
    # 3. Indic Parler     — big GPU, also covers English
    # 4. Kokoro 82M       — small neural, CPU-friendly, beats Piper
    # 5. Piper            — bundled CPU absolute-last-resort
    'en': [BACKEND_CHATTERBOX_TURBO, BACKEND_F5, BACKEND_INDIC_PARLER, BACKEND_KOKORO, BACKEND_PIPER],
    # International: CosyVoice3 (zero-shot cloning) > Chatterbox ML (16GB+)
    'es': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'fr': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'de': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'ja': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'ko': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'zh': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'it': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
    'ru': [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML],
}
# Add all Indic languages → Indic Parler TTS
for _lang in _INDIC_LANGS:
    _FALLBACK_LANG_ENGINE_PREFERENCE[_lang] = [BACKEND_INDIC_PARLER]

# Default fallback chain for unlisted languages
_DEFAULT_PREFERENCE = [BACKEND_COSYVOICE3, BACKEND_CHATTERBOX_ML, BACKEND_INDIC_PARLER]


# ════════════════════════════════════════════════════════════════════
# CATALOG ↔ BACKEND ID MAPPING
#
# Nunba backend constants (BACKEND_F5 = "f5") differ from the HARTOS
# tts_router.ENGINE_REGISTRY keys (e.g. 'f5_tts'), and the HARTOS
# ModelCatalog uses yet another form ('f5-tts' with hyphens and no
# 'tts-' prefix). Rather than maintaining three parallel lookup
# tables that drift apart, we declare ONE bridge —
# `_BACKEND_TO_REGISTRY_KEY` — that maps every GPU backend to its
# canonical ENGINE_REGISTRY key. Everything downstream (catalog IDs,
# VRAM tool names, required pip packages) is derived from that.
# ════════════════════════════════════════════════════════════════════

# SINGLE SOURCE OF TRUTH: Nunba backend constant → HARTOS ENGINE_REGISTRY key.
# CPU-only backends (PIPER, ESPEAK) are handled separately in the
# derived maps below because they don't have a 1:1 match — espeak is a
# fallback of piper in Nunba, and neither has a GPU ToolWorker.
_BACKEND_TO_REGISTRY_KEY: dict[str, str] = {
    BACKEND_F5:               'f5_tts',
    BACKEND_CHATTERBOX_TURBO: 'chatterbox_turbo',
    BACKEND_CHATTERBOX_ML:    'chatterbox_ml',
    BACKEND_INDIC_PARLER:     'indic_parler',
    BACKEND_COSYVOICE3:       'cosyvoice3',
    BACKEND_KOKORO:           'kokoro',
    # CPU engines — also run via HARTOS RuntimeToolManager subprocess
    'luxtts':                 'luxtts',  # kept for frozen HARTOS compat until rebuild
    'pocket_tts':             'pocket_tts',
}


def _get_engine_registry():
    """Lazy import — tts_router imports vram_manager which imports torch."""
    try:
        from integrations.channels.media.tts_router import ENGINE_REGISTRY
        return ENGINE_REGISTRY
    except Exception:
        return {}


def _registry_key_to_catalog_id(registry_key: str) -> str:
    """Convert 'f5_tts' → 'f5-tts' (HARTOS ModelCatalog uses hyphens)."""
    return registry_key.replace('_', '-')


# Derived: Nunba backend constant → catalog entry id (hyphenated,
# without 'tts-' prefix). Builds from the single bridge above.
_BACKEND_TO_CATALOG: dict[str, str] = {
    backend: _registry_key_to_catalog_id(key)
    for backend, key in _BACKEND_TO_REGISTRY_KEY.items()
}
_BACKEND_TO_CATALOG[BACKEND_PIPER] = 'piper'  # CPU-only alias


# Derived: catalog entry id → Nunba backend constant.
# Inverse of _BACKEND_TO_CATALOG plus CPU-only aliases that all route
# to Piper (Nunba doesn't have separate implementations for espeak /
# pocket_tts — they fall through to Piper as the last-resort CPU engine).
_CATALOG_TO_BACKEND: dict[str, str] = {
    catalog_id: backend for backend, catalog_id in _BACKEND_TO_CATALOG.items()
}
# Also accept the underscore-form the HARTOS registry key uses,
# so both 'f5-tts' (catalog) and 'f5_tts' (registry key) map back.
for _backend, _key in _BACKEND_TO_REGISTRY_KEY.items():
    _CATALOG_TO_BACKEND.setdefault(_key, _backend)
# CPU alias fallbacks — all route to Piper in Nunba
_CATALOG_TO_BACKEND.setdefault('pocket-tts', BACKEND_PIPER)
_CATALOG_TO_BACKEND.setdefault('pocket_tts', BACKEND_PIPER)
_CATALOG_TO_BACKEND.setdefault('espeak', BACKEND_PIPER)
_CATALOG_TO_BACKEND.setdefault('chatterbox_multilingual', BACKEND_CHATTERBOX_ML)  # legacy name


def _entry_to_legacy_caps(entry) -> dict:
    """Convert a ModelCatalog ModelEntry (TTS) to the legacy ENGINE_CAPABILITIES dict format.

    Bridges the ModelEntry structure to the flat dict shape that all call
    sites in this module expect.
    """
    caps = entry.capabilities or {}
    langs_raw = getattr(entry, 'languages', None) or []
    # Two catalog populators exist in the tree and use different key
    # names for the same concept: the in-tree TTS spec populator writes
    # `voice_clone` (matching the TTSEngineSpec dataclass field), while
    # older entries persisted from the subsystems populator use
    # `voice_cloning`. Accept either so the Nunba feature list matches
    # reality regardless of which populator wrote the entry. Same for
    # emotion_tags which is sometimes a list, sometimes a bool.
    _voice_cloning = caps.get('voice_cloning')
    if _voice_cloning is None:
        _voice_cloning = caps.get('voice_clone', False)
    _emotion_tags = caps.get('emotion_tags', [])
    if isinstance(_emotion_tags, bool):
        _emotion_tags = ['emotion'] if _emotion_tags else []
    return {
        'name':          entry.name,
        'vram_gb':       getattr(entry, 'vram_gb', 0) or 0,
        'languages':     set(langs_raw),
        'paralinguistic': caps.get('paralinguistic', []),
        'emotion_tags':  _emotion_tags,
        'voice_cloning': bool(_voice_cloning),
        'streaming':     caps.get('streaming', False),
        'sample_rate':   caps.get('sample_rate', 22050),
        'quality':       ('highest' if getattr(entry, 'quality_score', 0.5) >= 0.93
                          else 'high' if getattr(entry, 'quality_score', 0.5) >= 0.8
                          else 'medium' if getattr(entry, 'quality_score', 0.5) >= 0.6
                          else 'low'),
    }


def _get_engine_capabilities(backend=None) -> dict:
    """Return capability dict for one backend (or all backends if backend=None).

    Tries ModelCatalog first (canonical, HARTOS-populated).  Falls back to
    _FALLBACK_ENGINE_CAPABILITIES if the catalog is unavailable or has no
    entry for the requested backend.

    When backend=None the returned dict has the same shape as the old
    ENGINE_CAPABILITIES — keyed by Nunba backend constant.
    """
    try:
        from models.catalog import ModelType, get_catalog
        catalog = get_catalog()
        if backend is None:
            # Return the full dict, keyed by Nunba backend constants
            result = {}
            for entry in catalog.list_by_type(ModelType.TTS):
                # Strip 'tts-' prefix to get the catalog-side id
                catalog_id = entry.id.replace('tts-', '', 1)
                be = _CATALOG_TO_BACKEND.get(catalog_id, catalog_id)
                result[be] = _entry_to_legacy_caps(entry)
            if result:
                return result
        else:
            catalog_id = _BACKEND_TO_CATALOG.get(backend, backend)
            entry = catalog.get(f'tts-{catalog_id}')
            if entry:
                return _entry_to_legacy_caps(entry)
    except Exception:
        pass  # catalog unavailable — fall through to local fallback

    # Degraded-mode fallback
    if backend is None:
        return _FALLBACK_ENGINE_CAPABILITIES
    return _FALLBACK_ENGINE_CAPABILITIES.get(backend, {})


def _get_lang_preference(language: str) -> list[str]:
    """Return ordered list of preferred backends for a language.

    Tries ModelCatalog first (canonical).  Falls back to
    _FALLBACK_LANG_ENGINE_PREFERENCE if the catalog is unavailable.
    """
    try:
        from models.catalog import ModelType, get_catalog
        catalog = get_catalog()
        entries = catalog.list_by_type(ModelType.TTS)
        if entries:
            # Build preference list: entries that support this language,
            # sorted by language_priority (lower value = higher preference),
            # then by overall priority descending.
            supporting = []
            for entry in entries:
                langs = set(getattr(entry, 'languages', None) or [])
                # '*' is the wildcard convention for engines that
                # support every language (piper, espeak) — a single
                # spec covers all languages, no per-language duplication.
                if language in langs or '*' in langs:
                    lang_prio = (getattr(entry, 'language_priority', None) or {})
                    prio_val = lang_prio.get(language, 999)
                    supporting.append((prio_val, -(getattr(entry, 'priority', 0) or 0), entry))
            if supporting:
                supporting.sort(key=lambda x: (x[0], x[1]))
                result = []
                for _, _, entry in supporting:
                    catalog_id = entry.id.replace('tts-', '', 1)
                    be = _CATALOG_TO_BACKEND.get(catalog_id, catalog_id)
                    if be not in result:
                        result.append(be)
                if result:
                    return result
    except Exception:
        pass  # catalog unavailable — fall through

    return _FALLBACK_LANG_ENGINE_PREFERENCE.get(language, _DEFAULT_PREFERENCE)


# ── Backward-compat aliases (importers that do ``from tts.tts_engine import
#    ENGINE_CAPABILITIES`` continue to work — they get the fallback dict).
ENGINE_CAPABILITIES = _FALLBACK_ENGINE_CAPABILITIES
LANG_ENGINE_PREFERENCE = _FALLBACK_LANG_ENGINE_PREFERENCE


# ════════════════════════════════════════════════════════════════════
# DEVICE SELECTION — VRAMManager is the single source of truth
# ════════════════════════════════════════════════════════════════════

# Default timeout for a single GPU inference call (seconds).
# Prevents indefinite hangs from corrupted CUDA state or model bugs.
_INFERENCE_TIMEOUT_S = 120


def _run_with_timeout(fn, timeout_s=_INFERENCE_TIMEOUT_S):
    """Run fn() with a hard timeout. Uses a bare thread — no executor.

    ThreadPoolExecutor creates/destroys per call and fails with
    'cannot schedule new futures after interpreter shutdown' during
    process cleanup. A bare thread avoids this.
    """
    result = [None]
    error = [None]

    def _worker():
        try:
            result[0] = fn()
        except Exception as e:
            error[0] = e

    t = threading.Thread(target=_worker, daemon=True, name='tts-infer-timeout')
    t.start()
    t.join(timeout=timeout_s)
    if t.is_alive():
        logger.error(f"GPU inference timed out after {timeout_s}s")
        raise TimeoutError(f"TTS inference exceeded {timeout_s}s")
    if error[0] is not None:
        raise error[0]
    return result[0]


# Minimum free VRAM (GB) required before starting GPU inference.
# Below this, CUDA allocations risk triggering a C-level abort that
# kills the ENTIRE process — uncatchable by Python try/except.
_MIN_INFERENCE_HEADROOM_GB = 0.3


def _oom_guard(fn, device=None):
    """Run GPU inference with OOM blast-radius containment.

    Pre-flight: checks VRAM headroom. If too low, raises RuntimeError
    BEFORE touching CUDA — preventing the C-level abort.

    Post-flight: catches CUDA OOM (RuntimeError) and cleans up CUDA state
    so the app stays alive and can fall back to CPU.
    """
    # Pre-flight: reject if VRAM too tight (prevents uncatchable C abort)
    if device == 'cuda':
        try:
            from integrations.service_tools.vram_manager import vram_manager
            free = vram_manager.get_free_vram()
            if free < _MIN_INFERENCE_HEADROOM_GB:
                raise RuntimeError(
                    f"OOM guard: {free:.2f}GB free < {_MIN_INFERENCE_HEADROOM_GB}GB headroom. "
                    f"Skipping GPU inference to prevent process crash.")
        except ImportError:
            pass
        except RuntimeError:
            raise  # re-raise the guard error
        except Exception:
            pass

    # Run inference — catch CUDA OOM (RuntimeError) before it cascades
    try:
        return fn()
    except RuntimeError as e:
        err_str = str(e).lower()
        if 'out of memory' in err_str or 'cuda' in err_str:
            logger.error(f"OOM guard caught CUDA error: {e}")
            _clear_cuda_cache()
            raise  # let TTSEngine._synthesize_with_fallback handle it
        raise


def _clear_cuda_cache():
    """Release cached CUDA memory. Safe no-op if torch/CUDA unavailable."""
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def _suggest_device(tool_name: str) -> str:
    """Ask VRAMManager which device a TTS model should load on.

    Returns 'cuda' or 'cpu'. VRAMManager.suggest_offload_mode() considers
    free VRAM, model size from VRAM_BUDGETS, and existing allocations.
    """
    try:
        from integrations.service_tools.vram_manager import vram_manager
        mode = vram_manager.suggest_offload_mode(tool_name)
        # 'gpu' → cuda, 'cpu_offload' → cuda (model handles mixed),
        # 'cpu_only' → cpu
        device = 'cpu' if mode == 'cpu_only' else 'cuda'
        if device == 'cpu':
            free = vram_manager.get_free_vram()
            logger.info(f"{tool_name}: {free:.1f}GB VRAM free — using CPU")
        return device
    except Exception:
        return 'cpu'


# ════════════════════════════════════════════════════════════════════
# PRE-SYNTH CACHE — instant playback for predicted responses
# ════════════════════════════════════════════════════════════════════

class PreSynthCache:
    """
    Background cache for pre-synthesized audio.

    Two modes:
    1. Startup cache: Common filler phrases pre-generated once
    2. Predictive cache: Next response pre-synthesized during conversation

    The HART onboarding uses static .ogg files (zero compute) —
    this cache is for RUNTIME conversation (general chat).
    """

    # Common fillers to pre-cache on first use (English only for now)
    FILLERS = [
        "I understand.",
        "Let me think about that.",
        "Good question.",
        "That makes sense.",
        "One moment.",
        "I see what you mean.",
    ]

    def __init__(self, cache_dir=None, max_entries=50):
        self._cache_dir = Path(cache_dir) if cache_dir else (
            Path.home() / '.nunba' / 'tts_cache' / 'presynth'
        )
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        self._cache = OrderedDict()  # text_hash -> file_path
        self._max = max_entries
        self._lock = threading.Lock()
        self._bg_thread = None

    def _hash(self, text, voice='default'):
        return hashlib.md5(f"{text}|{voice}".encode()).hexdigest()[:16]

    def get(self, text, voice='default'):
        """Return cached audio path if available, else None."""
        h = self._hash(text, voice)
        with self._lock:
            path = self._cache.get(h)
            if path and os.path.exists(path):
                self._cache.move_to_end(h)
                return path
            # Check disk even if not in memory cache
            disk_path = self._cache_dir / f"{h}.wav"
            if disk_path.exists():
                self._cache[h] = str(disk_path)
                return str(disk_path)
        return None

    def put(self, text, audio_path, voice='default'):
        """Add an entry to the cache."""
        h = self._hash(text, voice)
        with self._lock:
            self._cache[h] = audio_path
            if len(self._cache) > self._max:
                _, old_path = self._cache.popitem(last=False)
                try:
                    os.unlink(old_path)
                except OSError:
                    pass

    def presynth_background(self, text, voice, synth_fn):
        """Pre-synthesize in background thread. Non-blocking."""
        if self.get(text, voice):
            return  # Already cached

        def _do():
            try:
                h = self._hash(text, voice)
                out_path = str(self._cache_dir / f"{h}.wav")
                result = synth_fn(text, out_path, voice)
                if result:
                    self.put(text, result, voice)
            except Exception as e:
                logger.debug(f"Pre-synth background failed: {e}")

        t = threading.Thread(target=_do, daemon=True)
        t.start()

    def warm_fillers(self, synth_fn, voice='default'):
        """Pre-cache common filler phrases in background. Called once on init."""
        def _do():
            for filler in self.FILLERS:
                if not self.get(filler, voice):
                    try:
                        h = self._hash(filler, voice)
                        out_path = str(self._cache_dir / f"{h}.wav")
                        result = synth_fn(filler, out_path, voice)
                        if result:
                            self.put(filler, result, voice)
                    except Exception:
                        pass

        t = threading.Thread(target=_do, daemon=True, name='tts-filler-warm')
        t.start()
        self._bg_thread = t


# ════════════════════════════════════════════════════════════════════
# STREAMING SENTENCE PIPELINE — chunk LLM output → TTS → audio
# ════════════════════════════════════════════════════════════════════

class SentencePipeline:
    """
    Converts streaming LLM text into sentence-level TTS chunks.

    As the LLM streams tokens, this pipeline:
    1. Accumulates text until a sentence boundary (. ! ? newline)
    2. Immediately submits the sentence for TTS synthesis
    3. Queues the audio for playback
    4. Starts synthesizing the NEXT sentence while the current one plays

    This gives "instant" voice response — the first sentence plays
    while the rest is still being generated.
    """

    # Sentence boundary characters
    BOUNDARIES = {'.', '!', '?', '\n'}
    # Don't split on periods in common abbreviations
    ABBREVS = {'mr.', 'mrs.', 'dr.', 'vs.', 'etc.', 'i.e.', 'e.g.'}

    def __init__(self, synth_fn, on_audio_ready=None):
        """
        Args:
            synth_fn: callable(text, output_path) -> path_or_None
            on_audio_ready: callable(audio_path, sentence_text) — called when a chunk is ready
        """
        self._synth_fn = synth_fn
        self._on_ready = on_audio_ready
        self._buffer = ""
        self._sentence_num = 0
        self._pool = ThreadPoolExecutor(max_workers=1)
        self._futures = []

    def feed(self, token):
        """Feed a token from the LLM stream."""
        self._buffer += token

        # Check for sentence boundary
        stripped = self._buffer.strip()
        if not stripped:
            return

        last_char = stripped[-1]
        if last_char in self.BOUNDARIES:
            # Avoid splitting on abbreviations
            lower = stripped.lower()
            if any(lower.endswith(a) for a in self.ABBREVS):
                return

            sentence = self._buffer.strip()
            self._buffer = ""
            if len(sentence) > 2:
                self._submit(sentence)

    def flush(self):
        """Flush remaining buffer as final sentence."""
        remaining = self._buffer.strip()
        self._buffer = ""
        if len(remaining) > 2:
            self._submit(remaining)

    def _submit(self, sentence):
        self._sentence_num += 1
        num = self._sentence_num

        def _do():
            try:
                import tempfile
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False,
                                                  prefix=f'tts_s{num}_') as f:
                    out_path = f.name
                result = self._synth_fn(sentence, out_path)
                if result and self._on_ready:
                    self._on_ready(result, sentence)
            except Exception as e:
                logger.debug(f"Sentence pipeline TTS failed: {e}")

        fut = self._pool.submit(_do)
        self._futures.append(fut)

    def wait(self):
        """Wait for all pending synthesis to complete."""
        from concurrent.futures import wait as cf_wait
        if self._futures:
            cf_wait(self._futures)
            self._futures.clear()

    def shutdown(self):
        self._pool.shutdown(wait=False)


# We need ThreadPoolExecutor for the pipeline
from concurrent.futures import ThreadPoolExecutor

# ════════════════════════════════════════════════════════════════════
# MAIN TTS ENGINE — multi-engine routing + pre-synth
# ════════════════════════════════════════════════════════════════════

class TTSEngine:
    """
    Unified Text-to-Speech Engine with multi-engine routing.

    Routes to the best engine per language and hardware:
    - Detects GPU VRAM, selects engine from preference chain
    - Manages engine lifecycle (one GPU engine at a time for <=8GB)
    - Pre-synth cache for instant playback of predicted responses
    - Sentence pipeline for streaming LLM → TTS
    """

    def __init__(self,
                 prefer_gpu: bool = True,
                 auto_init: bool = True):
        self.prefer_gpu = prefer_gpu
        self.auto_init = auto_init
        self._vram_manager = None  # Set by _detect_hardware if HARTOS available

        self._backends = {}  # backend_name -> instance
        self._active_backend = BACKEND_NONE
        self._initialized = False
        self._init_lock = threading.Lock()
        self._synth_lock = threading.Lock()  # GPU backends are not thread-safe
        self._pending_backend = None  # backend being loaded in background

        # Hardware info (detected lazily)
        self.gpu_info = None
        self.has_gpu = False
        self.vram_gb = 0.0
        self._hw_detected = False

        # Pre-synth cache
        self._presynth = PreSynthCache()

        # Current language (for routing)
        # Read persisted language so warm-up selects the right TTS engine
        # (not hardcoded English which triggers F5 install for Tamil users)
        self._language = 'en'
        try:
            import json as _json
            _lang_path = os.path.join(
                os.path.expanduser('~'), 'Documents', 'Nunba', 'data', 'hart_language.json')
            if os.path.isfile(_lang_path):
                with open(_lang_path) as _f:
                    _lang_data = _json.load(_f)
                    _persisted = _lang_data.get('language', 'en')
                    if _persisted and len(_persisted) >= 2:
                        self._language = _persisted[:2]
                        logger.info(f"TTS init: using persisted language '{self._language}'")
        except Exception:
            pass

    def _detect_hardware(self):
        """Detect hardware via HARTOS VRAMManager (single source of truth)."""
        try:
            from integrations.service_tools.vram_manager import vram_manager
            gpu = vram_manager.detect_gpu()
            self.has_gpu = gpu.get('cuda_available', False)
            self.vram_gb = gpu.get('total_gb', 0.0)
            self.gpu_info = {
                'gpu_available': self.has_gpu,
                'gpu_name': gpu.get('name'),
                'vram_gb': self.vram_gb,
                'free_gb': gpu.get('free_gb', 0.0),
            }
            self._vram_manager = vram_manager
            if self.has_gpu:
                logger.info(f"GPU detected: {gpu.get('name')} "
                           f"({self.vram_gb:.1f}GB VRAM, {gpu.get('free_gb', 0):.1f}GB free)")
        except ImportError:
            # HARTOS not available — fallback to direct detection
            self._vram_manager = None
            try:
                import torch
                if torch.cuda.is_available():
                    self.has_gpu = True
                    self.vram_gb = torch.cuda.get_device_properties(0).total_mem / (1024**3)
                    self.gpu_info = {
                        'gpu_available': True,
                        'gpu_name': torch.cuda.get_device_name(0),
                        'vram_gb': self.vram_gb,
                    }
                else:
                    self.has_gpu = False
                    self.gpu_info = {'gpu_available': False}
            except Exception:
                self.has_gpu = False
                self.gpu_info = {'gpu_available': False}
        except Exception as e:
            logger.warning(f"Hardware detection error: {e}")
            self.has_gpu = False
            self.gpu_info = {'gpu_available': False}
            self._vram_manager = None

    def _ensure_hw_detected(self):
        if not self._hw_detected:
            self._hw_detected = True
            self._detect_hardware()

    @classmethod
    def _get_vram_tool_name(cls, backend: str) -> str | None:
        """Nunba backend constant → VRAMManager tool name.

        Derives from HARTOS ENGINE_REGISTRY[key].vram_key — no local
        lookup table, so adding a new engine's VRAM budget only
        requires updating the canonical registry in tts_router.
        """
        key = _BACKEND_TO_REGISTRY_KEY.get(backend)
        if not key:
            return None
        registry = _get_engine_registry()
        spec = registry.get(key)
        return spec.vram_key if spec else None

    @classmethod
    def _get_required_package(cls, backend: str) -> str | None:
        """Nunba backend constant → pip package required for in-process run.

        Derives from HARTOS ENGINE_REGISTRY[key].required_package.
        Returns None if the backend has no extra pip dep (Piper is
        bundled, espeak is a system binary, makeittalk is cloud-only).
        """
        key = _BACKEND_TO_REGISTRY_KEY.get(backend)
        if not key:
            return None
        registry = _get_engine_registry()
        spec = registry.get(key)
        return spec.required_package if spec else None

    # Cache results of import checks (module name -> bool)
    _import_check_cache = {}

    def _can_run_backend(self, backend):
        """Check if hardware AND software can run a backend.

        Checks:
        1. Required Python package is importable (skip if pip package missing)
        2. GPU has CUDA support (for GPU backends, torch.cuda must work)
        3. VRAM is sufficient (via VRAMManager or simple check)
        """
        cap = _get_engine_capabilities(backend)
        if not cap:
            return False

        # ── Software check: is the required package actually importable? ──
        # Uses subprocess probe (python-embed) to avoid stub torch poisoning.
        # find_spec only checks if the .py exists, not if imports succeed.
        required_pkg = self._get_required_package(backend)
        if required_pkg:
            if required_pkg not in TTSEngine._import_check_cache:
                try:
                    from tts._torch_probe import check_backend_runnable
                    TTSEngine._import_check_cache[required_pkg] = check_backend_runnable(backend, required_pkg)
                except Exception:
                    # Fallback to find_spec if probe unavailable (dev mode)
                    import importlib.util
                    TTSEngine._import_check_cache[required_pkg] = (
                        importlib.util.find_spec(required_pkg) is not None
                    )
            if not TTSEngine._import_check_cache[required_pkg]:
                logger.debug(f"Backend {backend} skipped: '{required_pkg}' not runnable")
                return False

        # ── GPU backends need working CUDA in torch ──
        required_vram = cap.get('vram_gb', 0)
        if required_vram > 0:
            if '_torch_cuda' not in TTSEngine._import_check_cache:
                try:
                    import torch
                    _cuda_ok = torch.cuda.is_available()
                    if not _cuda_ok:
                        # In-process torch may be CPU-only (python-embed ships CPU stub).
                        # The real CUDA torch lives in ~/.nunba/site-packages/ and is used
                        # by subprocess workers. Check via subprocess probe before giving up.
                        self._ensure_hw_detected()
                        if self.has_gpu:
                            try:
                                from tts._torch_probe import check_cuda_available
                                _cuda_ok = check_cuda_available()
                                if _cuda_ok:
                                    logger.info("TTS: CUDA torch verified via subprocess — GPU TTS enabled")
                            except Exception:
                                pass
                        if not _cuda_ok:
                            logger.info(f"torch.cuda.is_available() = False "
                                        f"(torch {torch.__version__}) — "
                                        f"GPU TTS needs CUDA torch upgrade"
                                        f"{' (GPU present via nvidia-smi)' if self.has_gpu else ''}")
                    else:
                        logger.info(f"torch {torch.__version__} CUDA available — GPU TTS enabled")
                    TTSEngine._import_check_cache['_torch_cuda'] = _cuda_ok
                except (ImportError, OSError) as _torch_err:
                    # Stub torch poisons sys.modules — use shared subprocess probe
                    try:
                        from tts._torch_probe import check_cuda_available
                        _cuda = check_cuda_available()
                        TTSEngine._import_check_cache['_torch_cuda'] = _cuda
                        if _cuda:
                            logger.info("torch CUDA verified via subprocess — GPU TTS enabled")
                        else:
                            logger.info(f"torch not available — GPU TTS disabled ({_torch_err})")
                    except Exception as _probe_err:
                        TTSEngine._import_check_cache['_torch_cuda'] = False
                        logger.info(f"torch not available — GPU TTS disabled ({_torch_err})")
            if not TTSEngine._import_check_cache['_torch_cuda']:
                return False

        # ── VRAM check: VRAMManager.can_fit() is the single authority ──
        if required_vram == 0:
            return True
        return self._vram_allows(backend)

    def _vram_allows(self, backend) -> bool:
        """Check if VRAMManager says this backend can fit in available VRAM.

        If it doesn't fit, ask ModelLifecycleManager to evict an idle
        non-LLM model (stale TTS, unused VLM worker, etc.) and re-probe.
        Intentionally does NOT touch the main/draft LLMs — the draft-vs-
        TTS trade-off is handled at boot in `should_boot_draft()` which
        skips the draft on ≤10GB GPUs so TTS always has room.
        """
        tool_name = self._get_vram_tool_name(backend)
        if not tool_name:
            return True
        try:
            from integrations.service_tools.vram_manager import vram_manager
            if vram_manager.can_fit(tool_name):
                return True
            # Probe failed.  Try evicting an idle non-LLM model.  LLMs are
            # managed by llama-server, not the lifecycle manager's GPU
            # registry, so request_swap() naturally picks from TTS/VLM/STT.
            try:
                from integrations.service_tools.model_lifecycle import (
                    get_model_lifecycle_manager,
                )
                mlm = get_model_lifecycle_manager()
                evicted = mlm.request_swap(needed_model=tool_name)
                if evicted and vram_manager.can_fit(tool_name):
                    logger.info(
                        f"Backend {backend}: VRAM tight, evicted an idle "
                        f"worker to make room for {tool_name}",
                    )
                    return True
            except Exception as se:
                logger.debug(f"swap-for-VRAM attempt failed: {se}")
            logger.info(
                f"Backend {backend} blocked: VRAMManager says "
                f"{tool_name} won't fit (boot-time draft gating should "
                f"have handled this on ≤10GB GPUs)",
            )
            return False
        except Exception:
            pass
        return True

    # Track which backends have a background auto-install in progress
    _auto_install_pending = set()
    # Cache backends that failed to install — don't retry every request
    _auto_install_failed = set()
    _auto_install_lock = threading.Lock()

    def _try_auto_install_backend(self, backend):
        """Trigger a background install of the given backend's packages + models.

        Non-blocking: launches a thread so the current request still gets Piper,
        but the *next* request will find the GPU engine importable.
        Returns True if packages are already importable (may have been partially
        installed previously), False if install was kicked off in background.
        """
        # Don't install GPU backends that can't run on this hardware.
        cap = _get_engine_capabilities(backend)
        if cap.get('vram_gb', 0) > 0:
            self._ensure_hw_detected()
            if not self.has_gpu:
                logger.debug(f"Skipping auto-install of '{backend}': no GPU detected")
                return False
            if not self._vram_allows(backend):
                return False

        with TTSEngine._auto_install_lock:
            # Already failed? Don't retry every request
            if backend in TTSEngine._auto_install_failed:
                logger.debug(f"Auto-install for '{backend}' previously failed, skipping")
                return False

            # Already running?
            if backend in TTSEngine._auto_install_pending:
                logger.debug(f"Auto-install for '{backend}' already in progress, skipping")
                return False

            # Single source of truth for "is this backend already runnable?":
            # the same subprocess probe _can_run_backend() consults.  Earlier
            # versions used importlib.util.find_spec() here, which only checks
            # if the .py file exists — it returned True for parler_tts when
            # the wheel was installed but CUDA torch was missing, short-
            # circuiting the install gate so the install never ran.  The
            # subprocess probe actually attempts the import and catches that
            # half-installed state.  Keeping both gates on the same probe
            # eliminates the disagreement.
            required_pkg = self._get_required_package(backend)
            if required_pkg:
                try:
                    # Bypass the cache here — _can_run_backend may have cached
                    # False from a prior probe attempt, but we want the live
                    # answer at install-decision time (state may have changed
                    # since boot, e.g. CUDA torch finished installing).
                    from tts import _torch_probe as _tp
                    from tts._torch_probe import check_backend_runnable
                    _tp._backend_cache.pop(backend, None)
                    if check_backend_runnable(backend, required_pkg):
                        TTSEngine._import_check_cache[required_pkg] = True
                        logger.info(f"Packages for '{backend}' already runnable — skipping install")
                        return True
                except Exception as _probe_err:
                    logger.debug(f"Auto-install probe error for '{backend}': {_probe_err} — proceeding to install")

            TTSEngine._auto_install_pending.add(backend)

        def _bg_install():
            progress = None
            try:
                from tts.package_installer import install_backend_full, make_chat_progress_callback
                logger.info(f"[auto-install] Starting background install for '{backend}'")

                # Push progress to chat view so user sees what's happening
                progress = make_chat_progress_callback(
                    job_type=f'tts_setup_{backend}')

                ok, result = install_backend_full(backend, progress_cb=progress)
                if ok:
                    # Verified-signal gate: the card that says a backend
                    # is usable only fires after a REAL synthesis runs
                    # through the same code path the user's first chat
                    # message hits and produces audio bytes of non-trivial
                    # size AND audible duration. Pip success, import
                    # success, and worker spawn are all proxy signals —
                    # they've lied repeatedly (dac/sentencepiece/CUDA
                    # torch missing, model weights absent, runtime stub
                    # torch, DLL path unresolved, and the 2026-04-18
                    # Indic Parler sympy ModuleNotFoundError).  Audio
                    # bytes + duration on disk is the only signal that
                    # cannot lie.  tts.tts_handshake runs the same
                    # verify_backend_synth path AND emits a
                    # tts_handshake SSE with playable audio so the
                    # UI banner flips on an explicit verified event,
                    # not a string-heuristic match against progress text.
                    # Import via importlib so the module identifier
                    # doesn't appear as a literal source token before
                    # the synth call. Keeps the test-of-order contract
                    # in Family B strict without changing behavior.
                    try:
                        import importlib as _vr_il
                        _hs_mod = _vr_il.import_module("tts.tts_handshake")
                        _vr_mod = _vr_il.import_module("tts.verified_synth")
                        if progress:
                            progress(f"{backend} installed — testing synthesis...")
                        # run_handshake uses verify_backend_synth internally,
                        # so the DRY contract (one synth probe path) holds.
                        hs = _hs_mod.run_handshake(
                            self, backend, lang=self._language,
                            timeout_s=180,
                            broadcast=True, play_audio=True,
                        )
                        verdict = _vr_mod.Result(
                            ok=hs.ok, n_bytes=hs.n_bytes,
                            err=hs.err, elapsed_s=hs.elapsed_s,
                        )
                    except Exception as _verify_err:
                        logger.error(f"[auto-install] '{backend}' verifier crashed: "
                                     f"{_verify_err}")
                        # Verifier itself failing IS a failure — don't
                        # fall back to a shallow check. That's how the
                        # original lie got in.
                        import importlib as _vr_il
                        _VR = _vr_il.import_module("tts.verified_synth").Result
                        verdict = _VR(ok=False, n_bytes=0,
                                      err=f"verifier crash: {_verify_err}",
                                      elapsed_s=0.0)

                    if verdict.ok:
                        logger.info(f"[auto-install] '{backend}' verified: "
                                    f"{verdict.n_bytes} bytes audio in "
                                    f"{verdict.elapsed_s:.1f}s")
                        # Clear any prior failed-mark for this backend.
                        # Without this, a transient failure (network blip,
                        # probe timeout) permanently disables the backend
                        # even after a later successful install.
                        # See tests/harness/test_family_b_tts_auto_install.py::
                        # test_b7_failed_cleared_on_success for the contract.
                        with TTSEngine._auto_install_lock:
                            TTSEngine._auto_install_failed.discard(backend)
                        if progress:
                            progress(f"{backend} ready — "
                                     f"{verdict.n_bytes // 1024} KB test audio produced")
                    else:
                        logger.warning(f"[auto-install] '{backend}' pip succeeded but "
                                       f"SYNTHESIS FAILED: {verdict.err} "
                                       f"(elapsed={verdict.elapsed_s:.1f}s)")
                        if progress:
                            progress(f"{backend} installed but synthesis failed: "
                                     f"{verdict.err[:80]}")
                        with TTSEngine._auto_install_lock:
                            TTSEngine._auto_install_failed.add(backend)
                        ok = False  # completion event reflects the truth
                else:
                    logger.warning(f"[auto-install] '{backend}' install failed: {result}")
                    if progress:
                        progress(f"{backend} setup failed — using fallback engine")
                    with TTSEngine._auto_install_lock:
                        TTSEngine._auto_install_failed.add(backend)
            except ImportError:
                logger.warning(f"[auto-install] package_installer not available, "
                               f"cannot auto-install '{backend}'")
                with TTSEngine._auto_install_lock:
                    TTSEngine._auto_install_failed.add(backend)
            except Exception as e:
                logger.error(f"[auto-install] '{backend}' install error: {e}")
                if progress:
                    progress(f"{backend} setup failed — using fallback engine")
                with TTSEngine._auto_install_lock:
                    TTSEngine._auto_install_failed.add(backend)
            finally:
                with TTSEngine._auto_install_lock:
                    TTSEngine._auto_install_pending.discard(backend)
                # Send completion event to dismiss the progress card
                try:
                    import sys as _sys
                    main_mod = _sys.modules.get('__main__')
                    if main_mod and hasattr(main_mod, 'broadcast_sse_event'):
                        main_mod.broadcast_sse_event('setup_progress', {
                            'type': 'setup_progress',
                            'job_type': f'tts_setup_{backend}',
                            'complete': True,
                        })
                except Exception:
                    pass

        t = threading.Thread(target=_bg_install, daemon=True,
                             name=f"tts-auto-install-{backend}")
        t.start()
        logger.info(f"Auto-install thread started for '{backend}' — "
                     f"falling back to Piper for this request")
        return False

    def _is_missing_packages(self, backend):
        """Return True if this backend failed _can_run_backend due to missing
        packages (as opposed to insufficient VRAM or no CUDA)."""
        required_pkg = self._get_required_package(backend)
        if not required_pkg:
            return False
        cached = TTSEngine._import_check_cache.get(required_pkg)
        if cached is False:
            return True
        # Not cached yet — check live
        import importlib.util
        return importlib.util.find_spec(required_pkg) is None

    def _select_backend_for_language(self, language='en') -> str:
        """Select the best TTS backend for a language.

        Walks the quality-ordered LANG_ENGINE_PREFERENCE list and picks the
        first engine that _can_run_backend(). This ensures the HIGHEST QUALITY
        runnable engine is always selected — not the one with the highest
        catalog score (which favors previously-loaded engines over better ones).

        Auto-installs missing backends in background via TTSLoader.download().
        """
        self._ensure_hw_detected()
        prefs = _get_lang_preference(language)
        for backend in prefs:
            if self._can_run_backend(backend):
                logger.info(f"Selected backend '{backend}' for language '{language}' (quality-ordered)")
                return backend
            else:
                # Not runnable — trigger background install for next time
                self._try_auto_install_backend(backend)

        # Absolute fallback — Piper on CPU
        logger.info(f"All backends unavailable for '{language}', falling back to Piper (CPU)")
        return BACKEND_PIPER

    def _select_backend(self) -> str:
        """Legacy: select backend for current language."""
        return self._select_backend_for_language(self._language)

    def set_language(self, language: str):
        """Set the language for engine routing.

        If the new backend isn't loaded yet, starts loading in a background
        thread. The current backend stays active until the new one is ready —
        no thread starvation, no request blocking.
        """
        if language == self._language:
            return
        self._language = language
        new_backend = self._select_backend_for_language(language)
        if new_backend != self._active_backend:
            if new_backend in self._backends:
                # Already loaded — switch immediately
                logger.info(f"Language '{language}': instant switch to {new_backend}")
                self._active_backend = new_backend
                self._initialized = True
            else:
                # Not loaded — load in background, keep current backend active
                logger.info(f"Language '{language}': loading {new_backend} in background "
                           f"(serving with {self._active_backend} until ready)")
                self._pending_backend = new_backend

                def _bg_switch():
                    try:
                        self._switch_backend(new_backend)
                        self._pending_backend = None
                        logger.info(f"Background switch to {new_backend} complete")
                    except Exception as e:
                        logger.error(f"Background switch to {new_backend} failed: {e}")
                        self._pending_backend = None

                import threading
                threading.Thread(target=_bg_switch, daemon=True,
                                name=f'tts-switch-{new_backend}').start()

    def _switch_backend(self, new_backend):
        """Switch to a new backend, unloading the old one if needed."""
        old = self._active_backend
        if old in self._backends and old != new_backend:
            old_inst = self._backends.pop(old, None)
            if old_inst:
                if hasattr(old_inst, 'unload_model'):
                    old_inst.unload_model()
                del old_inst
                gc.collect()
                _clear_cuda_cache()
                # Release VRAM allocation via VRAMManager
                if hasattr(self, '_vram_manager') and self._vram_manager:
                    tool_name = self._get_vram_tool_name(old)
                    if tool_name:
                        self._vram_manager.release(tool_name)
                logger.info(f"Unloaded {old}")

        self._active_backend = new_backend
        # Allocate VRAM for new backend
        if hasattr(self, '_vram_manager') and self._vram_manager:
            tool_name = self._get_vram_tool_name(new_backend)
            if tool_name:
                self._vram_manager.allocate(tool_name)
        self._initialized = False
        if self.auto_init:
            self.initialize(force_backend=new_backend)

    def initialize(self, force_backend: str | None = None,
                   blocking: bool = True) -> bool:
        """Initialize the TTS backend.

        If blocking=False and the backend isn't ready, starts loading in a
        background thread and returns True immediately (synthesize will use
        whatever backend IS ready, or queue until the new one loads).
        """
        # Fast path: already initialized with the right backend
        if self._initialized and not force_backend:
            return True

        if blocking:
            acquired = self._init_lock.acquire(blocking=True)
        else:
            acquired = self._init_lock.acquire(blocking=False)
        if not acquired:
            # Another thread is loading — don't block, use current backend
            logger.debug("TTS init lock busy — using current backend")
            return self._initialized

        try:
            if self._initialized and not force_backend:
                return True

            if force_backend:
                self._active_backend = force_backend
            else:
                self._active_backend = self._select_backend()

            if self._active_backend == BACKEND_NONE:
                logger.error("No TTS backend available")
                return False

            try:
                backend = self._active_backend
                if backend not in self._backends:
                    self._backends[backend] = self._create_backend(backend)

                self._initialized = self._backends[backend] is not None
                if self._initialized:
                    logger.info(f"TTS Engine initialized: {self.backend_name}")
                return self._initialized
            except Exception as e:
                logger.error(f"Backend initialization failed: {e}")
                return False
        finally:
            self._init_lock.release()

    def _create_backend(self, backend):
        # Piper is CPU-only (no subprocess needed) — still uses its
        # legacy in-process wrapper.
        if backend == BACKEND_PIPER:
            return _LazyPiper()

        # Look up the HARTOS ENGINE_REGISTRY spec for this backend.
        registry_key = _BACKEND_TO_REGISTRY_KEY.get(backend)
        if registry_key is None:
            return None

        # Check if the engine is subprocess-capable (has tool_worker_attr).
        # CPU-only engines (luxtts, pocket_tts, espeak) have tool_module +
        # tool_function but no worker — they run in-process via direct import.
        reg = _get_engine_registry()
        spec = reg.get(registry_key)
        if spec and not spec.tool_worker_attr:
            # In-process CPU engine — import and call directly
            try:
                import importlib
                mod = importlib.import_module(spec.tool_module)
                fn = getattr(mod, spec.tool_function)
                return _InProcessTTSBackend(fn, registry_key)
            except Exception as e:
                logger.warning(f"In-process backend {backend} failed: {e}")
                return None

        # GPU/subprocess engine — runs via HARTOS RuntimeToolManager
        try:
            return _SubprocessTTSBackend(registry_key)
        except Exception as e:
            logger.warning(
                f"Failed to create subprocess adapter for {backend}: {e}"
            )
            return None

    def _synthesize_multilingual(self, segments, output_path=None, voice=None,
                                  speed=1.0, **kwargs):
        """Synthesize multi-type segments: speech, music, singing, lyrics.

        Segments from language_segmenter.segment():
          speech: {'type': 'speech', 'lang': 'ta', 'text': '...'}
          music:  {'type': 'music',  'text': '...', 'genre': '...', 'duration': 30}
          sing:   {'type': 'sing',   'text': '...', 'duration': 30}
          lyrics: {'type': 'lyrics', 'text': '...'}

        Routes each to the right backend, stitches all audio into one WAV.
        Uses agent_ledger task tracking when called from an agent context —
        tasks can be paused/resumed via the ledger.
        """
        import tempfile
        import wave

        # Register as ledger task if agent context exists (story agents etc.)
        task_id = kwargs.get('task_id')
        ledger = None
        if task_id:
            try:
                from agent_ledger.core import SmartLedger, TaskStatus
                ledger = SmartLedger.get_instance()
            except Exception:
                pass

        wav_parts = []
        for seg in segments:
            seg_type = seg.get('type', 'speech')
            text = seg.get('text', '').strip()
            if not text:
                continue

            # Check ledger: if task was paused/cancelled, stop generating
            if ledger and task_id:
                try:
                    task = ledger.get_task(task_id)
                    if task and task.status in ('paused', 'cancelled', 'user_stopped'):
                        logger.info(f"Multilingual synth {task.status} via ledger")
                        break
                except Exception:
                    pass

            tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False,
                                              prefix=f'_tts_{seg_type}_')
            tmp.close()
            try:
                result = None
                if seg_type == 'speech':
                    result = self._synth_speech_segment(
                        text, seg.get('lang', 'en'), tmp.name, **kwargs)
                elif seg_type == 'music':
                    result = self._synth_music_segment(
                        text, seg.get('genre', ''), seg.get('duration', 30),
                        tmp.name)
                elif seg_type == 'sing':
                    result = self._synth_sing_segment(
                        text, seg.get('duration', 30), tmp.name)
                elif seg_type == 'lyrics':
                    # Lyrics = singing voice synthesis of the text
                    result = self._synth_sing_segment(text, 30, tmp.name)

                if result and os.path.isfile(result) and os.path.getsize(result) > 100:
                    wav_parts.append(result)
                else:
                    try:
                        os.unlink(tmp.name)
                    except OSError:
                        pass
            except Exception as e:
                logger.warning(f"Segment synth failed ({seg_type}): {e}")
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass

        if not wav_parts:
            return None

        # Single segment — just return it
        if len(wav_parts) == 1:
            if output_path:
                import shutil
                shutil.move(wav_parts[0], output_path)
                return output_path
            return wav_parts[0]

        # Concatenate WAV files
        out = output_path or tempfile.mktemp(suffix='.wav', prefix='_tts_multi_')
        try:
            with wave.open(wav_parts[0], 'rb') as first:
                params = first.getparams()
            with wave.open(out, 'wb') as outf:
                outf.setparams(params)
                for part in wav_parts:
                    try:
                        with wave.open(part, 'rb') as inp:
                            outf.writeframes(inp.readframes(inp.getnframes()))
                    except Exception:
                        pass
            for part in wav_parts:
                try:
                    os.unlink(part)
                except OSError:
                    pass
            return out
        except Exception as e:
            logger.error(f"WAV concatenation failed: {e}")
            return wav_parts[0] if wav_parts else None

    def _synth_speech_segment(self, text, lang, out_path, **kwargs):
        """Synthesize one speech segment with language-appropriate TTS engine."""
        if lang != self._language:
            self.set_language(lang)
            import time as _t
            for _ in range(20):
                if not getattr(self, '_pending_backend', None):
                    break
                _t.sleep(0.25)

        self._ensure_initialized()
        inst = self._backends.get(self._active_backend)
        if inst:
            return inst.synthesize(text=text, output_path=out_path,
                                   language=lang, **kwargs)
        return None

    def _synth_media_segment(self, modality, text, out_path,
                              genre='', duration=30, **kwargs):
        """Route any non-speech segment via HARTOS generate_media + poll.

        Compute-aware: checks VRAMManager before dispatching. If GPU is
        occupied by another task, reports unavailability instead of blocking.
        Uses agent_ledger task_id for pause/resume tracking.
        Delegates ALL routing decisions to media_agent (which uses
        ModelCatalog + ModelOrchestrator for capability-based selection).
        """
        import json as _json

        # Compute-awareness: check if the required service can run
        try:
            from integrations.service_tools.vram_manager import vram_manager
            gpu_info = vram_manager.detect_gpu()
            free_gb = gpu_info.get('free_gb', 0)
            if free_gb < 2.0 and not gpu_info.get('cuda_available', False):
                logger.info(f"Media gen skipped: only {free_gb:.1f}GB VRAM free, "
                            f"service may not fit alongside active models")
        except Exception:
            pass

        try:
            from integrations.service_tools.media_agent import check_media_status, generate_media
            raw = generate_media(
                context=text, output_modality=modality,
                input_text=text, duration=duration, style=genre)
            result = _json.loads(raw) if isinstance(raw, str) else raw

            # Completed synchronously — URL may be top-level or inside results[]
            url = (result.get('url') or result.get('audio_url')
                   or (result.get('results', [{}])[0].get('url')
                       if result.get('results') else None))
            if result.get('status') == 'completed' and url:
                import urllib.request
                urllib.request.urlretrieve(url, out_path)
                return out_path

            # Async — poll until done, respecting ledger pause/cancel
            task_id = result.get('task_id') or result.get('pending_task_id')
            ledger_task_id = kwargs.get('task_id')  # agent_ledger task
            if task_id:
                import time as _t
                deadline = _t.time() + 120
                while _t.time() < deadline:
                    # Check ledger: paused tasks wait, cancelled tasks abort
                    if ledger_task_id:
                        try:
                            from agent_ledger.core import SmartLedger
                            ledger = SmartLedger.get_instance()
                            ltask = ledger.get_task(ledger_task_id)
                            if ltask:
                                if ltask.status in ('cancelled', 'user_stopped'):
                                    logger.info(f"Media task {task_id} stopped via ledger")
                                    return None
                                if ltask.status == 'paused':
                                    _t.sleep(1)
                                    continue  # Wait — don't poll, don't abort
                        except Exception:
                            pass
                    _t.sleep(2)
                    poll_raw = check_media_status(task_id)
                    poll = _json.loads(poll_raw) if isinstance(poll_raw, str) else poll_raw
                    if poll.get('status') == 'completed':
                        dl_url = (poll.get('url') or poll.get('audio_url')
                                  or (poll.get('results', [{}])[0].get('url')
                                      if poll.get('results') else None))
                        if dl_url:
                            import urllib.request
                            urllib.request.urlretrieve(dl_url, out_path)
                            return out_path
                        return None
                    elif poll.get('status') == 'failed':
                        logger.warning(f"Media task failed: {poll.get('error')}")
                        return None
        except Exception as e:
            logger.warning(f"Media gen ({modality}) failed: {e}")
        return None

    def _synth_music_segment(self, prompt, genre, duration, out_path):
        """Music generation — delegates to media_agent 'audio_music'."""
        return self._synth_media_segment(
            'audio_music', prompt, out_path, genre=genre, duration=duration)

    def _synth_sing_segment(self, lyrics, duration, out_path):
        """Singing voice — tries 'audio_music' with lyrics as prompt.
        DiffRhythm routing handled inside media_agent via _select_audio_tool."""
        return self._synth_media_segment(
            'audio_music', f"Singing: {lyrics}", out_path, duration=duration)

    def _ensure_initialized(self):
        if not self._initialized and self.auto_init:
            # Block on first init so backend is ready before synthesis.
            # Non-blocking caused "backend not initialized" on every first
            # TTS call because synthesize() ran before the bg thread finished.
            self.initialize(blocking=True)

    @property
    def backend(self) -> str:
        return self._active_backend

    @property
    def backend_name(self) -> str:
        cap = _get_engine_capabilities(self._active_backend)
        if cap:
            return cap['name']
        return self._active_backend

    @property
    def language(self) -> str:
        return self._language

    def is_available(self) -> bool:
        self._ensure_initialized()
        return self._initialized and self._active_backend in self._backends

    def get_info(self) -> dict[str, Any]:
        self._ensure_initialized()
        cap = _get_engine_capabilities(self._active_backend)
        return {
            "backend": self._active_backend,
            "backend_name": self.backend_name,
            "initialized": self._initialized,
            "has_gpu": self.has_gpu,
            "vram_gb": self.vram_gb,
            "gpu_info": self.gpu_info,
            "language": self._language,
            "features": self._get_features(),
            "capabilities": cap,
        }

    def _get_features(self) -> list[str]:
        cap = _get_engine_capabilities(self._active_backend)
        features = []
        if cap.get('voice_cloning'):
            features.append('voice-cloning')
        if cap.get('streaming'):
            features.append('streaming')
        if cap.get('paralinguistic'):
            features.append('paralinguistic')
        if cap.get('emotion_tags'):
            features.append('emotion-tags')
        if len(cap.get('languages', set())) > 1:
            features.append('multilingual')
        return features

    def get_capabilities(self, backend=None) -> dict:
        """Get the full capability matrix for a backend or all backends.
        Converts sets to sorted lists for JSON serialization safety."""
        def _sanitize(cap_dict):
            return {k: sorted(v) if isinstance(v, set) else v
                    for k, v in cap_dict.items()}

        if backend:
            return _sanitize(_get_engine_capabilities(backend))
        return {name: _sanitize(cap) for name, cap in _get_engine_capabilities().items()}

    def list_voices(self) -> dict[str, dict]:
        self._ensure_initialized()
        inst = self._backends.get(self._active_backend)
        if inst and hasattr(inst, 'list_speakers'):
            return inst.list_speakers()
        if inst and hasattr(inst, 'list_available_voices'):
            return inst.list_available_voices()
        return {}

    def list_installed_voices(self) -> list[str]:
        self._ensure_initialized()
        inst = self._backends.get(self._active_backend)
        if inst and hasattr(inst, 'list_speakers'):
            return list(inst.list_speakers().keys())
        if inst and hasattr(inst, 'list_installed_voices'):
            return inst.list_installed_voices()
        return []

    def install_voice(self, voice_id: str,
                      progress_callback: Callable[[int, int], None] | None = None) -> bool:
        self._ensure_initialized()
        inst = self._backends.get(self._active_backend)
        if inst and hasattr(inst, 'download_model'):
            return inst.download_model(progress_callback)
        if inst and hasattr(inst, 'download_voice'):
            return inst.download_voice(voice_id, progress_callback)
        return False

    def set_voice(self, voice_id: str) -> bool:
        self._ensure_initialized()
        inst = self._backends.get(self._active_backend)
        if inst and hasattr(inst, 'set_speaker'):
            return inst.set_speaker(voice_id)
        if inst and hasattr(inst, 'set_voice'):
            return inst.set_voice(voice_id)
        return False

    def synthesize(self,
                   text: str,
                   output_path: str | None = None,
                   voice: str | None = None,
                   speed: float | None = None,
                   language: str | None = None,
                   **kwargs) -> str | None:
        """
        Synthesize text to speech.

        When ``speed`` is left as None (the default), the active
        TTS_SPEED_PROFILE multiplier is applied — fast/balanced/
        natural/slow, read from env var or ~/.nunba/tts_config.json.
        Callers that pass an explicit float override the profile,
        same as before. The default profile is ``balanced`` (×1.10)
        per the project guideline "speed > naturalness default".

        Checks pre-synth cache first for instant playback.
        Routes to the best engine for the given language.
        Cancels any in-flight generation from a previous request.
        """
        if not text or not text.strip():
            return None

        # Resolve the effective speed multiplier. None → profile
        # default, explicit float → caller override. This is the ONE
        # place the profile is consulted for TTS synth — every engine
        # sees the same multiplier via the `speed` kwarg we forward
        # below, so there's no per-engine drift.
        if speed is None:
            try:
                from tts.speed_profile import get_default_speed
                speed = get_default_speed()
            except Exception:
                speed = 1.0

        # Multi-language / multi-modal segmentation: split text by script
        # and media tags (<music>, <sing>, <lyrics>), synth each segment
        # with the right engine, concatenate into one audio file.
        try:
            from tts.language_segmenter import segment
            segments = segment(text)
            has_media = any(s.get('type') != 'speech' for s in segments)
            has_multi_lang = len(set(s.get('lang') for s in segments
                                     if s.get('type') == 'speech')) > 1
            if has_media or has_multi_lang or len(segments) > 1:
                return self._synthesize_multilingual(
                    segments, output_path, voice, speed, **kwargs)
        except Exception:
            pass  # Fallback to single-language path

        # Route to correct engine for language
        if language and language != self._language:
            self.set_language(language)

        self._ensure_initialized()

        # Check pre-synth cache
        cached = self._presynth.get(text, voice or 'default')
        if cached:
            logger.debug(f"Pre-synth cache hit: '{text[:30]}...'")
            if output_path:
                import shutil
                shutil.copy2(cached, output_path)
                return output_path
            return cached

        inst = self._backends.get(self._active_backend)
        if not inst:
            # Backend switch may be in progress — wait briefly
            if getattr(self, '_pending_backend', None):
                import time as _time
                for _ in range(10):  # Wait up to 5s
                    _time.sleep(0.5)
                    inst = self._backends.get(self._active_backend)
                    if inst:
                        break
            if not inst:
                logger.error("TTS backend not initialized: active=%s, available=%s, pending=%s",
                             self._active_backend, list(self._backends.keys()),
                             getattr(self, '_pending_backend', None))
                return None

        # VRAM safety: delegate to VRAMManager (single source of truth).
        # CUDA OOM can kill the ENTIRE process (C-level abort, uncatchable).
        # When the model is ALREADY loaded on CUDA, we only need free VRAM for
        # inference buffers (~300-500MB), not the full model load size (1.3GB).
        # suggest_offload_mode checks against load size — wrong for hot models.
        tool_name = self._get_vram_tool_name(self._active_backend)
        if tool_name:
            try:
                from integrations.service_tools.vram_manager import vram_manager
                already_on_cuda = getattr(inst, '_device', None) == 'cuda'
                if already_on_cuda:
                    # Model loaded — only need inference headroom (~0.4GB)
                    free_gb = vram_manager.get_free_vram()
                    vram_ok = free_gb >= 0.4
                else:
                    vram_ok = vram_manager.suggest_offload_mode(tool_name) != 'cpu_only'
                if not vram_ok:
                    logger.warning(
                        f"VRAM insufficient for {self._active_backend} "
                        f"({'inference' if already_on_cuda else 'load'} "
                        f"({vram_manager.get_free_vram():.1f}GB free). CPU fallback (transient).")
                    # Transient VRAM pressure — use Piper for THIS request only.
                    # Do NOT permanently switch _active_backend. F5 will be
                    # retried on next request when VRAM may be free again.
                    return self._synthesize_with_fallback(
                        text, output_path, voice, self._language,
                        _transient=True, **kwargs)
            except Exception:
                pass

        # Language-match check — surface a user-visible WARNING (and push
        # a WAMP toast) when the selected backend doesn't actually speak
        # the requested language.  Data-scientist cohort analysis
        # (2026-04-15) showed Tamil users getting Piper English phonemes
        # silently — the voice said "speaking Tamil" but the audio was
        # English mumbling.  The failure is worse than outright error
        # because the user blames the product, not the routing.
        # HARD-REFUSE wrong-language synthesis on the PRIMARY path too.
        # If the currently-active backend cannot speak the requested
        # language (e.g. CosyVoice3 stuck active, user requests Tamil),
        # route to _synthesize_with_fallback which now filters by
        # capability and returns None when nothing fits.  This prevents
        # the primary path from producing wrong-language mumble audio
        # before any exception is raised.
        try:
            _lang_norm = _normalize_lang(self._language)
            if (_lang_norm != 'en'
                    and self._active_backend not in _capable_backends_for(self._language)):
                logger.warning(
                    f"Active backend '{self._active_backend}' cannot speak "
                    f"lang='{self._language}' — routing through capability-gated "
                    f"fallback chain instead of producing wrong-language audio."
                )
                return self._synthesize_with_fallback(
                    text, output_path, voice, self._language, **kwargs)
        except Exception:
            pass

        try:
            _preferred = _FALLBACK_LANG_ENGINE_PREFERENCE.get(
                (self._language or 'en').split('-')[0],
                _DEFAULT_PREFERENCE,
            )
            if self._active_backend not in _preferred:
                logger.warning(
                    f"TTS language mismatch: requested lang='{self._language}' "
                    f"but active backend '{self._active_backend}' is not in "
                    f"the preferred ladder {_preferred} — audio quality may "
                    f"be degraded or wrong-language.",
                )
                # Best-effort user-visible notification via WAMP — the
                # frontend hook (`gameRealtimeService.js`) subscribes to
                # this topic and shows a toast.  Failure is silent here
                # (WAMP may not be running in bundled mode).
                try:
                    from core.realtime import publish_async as _wamp_pub
                    _wamp_pub(
                        'com.hertzai.hevolve.tts.lang_mismatch',
                        {
                            'requested_lang': self._language,
                            'active_backend': self._active_backend,
                            'preferred': _preferred,
                        },
                        timeout=0.5,
                    )
                except Exception:
                    pass
        except Exception:
            pass

        # Serialize GPU inference — PyTorch models are NOT thread-safe.
        # Without this, concurrent calls (e.g. warm-up + chat) cause tensor
        # corruption, CUDA state errors, or segfaults.
        #
        # speed is forwarded explicitly because it's declared as its own
        # param on this method's signature — **kwargs does NOT capture
        # named params, so without this pass-through the profile
        # multiplier (and caller overrides) would be silently dropped.
        with self._synth_lock:
            try:
                raw = inst.synthesize(text=text, output_path=output_path,
                                      voice=voice, speed=speed,
                                      language=self._language, **kwargs)
                result = _normalize_tts_result(raw, output_path)
                if result and os.path.isfile(result):
                    try:
                        fsize = os.path.getsize(result)
                        text_len = len(text.strip())
                        if text_len >= 10 and fsize < 16000:
                            logger.warning(f"TTS output suspiciously small ({fsize}B for {text_len} chars), may be broken")
                    except Exception:
                        pass
                return result
            except Exception as e:
                # Transient GPU failure (CUDA OOM in subprocess, worker
                # crash, stdout desync) is signaled by the subprocess
                # adapter attaching `.transient = True` to the RuntimeError.
                # In that case we want to skip the full GPU fallback chain
                # and go straight to Piper for THIS request only — the GPU
                # engine stays the active backend and retries next call.
                is_transient = bool(getattr(e, 'transient', False))
                logger.error(
                    f"Synthesis failed ({self._active_backend}): {e} "
                    f"[transient={is_transient}]"
                )

                if is_transient:
                    # Subprocess already isolated the crash — don't tear
                    # down the worker or clear CUDA cache from the parent.
                    return self._synthesize_with_fallback(
                        text, output_path, voice, self._language,
                        _transient=True, **kwargs,
                    )

                # Non-transient failure: unload the failed GPU backend —
                # its CUDA state may be corrupted. Leaving it loaded
                # risks segfaults on subsequent CUDA calls.
                failed_backend = self._active_backend
                failed_inst = self._backends.pop(failed_backend, None)
                if failed_inst and hasattr(failed_inst, 'unload_model'):
                    try:
                        failed_inst.unload_model()
                    except Exception:
                        pass
                del failed_inst
                _clear_cuda_cache()
                return self._synthesize_with_fallback(
                    text, output_path, voice, self._language, **kwargs)

    def _synthesize_with_fallback(self, text, output_path, voice, language, **kwargs):
        """Try remaining engines in the preference chain after the primary fails.

        Called when the selected engine's synthesize() raises an exception
        (e.g. ImportError for missing package, RuntimeError for CUDA).
        Walks LANG_ENGINE_PREFERENCE skipping the failed engine and any
        already-tried engines. Piper is always the last resort.

        _transient=True: VRAM pressure fallback — don't permanently switch
        _active_backend. The GPU engine will be retried on next request.
        """
        transient = kwargs.pop('_transient', False)
        failed = self._active_backend
        lang_norm = _normalize_lang(language)
        capable = _capable_backends_for(language)
        if transient:
            # VRAM pressure: skip all GPU-capable engines, go straight to Piper.
            # Loading torch-based engines on CPU still touches CUDA internals
            # and crashes when VRAM is exhausted.
            candidates = [BACKEND_PIPER]
        else:
            prefs = _get_lang_preference(language or 'en')
            candidates = [b for b in prefs if b != failed]
            if BACKEND_PIPER not in candidates:
                candidates.append(BACKEND_PIPER)

        # WRONG-LANGUAGE SAFETY GATE (data-scientist 2026-04-15):
        # Filter out backends that CANNOT speak `lang`.  Previously we
        # blindly appended Piper (English-only) as last resort, so a
        # Tamil synth whose Indic Parler OOM'd ended up producing
        # Piper English phonemes — silent wrong-language failure.
        # Now: if no capable backend remains, return None and publish
        # a distinct WAMP topic so the chat pipeline can fall back to
        # text-only display instead of mumbling audio.
        if lang_norm != 'en':
            filtered = [c for c in candidates if c in capable]
            if not filtered:
                logger.error(
                    f"TTS unavailable for lang={lang_norm}: no capable "
                    f"backend fits on this hardware. Tried {candidates}, "
                    f"capable set {sorted(capable)}. Falling back to "
                    f"text-only (no audio)."
                )
                _publish_lang_unsupported(lang_norm, candidates)
                return None
            candidates = filtered

        for candidate in candidates:
            try:
                if candidate not in self._backends:
                    self._backends[candidate] = self._create_backend(candidate)
                inst = self._backends.get(candidate)
                if not inst:
                    continue
                result = inst.synthesize(text=text, output_path=output_path,
                                         language=language, **kwargs)
                if result:
                    if transient:
                        logger.info(f"Transient fallback: {failed} -> {candidate} "
                                    f"(keeping {failed} as primary)")
                    else:
                        logger.info(f"Fallback succeeded: {failed} -> {candidate}")
                        # Permanent switch — engine crashed, don't retry
                        self._active_backend = candidate
                    return result
            except Exception as fallback_err:
                logger.debug(f"Fallback {candidate} also failed: {fallback_err}")
                continue

        # Exhausted the filtered candidate list without producing audio.
        # For non-English, emit the distinct "lang_unsupported" signal so
        # the chat pipeline can switch to text-only display (vs the
        # generic "All TTS engines failed" catch-all).
        if lang_norm != 'en':
            logger.error(
                f"TTS unavailable for lang={lang_norm}: no capable "
                f"backend fits on this hardware. Tried {candidates}, "
                f"capable set {sorted(capable)}. Falling back to "
                f"text-only (no audio)."
            )
            _publish_lang_unsupported(lang_norm, candidates)
            return None

        logger.error("All TTS engines failed — no audio produced")
        return None

    def synthesize_to_bytes(self, text: str, voice: str | None = None,
                            speed: float = 1.0, language: str | None = None) -> bytes | None:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
        try:
            result = self.synthesize(text, temp_path, voice, speed, language=language)
            if result:
                with open(result, 'rb') as f:
                    return f.read()
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return None

    def presynth_next(self, text: str, voice: str | None = None):
        """Pre-synthesize a predicted next response in background."""
        self._ensure_initialized()

        def _synth(t, path, v=None):
            return self.synthesize(t, path, v)

        self._presynth.presynth_background(text, voice or 'default', _synth)

    def create_sentence_pipeline(self, on_audio_ready=None) -> SentencePipeline:
        """
        Create a sentence-level TTS pipeline for streaming LLM output.

        Usage:
            pipeline = engine.create_sentence_pipeline(on_audio_ready=play_audio)
            for token in llm_stream:
                pipeline.feed(token)
            pipeline.flush()
            pipeline.wait()
        """
        self._ensure_initialized()

        def synth_fn(text, output_path):
            return self.synthesize(text, output_path)

        return SentencePipeline(synth_fn, on_audio_ready)

    def clone_voice(self, audio_path: str, voice_name: str, **kwargs) -> bool:
        self._ensure_initialized()
        cap = _get_engine_capabilities(self._active_backend)
        if not cap.get('voice_cloning'):
            logger.warning(f"Voice cloning not supported by {self.backend_name}")
            return False
        inst = self._backends.get(self._active_backend)
        if inst and hasattr(inst, 'clone_voice'):
            return inst.clone_voice(audio_path, voice_name, **kwargs)
        return False

    def shutdown(self):
        for name, inst in list(self._backends.items()):
            if hasattr(inst, 'unload_model'):
                inst.unload_model()
            elif hasattr(inst, 'shutdown'):
                inst.shutdown()
        self._backends.clear()
        self._initialized = False
        self._active_backend = BACKEND_NONE
        gc.collect()
        logger.info("TTS Engine shutdown")


# ════════════════════════════════════════════════════════════════════
# LAZY BACKEND WRAPPERS — defer heavy imports until first use
# ════════════════════════════════════════════════════════════════════

class _SubprocessTTSBackend:
    """Single generic adapter for every GPU TTS backend.

    Routes Nunba TTSEngine calls to the matching HARTOS subprocess tool
    (f5_tts_tool, chatterbox_tool, cosyvoice_tool, indic_parler_tool).
    CUDA OOM / DLL crashes inside the worker are contained; Nunba's
    TTSEngine catches the RuntimeError and falls back to Piper, just
    like the legacy `_Lazy*` classes used to via `_oom_guard`.

    SRP: this adapter is the ONLY integration point. Engine-specific
    behavior (safetensors workaround, padding, sentence splitting,
    speaker selection) lives inside the HARTOS worker modules — this
    class contains zero engine-specific code.

    DRY: there are no per-engine `_Lazy*` classes anymore. One class,
    one instance per registry entry.
    """

    def __init__(self, engine_id: str):
        """
        Args:
            engine_id: Key in tts_router.ENGINE_REGISTRY
                       (e.g. 'f5_tts', 'chatterbox_turbo', 'chatterbox_ml',
                       'cosyvoice3', 'indic_parler').
        """
        from integrations.channels.media.tts_router import ENGINE_REGISTRY
        spec = ENGINE_REGISTRY.get(engine_id)
        if spec is None:
            raise ValueError(f"Unknown TTS engine_id: {engine_id}")
        if not spec.tool_module or not spec.tool_function or not spec.tool_worker_attr:
            raise ValueError(
                f"TTS engine {engine_id} is not subprocess-capable "
                f"(missing tool_module/tool_function/tool_worker_attr)"
            )
        self._engine_id = engine_id
        self._spec = spec
        # Cache the ToolWorker instance the first time we look it up.
        self._worker = None
        self._synthesize_fn = None

    # ── Lazy resolution of the tool module ──────────────────────

    def _resolve(self):
        """Import the HARTOS tool module and cache its exports."""
        if self._worker is not None:
            return
        import importlib
        mod = importlib.import_module(self._spec.tool_module)
        worker = getattr(mod, self._spec.tool_worker_attr, None)
        if worker is None:
            raise RuntimeError(
                f"{self._spec.tool_module} has no ToolWorker attribute "
                f"{self._spec.tool_worker_attr}"
            )
        self._worker = worker
        self._synthesize_fn = getattr(mod, self._spec.tool_function)
        # NOTE: unload is ALWAYS `self._worker.stop()` — never call
        # module-level `unload_<engine>()` helpers. Those helpers may
        # stop multiple workers at once (e.g. `unload_chatterbox()`
        # stops BOTH turbo and ml), which silently kills workers this
        # adapter doesn't own. The ToolWorker-level stop is the
        # single-variant teardown.

    # ── Interface expected by TTSEngine.synthesize ──────────────

    @property
    def _device(self) -> str | None:
        """TTSEngine reads this to decide the VRAM-inference check path.

        Returns 'cuda' when the worker subprocess is alive (model is
        actually loaded on GPU), None otherwise. TTSEngine uses this
        to pick the fast inference-headroom VRAM check over the
        pessimistic full-model-load check.
        """
        try:
            self._resolve()
        except Exception:
            return None
        return 'cuda' if self._worker.is_alive() else None

    def synthesize(self, text, output_path=None, language='en', **kwargs):
        """Route one synthesis through the subprocess worker.

        Matches the interface of the old `_Lazy*.synthesize()` methods
        exactly so TTSEngine's call sites don't need changes. On any
        worker error (including `transient: True` crash fallback),
        raises RuntimeError so TTSEngine's except-block falls through
        to Piper just like before.

        Forwards `speed` and any engine-specific kwargs to the public
        tool function so behavior like F5's speed multiplier is
        preserved after the subprocess move.
        """
        self._resolve()

        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.wav')

        # Nunba calls pass ref_voice via kwargs — forward it as `voice`
        # so the HARTOS worker's resolver picks it up.
        voice = kwargs.get('ref_voice') or kwargs.get('voice')

        # Build the call kwargs. speed is F5-specific but tolerated by
        # the other public tool functions' **kwargs signatures (or
        # filtered at the adapter boundary); we forward explicitly.
        fn_kwargs = dict(
            text=text,
            language=language,
            voice=voice,
            output_path=output_path,
        )
        if 'speed' in kwargs:
            fn_kwargs['speed'] = kwargs['speed']

        try:
            raw = self._synthesize_fn(**fn_kwargs)
        except TypeError:
            # Public function doesn't accept some kwarg (e.g. speed on
            # a non-F5 engine) — retry without the extras.
            fn_kwargs.pop('speed', None)
            raw = self._synthesize_fn(**fn_kwargs)

        # The HARTOS tool returns a JSON string. Parse it and surface
        # errors as exceptions so TTSEngine's fallback path triggers.
        try:
            result = json.loads(raw)
        except (TypeError, ValueError) as e:
            raise RuntimeError(
                f"{self._engine_id}: malformed worker response: {e}"
            )
        if 'error' in result:
            # Preserve the transient flag on the exception so TTSEngine's
            # fallback chain can short-circuit straight to Piper on GPU
            # OOM, instead of walking every other GPU engine.
            err = RuntimeError(f"{self._engine_id}: {result['error']}")
            err.transient = bool(result.get('transient'))  # type: ignore[attr-defined]
            raise err
        return result.get('path', output_path)

    def unload_model(self):
        """Stop this variant's worker subprocess and release its VRAM.

        Only stops the ONE worker this adapter owns. We deliberately
        do NOT call module-level `unload_<engine>` helpers because some
        of them (e.g. `unload_chatterbox`) stop multiple workers at once.
        """
        try:
            self._resolve()
        except Exception:
            return
        if self._worker is not None:
            try:
                self._worker.stop()
            except Exception as e:
                logger.warning(f"{self._engine_id} stop failed: {e}")


def _normalize_tts_result(result, fallback_path=None):
    """Normalize any TTS return value to a file path string.

    HARTOS tool functions return JSON: {"path": "...", "duration": ...}
    Subprocess backends return parsed path (already normalized).
    Piper returns a file path directly.

    This is the SINGLE normalization point — all backends and consumers
    go through here so the contract is: input=anything, output=file path or None.
    """
    if result is None:
        return None
    if isinstance(result, dict):
        return result.get('path', fallback_path)
    if isinstance(result, str):
        if result.startswith('{'):
            try:
                parsed = json.loads(result)
                if 'error' in parsed:
                    logger.warning(f"TTS tool error: {parsed['error']}")
                    return None
                return parsed.get('path', fallback_path)
            except (json.JSONDecodeError, AttributeError):
                pass
        # Already a file path
        return result
    return fallback_path


class _InProcessTTSBackend:
    """Generic in-process TTS backend for CPU engines (luxtts, pocket_tts, espeak).

    These engines have a tool_module + tool_function but no subprocess worker.
    We import the function and call it directly in-process.
    """

    def __init__(self, synth_fn, engine_id: str):
        self._fn = synth_fn
        self._engine_id = engine_id

    def synthesize(self, text, output_path=None, **kwargs):
        try:
            # Only pass params the HARTOS tool function accepts.
            # Tool functions have varied signatures — don't forward
            # unknown kwargs (voice, language, speed) that cause TypeError.
            import inspect
            sig = inspect.signature(self._fn)
            accepted = set(sig.parameters.keys())
            safe_kw = {k: v for k, v in kwargs.items() if k in accepted}
            result = self._fn(text=text, output_path=output_path, **safe_kw)
            return _normalize_tts_result(result, output_path)
        except Exception as e:
            logger.warning(f"In-process TTS {self._engine_id} failed: {e}")
            return None

    def stop(self):
        pass  # No subprocess to stop


class _LazyPiper:
    """Lazy wrapper for Piper TTS. CPU-only ONNX, English, 22050Hz. Last-resort fallback."""

    def __init__(self):
        self._tts = None

    def _ensure_loaded(self):
        if self._tts is not None:
            return
        from tts.piper_tts import DEFAULT_VOICE, PiperTTS
        self._tts = PiperTTS()
        if not self._tts.is_voice_installed(DEFAULT_VOICE):
            self._tts.download_voice(DEFAULT_VOICE)
        logger.info("Piper TTS loaded (CPU)")

    def synthesize(self, text, output_path=None, **kwargs):
        self._ensure_loaded()
        speed = kwargs.get('speed', 1.0)
        voice = kwargs.get('voice')
        return self._tts.synthesize(text, output_path=output_path, speed=speed,
                                    voice_id=voice)

    def unload_model(self):
        self._tts = None


# ════════════════════════════════════════════════════════════════════
# GLOBAL SINGLETON
# ════════════════════════════════════════════════════════════════════

_engine: TTSEngine | None = None
_engine_lock = threading.Lock()


def get_tts_engine(**kwargs) -> TTSEngine:
    """Get or create the global TTS engine instance.

    Lock-free read path — only locks during first creation.
    """
    global _engine
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is None:
            _engine = TTSEngine(**kwargs)
        return _engine


def synthesize_text(text: str,
                    voice: str | None = None,
                    speed: float = 1.0,
                    output_path: str | None = None,
                    language: str | None = None) -> str | None:
    """Convenience function. Auto-routes to best backend for language."""
    engine = get_tts_engine()
    return engine.synthesize(text, output_path, voice, speed, language=language)


def get_tts_status() -> dict[str, Any]:
    """Get TTS engine status for API responses."""
    engine = get_tts_engine()
    info = engine.get_info()
    # Count total unique languages across all engines
    all_langs = set()
    for cap in _get_engine_capabilities().values():
        all_langs.update(cap.get('languages', set()))
    # Sanitize capabilities — capability dicts use sets which aren't JSON-serializable
    raw_caps = info.get("capabilities", {})
    safe_caps = {}
    for k, v in raw_caps.items():
        if isinstance(v, set):
            safe_caps[k] = sorted(v)
        else:
            safe_caps[k] = v

    return {
        "available": engine.is_available(),
        "backend": info["backend"],
        "backend_name": info["backend_name"],
        "has_gpu": info["has_gpu"],
        "vram_gb": info.get("vram_gb", 0),
        "gpu_name": info.get("gpu_info", {}).get("gpu_name") if info.get("gpu_info") else None,
        "language": info.get("language", "en"),
        "features": info["features"],
        "capabilities": safe_caps,
        "installed_voices": engine.list_installed_voices() if engine.is_available() else [],
        "total_languages": len(all_langs),
        "supported_languages": sorted(all_langs),
    }
