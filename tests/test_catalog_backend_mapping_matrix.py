"""
Parametric catalog↔backend ID mapping matrix.

Tests every entry in both mapping dicts:
- Forward: catalog_id → backend constant
- Reverse: backend constant → catalog_id
- Round-trip: catalog→backend→catalog
- Reverse round-trip: backend→catalog→backend
- All ModelCatalog entries have valid backend mappings
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from integrations.service_tools.model_catalog import ModelType

from models.catalog import get_catalog
from tts.tts_engine import (
    _BACKEND_TO_CATALOG,
    _CATALOG_TO_BACKEND,
    _FALLBACK_ENGINE_CAPABILITIES,
    BACKEND_CHATTERBOX_ML,
    BACKEND_CHATTERBOX_TURBO,
    BACKEND_COSYVOICE3,
    BACKEND_F5,
    BACKEND_INDIC_PARLER,
    BACKEND_PIPER,
)

# ==========================================================================
# 1. Forward Mapping: catalog → backend
# ==========================================================================
FORWARD_ENTRIES = list(_CATALOG_TO_BACKEND.items())
FORWARD_IDS = [f"catalog_{k}" for k, _ in FORWARD_ENTRIES]

@pytest.mark.parametrize('catalog_id,expected_backend', FORWARD_ENTRIES, ids=FORWARD_IDS)
def test_forward_mapping_exists(catalog_id, expected_backend):
    assert expected_backend is not None

# Backends that are registered in HARTOS ENGINE_REGISTRY + exposed in
# Nunba's _BACKEND_TO_CATALOG for routing, but deliberately NOT in
# _FALLBACK_ENGINE_CAPABILITIES because Nunba has no in-process
# implementation — they dispatch entirely via HARTOS RuntimeToolManager
# subprocess. The capabilities matrix is the Nunba-local fallback for
# degraded mode; HARTOS-subprocess-only backends don't belong there.
_HARTOS_SUBPROCESS_ONLY_BACKENDS = {'pocket_tts', 'luxtts'}


@pytest.mark.parametrize('catalog_id,expected_backend', FORWARD_ENTRIES, ids=FORWARD_IDS)
def test_forward_maps_to_known_backend(catalog_id, expected_backend):
    if expected_backend in _HARTOS_SUBPROCESS_ONLY_BACKENDS:
        pytest.skip(f"{expected_backend} is HARTOS-subprocess-only; no Nunba capabilities row")
    assert expected_backend in _FALLBACK_ENGINE_CAPABILITIES, \
        f"catalog {catalog_id} → {expected_backend} not in engine capabilities"


# ==========================================================================
# 2. Reverse Mapping: backend → catalog
# ==========================================================================
REVERSE_ENTRIES = list(_BACKEND_TO_CATALOG.items())
REVERSE_IDS = [f"backend_{k}" for k, _ in REVERSE_ENTRIES]

@pytest.mark.parametrize('backend,catalog_id', REVERSE_ENTRIES, ids=REVERSE_IDS)
def test_reverse_mapping_exists(backend, catalog_id):
    assert catalog_id is not None

@pytest.mark.parametrize('backend,catalog_id', REVERSE_ENTRIES, ids=REVERSE_IDS)
def test_reverse_uses_hyphens(backend, catalog_id):
    """Catalog IDs should use hyphens (not underscores)."""
    assert '_' not in catalog_id, f"Catalog ID {catalog_id} has underscore"

@pytest.mark.parametrize('backend,catalog_id', REVERSE_ENTRIES, ids=REVERSE_IDS)
def test_reverse_catalog_id_in_forward(backend, catalog_id):
    """Reverse catalog_id must exist in forward map."""
    assert catalog_id in _CATALOG_TO_BACKEND, \
        f"Backend {backend} → {catalog_id} not found in forward map"


# ==========================================================================
# 3. Round-Trip: catalog → backend → catalog
# ==========================================================================
@pytest.mark.parametrize('catalog_id,backend', FORWARD_ENTRIES, ids=FORWARD_IDS)
def test_round_trip_forward(catalog_id, backend):
    if backend in _BACKEND_TO_CATALOG:
        round_trip_cat = _BACKEND_TO_CATALOG[backend]
        # The round-trip catalog ID should map back to same backend
        assert _CATALOG_TO_BACKEND.get(round_trip_cat) == backend, \
            f"Round trip failed: {catalog_id}→{backend}→{round_trip_cat}→{_CATALOG_TO_BACKEND.get(round_trip_cat)}"


# ==========================================================================
# 4. Reverse Round-Trip: backend → catalog → backend
# ==========================================================================
@pytest.mark.parametrize('backend,catalog_id', REVERSE_ENTRIES, ids=REVERSE_IDS)
def test_round_trip_reverse(backend, catalog_id):
    rt_backend = _CATALOG_TO_BACKEND.get(catalog_id)
    assert rt_backend == backend, \
        f"Reverse round trip: {backend}→{catalog_id}→{rt_backend}"


# ==========================================================================
# 5. All Core Backends Covered
# ==========================================================================
CORE_BACKENDS = [BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
                 BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_PIPER]

@pytest.mark.parametrize('backend', CORE_BACKENDS)
def test_core_backend_in_forward_values(backend):
    assert backend in _CATALOG_TO_BACKEND.values(), \
        f"Core backend {backend} not reachable from any catalog ID"

@pytest.mark.parametrize('backend', CORE_BACKENDS)
def test_core_backend_in_reverse_keys(backend):
    assert backend in _BACKEND_TO_CATALOG, \
        f"Core backend {backend} missing from reverse mapping"

@pytest.mark.parametrize('backend', CORE_BACKENDS)
def test_core_backend_has_capabilities(backend):
    assert backend in _FALLBACK_ENGINE_CAPABILITIES


# ==========================================================================
# 6. Catalog TTS Entries Have Backend Mapping
# ==========================================================================
class TestCatalogTTSEntries:
    @pytest.fixture(scope='class')
    def tts_entries(self):
        cat = get_catalog()
        return [e for e in cat.list_all() if e.model_type == ModelType.TTS]

    def test_tts_entries_exist(self, tts_entries):
        assert len(tts_entries) >= 1

    def test_each_tts_entry_id_mappable(self, tts_entries):
        """Every TTS catalog entry ID should be mappable to a backend."""
        for e in tts_entries:
            # Strip 'tts-' prefix
            bare_id = e.id.replace('tts-', '', 1) if e.id.startswith('tts-') else e.id
            mapped = _CATALOG_TO_BACKEND.get(bare_id)
            if mapped is None:
                # Try with underscore variant
                mapped = _CATALOG_TO_BACKEND.get(bare_id.replace('-', '_'))
            # Not all catalog TTS entries need Nunba backend mapping
            # (some may be HARTOS-only), so just log unmapped
            if mapped and mapped not in _HARTOS_SUBPROCESS_ONLY_BACKENDS:
                assert mapped in _FALLBACK_ENGINE_CAPABILITIES


# ==========================================================================
# 7. Legacy Compatibility
# ==========================================================================
class TestLegacyMappings:
    """Both hyphenated and underscored forms should work."""

    LEGACY_PAIRS = [
        ('f5-tts', 'f5_tts'),
        ('chatterbox-turbo', 'chatterbox_turbo'),
        ('indic-parler', 'indic_parler'),
    ]

    @pytest.mark.parametrize('hyphen,underscore', LEGACY_PAIRS)
    def test_both_forms_map_to_same_backend(self, hyphen, underscore):
        b1 = _CATALOG_TO_BACKEND.get(hyphen)
        b2 = _CATALOG_TO_BACKEND.get(underscore)
        if b1 and b2:
            assert b1 == b2, f"{hyphen}→{b1} vs {underscore}→{b2}"

    def test_pocket_tts_routes_to_piper(self):
        # 2026-05-04 root-cause fix: pocket_tts is NOT bundled in
        # Nunba's python-embed (no native loader, no required
        # package).  The HARTOS catalog still exposes a 'tts-pocket-tts'
        # entry, but Nunba routes it to BACKEND_PIPER — the canonical
        # CPU fallback that IS bundled and IS in every ladder.
        # Both hyphen ('pocket-tts') and underscore ('pocket_tts')
        # forms must collapse to Piper because HARTOS catalog uses
        # hyphens while ENGINE_REGISTRY uses underscores; either form
        # may flow through _get_lang_preference().
        from tts.tts_engine import BACKEND_PIPER
        assert _CATALOG_TO_BACKEND.get('pocket-tts') == BACKEND_PIPER
        assert _CATALOG_TO_BACKEND.get('pocket_tts') == BACKEND_PIPER

    def test_luxtts_routes_to_piper(self):
        # luxtts is an internal HARTOS tool — Nunba doesn't run it
        # in-process.  Same root-cause fix as pocket_tts: was
        # self-mapped in _BACKEND_TO_REGISTRY_KEY producing a
        # literal-echo entry; now declared in
        # _CPU_FALLBACK_CATALOG_IDS and routed to BACKEND_PIPER.
        from tts.tts_engine import BACKEND_PIPER
        assert _CATALOG_TO_BACKEND.get('luxtts') == BACKEND_PIPER

    def test_espeak_maps_to_piper(self):
        # espeak has no standalone backend; routed through Piper as the
        # last-resort CPU voice.
        assert _CATALOG_TO_BACKEND.get('espeak') == BACKEND_PIPER
