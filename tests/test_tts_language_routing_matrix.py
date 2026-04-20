"""
Parametric TTS language routing matrix.

Tests every language code against its expected engine preference:
- 21 Indic → Indic Parler
- 8 International → CosyVoice3
- English → Chatterbox Turbo
- Unlisted → Default chain (CosyVoice3)
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tts.tts_engine import (
    _DEFAULT_PREFERENCE,
    _FALLBACK_ENGINE_CAPABILITIES,
    _FALLBACK_LANG_ENGINE_PREFERENCE,
    _INDIC_LANGS,
    BACKEND_CHATTERBOX_ML,
    BACKEND_CHATTERBOX_TURBO,
    BACKEND_COSYVOICE3,
    BACKEND_F5,
    BACKEND_INDIC_PARLER,
    BACKEND_PIPER,
)


# ==========================================================================
# 1. English Routing
# ==========================================================================
def test_english_first_choice():
    assert _FALLBACK_LANG_ENGINE_PREFERENCE['en'][0] == BACKEND_CHATTERBOX_TURBO

def test_english_has_4_fallbacks():
    assert len(_FALLBACK_LANG_ENGINE_PREFERENCE['en']) >= 4

def test_english_ends_with_piper():
    assert _FALLBACK_LANG_ENGINE_PREFERENCE['en'][-1] == BACKEND_PIPER


# ==========================================================================
# 2. Every Indic Language → Indic Parler First
# ==========================================================================
INDIC_LANGS = sorted(_INDIC_LANGS)

@pytest.mark.parametrize('lang', INDIC_LANGS)
def test_indic_lang_has_preference(lang):
    assert lang in _FALLBACK_LANG_ENGINE_PREFERENCE, f"Indic lang {lang} missing preference"

@pytest.mark.parametrize('lang', INDIC_LANGS)
def test_indic_lang_prefers_indic_parler(lang):
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    assert prefs[0] == BACKEND_INDIC_PARLER, f"{lang} should prefer Indic Parler, got {prefs[0]}"

@pytest.mark.parametrize('lang', INDIC_LANGS)
def test_indic_lang_in_engine_capabilities(lang):
    caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_INDIC_PARLER]
    assert lang in caps['languages'], f"Indic Parler must support {lang}"


# ==========================================================================
# 3. Every International Language → Chatterbox ML First (J213 decision)
#
# Was CosyVoice3 First; demoted to secondary on 2026-04-18 because
# `cosyvoice` is not pip-installable and the standard installer never
# clones the repo — a fresh-install user hitting Spanish / French / etc.
# would load a primary that fails on import and cascade to Chatterbox
# ML anyway.  Flipping the order gives the default install a primary
# that actually loads.  CosyVoice3 stays SECOND so power users who
# clone `FunAudioLLM/CosyVoice` manually still route through it.
# ==========================================================================
INTL_LANGS = ['es', 'fr', 'de', 'ja', 'ko', 'zh', 'it', 'ru']

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_has_preference(lang):
    assert lang in _FALLBACK_LANG_ENGINE_PREFERENCE

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_prefers_chatterbox_ml(lang):
    """J213: Chatterbox ML is the pip-installable primary."""
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    assert prefs[0] == BACKEND_CHATTERBOX_ML, (
        f"{lang} should prefer Chatterbox ML (J213 — CosyVoice3 "
        f"demoted; it requires a manual repo clone the installer "
        f"doesn't perform).  Current ladder: {prefs}"
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_retains_cosyvoice3_secondary(lang):
    """Demote was a policy change, not a removal — opt-in path kept."""
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    assert BACKEND_COSYVOICE3 in prefs, (
        f"{lang} missing CosyVoice3 — demote was meant to re-order, "
        f"not delete.  Current ladder: {prefs}"
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_in_chatterbox_ml_capabilities(lang):
    """The promoted primary must actually speak the language."""
    caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_ML]
    assert lang in caps['languages'], (
        f"Chatterbox ML capability dict doesn't list {lang!r} — "
        f"promoting it to primary without confirming support would "
        f"silently cascade through the ladder on every synth."
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_in_cosyvoice3_capabilities(lang):
    """CosyVoice3 still declares the lang (secondary slot must be real)."""
    caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_COSYVOICE3]
    assert lang in caps['languages'], f"CosyVoice3 must support {lang}"


# ==========================================================================
# 4. Unlisted Languages → Default Chain
# ==========================================================================
UNLISTED_LANGS = ['sw', 'vi', 'th', 'id', 'ms', 'fi', 'pl', 'uk', 'he', 'tr']

@pytest.mark.parametrize('lang', UNLISTED_LANGS)
def test_unlisted_lang_uses_default(lang):
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE.get(lang, _DEFAULT_PREFERENCE)
    assert prefs[0] in (BACKEND_COSYVOICE3, BACKEND_INDIC_PARLER, BACKEND_CHATTERBOX_ML), \
        f"Unlisted lang {lang} should use default chain, got {prefs[0]}"


# ==========================================================================
# 5. Engine Capability Coverage
# ==========================================================================
ALL_ENGINES = [BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
               BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_PIPER]

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_capabilities(engine):
    assert engine in _FALLBACK_ENGINE_CAPABILITIES

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_languages(engine):
    caps = _FALLBACK_ENGINE_CAPABILITIES[engine]
    assert 'languages' in caps
    assert isinstance(caps['languages'], set)

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_vram(engine):
    caps = _FALLBACK_ENGINE_CAPABILITIES[engine]
    assert 'vram_gb' in caps
    assert isinstance(caps['vram_gb'], (int, float))
    assert caps['vram_gb'] >= 0

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_quality(engine):
    caps = _FALLBACK_ENGINE_CAPABILITIES[engine]
    assert 'quality' in caps
    assert caps['quality'] in ('highest', 'high', 'medium', 'low')

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_sample_rate(engine):
    caps = _FALLBACK_ENGINE_CAPABILITIES[engine]
    assert caps['sample_rate'] in (16000, 22050, 24000, 44100, 48000)

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_streaming_flag(engine):
    caps = _FALLBACK_ENGINE_CAPABILITIES[engine]
    assert isinstance(caps['streaming'], bool)

@pytest.mark.parametrize('engine', ALL_ENGINES)
def test_engine_has_cloning_flag(engine):
    caps = _FALLBACK_ENGINE_CAPABILITIES[engine]
    assert isinstance(caps['voice_cloning'], bool)


# ==========================================================================
# 6. Cross-check: every language in preferences has engine support
# ==========================================================================
@pytest.mark.parametrize('lang', list(_FALLBACK_LANG_ENGINE_PREFERENCE.keys()))
def test_preferred_engine_supports_language(lang):
    """First-choice engine for each language must actually support that language."""
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    first = prefs[0]
    caps = _FALLBACK_ENGINE_CAPABILITIES[first]
    # English is special (en is in multiple engines)
    if lang == 'en':
        assert 'en' in caps['languages']
    else:
        assert lang in caps['languages'], \
            f"Engine {first} doesn't support {lang} but is first choice"
