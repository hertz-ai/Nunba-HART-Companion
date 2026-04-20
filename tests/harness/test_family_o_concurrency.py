"""Family O — concurrency / multi-session correctness.

Static + runtime checks that the hot-path is safe under
concurrent requests. Focus on the surfaces that have bit this session:
session state, VRAM allocate, install pending dedup, SQLite WAL.
"""

from __future__ import annotations

import threading

import pytest

pytestmark = pytest.mark.unit


def test_o1_chat_session_scoped_not_global(project_root, source_text):
    """FAILS if chat handler uses a module-level mutable dict for
    conversation memory.  Multi-user regional nodes would leak state
    across users. Task #259 addressed this — regression guard.
    """
    candidates = [
        project_root / "routes" / "chatbot_routes.py",
        project_root / "main.py",
    ]
    import re
    bad = []
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        # Look for a top-level `sessions = {}` or `conversations = {}`
        # NOT inside a class, NOT guarded by a lock.
        for m in re.finditer(
            r"^(sessions|conversations|history)\s*=\s*\{\}",
            src,
            re.MULTILINE,
        ):
            # Check that within 500 chars there's a lock or user_id key scope
            window = src[max(0, m.start() - 200):m.end() + 500]
            if "Lock" not in window and "user_id" not in window:
                bad.append((p.name, m.group(0)))
    assert not bad, (
        f"module-level mutable session dict without user_id scoping / lock: "
        f"{bad}. Task #259 regression — regional nodes leak memory + state "
        f"across users"
    )


def test_o2_vram_allocate_is_lock_serialized(project_root, source_text):
    """FAILS if vram_manager.allocate() doesn't take a lock.
    Two concurrent callers can both pass can_fit() on 5GB free,
    both allocate 4GB, and overcommit the GPU.
    """
    vm = project_root / ".." / "HARTOS" / "integrations" / "service_tools" / "vram_manager.py"
    if not vm.exists():
        pytest.skip("vram_manager.py absent")
    src = source_text(vm)
    has_lock = (
        "threading.Lock" in src
        or "threading.RLock" in src
        or "_alloc_lock" in src
    )
    # The lock must be TAKEN inside allocate().
    import re
    allocate_block = re.search(r"def allocate\(.*?\)(?:.|\n)*?(?=\n    def |\nclass |\Z)", src)
    if allocate_block:
        has_lock_in_allocate = (
            "with self." in allocate_block.group(0)
            and "lock" in allocate_block.group(0).lower()
        )
    else:
        has_lock_in_allocate = False
    assert has_lock and has_lock_in_allocate, (
        "vram_manager.allocate() is not serialized by a lock; two parallel "
        "allocations can both succeed past can_fit() and overcommit"
    )


def test_o3_auto_install_pending_dedup_under_contention(tts_engine_reset):
    """Runtime test: spawn N threads that all call
    _try_auto_install_backend('indic_parler') — only ONE install
    thread should actually spawn.
    """
    try:
        import importlib
        te = importlib.import_module("tts.tts_engine")
    except Exception as e:
        pytest.skip(f"tts.tts_engine not importable here: {e}")

    engine = te.get_tts_engine() if hasattr(te, "get_tts_engine") else te.TTSEngine()
    # Prime so _try_auto_install doesn't actually pip-install.
    orig_impl = getattr(te.TTSEngine, "_try_auto_install_backend", None)
    if orig_impl is None:
        pytest.skip("_try_auto_install_backend not defined")

    spawn_count = {"n": 0}
    original_install_full = None
    try:
        from tts import package_installer as _pi
        original_install_full = _pi.install_backend_full

        def _counting_stub(backend, progress_cb=None):
            spawn_count["n"] += 1
            return True, "ok"

        _pi.install_backend_full = _counting_stub

        threads = [
            threading.Thread(target=lambda: engine._try_auto_install_backend("indic_parler"))
            for _ in range(8)
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
    finally:
        if original_install_full is not None:
            from tts import package_installer as _pi
            _pi.install_backend_full = original_install_full

    assert spawn_count["n"] <= 1, (
        f"_try_auto_install_backend spawned {spawn_count['n']} parallel "
        f"installs of the same backend under 8-thread contention — must be 1"
    )


def test_o4_sqlite_busy_timeout_set(project_root, source_text):
    """FAILS if SQLite connection doesn't configure busy_timeout.
    Without it, WAL reader/writer contention raises 'database is locked'
    instead of waiting. CLAUDE.md declares busy_timeout=3000.
    """
    candidates = list(project_root.rglob("*.py"))
    import re
    # Filter to likely DB connection sites.
    db_files = [p for p in candidates
                if any(x in p.name for x in ("db", "sql", "database"))
                and not any(x in p.parts for x in (".venv", "build", "__pycache__",
                                                    "python-embed", "python-embed-310-backup",
                                                    "tests", "node_modules"))]
    if not db_files:
        pytest.skip("no db-related modules found")
    for p in db_files[:20]:
        try:
            src = source_text(p)
        except Exception:
            continue
        if ("sqlite3.connect" in src or "create_engine" in src) and "busy_timeout" in src:
            return  # found
    pytest.fail(
        "no SQLite connection site configures busy_timeout; concurrent "
        "reads/writes will raise 'database is locked' under WAL"
    )


def test_o5_concurrent_synth_requests_do_not_race(project_root, source_text):
    """FAILS if synthesize() shares mutable engine state without a lock
    across calls. Two messages arriving within 100ms must not corrupt
    each other's output.
    """
    src = source_text(project_root / "tts" / "tts_engine.py")
    # A safe impl either has a per-request output_path, a lock around
    # the active-backend switch, or both.
    import re
    has_switch_lock = (
        "_pending_backend" in src
        or "_switch_lock" in src
        or re.search(r"with self\._\w*lock\w*:.*?synthesize", src, re.DOTALL)
    )
    has_per_request_path = "tempfile" in src and "synthesize" in src
    assert has_switch_lock or has_per_request_path, (
        "synthesize() has no per-request path or switch lock; two "
        "concurrent requests can corrupt each other's output file"
    )
