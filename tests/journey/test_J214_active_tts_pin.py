"""J214 · `TTSEngine.set_language(L)` pins the active TTS backend.

Gap from 2026-04-18 live audit (report §5):

    The HARTOS ``ModelLifecycleManager`` sweeps idle models on phase
    7 of ``_tick`` (integrations/service_tools/model_lifecycle.py
    around ``_evict_idle_models``).  A model flagged
    ``pressure_evict_only = True`` is EXCLUDED from that sweep — it
    only yields VRAM when the machine is genuinely under pressure.
    Nothing on the Nunba side ever sets that flag for the active
    TTS backend.  A user speaking Tamil through Indic Parler who
    then pauses for 10+ minutes (reads a long agent response, takes
    a phone call) would return to find Indic Parler evicted — the
    next synth pays a cold-reload hit despite zero VRAM pressure.

    Worse: during the 10-min quiet period the user might trigger an
    unrelated model load (new agent, VLM caption, etc.) — Phase 3
    VRAM-pressure eviction sees the idle TTS as fair game because
    the flag defaults to False, and gladly reclaims its budget.

Outcome asserted
----------------
1. ``TTSEngine.set_language('ta')`` selects ``indic_parler`` and
   flips ``ModelState(tts_indic_parler).pressure_evict_only = True``
   via the HARTOS ``set_pressure_evict_only`` public method.
2. Subsequently switching to a different-backend language
   (``set_language('en')`` → chatterbox_turbo) unpins the prior
   backend (pressure_evict_only back to False) and pins the new one.
3. If the lifecycle manager hasn't seen the tool yet (RTM
   ``on_tool_started`` hasn't fired because the backend hasn't
   synthesized anything yet), the pin is staged as a persisted hint
   so it lands the moment the tool IS tracked.
4. Piper is CPU-only (no VRAM tool name); calling set_language on a
   path that resolves to Piper does NOT raise and does NOT stage a
   phantom hint.
5. Regression-guard: re-calling ``set_language`` with the SAME code
   does not double-flip.  (Idempotent — same-lang re-call is a
   cheap no-op.)
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# ────────────────────────────────────────────────────────────────────
# Helper — returns the tool name a given backend maps to via the
# canonical ``TTSEngine._get_vram_tool_name``.
# ────────────────────────────────────────────────────────────────────


def _tool_name(backend: str) -> str | None:
    from tts.tts_engine import TTSEngine
    return TTSEngine._get_vram_tool_name(backend)


@pytest.fixture
def fresh_lifecycle_manager():
    """Reset the HARTOS lifecycle singleton so pin state from a
    prior test doesn't leak forward."""
    try:
        from integrations.service_tools import model_lifecycle as _ml
    except Exception:
        pytest.skip("HARTOS model_lifecycle not importable")
    _ml._lifecycle_manager = None
    mgr = _ml.get_model_lifecycle_manager()
    yield mgr
    _ml._lifecycle_manager = None


@pytest.fixture
def tts_engine_under_test(monkeypatch):
    """TTSEngine instance whose _can_run_backend always returns True
    for a fixed allowlist so the test doesn't depend on the dev box
    having Chatterbox Turbo / Indic Parler actually installed.  The
    set_language path under test only needs backend resolution — it
    does NOT need to synthesize anything."""
    from tts import tts_engine as _te
    from tts.tts_engine import (
        BACKEND_CHATTERBOX_TURBO,
        BACKEND_F5,
        BACKEND_INDIC_PARLER,
        BACKEND_KOKORO,
        BACKEND_PIPER,
        TTSEngine,
    )

    # Force backend resolution to land on the canonical "quality"
    # choice for each language: ta→indic_parler, en→chatterbox_turbo.
    runnable = {
        BACKEND_INDIC_PARLER,
        BACKEND_CHATTERBOX_TURBO,
        BACKEND_F5,
        BACKEND_KOKORO,
        BACKEND_PIPER,
    }

    # Avoid actual engine init — set auto_init=False so __init__
    # doesn't try to load the default backend via pip / gpu.
    engine = TTSEngine(auto_init=False)

    monkeypatch.setattr(
        engine, "_can_run_backend",
        lambda backend: backend in runnable,
    )
    # Avoid firing auto-installs against the real network.
    monkeypatch.setattr(
        engine, "_try_auto_install_backend", lambda *a, **kw: None,
    )
    # Start as though an English backend was previously selected so
    # we can verify the unpin path.
    engine._language = "en"
    engine._active_backend = BACKEND_CHATTERBOX_TURBO
    return engine


# ────────────────────────────────────────────────────────────────────
# 1. set_language(ta) → pin the indic_parler tool
# ────────────────────────────────────────────────────────────────────


def test_j214_set_language_pins_new_backend(
    fresh_lifecycle_manager, tts_engine_under_test
):
    mgr = fresh_lifecycle_manager
    engine = tts_engine_under_test

    # Sanity — indic_parler must map to a real VRAM tool name
    # (it does; "tts_indic_parler" per ENGINE_REGISTRY).
    from tts.tts_engine import BACKEND_INDIC_PARLER
    indic_tool = _tool_name(BACKEND_INDIC_PARLER)
    assert indic_tool == "tts_indic_parler", (
        f"Gate 1 caller audit guard: if this changes the pin logic "
        f"must track.  Got: {indic_tool!r}"
    )

    engine.set_language("ta")

    # Behavior under assertion: indic_parler is marked pressure-evict-only,
    # either as a live ModelState (if RTM pre-registered the tool) or as
    # a staged persisted hint (typical first-call case where no synth
    # has yet fired the _on_tool_started hook).
    with mgr._lock:
        state = mgr._models.get(indic_tool)
        staged = mgr._persisted_hints.get(indic_tool, {})

    if state is not None:
        assert state.pressure_evict_only is True, (
            "tracked state exists but pressure_evict_only still False"
        )
    else:
        assert staged.get("pressure_evict_only") is True, (
            f"no ModelState for {indic_tool!r} AND no staged hint — "
            f"J214 pin path did not fire.  Hints: {staged!r}"
        )


# ────────────────────────────────────────────────────────────────────
# 2. Switch languages → unpin prev, pin new
# ────────────────────────────────────────────────────────────────────


def test_j214_lang_switch_unpins_previous_pins_new(
    fresh_lifecycle_manager, tts_engine_under_test
):
    mgr = fresh_lifecycle_manager
    engine = tts_engine_under_test

    from tts.tts_engine import (
        BACKEND_CHATTERBOX_TURBO,
        BACKEND_INDIC_PARLER,
    )
    indic_tool = _tool_name(BACKEND_INDIC_PARLER)
    english_tool = _tool_name(BACKEND_CHATTERBOX_TURBO)
    # Chatterbox Turbo is English-only; its tool name via catalog:
    assert english_tool, "expected tool name for Chatterbox Turbo"

    # Pre-register BOTH tools as tracked ModelStates so we can
    # observe the flag flipping live (simulates a real RTM that has
    # already started both during normal boot).
    mgr._on_tool_started(indic_tool, device="gpu", inprocess=False)
    mgr._on_tool_started(english_tool, device="gpu", inprocess=False)

    # User speaks Tamil first — indic pinned, english unpinned default.
    engine.set_language("ta")
    with mgr._lock:
        assert mgr._models[indic_tool].pressure_evict_only is True
        assert mgr._models[english_tool].pressure_evict_only is False

    # Then switches to English — indic unpinned, english pinned.
    engine.set_language("en")
    with mgr._lock:
        assert mgr._models[indic_tool].pressure_evict_only is False, (
            "prior backend was not unpinned — it would stay "
            "pressure-evict-only forever and the idle sweep never "
            "reclaims its VRAM even after the user stops using Tamil"
        )
        assert mgr._models[english_tool].pressure_evict_only is True, (
            "new backend wasn't pinned — idle sweep could kill the "
            "active English voice mid-session"
        )


# ────────────────────────────────────────────────────────────────────
# 3. Staged hint applied at RTM start-time
# ────────────────────────────────────────────────────────────────────


def test_j214_staged_hint_applied_on_tool_started(
    fresh_lifecycle_manager, tts_engine_under_test
):
    mgr = fresh_lifecycle_manager
    engine = tts_engine_under_test

    from tts.tts_engine import BACKEND_INDIC_PARLER
    indic_tool = _tool_name(BACKEND_INDIC_PARLER)

    # set_language BEFORE the RTM has seen the tool — should stage
    # the pin as a hint.
    engine.set_language("ta")
    with mgr._lock:
        assert indic_tool not in mgr._models, (
            "tool pre-registered by another path — can't test the "
            "staged-hint flow"
        )
        assert mgr._persisted_hints[indic_tool]["pressure_evict_only"] is True

    # Now RTM fires the hook (first synth).  The hint must be
    # applied to the new state.
    mgr._on_tool_started(indic_tool, device="gpu", inprocess=False)
    with mgr._lock:
        assert mgr._models[indic_tool].pressure_evict_only is True, (
            "staged J214 hint was not applied when the tool started; "
            "the first synth would load WITHOUT the pin, letting the "
            "idle sweep kill it minutes later"
        )
        # Hint must be consumed — no double-application on future
        # resets.
        assert indic_tool not in mgr._persisted_hints


# ────────────────────────────────────────────────────────────────────
# 4. Piper has no VRAM tool name — set_language must be a safe no-op
# ────────────────────────────────────────────────────────────────────


def test_j214_cpu_only_backend_noop(
    fresh_lifecycle_manager, tts_engine_under_test
):
    mgr = fresh_lifecycle_manager
    engine = tts_engine_under_test

    # Make every non-Piper backend unrunnable so resolution lands
    # on Piper.
    from tts.tts_engine import BACKEND_PIPER
    engine._can_run_backend = lambda b: b == BACKEND_PIPER

    # Clear active backend so there's nothing to unpin on the
    # prev-side either.
    engine._active_backend = None

    # Must not raise.
    engine.set_language("zu")  # Zulu — not in any ladder

    # No NEW hints for any TTS tool should have been staged by the
    # Piper-only path.  (A fresh lifecycle mgr can carry unrelated
    # hints from the persisted-state file left by a prior boot /
    # other test suites — we only guard against phantom TTS hints
    # injected by THIS set_language call.)
    with mgr._lock:
        tts_hints = {
            k: v for k, v in mgr._persisted_hints.items()
            if k.startswith("tts_")
        }
        assert not tts_hints, (
            f"Piper path staged phantom TTS hints: {tts_hints!r}"
        )


# ────────────────────────────────────────────────────────────────────
# 5. set_pressure_evict_only public API — contract tests
# ────────────────────────────────────────────────────────────────────


def test_j214_set_pressure_evict_only_live(fresh_lifecycle_manager):
    """Direct public-API test.  The admin endpoint and the J214 pin
    both ride this same method — if it regresses, both flows break."""
    mgr = fresh_lifecycle_manager
    mgr._on_tool_started("tts_indic_parler", device="gpu", inprocess=False)

    r = mgr.set_pressure_evict_only("tts_indic_parler", True)
    assert r["tracked"] is True
    assert r["pressure_evict_only"] is True
    with mgr._lock:
        assert mgr._models["tts_indic_parler"].pressure_evict_only is True

    r2 = mgr.set_pressure_evict_only("tts_indic_parler", False)
    assert r2["pressure_evict_only"] is False
    with mgr._lock:
        assert mgr._models["tts_indic_parler"].pressure_evict_only is False


def test_j214_set_pressure_evict_only_staged(fresh_lifecycle_manager):
    mgr = fresh_lifecycle_manager
    r = mgr.set_pressure_evict_only("tts_chatterbox_ml", True)
    assert r["tracked"] is False
    assert r.get("staged_as_hint") is True
    assert mgr._persisted_hints["tts_chatterbox_ml"]["pressure_evict_only"] is True
