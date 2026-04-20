"""J213 · CosyVoice3 demoted from primary for pip-path installs.

Gap from 2026-04-18 live audit (report §4):

    `tts/package_installer.py:52-56` declares CosyVoice3's pip deps as
    `['torchaudio']` and comments "cosyvoice is NOT pip-installable —
    needs cloned repo".  The package_installer downloads the MODEL
    WEIGHTS (`FunAudioLLM/Fun-CosyVoice3-0.5B-2512` via snapshot_download
    into ``~/PycharmProjects/CosyVoice/pretrained_models``) but never
    clones the `cosyvoice` python package itself.  A user on a fresh
    install hitting Spanish / French / German / Japanese / Korean /
    Chinese / Italian / Russian → CosyVoice3 selected first → `import
    cosyvoice` raises ModuleNotFoundError → cascade to Chatterbox ML
    (which IS pip-installable).  The first-pass probe fires the
    engine-missing warning, wastes seconds, emits a log line that
    confuses bug reports.

Decision
--------
DEMOTE CosyVoice3 from primary for the 8 international languages
(es/fr/de/ja/ko/zh/it/ru) AND for `_DEFAULT_PREFERENCE`.  Chatterbox
ML is pip-installable via `chatterbox-tts` and natively supports all
8 langs (see ``_FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_ML]
['languages']`` at tts/tts_engine.py:83 — 23 langs total, includes
every one of the 8).  CosyVoice3 stays as the SECOND slot so power
users who manually clone the repo still benefit from its zero-shot
voice-cloning quality — opt-in, not forced-default.

An alternative would have been to vendor the `cosyvoice` package via
a pinned `git+https://github.com/FunAudioLLM/CosyVoice@<ref>` install
step, but:

  1. It adds ~2GB of CUDA-specific wheels + model deps to the
     installer footprint, inflating the standard download for every
     user regardless of whether they want the 8 additional langs.
  2. The upstream README warns the repo is NOT stable pip-ready;
     their install path is always "clone + pip install -r
     requirements.txt + model download".  A frozen pin would need
     maintenance on every CosyVoice release.
  3. The pinned clone would live inside `~/.nunba/cosyvoice/` to be
     properly installer-managed, requiring duplication of the
     loader-path logic that already lives at
     scripts/generate_hart_voices.py:987 (sys.path.insert for
     `~/PycharmProjects/CosyVoice`).  Two canonical locations =
     parallel path (CLAUDE.md Gate 4 violation).

The demote keeps CosyVoice3 accessible but stops routing the default
user through a path that silently fails on the first synth attempt.
This is safer and additive-only.

Outcome asserted
----------------
1. For every one of the 8 languages (es/fr/de/ja/ko/zh/it/ru),
   `_FALLBACK_LANG_ENGINE_PREFERENCE[lang][0] != 'cosyvoice3'`.
2. For those same 8, CosyVoice3 still appears somewhere in the
   ladder (secondary slot) — the power-user opt-in remains viable.
3. `_DEFAULT_PREFERENCE[0] != 'cosyvoice3'` — a brand-new language
   code with no explicit entry in `_FALLBACK_LANG_ENGINE_PREFERENCE`
   doesn't silently route to cosyvoice either.
4. The promoted primary is Chatterbox ML, and its capability dict
   lists the 8 langs.  This catches the drift-case where the
   demotion is committed but the promoted primary doesn't actually
   speak the language (silent cascade #2).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_DEMOTED_LANGS: tuple[str, ...] = (
    "es", "fr", "de", "ja", "ko", "zh", "it", "ru",
)


def test_j213_cosyvoice3_not_primary_for_international():
    """For every demoted lang, the FIRST backend must not be cosyvoice."""
    from tts.tts_engine import (
        _FALLBACK_LANG_ENGINE_PREFERENCE,
        BACKEND_CHATTERBOX_ML,
        BACKEND_COSYVOICE3,
    )
    for lang in _DEMOTED_LANGS:
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
        assert prefs, f"{lang!r} has empty preference list"
        assert prefs[0] != BACKEND_COSYVOICE3, (
            f"{lang!r} still has cosyvoice3 as primary — regressing "
            f"the J213 demotion would re-expose fresh installs to the "
            f"silent-cascade: ModuleNotFoundError('cosyvoice') on "
            f"first synth.  Current ladder: {prefs}"
        )


def test_j213_chatterbox_ml_is_promoted_primary():
    """Chatterbox ML replaces CosyVoice3 as the primary for the 8."""
    from tts.tts_engine import (
        _FALLBACK_ENGINE_CAPABILITIES,
        _FALLBACK_LANG_ENGINE_PREFERENCE,
        BACKEND_CHATTERBOX_ML,
    )
    for lang in _DEMOTED_LANGS:
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
        assert prefs[0] == BACKEND_CHATTERBOX_ML, (
            f"{lang!r} primary is {prefs[0]!r}, expected "
            f"{BACKEND_CHATTERBOX_ML!r}.  The J213 decision named "
            f"Chatterbox ML as the pip-installable drop-in for "
            f"CosyVoice3; a silent change here would mean the demote "
            f"landed but the replacement isn't set."
        )

    # Chatterbox ML must actually claim capability in every demoted lang,
    # else we'd just be moving the silent-cascade one slot down.
    caps = _FALLBACK_ENGINE_CAPABILITIES[BACKEND_CHATTERBOX_ML]
    langs = caps.get("languages", set())
    for lang in _DEMOTED_LANGS:
        assert lang in langs, (
            f"Chatterbox ML capability dict doesn't list {lang!r} — "
            f"promoting it to primary without confirming support "
            f"would regress to a wrong-language synth.  Declared "
            f"languages: {sorted(langs)}"
        )


def test_j213_cosyvoice3_still_available_secondary():
    """Power-users who clone the repo still get CosyVoice3 — demote
    is a policy change, not a removal."""
    from tts.tts_engine import (
        _FALLBACK_LANG_ENGINE_PREFERENCE,
        BACKEND_COSYVOICE3,
    )
    for lang in _DEMOTED_LANGS:
        prefs = _FALLBACK_LANG_ENGINE_PREFERENCE[lang]
        assert BACKEND_COSYVOICE3 in prefs, (
            f"{lang!r} ladder {prefs} no longer contains cosyvoice3 "
            f"at all — the J213 decision was to demote, NOT remove.  "
            f"Removing it entirely would strip the zero-shot cloning "
            f"path for users who DO have the repo cloned."
        )


def test_j213_default_preference_not_cosyvoice_first():
    """A language not listed in _FALLBACK_LANG_ENGINE_PREFERENCE
    (e.g. an exotic ISO-639-3 code) must not route to cosyvoice by
    default either."""
    from tts.tts_engine import _DEFAULT_PREFERENCE, BACKEND_COSYVOICE3
    assert _DEFAULT_PREFERENCE, "_DEFAULT_PREFERENCE is empty"
    assert _DEFAULT_PREFERENCE[0] != BACKEND_COSYVOICE3, (
        "_DEFAULT_PREFERENCE still starts with cosyvoice3 — the "
        "J213 demotion must cover the fallthrough path too, not just "
        f"the explicit per-lang entries.  Current: {_DEFAULT_PREFERENCE}"
    )
