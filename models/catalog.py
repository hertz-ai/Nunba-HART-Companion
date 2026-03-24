"""
ModelCatalog — Nunba shim.

Re-exports the canonical ModelCatalog from HARTOS and adds Nunba-specific
subsystem populators (LLM presets from llama_installer, TTS engines from
tts_engine).  All existing ``from models.catalog import ...`` imports
continue to work unchanged.

The singleton is shared with HARTOS so that BOTH
``integrations.service_tools.model_catalog.get_catalog()`` and
``models.catalog.get_catalog()`` return the same instance.
"""

import logging

# Access the HARTOS module for shared singleton management
import integrations.service_tools.model_catalog as _hartos_mod

# ── Re-export canonical types from HARTOS ─────────────────────────
from integrations.service_tools.model_catalog import (  # noqa: F401
    BACKENDS,
    MODEL_TYPES,
    SOURCES,
    ModelCatalog,
    ModelEntry,
    ModelType,
)

logger = logging.getLogger('NunbaModelCatalog')


# ── Nunba-specific subsystem populators ───────────────────────────
# These are registered as callbacks on the catalog so HARTOS itself
# never imports from llama.* or tts.* (avoids circular deps).

def populate_llm_presets(catalog: ModelCatalog) -> int:
    """Import MODEL_PRESETS from llama_installer into the catalog."""
    added = 0
    try:
        from llama.llama_installer import MODEL_PRESETS
        for i, preset in enumerate(MODEL_PRESETS):
            slug = preset.display_name.lower().replace(" ", "-").replace("(", "").replace(")", "")
            entry_id = f'llm-{slug}'
            if catalog.get(entry_id):
                continue
            vram_est = preset.size_mb / 1024.0
            files = {'model': preset.file_name, 'repo': preset.repo_id}
            if preset.has_vision and preset.mmproj_file:
                files['mmproj'] = preset.mmproj_file
                # mmproj_source is the HF filename (e.g. "mmproj-F16.gguf");
                # mmproj is the unique local name (e.g. "mmproj-Qwen3.5-4B-F16.gguf").
                # Storing both lets downstream code (LlamaLoader, etc.) work
                # purely from the catalog without re-importing MODEL_PRESETS.
                files['mmproj_source'] = preset.mmproj_source_file or preset.mmproj_file
            caps = {'has_vision': preset.has_vision}
            if 'Qwen3.5' in preset.display_name:
                caps['context_length'] = 256000
                caps['chat_template'] = 'jinja'

            tags = ['local']
            if preset.has_vision:
                tags.append('vision')
            if i == 0:
                tags.append('recommended')

            entry = ModelEntry(
                id=entry_id,
                name=preset.display_name,
                model_type=ModelType.LLM,
                source='huggingface',
                repo_id=preset.repo_id,
                files=files,
                vram_gb=round(vram_est, 1),
                ram_gb=round(vram_est * 1.2, 1),
                disk_gb=round(preset.size_mb / 1024.0, 1),
                backend='llama.cpp',
                supports_gpu=True,
                supports_cpu=True,
                supports_cpu_offload=False,
                idle_timeout_s=0,
                min_build=preset.min_build,
                capabilities=caps,
                quality_score=min(0.5 + (preset.size_mb / 20000), 0.95),
                speed_score=max(0.3, 1.0 - (preset.size_mb / 25000)),
                priority=90 - i * 5,
                tags=tags,
                auto_load=i == 0,
            )
            catalog.register(entry, persist=False)
            added += 1
    except ImportError:
        logger.debug("llama_installer not available, skipping LLM presets")
    return added


def populate_tts_engines(catalog: ModelCatalog) -> int:
    """No-op — HARTOS tts_router.populate_tts_catalog() is now the canonical TTS populator.

    TTS engine entries are registered directly by HARTOS via the tts_router subsystem
    (integrations/tts/tts_router.py → populate_tts_catalog()).  Nunba's tts_engine.py
    reads back from the catalog via _get_engine_capabilities() / _get_lang_preference()
    rather than maintaining its own capability matrix.  This function is intentionally
    left as a no-op so the populator slot remains registered without double-registering
    TTS entries that HARTOS already owns.
    """
    return 0


def populate_media_gen(catalog: ModelCatalog) -> int:
    """Register music (ACE Step 1.5) and video (LTX2) generation models."""
    added = 0

    if not catalog.get('audio_gen-acestep-1.5'):
        catalog.register(ModelEntry(
            id='audio_gen-acestep-1.5',
            name='ACE Step 1.5 (Music Generation)',
            model_type=ModelType.AUDIO_GEN,
            source='huggingface',
            repo_id='ACE-Step/ACE-Step-v1-3.5B',
            vram_gb=6.0,
            ram_gb=8.0,
            disk_gb=7.0,
            backend='torch',
            supports_gpu=True,
            supports_cpu=True,
            supports_cpu_offload=True,
            cpu_offload_method='torch_to_cpu',
            idle_timeout_s=300,
            quality_score=0.9,
            speed_score=0.6,
            priority=80,
            languages=['en'],  # lyrics language — generation is universal
            tags=['local', 'music', 'generative'],
            auto_load=False,
        ), persist=False)
        added += 1

    if not catalog.get('video_gen-ltx2'):
        catalog.register(ModelEntry(
            id='video_gen-ltx2',
            name='LTX Video 2 (via wan2gp)',
            model_type=ModelType.VIDEO_GEN,
            source='huggingface',
            repo_id='Lightricks/LTX-Video-2',
            vram_gb=8.0,
            ram_gb=12.0,
            disk_gb=10.0,
            backend='sidecar',
            supports_gpu=True,
            supports_cpu=False,
            supports_cpu_offload=True,
            cpu_offload_method='torch_to_cpu',
            idle_timeout_s=300,
            quality_score=0.92,
            speed_score=0.4,
            priority=80,
            languages=[],  # language-agnostic (text prompt)
            tags=['local', 'video', 'generative'],
            auto_load=False,
        ), persist=False)
        added += 1

    return added


# ── Singleton (shared with HARTOS module) ─────────────────────────
_populators_registered = False


def get_catalog() -> ModelCatalog:
    """Get or create the global ModelCatalog singleton.

    Shares the singleton with HARTOS's model_catalog module so that
    both import paths return the same instance.  Registers Nunba-specific
    LLM/TTS populators before the first auto-populate runs.
    """
    global _populators_registered

    if _hartos_mod._catalog_instance is not None:
        if not _populators_registered:
            _hartos_mod._catalog_instance.register_populator(
                'llm_presets', populate_llm_presets)
            _hartos_mod._catalog_instance.register_populator(
                'tts_engines', populate_tts_engines)
            _hartos_mod._catalog_instance.register_populator(
                'media_gen', populate_media_gen)
            _populators_registered = True
        return _hartos_mod._catalog_instance

    with _hartos_mod._catalog_lock:
        if _hartos_mod._catalog_instance is None:
            inst = ModelCatalog()
            inst.register_populator('llm_presets', populate_llm_presets)
            inst.register_populator('tts_engines', populate_tts_engines)
            inst.register_populator('media_gen', populate_media_gen)
            _populators_registered = True
            if not inst.list_all():
                inst.populate_from_subsystems()
            else:
                # Re-run populators for any new model types not yet in catalog
                # (e.g., media_gen added after initial catalog creation)
                existing_ids = {e.id for e in inst.list_all()}
                for name, fn in inst._populators:
                    try:
                        fn(inst)
                    except Exception:
                        pass
            _hartos_mod._catalog_instance = inst
        elif not _populators_registered:
            _hartos_mod._catalog_instance.register_populator(
                'llm_presets', populate_llm_presets)
            _hartos_mod._catalog_instance.register_populator(
                'tts_engines', populate_tts_engines)
            _hartos_mod._catalog_instance.register_populator(
                'media_gen', populate_media_gen)
            _populators_registered = True
    return _hartos_mod._catalog_instance
