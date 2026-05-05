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
    BACKEND_KOKORO,
    BACKEND_MELOTTS,
    BACKEND_MMS_TTS,
    BACKEND_PIPER,
    BACKEND_XTTS_V2,
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
# 3. Every International Language → mid-VRAM tier First (2026-04-29)
#
# Policy evolution:
#   * Pre-2026-04-18: CosyVoice3 first.  Demoted because `cosyvoice` is
#     not pip-installable and the installer doesn't clone the repo —
#     fresh installs cascaded to Chatterbox ML anyway.
#   * 2026-04-18 (J213): Chatterbox ML first as the pip-installable
#     primary.  Better than CosyVoice but it needs 14 GB VRAM, so 4-8
#     GB consumer GPUs still cascaded to silence.
#   * 2026-04-29 (this commit): MeloTTS (1.5 GB) and XTTS-v2 (2.5 GB)
#     added as the mid-VRAM tier.  Either of those is now the primary
#     for the 8 international langs — they ARE pip-installable
#     (`melotts`, `coqui-tts`) and run on a 4 GB consumer GPU.  Same
#     spirit as J213 (importable primary) with a vastly broader
#     hardware coverage.  Chatterbox ML stays in the ladder for users
#     with the VRAM, CosyVoice3 stays for power users.
#
# The contract: first-choice engine MUST (a) be importable from a
# fresh `pip install` AND (b) fit in ≤ 3 GB VRAM AND (c) declare the
# language in its capabilities.
# ==========================================================================
INTL_LANGS = ['es', 'fr', 'de', 'ja', 'ko', 'zh', 'it', 'ru']

# Acceptable first-choice engines for the international ladder.
# All three are pip-installable and ≤ 3 GB; per-lang choice depends on
# what the engine's `languages` set declares.
_INTL_ACCEPTABLE_FIRST = {BACKEND_MELOTTS, BACKEND_XTTS_V2, BACKEND_MMS_TTS}

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_has_preference(lang):
    assert lang in _FALLBACK_LANG_ENGINE_PREFERENCE

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_prefers_light_pip_installable(lang):
    """First choice MUST be a pip-installable ≤ 3 GB engine that
    actually speaks the language.

    Subsumes the J213 contract (no repo-clone-only primary) and adds
    the VRAM ceiling — fresh-install 4 GB GPU users get audio without
    cascading to silence.
    """
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    first = prefs[0]
    assert first in _INTL_ACCEPTABLE_FIRST, (
        f"{lang} first choice {first!r} not in the pip-installable "
        f"≤ 3 GB tier {_INTL_ACCEPTABLE_FIRST}.  See test docstring "
        f"for the policy evolution.  Current ladder: {prefs}"
    )
    caps = _FALLBACK_ENGINE_CAPABILITIES[first]
    assert lang in caps['languages'], (
        f"{first} is first for {lang!r} but its languages set doesn't "
        f"include it — first-choice engine MUST declare the language."
    )
    assert caps['vram_gb'] <= 3.0, (
        f"{first} = {caps['vram_gb']} GB VRAM exceeds the 3 GB "
        f"ceiling for the mid-VRAM primary tier."
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_retains_chatterbox_ml_in_ladder(lang):
    """Chatterbox ML stays in the ladder as a high-VRAM voice-clone
    option (14 GB) — promotion of the mid-VRAM tier was a re-order,
    not a removal."""
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    assert BACKEND_CHATTERBOX_ML in prefs, (
        f"{lang} missing Chatterbox ML from ladder — high-VRAM users "
        f"should still get the voice-clone path.  Ladder: {prefs}"
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_retains_cosyvoice3_secondary(lang):
    """CosyVoice3 stays in the ladder for power users who clone
    `FunAudioLLM/CosyVoice` manually."""
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
    assert BACKEND_COSYVOICE3 in prefs, (
        f"{lang} missing CosyVoice3 — opt-in path must be kept.  "
        f"Current ladder: {prefs}"
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_in_chatterbox_ml_capabilities(lang):
    """Chatterbox ML still declares the lang (it's now in the middle
    of the ladder, not the head — but must remain a valid synth path
    for users with 14 GB VRAM)."""
    caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_ML]
    assert lang in caps['languages'], (
        f"Chatterbox ML capability dict doesn't list {lang!r} — "
        f"having it in the ladder without language support would "
        f"silently cascade through the high-VRAM path."
    )

@pytest.mark.parametrize('lang', INTL_LANGS)
def test_intl_lang_in_cosyvoice3_capabilities(lang):
    """CosyVoice3 still declares the lang (kept as power-user slot)."""
    caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_COSYVOICE3]
    assert lang in caps['languages'], f"CosyVoice3 must support {lang}"


# ==========================================================================
# 4. Previously-Unlisted Languages → now have explicit mid-VRAM ladder
#
# Pre-2026-04-29 these langs hit `_DEFAULT_PREFERENCE` (CosyVoice3 /
# Indic Parler / Chatterbox ML).  Now each has an explicit ladder
# rooted in the mid-VRAM tier (MMS-TTS or XTTS-v2 first), and the
# default chain itself starts with MMS-TTS for any genuinely unlisted
# lang.  The contract is: first-choice engine for these langs MUST
# either come from the mid-VRAM tier OR be in the legacy default chain
# AND declare the language in its capabilities.
# ==========================================================================
PREVIOUSLY_UNLISTED_LANGS = ['sw', 'vi', 'th', 'id', 'ms', 'fi', 'pl', 'uk', 'he', 'tr']

_ACCEPTABLE_FALLBACK_FIRSTS = {
    BACKEND_COSYVOICE3, BACKEND_INDIC_PARLER, BACKEND_CHATTERBOX_ML,
    BACKEND_MELOTTS, BACKEND_XTTS_V2, BACKEND_MMS_TTS,
}

@pytest.mark.parametrize('lang', PREVIOUSLY_UNLISTED_LANGS)
def test_unlisted_lang_uses_default(lang):
    prefs = _FALLBACK_LANG_ENGINE_PREFERENCE.get(lang, _DEFAULT_PREFERENCE)
    first = prefs[0]
    assert first in _ACCEPTABLE_FALLBACK_FIRSTS, (
        f"Lang {lang} routes to {first!r}, not in the acceptable "
        f"fallback set {_ACCEPTABLE_FALLBACK_FIRSTS}.  Current "
        f"ladder: {prefs}"
    )
    # Whatever the first choice is, it must declare the lang.
    caps = _FALLBACK_ENGINE_CAPABILITIES.get(first, {})
    assert lang in caps.get('languages', set()), (
        f"{first} is first for {lang!r} but its languages set doesn't "
        f"include the code — would silently cascade.  Either reorder "
        f"the ladder or add {lang} to {first}.languages."
    )

def test_default_preference_starts_with_light_engine():
    """_DEFAULT_PREFERENCE must lead with a ≤ 3 GB engine so genuinely
    unlisted langs still synth on consumer GPUs."""
    first = _DEFAULT_PREFERENCE[0]
    caps = _FALLBACK_ENGINE_CAPABILITIES[first]
    assert caps['vram_gb'] <= 3.0, (
        f"_DEFAULT_PREFERENCE[0] = {first} = {caps['vram_gb']} GB "
        f"exceeds the mid-VRAM ceiling.  Unlisted-lang users on 4 GB "
        f"GPUs would cascade to silence."
    )


# ==========================================================================
# 5. Engine Capability Coverage
# ==========================================================================
ALL_ENGINES = [BACKEND_F5, BACKEND_CHATTERBOX_TURBO, BACKEND_CHATTERBOX_ML,
               BACKEND_INDIC_PARLER, BACKEND_COSYVOICE3, BACKEND_PIPER,
               # Mid-VRAM tier added 2026-04-29 — covered by the same
               # schema invariants as the heavy engines.
               BACKEND_MELOTTS, BACKEND_XTTS_V2, BACKEND_MMS_TTS]

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
