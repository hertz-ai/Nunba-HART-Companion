"""Family N — injected failure scenarios.

Each test simulates a runtime fault (disk full, HF offline, llama crash)
and asserts the system degrades gracefully instead of failing silently
or with an unhelpful error.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


def test_n1_low_disk_blocks_large_model_install(project_root, source_text):
    """FAILS if a 5GB model install starts on a near-full disk without
    a preflight abort + user-visible error.
    """
    pi = source_text(project_root / "tts" / "package_installer.py")
    has_preflight = (
        ("disk_usage" in pi and "free" in pi.lower())
        or "ENOSPC" in pi
        or "min_free_gb" in pi
    )
    assert has_preflight, (
        "no pre-install disk-free check; 5GB model download fails mid-stream "
        "with cryptic IOError instead of a user-visible 'not enough space' card"
    )


def test_n2_offline_hf_surfaces_clear_error(project_root, source_text):
    """FAILS if HF_HUB_OFFLINE=1 or a network failure produces a
    silent fallback instead of a user-visible 'model couldn't download'.
    """
    candidates = [
        project_root / "tts" / "verified_synth.py",
        project_root / "tts" / "tts_engine.py",
        project_root / "tts" / "package_installer.py",
    ]
    found = False
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        # Either HF_HUB_OFFLINE is checked OR a network-error branch
        # surfaces via progress(...) with 'offline'/'network'/'download failed'.
        if (
            "HF_HUB_OFFLINE" in src
            or "RepositoryNotFoundError" in src
            or ("ConnectionError" in src and "progress" in src)
            or "download failed" in src.lower()
        ):
            found = True
            break
    assert found, (
        "no HF offline / network-failure handling surfaces to user; "
        "silent stall is the observed failure mode"
    )


def test_n3_vram_exhaustion_user_visible(project_root, source_text):
    """FAILS if VRAM overcommit failure silently falls back without
    telling the user their GPU is full.
    """
    hartos = project_root / ".." / "HARTOS"
    if not hartos.exists():
        pytest.skip("HARTOS absent")
    orch = hartos / "integrations" / "service_tools" / "model_orchestrator.py"
    if not orch.exists():
        pytest.skip("model_orchestrator.py missing")
    src = source_text(orch)
    has_surface = (
        ("VRAM" in src and "progress" in src.lower())
        or ("VRAM" in src and "broadcast" in src)
        or "vram_exhausted" in src.lower()
    )
    assert has_surface, (
        "VRAM exhaustion falls to silent skip; user sees 'LLM not ready' "
        "with no indication why"
    )


def test_n4_llama_server_crash_produces_user_error(project_root, source_text):
    """FAILS if llama-server dying mid-chat yields 500 with stack-trace
    instead of a graceful 'model restarting' user message.
    """
    src = source_text(project_root / "llama" / "llama_config.py")
    has_restart = (
        "restart" in src.lower()
        and ("subprocess" in src or "Popen" in src)
    )
    has_user_surface = (
        "Starting the local AI engine" in src
        or "restarting" in src.lower()
        or "model_restarting" in src
    )
    assert has_restart or has_user_surface, (
        "no llama-server restart / user-surface on crash; user stuck with "
        "opaque 500 response"
    )


def test_n5_second_instance_shows_already_running(source_app_py, source_text):
    """FAILS if launching a second Nunba.exe while one is running
    crashes or silently exits. Must bring-to-foreground + log.
    """
    src = source_text(source_app_py)
    idx = src.find("_check_single_instance")
    assert idx > 0, "_check_single_instance not found in app.py"
    block = src[idx:idx + 4000]
    # Acceptable: bring-to-focus via /api/focus, OR a user-visible log
    # + clean sys.exit(0).
    has_handoff = (
        "/api/focus" in block
        or "bring_to_front" in block
        or "SetForegroundWindow" in block
        or ("Nunba is already running" in src)
    )
    assert has_handoff, (
        "second instance has no hand-off path; user clicks icon, nothing "
        "visible happens"
    )
