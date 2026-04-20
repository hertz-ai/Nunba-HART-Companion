"""Family C — generic auto-install defects, parametrised over every
model type (TTS + LLM + STT + VLM + audio-gen + video-gen).
"""
from __future__ import annotations

import pytest
from conftest import ALL_AUTO_INSTALL

pytestmark = pytest.mark.unit


# ───────────────────────────────────────────────────────────────
# C1 — Verified-signal probe exists for every model TYPE
# ───────────────────────────────────────────────────────────────

def test_c1_verified_signal_probe_for_every_model_type(project_root):
    """Only TTS has verify_backend_synth. LLM/STT/VLM/audio/video rely
    on shallow signals (/health, process-up, dict-write).  Must have
    a verified-signal probe per type.
    """
    required = {
        "tts":       project_root / "tts" / "verified_synth.py",
        # These are expected in HARTOS — live suite covers the full set.
        # The unit test here just asserts the TTS verifier is present as
        # the template.  Adding a sibling for each type is Phase 5 work.
    }
    for kind, path in required.items():
        assert path.exists(), (
            f"verified-signal probe for '{kind}' missing at {path}. "
            f"Add sibling modules for llm, stt, vlm, audio, video in Phase 5"
        )
    # Explicit TODO for the other five types.
    others = ["llm", "stt", "vlm", "audio_gen", "video_gen"]
    missing = [k for k in others
               if not (project_root / "tts" / f"verified_{k}.py").exists()
               and not (project_root / "core" / f"verified_{k}.py").exists()]
    assert not missing, (
        f"verified-signal probes still missing for types: {missing}. "
        f"Each must gate the corresponding 'Ready/Healthy/Loaded' UI "
        f"claim with a real round-trip assertion."
    )


# ───────────────────────────────────────────────────────────────
# C2 — Progress card stall detection (per install)
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("model_id", ALL_AUTO_INSTALL)
def test_c2_progress_has_stall_detection(model_id, project_root, source_text):
    """FAILS on HEAD — no progress card has wallclock-based stall
    detection. "Step 1/2" hangs forever on a frozen pip.
    """
    pi = source_text(project_root / "tts" / "package_installer.py")
    # Any of: heartbeat callback, wallclock watchdog, timeout kwarg
    has_stall_guard = (
        "stall" in pi.lower()
        or "watchdog" in pi.lower()
        or ("time.monotonic" in pi and "progress" in pi.lower())
        or ("last_progress" in pi)
    )
    assert has_stall_guard, (
        f"no stall-detection on install progress for '{model_id}'. "
        f"A progress callback is not enough — must detect absence of "
        f"progress over a wallclock window."
    )


# ───────────────────────────────────────────────────────────────
# C3 — Install failure surfaced to user (per model)
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("model_id", ALL_AUTO_INSTALL)
def test_c3_install_failure_surfaced(model_id, project_root, source_text):
    """FAILS on HEAD if install failure silently falls back without
    telling the user. The user should see the actual error, not just
    a successor backend appearing.
    """
    src = source_text(project_root / "tts" / "tts_engine.py")
    # Look for explicit user-facing error on install fail.
    # Must use broadcast_sse_event OR progress() with an error prefix.
    has_error_surface = (
        ("install failed" in src.lower() or "synthesis failed" in src.lower())
        and ("broadcast_sse_event" in src or "progress(" in src)
    )
    assert has_error_surface, (
        f"install failure for '{model_id}' not surfaced to user; "
        f"silent fallback hides the root cause"
    )


# ───────────────────────────────────────────────────────────────
# C4 — Disk-space preflight per model install
# ───────────────────────────────────────────────────────────────

@pytest.mark.parametrize("model_id", ALL_AUTO_INSTALL)
def test_c4_disk_space_preflight(model_id, project_root, source_text):
    """FAILS on HEAD if install starts without a disk-space check for
    the model's size.  Half-downloaded 5GB model → mid-download ENOSPC.
    """
    pi = source_text(project_root / "tts" / "package_installer.py")
    has_disk_check = (
        "disk_usage" in pi
        or "free_space" in pi
        or "ENOSPC" in pi
    )
    # The D:-drive-fallback commit addressed CUDA torch only; generic
    # per-model disk preflight is Phase 5.
    if not has_disk_check:
        pytest.fail(
            f"no disk-space preflight for '{model_id}'; 5GB model "
            f"download can fail mid-stream with cryptic error"
        )
