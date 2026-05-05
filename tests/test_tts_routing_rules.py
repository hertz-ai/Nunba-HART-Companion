"""
Deep functional tests for TTS engine routing business rules.

Tests INTENDED BEHAVIOR of the language→engine routing:
- English prefers Chatterbox Turbo (paralinguistic support)
- Indic languages route to Indic Parler (21 languages)
- International languages route to CosyVoice3
- Piper is CPU-only fallback (zero VRAM)
- Catalog↔backend ID mapping is bidirectional
- Engine capabilities match documented specs
- VRAM requirements are accurate
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tts.tts_engine import (
    _BACKEND_TO_CATALOG,
    _CATALOG_TO_BACKEND,
    _DEFAULT_PREFERENCE,
    _FALLBACK_ENGINE_CAPABILITIES,
    _FALLBACK_LANG_ENGINE_PREFERENCE,
    _INDIC_LANGS,
    BACKEND_CHATTERBOX_ML,
    BACKEND_CHATTERBOX_TURBO,
    BACKEND_COSYVOICE3,
    BACKEND_F5,
    BACKEND_INDIC_PARLER,
    BACKEND_MELOTTS,
    BACKEND_MMS_TTS,
    BACKEND_PIPER,
    BACKEND_XTTS_V2,
)

# Mid-VRAM tier (added 2026-04-29) — engines that are pip-installable
# AND fit in ≤ 3 GB VRAM, so they're acceptable primary choices for
# fresh-install consumer-GPU users.  Used by the international-lang
# preference contract below.
_MID_VRAM_TIER = frozenset({BACKEND_MELOTTS, BACKEND_XTTS_V2, BACKEND_MMS_TTS})


# ==========================================================================
# 1. English Routing Rules
# ==========================================================================
class TestEnglishRouting:
    def test_english_first_choice_is_chatterbox_turbo(self):
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE['en']
        assert prefs[0] == BACKEND_CHATTERBOX_TURBO, \
            f"English first choice must be Chatterbox Turbo (paralinguistic), got {prefs[0]}"

    def test_english_has_piper_fallback(self):
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE['en']
        assert BACKEND_PIPER in prefs, "English must have Piper as CPU fallback"

    def test_english_piper_is_last(self):
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE['en']
        assert prefs[-1] == BACKEND_PIPER, "Piper must be last resort for English"

    def test_english_has_f5_for_cloning(self):
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE['en']
        assert BACKEND_F5 in prefs, "English must include F5-TTS for voice cloning"

    def test_english_f5_before_piper(self):
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE['en']
        assert prefs.index(BACKEND_F5) < prefs.index(BACKEND_PIPER)


# ==========================================================================
# 2. Indic Language Routing
# ==========================================================================
class TestIndicRouting:
    def test_all_21_indic_langs_covered(self):
        expected_indic = {'as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'kok', 'mai',
                          'ml', 'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur'}
        assert _INDIC_LANGS == expected_indic, f"Missing Indic langs: {expected_indic - _INDIC_LANGS}"

    def test_hindi_routes_to_indic_parler(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['hi'][0] == BACKEND_INDIC_PARLER

    def test_tamil_routes_to_indic_parler(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['ta'][0] == BACKEND_INDIC_PARLER

    def test_bengali_routes_to_indic_parler(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['bn'][0] == BACKEND_INDIC_PARLER

    def test_telugu_routes_to_indic_parler(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['te'][0] == BACKEND_INDIC_PARLER

    def test_urdu_routes_to_indic_parler(self):
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['ur'][0] == BACKEND_INDIC_PARLER

    def test_all_indic_langs_have_preference(self):
        for lang in _INDIC_LANGS:
            assert lang in _FALLBACK_LANG_ENGINE_PREFERENCE, f"Indic lang {lang} has no preference"

    def test_all_indic_prefer_indic_parler_first(self):
        for lang in _INDIC_LANGS:
            prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
            assert prefs[0] == BACKEND_INDIC_PARLER, \
                f"Lang {lang} should prefer Indic Parler, got {prefs[0]}"


# ==========================================================================
# 3. International Language Routing
# ==========================================================================
class TestInternationalRouting:
    INTL_LANGS = ['es', 'fr', 'de', 'ja', 'ko', 'zh', 'it', 'ru']

    def test_all_intl_langs_have_preference(self):
        for lang in self.INTL_LANGS:
            assert lang in _FALLBACK_LANG_ENGINE_PREFERENCE, f"Intl lang {lang} missing"

    def test_all_intl_prefer_mid_vram_tier(self):
        """Policy 2026-04-29 (extends J213):

        First-choice MUST be pip-installable AND ≤ 3 GB VRAM.  The
        mid-VRAM tier (MeloTTS 1.5 GB, XTTS-v2 2.5 GB, MMS-TTS 1 GB)
        satisfies both.  Chatterbox ML stays in the ladder for users
        with 14 GB GPU; CosyVoice3 stays for power users with the
        repo cloned.  See test_tts_language_routing_matrix.py § 3 for
        the full evolution.
        """
        for lang in self.INTL_LANGS:
            prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
            first = prefs[0]
            assert first in _MID_VRAM_TIER, (
                f"Lang {lang} first choice {first!r} not in mid-VRAM "
                f"tier {set(_MID_VRAM_TIER)} — fresh 4 GB GPU user "
                f"would cascade.  Ladder: {prefs}"
            )

    def test_intl_retains_cosyvoice3_secondary(self):
        """Demote kept CosyVoice3 in the ladder for power users who
        manually clone the `FunAudioLLM/CosyVoice` repo."""
        for lang in self.INTL_LANGS:
            prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
            assert BACKEND_COSYVOICE3 in prefs, \
                f"Lang {lang} should still list CosyVoice3 (secondary slot)"

    def test_japanese_prefers_mid_vram_tier(self):
        """Japanese first-choice must be pip-installable AND ≤ 3 GB."""
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['ja'][0] in _MID_VRAM_TIER

    def test_chinese_prefers_mid_vram_tier(self):
        """Chinese first-choice must be pip-installable AND ≤ 3 GB."""
        assert _FALLBACK_LANG_ENGINE_PREFERENCE['zh'][0] in _MID_VRAM_TIER


# ==========================================================================
# 4. Default Fallback Chain
# ==========================================================================
class TestDefaultFallback:
    def test_default_preference_exists(self):
        assert len(_DEFAULT_PREFERENCE) >= 2

    def test_default_starts_with_light_tier(self):
        """2026-04-29: _DEFAULT_PREFERENCE leads with the mid-VRAM tier
        (currently MMS-TTS, ~1 GB) so genuinely-unlisted langs still
        synth on consumer GPUs.  Pre-J213 was CosyVoice3 (clone-only),
        J213 was Chatterbox ML (pip-installable but 14 GB).  Now the
        default leads with a ≤ 3 GB engine that's also pip-installable."""
        first = _DEFAULT_PREFERENCE[0]
        assert first in _MID_VRAM_TIER, (
            f"_DEFAULT_PREFERENCE[0] = {first!r} should be in the "
            f"mid-VRAM tier {set(_MID_VRAM_TIER)}."
        )
        caps = _FALLBACK_ENGINE_CAPABILITIES[first]
        assert caps['vram_gb'] <= 3.0

    def test_default_includes_indic_parler(self):
        assert BACKEND_INDIC_PARLER in _DEFAULT_PREFERENCE

    def test_default_retains_cosyvoice3_secondary(self):
        """J213: demote was a re-order, not a removal."""
        assert BACKEND_COSYVOICE3 in _DEFAULT_PREFERENCE


# ==========================================================================
# 5. Engine Capabilities — VRAM
# ==========================================================================
class TestEngineVRAM:
    def test_piper_zero_vram(self):
        """Piper is CPU-only — must not need GPU memory."""
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_PIPER]
        assert caps['vram_gb'] == 0, f"Piper VRAM must be 0, got {caps['vram_gb']}"

    def test_f5_moderate_vram(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_F5]
        assert caps['vram_gb'] <= 4.0, "F5-TTS should need ≤4GB VRAM"

    def test_chatterbox_turbo_vram(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_TURBO]
        assert caps['vram_gb'] <= 8.0, "Chatterbox Turbo should fit in 8GB GPU"

    def test_indic_parler_moderate_vram(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_INDIC_PARLER]
        assert caps['vram_gb'] <= 4.0

    def test_chatterbox_ml_large_vram(self):
        """Chatterbox ML is the largest — needs 14GB+."""
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_ML]
        assert caps['vram_gb'] >= 10.0, "Chatterbox ML is large model"


# ==========================================================================
# 6. Engine Capabilities — Features
# ==========================================================================
class TestEngineFeatures:
    def test_chatterbox_turbo_has_paralinguistic(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_TURBO]
        assert len(caps['paralinguistic']) > 0, "Chatterbox Turbo must support [laugh], [sigh], etc."
        assert '[laugh]' in caps['paralinguistic']

    def test_f5_supports_voice_cloning(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_F5]
        assert caps['voice_cloning'] is True

    def test_piper_no_voice_cloning(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_PIPER]
        assert caps['voice_cloning'] is False

    def test_indic_parler_no_voice_cloning(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_INDIC_PARLER]
        assert caps['voice_cloning'] is False

    def test_cosyvoice3_supports_streaming(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_COSYVOICE3]
        assert caps['streaming'] is True

    def test_indic_parler_has_emotion_tags(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_INDIC_PARLER]
        assert len(caps['emotion_tags']) > 0, "Indic Parler supports emotion tags"
        assert 'happy' in caps['emotion_tags']

    def test_indic_parler_21_languages(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_INDIC_PARLER]
        assert len(caps['languages']) >= 21, f"Indic Parler should support 21+ langs, got {len(caps['languages'])}"

    def test_cosyvoice3_9_languages(self):
        caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_COSYVOICE3]
        assert len(caps['languages']) >= 9


# ==========================================================================
# 7. Catalog ↔ Backend Mapping (Bidirectional)
# ==========================================================================
class TestCatalogMapping:
    def test_mapping_round_trip(self):
        """catalog→backend→catalog should be identity."""
        for catalog_id, backend in _CATALOG_TO_BACKEND.items():
            if backend in _BACKEND_TO_CATALOG:
                round_trip = _BACKEND_TO_CATALOG[backend]
                # May not be exact same key (legacy vs hyphen) but should map back
                assert round_trip in _CATALOG_TO_BACKEND, \
                    f"Round-trip failed: {catalog_id}→{backend}→{round_trip} not in forward map"

    def test_all_backends_have_reverse_mapping(self):
        backends = {BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
                    BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_PIPER}
        for b in backends:
            assert b in _BACKEND_TO_CATALOG, f"Backend {b} has no catalog mapping"

    def test_pocket_tts_routes_to_piper(self):
        # 2026-05-04 root-cause fix: pocket_tts has NO native loader in
        # Nunba's python-embed.  Pre-fix, _BACKEND_TO_REGISTRY_KEY held
        # the self-mapping 'pocket_tts': 'pocket_tts' which made the
        # inverse derivation produce a literal-echo entry in
        # _CATALOG_TO_BACKEND.  When the catalog ladder picked it,
        # Nunba activated literal pocket_tts, the dispatcher tried to
        # spawn an unavailable subprocess, and synthesis silently failed
        # ("No TTS engine available (install pocket-tts or espeak-ng)"
        # — confirmed in user's gui_app.log 2026-04-30 → 2026-05-04).
        # Post-fix: pocket-tts/pocket_tts route to BACKEND_PIPER which
        # IS bundled in python-embed and IS in every fallback ladder.
        assert _CATALOG_TO_BACKEND['pocket-tts'] == BACKEND_PIPER
        assert _CATALOG_TO_BACKEND['pocket_tts'] == BACKEND_PIPER

    def test_espeak_maps_to_piper(self):
        # espeak remains a Piper fallback — there is no standalone espeak
        # backend in Nunba, it's the last-resort CPU voice invoked via
        # pocket_tts_tool._espeak_synthesize (HARTOS-side).
        assert _CATALOG_TO_BACKEND['espeak'] == BACKEND_PIPER

    def test_f5_tts_maps_correctly(self):
        assert _CATALOG_TO_BACKEND['f5-tts'] == BACKEND_F5
        assert _CATALOG_TO_BACKEND['f5_tts'] == BACKEND_F5  # legacy

    def test_backend_to_catalog_uses_hyphens(self):
        for backend, catalog_id in _BACKEND_TO_CATALOG.items():
            assert '_' not in catalog_id, f"Catalog ID {catalog_id} should use hyphens not underscores"


# ==========================================================================
# 8. Sample Rates
# ==========================================================================
class TestSampleRates:
    def test_all_engines_have_sample_rate(self):
        for backend, caps in _FALLBACK_ENGINE_CAPABILITIES.items():
            assert 'sample_rate' in caps, f"{backend} missing sample_rate"
            assert caps['sample_rate'] > 0

    def test_sample_rates_are_standard(self):
        valid_rates = {16000, 22050, 24000, 44100, 48000}
        for backend, caps in _FALLBACK_ENGINE_CAPABILITIES.items():
            assert caps['sample_rate'] in valid_rates, \
                f"{backend} has non-standard sample rate {caps['sample_rate']}"
