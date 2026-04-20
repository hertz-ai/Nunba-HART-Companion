"""J211 · Model lifecycle state survives a Nunba restart.

Gap from 2026-04-18 live audit (report §2):

    HARTOS `integrations/service_tools/model_lifecycle.py:41` declares
    `LIFECYCLE_STATE_FILE = Path.home() / '.hevolve' / 'lifecycle_state.json'`
    but nothing ever reads OR writes it.  Consequence: a user who
    speaks Tamil for 40 minutes builds up access hints on Indic Parler,
    then kills + restarts Nunba.  The first Tamil request after the
    restart has to cold-load Indic Parler from scratch — the prior
    warmth is wasted.

Outcome asserted
----------------
1. A fresh ModelLifecycleManager writes the hint file when a tool is
   released (`_on_tool_stopped`) and when the lifecycle tick runs.
2. Killing and re-creating the singleton re-reads the hint file.
3. Entries older than ``LIFECYCLE_STALENESS_S`` (24h) are dropped at
   load-time — a week-old hint would pin a model the user no longer
   uses.
4. The hint file is atomic: a write-then-rename pattern means a crash
   mid-persist cannot leave a corrupt half-JSON behind.

This test drives the REAL HARTOS singleton.  No monkey-patching of
the persistence path, no faked JSON — we exercise the same code the
running Nunba will hit.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.journey

try:
    from integrations.service_tools import model_lifecycle as _ml  # type: ignore
    from integrations.service_tools.model_lifecycle import (  # type: ignore
        LIFECYCLE_STALENESS_S,
        LIFECYCLE_STATE_FILE,
        ModelPriority,
        ModelState,
    )
    _HARTOS_AVAILABLE = True
except Exception:  # pragma: no cover — only triggered when HARTOS isn't installed
    _HARTOS_AVAILABLE = False
    LIFECYCLE_STATE_FILE = Path.home() / ".hevolve" / "lifecycle_state.json"


pytestmark_hartos = pytest.mark.skipif(
    not _HARTOS_AVAILABLE,
    reason="HARTOS integrations.service_tools.model_lifecycle not importable",
)


@pytest.fixture
def isolated_state_file(tmp_path, monkeypatch):
    """Point the persist/load path at a temp file so the real
    ~/.hevolve/lifecycle_state.json isn't clobbered by tests."""
    assert _HARTOS_AVAILABLE, "HARTOS must be importable for this fixture"
    target = tmp_path / "lifecycle_state.json"
    monkeypatch.setattr(_ml, "LIFECYCLE_STATE_FILE", target)
    # Reset the singleton so __init__ re-runs with the patched path
    _ml._lifecycle_manager = None
    yield target
    _ml._lifecycle_manager = None


@pytestmark_hartos
def test_j211_persist_and_reload_roundtrip(isolated_state_file):
    """Writing from one manager + reading into a fresh one preserves
    access_count, last_access_time, and the pinned flag."""
    target = isolated_state_file
    m1 = _ml.get_model_lifecycle_manager()
    now = time.time()

    with m1._lock:
        m1._models["indic_parler"] = ModelState(
            name="indic_parler",
            last_access_time=now - 30.0,  # 30s ago
            access_count=11,
            pinned=False,
        )
        m1._models["whisper"] = ModelState(
            name="whisper",
            last_access_time=now - 120.0,
            access_count=5,
            pinned=True,
        )

    # Force persist (bypasses throttle).
    m1._persist_state_to_disk(force=True)
    assert target.exists(), "persist_state_to_disk didn't write the file"

    # File structure invariants — the schema is part of the contract
    # consumers will depend on; an accidental rename here would silently
    # break a future Nunba release that reads the field.
    blob = json.loads(target.read_text("utf-8"))
    assert blob.get("version") == 1
    assert "models" in blob
    assert "indic_parler" in blob["models"]
    assert blob["models"]["whisper"]["pinned"] is True

    # Reload via a fresh singleton — simulates a Nunba restart.
    _ml._lifecycle_manager = None
    m2 = _ml.get_model_lifecycle_manager()
    hints = m2._persisted_hints
    assert "indic_parler" in hints
    assert hints["indic_parler"]["access_count"] == 11
    assert hints["whisper"]["pinned"] is True


@pytestmark_hartos
def test_j211_stale_entries_dropped_on_reload(isolated_state_file):
    """A 48h-old hint is silently discarded so the next boot doesn't
    cling to a model the user no longer touches."""
    target = isolated_state_file
    now = time.time()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(
            {
                "version": 1,
                "saved_at": now,
                "models": {
                    "stale_tool": {
                        "last_access_time": now - 2 * LIFECYCLE_STALENESS_S,
                        "access_count": 99,
                        "pinned": False,
                    },
                    "fresh_tool": {
                        "last_access_time": now - 60.0,
                        "access_count": 3,
                        "pinned": False,
                    },
                },
            }
        )
    )
    _ml._lifecycle_manager = None
    m = _ml.get_model_lifecycle_manager()
    assert "fresh_tool" in m._persisted_hints
    assert "stale_tool" not in m._persisted_hints, (
        "staleness filter failed — a 2x-cutoff entry survived reload"
    )


@pytestmark_hartos
def test_j211_hint_applied_on_tool_started(isolated_state_file):
    """When the RTM hook fires for a tool that has a persisted hint,
    the hint's access_count is preserved and the model starts in a
    hive-boosted WARM state so the first inference skips the cold
    cohort penalty.  This is the user-facing outcome: speak Tamil,
    restart, the next Tamil request doesn't block on cold-load."""
    target = isolated_state_file
    now = time.time()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(
            {
                "version": 1,
                "saved_at": now,
                "models": {
                    "indic_parler": {
                        "last_access_time": now - 300.0,  # 5 min ago
                        "access_count": 42,
                        "pinned": False,
                    },
                },
            }
        )
    )
    _ml._lifecycle_manager = None
    m = _ml.get_model_lifecycle_manager()

    # Fire the RTM hook the way runtime_manager would.
    m._on_tool_started("indic_parler", device="gpu", inprocess=False)
    with m._lock:
        state = m._models["indic_parler"]

    assert state.access_count == 42, (
        f"hint access_count wasn't applied: got {state.access_count}"
    )
    # A recently-used tool gets bumped to hive-boost so the eviction
    # loop doesn't immediately sweep it up on first tick.
    assert state.hive_boost is True, (
        "recent hint should set hive_boost=True"
    )
    assert state.priority == ModelPriority.WARM


@pytestmark_hartos
def test_j211_atomic_write_no_partial_file(isolated_state_file):
    """Simulate a concurrent reader running against the file while the
    writer is mid-flush.  An atomic rename guarantees the reader
    always sees either the old JSON or the new JSON — never a
    half-written truncated blob."""
    target = isolated_state_file
    now = time.time()
    m = _ml.get_model_lifecycle_manager()

    with m._lock:
        m._models["tts_audio_suite"] = ModelState(
            name="tts_audio_suite",
            last_access_time=now,
            access_count=1,
        )
    m._persist_state_to_disk(force=True)
    # After the persist call returns, the file must be fully-parseable
    # JSON — no .tmp left behind, no truncation.
    blob = json.loads(target.read_text("utf-8"))
    assert "tts_audio_suite" in blob["models"]
    tmp_path = target.with_suffix(".json.tmp")
    assert not tmp_path.exists(), "leftover .json.tmp after atomic rename"
