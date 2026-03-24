"""
Unified Model Management — single registry for ALL model types.

Bridges LLM (llama.cpp), TTS (multi-engine), STT (whisper), VLM (MiniCPM),
and media gen under one catalog + orchestrator.

This package re-exports from HARTOS (canonical implementation) and adds
Nunba-specific loaders and populators.
"""
from models.catalog import MODEL_TYPES, ModelCatalog, ModelEntry, ModelType, get_catalog
from models.orchestrator import (
    ModelLoader,
    ModelOrchestrator,
    get_orchestrator,
)

__all__ = [
    'ModelCatalog', 'ModelEntry', 'ModelType', 'MODEL_TYPES',
    'get_catalog', 'ModelOrchestrator', 'ModelLoader', 'get_orchestrator',
]
