"""
TTS language coverage regression — every SUPPORTED_LANG_DICT code
MUST have at least one engine with ``vram_gb <= 3.0`` in its fallback
ladder.

Background (2026-04-29):
    The pre-existing ladder relied on heavy 4-14 GB engines
    (Chatterbox-ML 14 GB, CosyVoice3 8 GB, F5 4 GB, Indic Parler 2 GB)
    plus Kokoro (0.2 GB, English-only) and Piper (CPU-only, narrow
    voice catalogue). 8 European/CJK languages — es, fr, de, it, ja,
    ko, zh, ru — had NO engine ≤ 3 GB in their ladder, meaning a 4 GB
    consumer GPU could only fall back to silence (Kokoro/Piper don't
    have voices for those langs).

    The mid-VRAM tier added 2026-04-29 — MeloTTS (1.5 GB), XTTS-v2
    (2.5 GB), MMS-TTS (~1 GB) — closes the gap so EVERY code in
    SUPPORTED_LANG_DICT now has at least one ≤ 3 GB engine in its
    ladder. This test guards the invariant: any future commit that
    deletes a mid-VRAM entry, narrows its language coverage, or
    re-introduces a heavy-only ladder will fail this test.

Cross-references:
  * core.constants.SUPPORTED_LANG_DICT — canonical lang catalogue
    (single source of truth, do NOT duplicate).
  * tts.tts_engine._FALLBACK_LANG_ENGINE_PREFERENCE — per-lang ladder
  * tts.tts_engine._FALLBACK_ENGINE_CAPABILITIES — per-engine capabilities
  * tts.tts_engine._DEFAULT_PREFERENCE — fallback ladder for unlisted langs
"""
from __future__ import annotations

import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# Maximum VRAM (GB) for the "light tier" — engines at or below this
# size can run on a 4 GB consumer GPU alongside the 0.8B draft model.
# 3.0 GB is the current contract; raising it would weaken the
# guarantee, so the test pins it at 3.0.
LIGHT_TIER_VRAM_CEILING_GB = 3.0


def test_every_supported_lang_has_a_light_tier_engine():
    """For every SUPPORTED_LANG_DICT code, at least one engine in its
    fallback ladder must report ``vram_gb <= 3.0``.

    If this test fails, a recent commit either:
      (a) removed an engine from _FALLBACK_ENGINE_CAPABILITIES, OR
      (b) narrowed an engine's `languages` set, OR
      (c) shipped a new SUPPORTED_LANG_DICT code without extending
          _FALLBACK_LANG_ENGINE_PREFERENCE OR _DEFAULT_PREFERENCE,
      (d) or re-introduced a heavy-only ladder.

    Fix in this order:
      1. If a new lang was added to core.constants — extend the
         per-lang ladder OR confirm _DEFAULT_PREFERENCE covers it.
      2. If an engine was removed — restore it OR add a replacement
         to _DEFAULT_PREFERENCE that has equivalent coverage.
      3. NEVER raise LIGHT_TIER_VRAM_CEILING_GB to make the test pass.
    """
    from core.constants import SUPPORTED_LANG_DICT

    from tts.tts_engine import (
        _DEFAULT_PREFERENCE,
        _FALLBACK_ENGINE_CAPABILITIES,
        _FALLBACK_LANG_ENGINE_PREFERENCE,
    )

    uncovered: list[tuple[str, list[str]]] = []
    for code in SUPPORTED_LANG_DICT:
        ladder = _FALLBACK_LANG_ENGINE_PREFERENCE.get(code, _DEFAULT_PREFERENCE)
        has_light_engine = any(
            _FALLBACK_ENGINE_CAPABILITIES.get(b, {}).get('vram_gb', 99.0)
            <= LIGHT_TIER_VRAM_CEILING_GB
            for b in ladder
        )
        if not has_light_engine:
            uncovered.append((code, list(ladder)))

    assert not uncovered, (
        f"{len(uncovered)} SUPPORTED_LANG_DICT codes have no engine "
        f"with vram_gb <= {LIGHT_TIER_VRAM_CEILING_GB} GB in their "
        f"fallback ladder. Users on 4 GB consumer GPUs cannot run "
        f"these langs.\nUncovered:\n  "
        + "\n  ".join(f"{code}: {ladder}" for code, ladder in uncovered)
    )


def test_default_preference_has_a_light_tier_engine():
    """_DEFAULT_PREFERENCE itself must contain at least one ≤ 3 GB
    engine — it is the catch-all for any SUPPORTED_LANG_DICT code
    not present in _FALLBACK_LANG_ENGINE_PREFERENCE."""
    from tts.tts_engine import (
        _DEFAULT_PREFERENCE,
        _FALLBACK_ENGINE_CAPABILITIES,
    )

    light = [
        b for b in _DEFAULT_PREFERENCE
        if _FALLBACK_ENGINE_CAPABILITIES.get(b, {}).get('vram_gb', 99.0)
        <= LIGHT_TIER_VRAM_CEILING_GB
    ]
    assert light, (
        f"_DEFAULT_PREFERENCE = {_DEFAULT_PREFERENCE} has no engine "
        f"with vram_gb <= {LIGHT_TIER_VRAM_CEILING_GB}. Any new "
        f"SUPPORTED_LANG_DICT code without an explicit ladder will "
        f"fail to synthesise on 4 GB GPUs."
    )


def test_new_engines_present_in_capabilities():
    """The 3 mid-VRAM engines (MeloTTS, XTTS-v2, MMS-TTS) must remain
    declared in _FALLBACK_ENGINE_CAPABILITIES with vram_gb ≤ 3.0.

    Guards against accidental deletion / VRAM-key inflation.
    """
    from tts.tts_engine import (
        _FALLBACK_ENGINE_CAPABILITIES,
        BACKEND_MELOTTS,
        BACKEND_MMS_TTS,
        BACKEND_XTTS_V2,
    )

    for backend in (BACKEND_MELOTTS, BACKEND_XTTS_V2, BACKEND_MMS_TTS):
        caps = _FALLBACK_ENGINE_CAPABILITIES.get(backend)
        assert caps is not None, (
            f"{backend} missing from _FALLBACK_ENGINE_CAPABILITIES — "
            f"tts/tts_engine.py was edited and forgot to keep the "
            f"mid-VRAM tier."
        )
        vram = caps.get('vram_gb', 99.0)
        assert vram <= LIGHT_TIER_VRAM_CEILING_GB, (
            f"{backend}.vram_gb={vram} exceeds the {LIGHT_TIER_VRAM_CEILING_GB} GB "
            f"ceiling — this engine no longer counts as light-tier "
            f"and the coverage matrix will regress."
        )
        assert caps.get('languages'), (
            f"{backend}.languages is empty — light-tier engine with "
            f"no language coverage breaks the contract."
        )


def test_new_engines_have_registry_keys():
    """Every BACKEND_* constant for the new engines must have a
    matching entry in _BACKEND_TO_REGISTRY_KEY so RuntimeToolManager
    can dispatch synth requests through HARTOS service_tools."""
    from tts.tts_engine import (
        _BACKEND_TO_REGISTRY_KEY,
        BACKEND_MELOTTS,
        BACKEND_MMS_TTS,
        BACKEND_XTTS_V2,
    )

    for backend in (BACKEND_MELOTTS, BACKEND_XTTS_V2, BACKEND_MMS_TTS):
        key = _BACKEND_TO_REGISTRY_KEY.get(backend)
        assert key, (
            f"{backend} missing from _BACKEND_TO_REGISTRY_KEY — "
            f"the synth path will silently skip this engine."
        )
