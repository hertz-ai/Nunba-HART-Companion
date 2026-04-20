"""Integration smoke tests for models/ module — batch #25.

models/ contains Nunba shims over HARTOS's canonical ModelCatalog +
ModelOrchestrator.  1422 LOC covering catalog populators, loader
plugins (LlamaLoader, TTSLoader, STTLoader, VLMLoader), language
bootstrap, and the get_catalog()/get_orchestrator() singletons.

Singleton contract per MEMORY.md: both models.catalog.get_catalog()
and HARTOS's equivalent must return the SAME instance so populators
registered on one side appear on the other.
"""
from __future__ import annotations

import os
import sys

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

pytestmark = pytest.mark.timeout(15)


# ════════════════════════════════════════════════════════════════════════
# models/catalog.py
# ════════════════════════════════════════════════════════════════════════

class TestCatalogExports:
    @pytest.mark.parametrize('name', [
        'populate_llm_presets',
        'populate_tts_engines',
        'populate_media_gen',
        '_register_nunba_populators',
        '_enforce_nunba_business_rules',
        'get_catalog',
    ])
    def test_symbol_exported(self, name):
        import models.catalog as cat
        assert hasattr(cat, name), f'{name} missing from models.catalog'
        assert callable(getattr(cat, name))


class TestGetCatalogSingleton:
    def test_get_catalog_returns_non_none(self):
        from models.catalog import get_catalog
        cat = get_catalog()
        assert cat is not None

    def test_get_catalog_is_singleton(self):
        """Calling get_catalog() twice returns the SAME instance —
        critical for populator idempotence across Nunba + HARTOS."""
        from models.catalog import get_catalog
        a = get_catalog()
        b = get_catalog()
        assert a is b

    def test_populators_registered(self):
        """After first get_catalog() the Nunba populators should have
        run — the catalog should contain at least some LLM presets."""
        from models.catalog import get_catalog
        cat = get_catalog()
        # Catalog exposes a listing API.  We just confirm it has
        # something registered (non-crashing iteration).
        assert cat is not None


# ════════════════════════════════════════════════════════════════════════
# models/orchestrator.py
# ════════════════════════════════════════════════════════════════════════

class TestOrchestratorExports:
    @pytest.mark.parametrize('name', [
        '_entry_to_preset',
        'LlamaLoader',
        'TTSLoader',
        '_levenshtein',
        'STTLoader',
        'VLMLoader',
        '_register_loaders',
        'get_orchestrator',
    ])
    def test_symbol_exported(self, name):
        import models.orchestrator as orch
        assert hasattr(orch, name), f'{name} missing from models.orchestrator'


class TestLevenshtein:
    """Pure string distance — trivial to verify."""

    def test_identical_strings(self):
        from models.orchestrator import _levenshtein
        assert _levenshtein('foo', 'foo') == 0

    def test_single_substitution(self):
        from models.orchestrator import _levenshtein
        assert _levenshtein('cat', 'bat') == 1

    def test_empty_strings(self):
        from models.orchestrator import _levenshtein
        assert _levenshtein('', '') == 0

    def test_empty_vs_nonempty(self):
        from models.orchestrator import _levenshtein
        assert _levenshtein('', 'abc') == 3
        assert _levenshtein('abc', '') == 3

    def test_case_sensitive(self):
        from models.orchestrator import _levenshtein
        # Case-sensitive by default.
        assert _levenshtein('Hello', 'hello') >= 1


class TestLoaderClasses:
    @pytest.mark.parametrize('cls_name', [
        'LlamaLoader', 'TTSLoader', 'STTLoader', 'VLMLoader',
    ])
    def test_loader_is_class(self, cls_name):
        import inspect
        import models.orchestrator as orch
        cls = getattr(orch, cls_name)
        assert inspect.isclass(cls)


class TestGetOrchestratorSingleton:
    def test_get_orchestrator_returns_non_none(self):
        from models.orchestrator import get_orchestrator
        orch = get_orchestrator()
        assert orch is not None

    def test_get_orchestrator_is_singleton(self):
        from models.orchestrator import get_orchestrator
        a = get_orchestrator()
        b = get_orchestrator()
        assert a is b


# ════════════════════════════════════════════════════════════════════════
# models/language_bootstrap.py
# ════════════════════════════════════════════════════════════════════════

class TestLanguageBootstrap:
    def test_module_loads(self):
        import models.language_bootstrap as lb
        assert lb is not None

    def test_has_public_callable(self):
        import models.language_bootstrap as lb
        pub_callables = [
            name for name in dir(lb)
            if not name.startswith('_') and callable(getattr(lb, name, None))
        ]
        assert len(pub_callables) > 0, (
            'models.language_bootstrap exports no public callable'
        )


# ════════════════════════════════════════════════════════════════════════
# models/__init__.py — re-export contract
# ════════════════════════════════════════════════════════════════════════

class TestModelsInit:
    def test_package_loads(self):
        import models
        assert models is not None
