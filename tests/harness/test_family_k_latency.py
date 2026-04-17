"""Family K — latency / resource-budget assertions.

CLAUDE.md declares budgets:
    chat hot-path  <= 1500 ms
    draft response <=  300 ms
    cache hit      <=    1 ms
    warmup         <=   60 s  (first boot)

Pure-unit tests check that latency MEASUREMENT exists in the hot
path. Runtime latency enforcement against a live instance lives in
the `live` tier.
"""

from __future__ import annotations

import re

import pytest

pytestmark = pytest.mark.unit


def test_k1_chat_endpoint_measures_latency(project_root, source_text):
    """FAILS if no chat handler records request-start → response-end.

    Without a timer, a regression that crosses the 1.5s budget is
    invisible. Must find `time.monotonic()` or equivalent bracketing
    the chat inference call.
    """
    candidates = [
        project_root / "main.py",
        project_root / "routes" / "chatbot_routes.py",
    ]
    found_timer = False
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        if "time.monotonic" in src and ("chat" in src.lower() or "/chat" in src):
            if re.search(r"time\.monotonic\(\).*?(chat|prompt|response|complete)", src, re.DOTALL):
                found_timer = True
                break
    assert found_timer, (
        "chat handler has no latency measurement (time.monotonic bracketing "
        "the LLM call); regressions past the 1.5s hot-path budget are invisible"
    )


def test_k2_draft_dispatcher_tracks_latency(project_root, source_text):
    """FAILS if draft dispatcher doesn't record elapsed time per turn.
    300ms budget is in the design doc; without tracking, silent drift
    to 1s+ goes unnoticed.
    """
    candidates = list((project_root.parent / "HARTOS").rglob("*dispatcher*.py")) if (project_root.parent / "HARTOS").exists() else []
    candidates += [project_root / "llama" / "llama_config.py"]
    has_timing = False
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        if ("draft" in src.lower() and "time.monotonic" in src) or "draft_latency" in src:
            has_timing = True
            break
    assert has_timing, (
        "draft dispatcher doesn't record elapsed time per turn; "
        "the 300ms budget is untracked"
    )


def test_k3_presynth_cache_has_O1_lookup(project_root, source_text):
    """FAILS if pre-synth cache is a list-scan instead of dict/set.
    The <1ms budget is only achievable with O(1) lookup.
    """
    candidates = list((project_root / "tts").rglob("presynth*.py")) + \
                 [project_root / "tts" / "tts_engine.py"]
    has_o1 = False
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        if "_presynth" in src and ("{" in src or "dict(" in src or "lru_cache" in src):
            # Check the presynth get() uses dict lookup not list comp
            if re.search(r"_presynth\s*=\s*\{", src) or \
               re.search(r"class\s+\w*PreSynth[^:]*:.*?self\.\w+\s*=\s*\{", src, re.DOTALL):
                has_o1 = True
                break
    assert has_o1, (
        "pre-synth cache lookup may not be O(1); <1ms budget at risk"
    )


def test_k4_warmup_has_timeout(project_root, source_text):
    """FAILS if the TTS warmup thread has no deadline — a hung probe
    can silently block first-message synth forever.
    """
    src = source_text(project_root / "main.py")
    idx = src.find("_warmup_tts")
    assert idx > 0, "_warmup_tts not found in main.py"
    block = src[idx:idx + 6000]
    has_timeout = (
        "timeout=" in block
        or "join(timeout" in block
        or "WARMUP_TIMEOUT" in block
    )
    assert has_timeout, (
        "_warmup_tts has no timeout; a stalled probe can prevent first "
        "synth from ever happening"
    )


def test_k5_verify_backend_synth_has_default_timeout(project_root, source_text):
    """Regression guard — the verifier MUST keep its timeout. Removing
    it would reintroduce the hung-test class of bug one level up.
    """
    src = source_text(project_root / "tts" / "verified_ready.py")
    assert "timeout_s: int = " in src or "timeout_s:int=" in src.replace(" ", ""), (
        "verify_backend_synth default timeout removed — hang surface "
        "reopens, user sees stuck Ready card"
    )


def test_k6_startup_trace_records_elapsed_time(project_root, source_text):
    """FAILS if the startup tracer isn't emitting elapsed seconds per
    phase; cold-boot regressions invisible without per-phase budgets.
    """
    src = source_text(project_root / "app.py")
    has_elapsed = "elapsed = " in src and "startup_t0" in src
    assert has_elapsed, (
        "startup_trace.log doesn't emit per-line elapsed seconds; "
        "cold-boot regressions invisible"
    )
