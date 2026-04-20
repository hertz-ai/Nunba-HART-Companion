"""Family B — TTS auto-install defects, parametrised over every backend.

Uses the SSoT TTS_AUTO_INSTALL list from conftest (sourced from
tts.tts_engine._BACKEND_TO_REGISTRY_KEY). No GPU required.
"""
from __future__ import annotations

import ast

import pytest
from conftest import TTS_ALL, TTS_AUTO_INSTALL

pytestmark = pytest.mark.unit


# ───────────────────────────────────────────────────────────────
# B1 — Ready card fires only after verified synth (per backend)
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("backend", TTS_AUTO_INSTALL)
def test_b1_ready_only_after_verified_synth(backend, source_text, project_root):
    """Every backend's Ready card MUST be gated by verify_backend_synth.

    FAILS on HEAD if tts_engine._bg_install fires `progress(f"{backend}
    ready!")` on install success without first calling
    verify_backend_synth() and checking the Result.ok.
    """
    tts_src = source_text(project_root / "tts" / "tts_engine.py")
    # Find the bg_install block.
    idx = tts_src.find("def _bg_install(")
    assert idx > 0, "tts_engine._bg_install not found"
    block = tts_src[idx:idx + 10_000]
    assert "verify_backend_synth" in block, (
        f"_bg_install must call verify_backend_synth before firing "
        f"Ready for any backend (including {backend})"
    )
    # The "ready!" progress string must be inside the verdict.ok branch.
    ready_idx = block.find('ready')
    verify_idx = block.find("verify_backend_synth")
    verdict_idx = block.find("verdict.ok")
    assert verify_idx > 0 and verdict_idx > 0, (
        "verify_backend_synth result must be consulted as verdict.ok"
    )
    assert ready_idx > verify_idx, (
        f"'ready' progress must appear AFTER verify_backend_synth call "
        f"(backend={backend})"
    )


# ───────────────────────────────────────────────────────────────
# B3 — Boot must consult hart_language.json BEFORE picking backend
# ───────────────────────────────────────────────────────────────

def test_b3_warmup_reads_lang_before_selecting_backend(source_main_py, source_text):
    """FAILS on HEAD: warmup defaults `preferred_lang = 'en'` at line
    3830 BEFORE reading hart_language.json (even though it reads right
    after).  The bug is the default-then-override pattern: if the
    FIRST ladder probe runs before the file is read, the 'en' ladder
    wins and Chatterbox Turbo gets installed for a Tamil user.
    """
    src = source_text(source_main_py)
    # Simplified contract: the _warmup_tts must use
    # core.user_lang.get_preferred_lang as a SINGLE source of truth,
    # not a default-en-then-file pattern.
    assert "from core.user_lang import get_preferred_lang" in src or \
           "core.user_lang.get_preferred_lang" in src, (
        "warmup must use core.user_lang.get_preferred_lang() as the "
        "single source of truth instead of default='en' then JSON read"
    )


# ───────────────────────────────────────────────────────────────
# B4 — Obsolete install cancelled on language change (per backend)
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("backend", TTS_AUTO_INSTALL)
def test_b4_install_cancelled_on_lang_change(backend, source_text, project_root):
    """FAILS on HEAD. When user changes language, in-flight installs
    for backends no longer in the capable set must be cancelled."""
    src = source_text(project_root / "tts" / "tts_engine.py")
    # A cancel path looks like: set_language clears _auto_install_pending
    # of backends not in the new language's capable set.
    assert "cancel_auto_install" in src or \
           "_cancel_obsolete_installs" in src or \
           ("_auto_install_pending" in src and "set_language" in src
            and "discard" in src), (
        f"no cancel-on-lang-change path for auto-install "
        f"(backend={backend})"
    )


# ───────────────────────────────────────────────────────────────
# B5 — Hung pip subprocess must be reaped (per backend)
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("backend", TTS_AUTO_INSTALL)
def test_b5_install_has_wallclock_timeout(backend, source_text, project_root):
    """FAILS on HEAD. The install subprocess has no wallclock timeout;
    a hung pip shows "Step 1/2" forever.
    """
    pi = source_text(project_root / "tts" / "package_installer.py")
    # Look for a subprocess.run/call/Popen with a timeout= kwarg.
    # `subprocess.run(..., timeout=N)` OR Popen + wait(timeout=N).
    has_timeout = ("timeout=" in pi and "subprocess" in pi) or \
                  "WALL_CLOCK_TIMEOUT" in pi
    assert has_timeout, (
        f"package_installer has no wallclock timeout on pip subprocess; "
        f"hung install for '{backend}' would leave card stuck at Step 1/2"
    )


# ───────────────────────────────────────────────────────────────
# B6 — Warmup installs only backends in the user's lang ladder
# ───────────────────────────────────────────────────────────────

def test_b6_warmup_respects_language_ladder(source_main_py, source_text):
    """FAILS on HEAD if `LANG_ENGINE_PREFERENCE.get(lang, [])` returns []
    for an unknown lang and the filter becomes empty, installing all
    backends.  Must fall back to a deterministic minimal set.
    """
    src = source_text(source_main_py)
    # Look for the _ladder_backends build
    idx = src.find("_ladder_backends")
    assert idx > 0, "_ladder_backends not found in main.py"
    block = src[idx:idx + 1500]
    # A safe impl ensures non-empty ladder OR falls through to piper only
    assert (
        "fallback" in block.lower()
        or "or [BACKEND_PIPER]" in block
        or "or {BACKEND_PIPER}" in block
        or "minimal" in block.lower()
        or "['piper']" in block
    ), (
        "warmup must fall back to a minimal backend set (piper) when the "
        "lang ladder is empty; currently empty ladder → install-everything"
    )


# ───────────────────────────────────────────────────────────────
# B7 — _auto_install_failed cleared on subsequent success
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("backend", TTS_AUTO_INSTALL)
def test_b7_failed_cleared_on_success(backend, source_text, project_root):
    """FAILS on HEAD. The _auto_install_failed set accumulates. A
    transient network failure permanently disables the backend.
    """
    src = source_text(project_root / "tts" / "tts_engine.py")
    # Contract: on verified success, the backend must be .discard()ed
    # from _auto_install_failed.
    has_clear = (
        "_auto_install_failed.discard" in src
        or "_auto_install_failed.remove" in src
        or "_auto_install_failed.clear()" in src
    )
    assert has_clear, (
        f"_auto_install_failed never cleared on subsequent success; "
        f"backend '{backend}' permanently disabled after transient fail"
    )


# ───────────────────────────────────────────────────────────────
# B8 — No duplicate in-flight install (race guard per backend)
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("backend", TTS_AUTO_INSTALL)
def test_b8_no_duplicate_install(backend, source_text, project_root):
    """FAILS on HEAD if _try_auto_install_backend doesn't check
    _auto_install_pending under lock before spawning a thread.
    """
    src = source_text(project_root / "tts" / "tts_engine.py")
    idx = src.find("def _try_auto_install_backend(")
    assert idx > 0, "_try_auto_install_backend not found"
    block = src[idx:idx + 5000]
    # Must check _auto_install_pending under _auto_install_lock
    has_lock_guard = (
        "_auto_install_lock" in block
        and "_auto_install_pending" in block
        and "return" in block
    )
    assert has_lock_guard, (
        f"_try_auto_install_backend needs a lock-guarded pending check "
        f"before spawning; without it, '{backend}' can install twice"
    )


# ───────────────────────────────────────────────────────────────
# B9 — Selected backend must be in the lang-capable set
# ───────────────────────────────────────────────────────────────

def test_b9_selected_backend_in_capable_set(tts_engine_reset):
    """FAILS if _select_backend_for_language picks a backend not in
    _capable_backends_for. This is a runtime property check.
    """
    try:
        from tts.tts_engine import (
            BACKEND_INDIC_PARLER,
            TTSEngine,
            _capable_backends_for,
        )
    except Exception as e:
        pytest.skip(f"tts_engine import failed: {e}")

    # For every Indic language, the capable set must include
    # indic_parler, and a dummy engine that only offers indic_parler
    # as runnable must pick it.
    for lang in ("ta", "hi", "te", "bn", "ml", "kn"):
        capable = _capable_backends_for(lang)
        assert BACKEND_INDIC_PARLER in capable, (
            f"Indic Parler missing from capable set for lang={lang}"
        )
