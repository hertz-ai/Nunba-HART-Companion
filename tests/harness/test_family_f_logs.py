"""Family F — log handling.  Every log opened in 'w' mode truncates
across restarts, destroying autostart-crash evidence.
"""
from __future__ import annotations

import re

import pytest

pytestmark = pytest.mark.unit


# Logs that must NEVER be opened in 'w' mode because they carry
# cross-session evidence (crash traces, autostart boot order).
CRITICAL_LOGS = [
    "startup_trace.log",
    "frozen_debug.log",
    "gui_app.log",
    "server.log",
    "langchain.log",
    "acceptance.log",
    "validate.log",
    "caption_server.log",
]


@pytest.mark.parametrize("logname", CRITICAL_LOGS)
def test_f1_critical_log_append_mode(logname, project_root):
    """FAILS for any critical log opened in 'w' (truncate) mode in the
    hot path. Scans Nunba + HARTOS source trees for the pattern.
    """
    bad = []
    # Regex: open(..'logname'.., 'w' OR open(... logname... , 'w'
    pat = re.compile(
        r"open\s*\([^)]*" + re.escape(logname) + r"[^)]*,\s*['\"]w['\"]",
        re.DOTALL,
    )
    # rglob is recursive; for ~1M files (venv+site-packages+backup) it
    # takes minutes.  Exclude EVERY vendored/generated path up front.
    _SKIP = (
        ".venv", "venv", "venv310", "venv311", "venv312",
        "python-embed", "python-embed-310-backup",
        "__pycache__", "build", "node_modules", ".git",
        "site-packages", ".pytest_cache",
    )
    for root in (project_root, project_root.parent / "HARTOS"):
        if not root.exists():
            continue
        for p in root.rglob("*.py"):
            if any(s in p.parts for s in _SKIP):
                continue
            try:
                t = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if pat.search(t):
                bad.append(str(p))
    assert not bad, (
        f"log '{logname}' opened in 'w' mode at: {bad}; each restart "
        f"truncates the prior session's evidence"
    )


def test_f2_run_separator_banner_present(source_app_py, source_text):
    """FAILS if app.py appends a run-separator banner so log readers
    can tell run boundaries.
    """
    src = source_text(source_app_py)
    # Banner must contain a timestamp + PID so readers can distinguish
    # consecutive autostart runs. We already added this for
    # startup_trace.log at app.py:229-235.
    has_banner = (
        "======== " in src and "PID=" in src
    ) or ("session " in src and "isoformat" in src)
    assert has_banner, (
        "no per-run banner emitted to logs; appended runs are "
        "indistinguishable from each other"
    )
