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
import logging
import os
import sys
import threading
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import Any

logger = logging.getLogger('NunbaTTSEngine')

# Backend types
BACKEND_F5 = "f5"
BACKEND_CHATTERBOX_TURBO = "chatterbox_turbo"
BACKEND_CHATTERBOX_ML = "chatterbox_multilingual"
BACKEND_INDIC_PARLER = "indic_parler"
BACKEND_COSYVOICE3 = "cosyvoice3"
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
        'vram_gb': 2.0,
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

# All 21 Indic languages supported by Indic Parler TTS
_INDIC_LANGS = {
    'as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'kok', 'mai',
    'ml', 'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
}

# Language → preferred engine order (first available wins).
# Fallback-only — canonical preference is read from ModelCatalog via
# _get_lang_preference().  Direct use of this dict is degraded-mode only.
_FALLBACK_LANG_ENGINE_PREFERENCE = {
    # English: Chatterbox Turbo (paralinguistic tags) > F5 (voice cloning) > Indic Parler > Piper CPU fallback
    'en': [BACKEND_CHATTERBOX_TURBO, BACKEND_F5, BACKEND_INDIC_PARLER, BACKEND_PIPER],
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
# HARTOS catalog uses 'f5_tts' as the entry id; Nunba's backend
# constant is 'f5'.  Map both directions so catalog lookups translate
# cleanly to the backend strings used everywhere in this file.
# ════════════════════════════════════════════════════════════════════

# catalog entry id (without 'tts-' prefix) → Nunba backend constant
# Catalog IDs use hyphens (tts-f5-tts → strip prefix → f5-tts)
# Nunba backend constants use underscores (BACKEND_F5 = "f5")
_CATALOG_TO_BACKEND: dict[str, str] = {
    # Hyphenated form (from HARTOS tts_router.populate_tts_catalog)
    'f5-tts': BACKEND_F5,
    'chatterbox-turbo': BACKEND_CHATTERBOX_TURBO,
    'chatterbox-ml': BACKEND_CHATTERBOX_ML,
    'indic-parler': BACKEND_INDIC_PARLER,
    'cosyvoice3': BACKEND_COSYVOICE3,
    'pocket-tts': BACKEND_PIPER,  # pocket_tts maps to piper in Nunba
    'piper': BACKEND_PIPER,
    'espeak': BACKEND_PIPER,      # espeak is piper fallback
    # Legacy underscore form (backward compat)
    'f5_tts': BACKEND_F5,
    'chatterbox_turbo': BACKEND_CHATTERBOX_TURBO,
    'chatterbox_multilingual': BACKEND_CHATTERBOX_ML,
    'indic_parler': BACKEND_INDIC_PARLER,
}

# Reverse: Nunba backend constant → catalog entry id (hyphenated, without 'tts-' prefix)
_BACKEND_TO_CATALOG: dict[str, str] = {
    BACKEND_F5:               'f5-tts',
    BACKEND_CHATTERBOX_TURBO: 'chatterbox-turbo',
    BACKEND_CHATTERBOX_ML:    'chatterbox-ml',
    BACKEND_INDIC_PARLER:     'indic-parler',
    BACKEND_COSYVOICE3:       'cosyvoice3',
    BACKEND_PIPER:            'piper',
}


def _entry_to_legacy_caps(entry) -> dict:
    """Convert a ModelCatalog ModelEntry (TTS) to the legacy ENGINE_CAPABILITIES dict format.

    Bridges the ModelEntry structure to the flat dict shape that all call
    sites in this module expect.
    """
    caps = entry.capabilities or {}
    langs_raw = getattr(entry, 'languages', None) or []
    return {
        'name':          entry.name,
        'vram_gb':       getattr(entry, 'vram_gb', 0) or 0,
        'languages':     set(langs_raw),
        'paralinguistic': caps.get('paralinguistic', []),
        'emotion_tags':  caps.get('emotion_tags', []),
        'voice_cloning': caps.get('voice_cloning', False),
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
                if language in langs:
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
        self._pending_backend = None  # backend being loaded in background

        # Hardware info (detected lazily)
        self.gpu_info = None
        self.has_gpu = False
        self.vram_gb = 0.0
        self._hw_detected = False

        # Pre-synth cache
        self._presynth = PreSynthCache()

        # Current language (for routing)
        self._language = 'en'

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

    # Map backend names to VRAMManager tool names
    _VRAM_TOOL_MAP = {
        BACKEND_F5: 'tts_f5',
        BACKEND_CHATTERBOX_TURBO: 'tts_chatterbox_turbo',
        BACKEND_CHATTERBOX_ML: 'tts_chatterbox_ml',
        BACKEND_INDIC_PARLER: 'tts_indic_parler',
        BACKEND_COSYVOICE3: 'tts_cosyvoice3',
    }

    # Map backend names to the Python packages they need at runtime.
    # _can_run_backend uses this to skip backends whose deps aren't installed
    # (e.g. frozen build without chatterbox-tts pip package).
    _BACKEND_REQUIRED_IMPORTS = {
        BACKEND_F5: 'f5_tts',
        BACKEND_CHATTERBOX_TURBO: 'chatterbox',
        BACKEND_CHATTERBOX_ML: 'chatterbox',
        BACKEND_INDIC_PARLER: 'parler_tts',
        BACKEND_COSYVOICE3: 'cosyvoice',
        # Piper has no external dep — it's bundled
    }

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

        # ── Software check: is the required package installed? ──
        required_pkg = self._BACKEND_REQUIRED_IMPORTS.get(backend)
        if required_pkg:
            if required_pkg not in TTSEngine._import_check_cache:
                import importlib.util
                TTSEngine._import_check_cache[required_pkg] = (
                    importlib.util.find_spec(required_pkg) is not None
                )
            if not TTSEngine._import_check_cache[required_pkg]:
                logger.debug(f"Backend {backend} skipped: '{required_pkg}' package not installed")
                return False

        # ── GPU backends need working CUDA in torch ──
        required_vram = cap.get('vram_gb', 0)
        if required_vram > 0:
            if '_torch_cuda' not in TTSEngine._import_check_cache:
                try:
                    import torch
                    TTSEngine._import_check_cache['_torch_cuda'] = torch.cuda.is_available()
                    if not TTSEngine._import_check_cache['_torch_cuda']:
                        self._ensure_hw_detected()
                        logger.info(f"torch.cuda.is_available() = False "
                                    f"(torch {torch.__version__}) — "
                                    f"GPU TTS needs CUDA torch upgrade"
                                    f"{' (GPU present via nvidia-smi)' if self.has_gpu else ''}")
                except ImportError:
                    TTSEngine._import_check_cache['_torch_cuda'] = False
                    logger.info("torch not installed — GPU TTS engines disabled")
            if not TTSEngine._import_check_cache['_torch_cuda']:
                return False

        # ── VRAM check: enough room? ──
        # Use VRAMManager if available (HARTOS)
        if hasattr(self, '_vram_manager') and self._vram_manager:
            tool_name = self._VRAM_TOOL_MAP.get(backend)
            if tool_name:
                return self._vram_manager.can_fit(tool_name)
        # Fallback: simple VRAM check
        if required_vram == 0:
            return True
        return self.has_gpu and self.vram_gb >= required_vram

    # Track which backends have a background auto-install in progress
    _auto_install_pending = set()
    # Cache backends that failed to install — don't retry every request
    _auto_install_failed = set()

    def _try_auto_install_backend(self, backend):
        """Trigger a background install of the given backend's packages + models.

        Non-blocking: launches a thread so the current request still gets Piper,
        but the *next* request will find the GPU engine importable.
        Returns True if packages are already importable (may have been partially
        installed previously), False if install was kicked off in background.
        """
        # Don't install GPU backends on machines without GPUs — waste of bandwidth
        cap = _get_engine_capabilities(backend)
        if cap.get('vram_gb', 0) > 0:
            self._ensure_hw_detected()
            if not self.has_gpu:
                logger.debug(f"Skipping auto-install of '{backend}': no GPU detected")
                return False

        # Already failed? Don't retry every request
        if backend in TTSEngine._auto_install_failed:
            logger.debug(f"Auto-install for '{backend}' previously failed, skipping")
            return False

        # Already running?
        if backend in TTSEngine._auto_install_pending:
            logger.debug(f"Auto-install for '{backend}' already in progress, skipping")
            return False

        # Quick check — maybe packages landed since last cache refresh
        required_pkg = self._BACKEND_REQUIRED_IMPORTS.get(backend)
        if required_pkg:
            import importlib.util
            if importlib.util.find_spec(required_pkg) is not None:
                # Packages exist — clear stale cache entry so _can_run_backend sees it
                TTSEngine._import_check_cache.pop(required_pkg, None)
                logger.info(f"Packages for '{backend}' already importable after cache refresh")
                return True

        TTSEngine._auto_install_pending.add(backend)

        def _bg_install():
            try:
                from tts.package_installer import install_backend_full, make_chat_progress_callback
                logger.info(f"[auto-install] Starting background install for '{backend}'")

                # Push progress to chat view so user sees what's happening
                progress = make_chat_progress_callback(
                    job_type=f'tts_setup_{backend}')

                ok, result = install_backend_full(backend, progress_cb=progress)
                if ok:
                    logger.info(f"[auto-install] '{backend}' installed successfully — "
                                f"will be used on next TTS request")
                else:
                    logger.warning(f"[auto-install] '{backend}' install failed: {result}")
                    TTSEngine._auto_install_failed.add(backend)
            except ImportError:
                logger.warning(f"[auto-install] package_installer not available, "
                               f"cannot auto-install '{backend}'")
                TTSEngine._auto_install_failed.add(backend)
            except Exception as e:
                logger.error(f"[auto-install] '{backend}' install error: {e}")
                TTSEngine._auto_install_failed.add(backend)
            finally:
                TTSEngine._auto_install_pending.discard(backend)

        t = threading.Thread(target=_bg_install, daemon=True,
                             name=f"tts-auto-install-{backend}")
        t.start()
        logger.info(f"Auto-install thread started for '{backend}' — "
                     f"falling back to Piper for this request")
        return False

    def _is_missing_packages(self, backend):
        """Return True if this backend failed _can_run_backend due to missing
        packages (as opposed to insufficient VRAM or no CUDA)."""
        required_pkg = self._BACKEND_REQUIRED_IMPORTS.get(backend)
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

        Delegates to ModelOrchestrator.select_best('tts', language) which uses
        ModelCatalog + VRAMManager (single source of truth for compute-aware
        model selection). Falls back to local ENGINE_CAPABILITIES walk only
        if the orchestrator is unavailable (standalone/embedded mode).

        Auto-installs missing backends in background via TTSLoader.download().
        """
        # Try orchestrator first (canonical path)
        try:
            from models.orchestrator import get_orchestrator
            orch = get_orchestrator()
            entry = orch.select_best('tts', language=language)
            if entry:
                # Map catalog entry ID → Nunba backend constant via canonical mapping
                catalog_id = entry.id.replace('tts-', '', 1)
                backend = _CATALOG_TO_BACKEND.get(catalog_id, catalog_id)
                if self._can_run_backend(backend):
                    logger.info(f"Selected backend '{backend}' for language '{language}' (via orchestrator)")
                    return backend
                else:
                    # Orchestrator picked it but it's not runnable — trigger install
                    self._try_auto_install_backend(backend)
                    logger.info(f"Backend '{backend}' selected but not runnable — install triggered")
        except Exception as e:
            logger.debug(f"Orchestrator TTS selection unavailable: {e}")

        # Fallback: preference walk via catalog (or local dict in standalone mode)
        self._ensure_hw_detected()
        prefs = _get_lang_preference(language)
        for backend in prefs:
            if self._can_run_backend(backend):
                logger.info(f"Selected backend '{backend}' for language '{language}' (local fallback)")
                return backend

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
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
                # Release VRAM allocation via VRAMManager
                if hasattr(self, '_vram_manager') and self._vram_manager:
                    tool_name = self._VRAM_TOOL_MAP.get(old)
                    if tool_name:
                        self._vram_manager.release(tool_name)
                logger.info(f"Unloaded {old}")

        self._active_backend = new_backend
        # Allocate VRAM for new backend
        if hasattr(self, '_vram_manager') and self._vram_manager:
            tool_name = self._VRAM_TOOL_MAP.get(new_backend)
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
        if backend == BACKEND_F5:
            return _LazyF5()
        elif backend == BACKEND_CHATTERBOX_TURBO:
            return _LazyChatterboxTurbo()
        elif backend == BACKEND_CHATTERBOX_ML:
            return _LazyChatterboxMultilingual()
        elif backend == BACKEND_INDIC_PARLER:
            return _LazyIndicParler()
        elif backend == BACKEND_COSYVOICE3:
            return _LazyCosyVoice3()
        elif backend == BACKEND_PIPER:
            return _LazyPiper()
        return None

    def _ensure_initialized(self):
        if not self._initialized and self.auto_init:
            # Non-blocking: if another thread is loading, don't wait
            self.initialize(blocking=False)

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
                   speed: float = 1.0,
                   language: str | None = None,
                   **kwargs) -> str | None:
        """
        Synthesize text to speech.

        Checks pre-synth cache first for instant playback.
        Routes to the best engine for the given language.
        """
        if not text or not text.strip():
            return None

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
            logger.error("TTS backend not initialized")
            return None

        try:
            result = inst.synthesize(text=text, output_path=output_path,
                                     language=self._language, **kwargs)
            # Inline sanity check: audio duration vs text length
            if result and os.path.isfile(result):
                try:
                    fsize = os.path.getsize(result)
                    text_len = len(text.strip())
                    # WAV: ~32KB/s at 16kHz 16-bit. If file < 0.5s for 10+ char text, it's empty/broken
                    if text_len >= 10 and fsize < 16000:
                        logger.warning(f"TTS output suspiciously small ({fsize}B for {text_len} chars), may be broken")
                except Exception:
                    pass
            return result
        except Exception as e:
            logger.error(f"Synthesis failed ({self._active_backend}): {e}")
            # ── Fallback chain: try next engines in preference order ──
            # If the selected engine fails (missing package, CUDA error, model
            # not downloaded), walk the preference chain and try each remaining
            # engine. This ensures we always produce audio when possible.
            return self._synthesize_with_fallback(
                text, output_path, voice, self._language, **kwargs
            )

    def _synthesize_with_fallback(self, text, output_path, voice, language, **kwargs):
        """Try remaining engines in the preference chain after the primary fails.

        Called when the selected engine's synthesize() raises an exception
        (e.g. ImportError for missing package, RuntimeError for CUDA).
        Walks LANG_ENGINE_PREFERENCE skipping the failed engine and any
        already-tried engines. Piper is always the last resort.
        """
        failed = self._active_backend
        prefs = _get_lang_preference(language or 'en')
        # Build fallback list: remaining prefs + Piper (if not already in list)
        candidates = [b for b in prefs if b != failed]
        if BACKEND_PIPER not in candidates:
            candidates.append(BACKEND_PIPER)

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
                    logger.info(f"Fallback succeeded: {failed} -> {candidate}")
                    # Switch active backend so future calls skip the broken engine
                    self._active_backend = candidate
                    return result
            except Exception as fallback_err:
                logger.debug(f"Fallback {candidate} also failed: {fallback_err}")
                continue

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

class _LazyF5:
    """Lazy wrapper for F5-TTS. 2GB VRAM, best voice cloning quality."""

    def __init__(self):
        self._model = None
        self._ref_voice = os.path.join(os.path.expanduser('~'), 'Downloads', 'Lily.mp3')
        self._ref_text = ''  # Empty = auto-transcribe on first call, then cached by F5

    def _ensure_loaded(self):
        if self._model is None:
            from f5_tts.api import F5TTS
            self._model = F5TTS(model='F5TTS_v1_Base', device='cuda')

    def synthesize(self, text, output_path=None, language='en', **kwargs):
        self._ensure_loaded()
        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.wav')
        ref = kwargs.get('ref_voice', self._ref_voice)
        self._model.infer(
            ref_file=ref,
            ref_text=self._ref_text,
            gen_text=text,
            file_wave=output_path,
            speed=1.0,
        )
        return output_path

    def unload_model(self):
        if self._model:
            del self._model
            self._model = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass


class _LazyChatterboxTurbo:
    """Lazy wrapper for Chatterbox Turbo. Loads model on first synthesize()."""

    def __init__(self):
        self._model = None
        self._torchaudio = None
        self._sr = None
        self._ref_voice = os.path.join(os.path.expanduser('~'), 'Downloads', 'Lily.mp3')

    def _ensure_loaded(self):
        if self._model is None:
            import torchaudio
            from chatterbox.tts_turbo import ChatterboxTurboTTS
            self._torchaudio = torchaudio
            # Workaround: safetensors segfaults on sequential CUDA loads on Windows.
            # Patch load_file to always load to CPU first, then .to(device) handles CUDA.
            if sys.platform == 'win32':
                import safetensors.torch as _st
                _orig_load = _st.load_file
                def _cpu_first_load(path, device=None):
                    return _orig_load(path, device='cpu')
                _st.load_file = _cpu_first_load
                try:
                    self._model = ChatterboxTurboTTS.from_pretrained(device="cuda")
                finally:
                    _st.load_file = _orig_load
            else:
                self._model = ChatterboxTurboTTS.from_pretrained(device="cuda")
            self._sr = self._model.sr

    def synthesize(self, text, output_path=None, language='en', **kwargs):
        self._ensure_loaded()
        ref = kwargs.get('ref_voice', self._ref_voice)
        wav = self._model.generate(text, audio_prompt_path=ref)
        # Pad 0.3s silence to prevent chopped ending
        import torch as _t
        pad = _t.zeros(1, int(self._sr * 0.3), dtype=wav.dtype, device=wav.device)
        wav = _t.cat([wav, pad], dim=-1)
        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.wav')
        self._torchaudio.save(output_path, wav, self._sr)
        return output_path

    def unload_model(self):
        if self._model:
            del self._model
            self._model = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass


class _LazyChatterboxMultilingual:
    """Lazy wrapper for Chatterbox Multilingual."""

    def __init__(self):
        self._model = None
        self._torchaudio = None
        self._sr = None
        self._ref_voice = os.path.join(os.path.expanduser('~'), 'Downloads', 'Lily.mp3')

    def _ensure_loaded(self):
        if self._model is None:
            import torchaudio
            from chatterbox.tts import ChatterboxMultilingualTTS
            self._torchaudio = torchaudio
            self._model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
            self._sr = self._model.sr

    def synthesize(self, text, output_path=None, language='en', **kwargs):
        self._ensure_loaded()
        ref = kwargs.get('ref_voice', self._ref_voice)
        wav = self._model.generate(text, audio_prompt_path=ref, language_id=language)
        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.wav')
        self._torchaudio.save(output_path, wav, self._sr)
        return output_path

    def unload_model(self):
        if self._model:
            del self._model
            self._model = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass


class _LazyIndicParler:
    """Lazy wrapper for Indic Parler TTS. 21 Indic languages + English. ~2GB VRAM."""

    # Recommended speakers per language
    SPEAKERS = {
        'ta': 'Jaya', 'hi': 'Divya', 'bn': 'Aditi', 'te': 'Lalitha',
        'kn': 'Anu', 'ml': 'Anjali', 'gu': 'Neha', 'mr': 'Sunita',
        'as': 'Sita', 'ur': 'Divya', 'ne': 'Amrita', 'or': 'Debjani',
        'sa': 'Aryan', 'mai': 'Aditi', 'mni': 'Laishram', 'sd': 'Divya',
        'kok': 'Sunita', 'brx': 'Maya', 'doi': 'Karan', 'sat': 'Maya',
        'pa': 'Divya', 'en': 'Divya',
    }

    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._desc_tokenizer = None
        self._device = None
        self._sr = 44100

    def _ensure_loaded(self):
        if self._model is not None:
            return
        import torch
        from parler_tts import ParlerTTSForConditionalGeneration
        from transformers import AutoTokenizer
        self._device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
        self._model = ParlerTTSForConditionalGeneration.from_pretrained(
            'ai4bharat/indic-parler-tts').to(self._device)
        self._tokenizer = AutoTokenizer.from_pretrained('ai4bharat/indic-parler-tts')
        self._desc_tokenizer = AutoTokenizer.from_pretrained(
            self._model.config.text_encoder._name_or_path)
        self._sr = self._model.config.sampling_rate
        logger.info(f"Indic Parler TTS loaded ({self._device}), sr={self._sr}")

    def _get_description(self, language):
        speaker = self.SPEAKERS.get(language, 'Divya')
        return (
            f"{speaker} speaks with a confident, clear and expressive voice "
            f"at a moderate pace. The recording is of very high quality with no background noise, "
            f"the speaker's voice is loud, clear and very close to the microphone."
        )

    def _generate_chunk(self, text, language):
        """Generate audio for a single text chunk. Returns numpy array."""
        description = self._get_description(language)
        desc_inputs = self._desc_tokenizer(description, return_tensors='pt').to(self._device)
        prompt_inputs = self._tokenizer(text, return_tensors='pt').to(self._device)
        max_tokens = max(3000, min(8000, len(text) * 50))
        generation = self._model.generate(
            input_ids=desc_inputs.input_ids,
            attention_mask=desc_inputs.attention_mask,
            prompt_input_ids=prompt_inputs.input_ids,
            prompt_attention_mask=prompt_inputs.attention_mask,
            max_new_tokens=max_tokens,
        )
        return generation.cpu().float().numpy().squeeze()

    @staticmethod
    def _split_sentences(text):
        """Split text at real sentence boundaries, not mid-ellipsis.

        Handles: "Hey... I was waiting. Give me something." → 2 chunks.
        Skips: "...", "..", standalone dots.
        """
        import re
        protected = text.replace('...', '\x00ELLIPSIS\x00')
        parts = re.split(r'(?<=[^\.\s])[.?!।৷]\s+', protected)
        parts = [p.replace('\x00ELLIPSIS\x00', '...') for p in parts]
        merged = []
        for p in parts:
            p = p.strip()
            if not p:
                continue
            if merged and len(merged[-1]) < 20:
                merged[-1] = merged[-1] + ' ' + p
            else:
                merged.append(p)
        if len(merged) > 1 and len(merged[-1]) < 15:
            merged[-2] = merged[-2] + ' ' + merged[-1]
            merged.pop()
        return merged if len(merged) > 1 else [text]

    def synthesize(self, text, output_path=None, language='hi', **kwargs):
        self._ensure_loaded()
        import numpy as np
        import soundfile as sf

        # Split long text into sentences to prevent end-clipping
        sentences = self._split_sentences(text) if len(text) > 80 else [text]

        if len(sentences) == 1:
            audio = self._generate_chunk(text, language)
        else:
            logger.info(f"IndicParler: splitting into {len(sentences)} chunks")
            chunks = []
            gap = np.zeros(int(self._sr * 0.15), dtype=np.float32)
            for i, sent in enumerate(sentences):
                chunk_audio = self._generate_chunk(sent, language)
                if chunk_audio is not None and len(chunk_audio) > 0:
                    chunks.append(chunk_audio)
                    if i < len(sentences) - 1:
                        chunks.append(gap)
            audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)

        # Pad 0.5s silence to prevent chopped ending
        pad = np.zeros(int(self._sr * 0.5), dtype=np.float32)
        audio = np.concatenate([audio, pad])
        # Peak-normalize to -1dB
        peak = np.abs(audio).max()
        if peak > 0:
            target_peak = 10 ** (-1.0 / 20)  # -1 dB
            audio = audio * (target_peak / peak)

        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.wav')
        sf.write(output_path, audio, self._sr)
        return output_path

    def unload_model(self):
        if self._model:
            del self._model, self._tokenizer, self._desc_tokenizer
            self._model = self._tokenizer = self._desc_tokenizer = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass


class _LazyCosyVoice3:
    """Lazy wrapper for CosyVoice3 0.5B. 9 languages, zero-shot cloning. ~4GB VRAM."""

    def __init__(self):
        self._model = None
        self._sr = 22050
        self._ref_voice = os.path.join(os.path.expanduser('~'), 'Downloads', 'Lily.mp3')

    def _ensure_loaded(self):
        if self._model is not None:
            return
        import sys as _sys
        cosyvoice_dir = os.path.join(os.path.expanduser('~'), 'PycharmProjects', 'CosyVoice')
        if not os.path.isdir(cosyvoice_dir):
            raise FileNotFoundError(f"CosyVoice not found at {cosyvoice_dir}")
        if cosyvoice_dir not in _sys.path:
            _sys.path.insert(0, cosyvoice_dir)
            matcha = os.path.join(cosyvoice_dir, 'third_party', 'Matcha-TTS')
            if os.path.isdir(matcha) and matcha not in _sys.path:
                _sys.path.insert(0, matcha)

        from cosyvoice.cli.cosyvoice import AutoModel
        model_dir = os.path.join(cosyvoice_dir, 'pretrained_models', 'CosyVoice3-0.5B')
        if not os.path.isdir(model_dir):
            from huggingface_hub import snapshot_download
            snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512',
                              local_dir=model_dir)
        self._model = AutoModel(model_dir=model_dir)
        self._sr = self._model.sample_rate
        logger.info(f"CosyVoice3 loaded, sr={self._sr}")

    def synthesize(self, text, output_path=None, language='es', **kwargs):
        self._ensure_loaded()
        import torchaudio

        if output_path is None:
            import tempfile
            output_path = tempfile.mktemp(suffix='.wav')

        # CosyVoice3 requires <|endofprompt|> token in text
        cv3_text = f'You are a helpful assistant.<|endofprompt|>{text}'
        ref = kwargs.get('ref_voice', self._ref_voice)
        # Cross-lingual with reference voice
        if ref and os.path.isfile(ref):
            for chunk in self._model.inference_cross_lingual(
                    cv3_text, ref, stream=False):
                audio = chunk['tts_speech']
                # Pad 0.3s silence to prevent chopped ending
                import torch as _t
                pad = _t.zeros(1, int(self._sr * 0.3), dtype=audio.dtype, device=audio.device)
                audio = _t.cat([audio, pad], dim=-1)
                torchaudio.save(output_path, audio, self._sr)
                return output_path
        else:
            spks = self._model.list_available_spks()
            spk = spks[0] if spks else None
            if not spk:
                logger.error("CosyVoice3: no speakers available for SFT")
                return None
            for chunk in self._model.inference_sft(
                    cv3_text, spk, stream=False):
                audio = chunk['tts_speech']
                # Pad 0.3s silence to prevent chopped ending
                import torch as _t
                pad = _t.zeros(1, int(self._sr * 0.3), dtype=audio.dtype, device=audio.device)
                audio = _t.cat([audio, pad], dim=-1)
                torchaudio.save(output_path, audio, self._sr)
                return output_path
        return None

    def unload_model(self):
        if self._model:
            del self._model
            self._model = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass


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
