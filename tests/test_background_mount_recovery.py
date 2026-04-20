"""Static AST + source checks that guard the taskbar-restore mount recovery fix.

Bug context
-----------
When Nunba's main window was restored from the Windows TASKBAR (click
taskbar button after minimize), WebView2 stayed paint-dead because pywebview
does NOT fire its ``shown`` event on native Windows SW_RESTORE — that event
only fires when ``.show()`` is called from Python. Tray "Show" went through
``window.show()`` + ``window.restore()`` and so triggered the existing
``_ensure_react_mounted`` recovery path; taskbar clicks did not.

The fix (in app.py) extracts the mount-recovery body into a reusable closure
``_force_remount_and_paint`` and adds a Windows-only watchdog thread that
polls ``IsIconic`` / ``IsWindowVisible`` and invokes the same closure on
iconic→non-iconic transitions.

These tests are STATIC (AST + source grep) so they run in any environment
without touching pywebview / WebView2. They guard against regression of the
three load-bearing properties of the fix:

1. Gate 4 (no parallel paths) — ``_force_remount_and_paint`` is defined
   exactly once in app.py.
2. Gate 2 (stricter mount check) — the mount-state JS contains BOTH
   ``children.length`` AND ``getBoundingClientRect`` so paint-dead states
   (root has children but renders at 0 height) are detected, not
   false-positived as "mounted".
3. Gate 7 (Windows-gated watchdog) — a daemon thread literally named
   ``taskbar-restore-watchdog`` is started inside a ``sys.platform ==
   'win32'`` branch in app.py.
"""
from __future__ import annotations

import ast
import os
import re

import pytest

APP_PY = os.path.abspath(
    os.path.join(os.path.dirname(__file__), os.pardir, 'app.py')
)


# ─────────────────────────────────────────────────────────────────────────
# Shared fixtures — parsed once per session for speed
# ─────────────────────────────────────────────────────────────────────────

@pytest.fixture(scope='module')
def app_source() -> str:
    with open(APP_PY, encoding='utf-8') as fh:
        return fh.read()


@pytest.fixture(scope='module')
def app_ast(app_source: str) -> ast.AST:
    return ast.parse(app_source, filename=APP_PY)


def _all_function_names(tree: ast.AST) -> list[str]:
    """Return names of every FunctionDef / AsyncFunctionDef in the tree
    (including nested closures)."""
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            names.append(node.name)
    return names


def _all_string_constants(tree: ast.AST) -> list[str]:
    """Return every string literal (ast.Constant of str) in the tree.
    We concatenate multi-line string literals implicitly because each
    ast.Constant captures one logical string per node."""
    out: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            out.append(node.value)
    return out


# ─────────────────────────────────────────────────────────────────────────
# Test 1 — Gate 4: _force_remount_and_paint defined exactly once
# ─────────────────────────────────────────────────────────────────────────

def test_force_remount_and_paint_defined_exactly_once(app_ast: ast.AST) -> None:
    """No parallel paths: the recovery body must live in ONE function."""
    names = _all_function_names(app_ast)
    count = names.count('_force_remount_and_paint')
    assert count == 1, (
        f"Expected exactly 1 definition of _force_remount_and_paint in "
        f"app.py (found {count}). Parallel recovery paths drift — Gate 4."
    )


def test_force_remount_and_paint_is_invoked(app_source: str) -> None:
    """The extracted helper must actually be called — otherwise the
    refactor is dead code."""
    # Either direct call or thread target.
    direct = re.search(r'\b_force_remount_and_paint\s*\(', app_source)
    as_target = re.search(
        r'target\s*=\s*_force_remount_and_paint', app_source
    )
    assert direct or as_target, (
        "_force_remount_and_paint is defined but never invoked — "
        "the mount-recovery path is dead."
    )


# ─────────────────────────────────────────────────────────────────────────
# Test 2 — Gate 2: stricter paint-dead mount check
# ─────────────────────────────────────────────────────────────────────────

def test_mount_check_js_uses_both_children_and_bounding_rect(
    app_ast: ast.AST,
) -> None:
    """The mount-check JS must inspect BOTH ``children.length`` AND
    ``getBoundingClientRect`` so a paint-dead state (root has children
    but height==0) is not a false positive.

    We walk every string constant in app.py. At least one string must
    contain both substrings — that's the paint-dead-aware check."""
    strings = _all_string_constants(app_ast)
    joined_has_both = [
        s for s in strings
        if 'children.length' in s and 'getBoundingClientRect' in s
    ]
    assert joined_has_both, (
        "No single string constant in app.py combines 'children.length' "
        "and 'getBoundingClientRect'. The stricter paint-dead check "
        "required by Gate 2 is missing."
    )


def test_paint_dead_state_literal_present(app_source: str) -> None:
    """When the stricter check detects children but zero height, it
    returns the string 'paint_dead' so the caller can treat it as a
    failure (reload path). Assert the literal appears in source."""
    assert "'paint_dead'" in app_source or '"paint_dead"' in app_source, (
        "The 'paint_dead' state literal is missing from app.py — the "
        "stricter mount check cannot signal the paint-dead condition."
    )


# ─────────────────────────────────────────────────────────────────────────
# Test 3 — Gate 7: Windows-only watchdog thread
# ─────────────────────────────────────────────────────────────────────────

def test_taskbar_restore_watchdog_thread_name_present(
    app_source: str,
) -> None:
    """The daemon thread must be literally named 'taskbar-restore-watchdog'
    so operators can find it in thread dumps."""
    assert 'taskbar-restore-watchdog' in app_source, (
        "Thread name literal 'taskbar-restore-watchdog' is missing — "
        "the watchdog cannot be identified in thread dumps."
    )


def _find_all(src: str, needle: str) -> list[int]:
    """Return all offsets where `needle` appears in `src`."""
    out: list[int] = []
    start = 0
    while True:
        i = src.find(needle, start)
        if i < 0:
            break
        out.append(i)
        start = i + 1
    return out


def test_taskbar_restore_watchdog_is_started_on_windows(
    app_source: str,
) -> None:
    """Grep-style assertion: the literal 'taskbar-restore-watchdog' must
    appear as a ``name=`` kwarg to a ``Thread(target=...)`` construction
    that is followed by ``.start()``, AND the whole block must live inside
    a ``sys.platform == 'win32'`` guard (Gate 7).

    The literal may legitimately appear in surrounding comments too, so
    we scan every occurrence and require AT LEAST ONE to satisfy the
    Thread(target=…) + .start() + win32 guard conditions together."""
    occurrences = _find_all(app_source, 'taskbar-restore-watchdog')
    assert occurrences, (
        "Thread name literal 'taskbar-restore-watchdog' missing."
    )

    any_match = False
    for idx in occurrences:
        # Check Thread(target=… within ~600 chars before this occurrence.
        pre = app_source[max(0, idx - 600):idx + 100]
        if not re.search(r'Thread\s*\(\s*\n?\s*target\s*=', pre):
            continue

        # Check .start() within ~500 chars after this occurrence.
        post = app_source[idx:idx + 500]
        if '.start()' not in post:
            continue

        # Check sys.platform == 'win32' guard within ~6000 chars before
        # (the watchdog's inner closure body is ~4k chars on its own, so
        # the guard-to-literal distance is several thousand chars).
        guard_pre = app_source[max(0, idx - 6000):idx]
        has_guard = (
            "sys.platform == 'win32'" in guard_pre
            or 'sys.platform == "win32"' in guard_pre
        )
        if not has_guard:
            continue

        any_match = True
        break

    assert any_match, (
        "No occurrence of 'taskbar-restore-watchdog' satisfies all three "
        "conditions together: Thread(target=…) within 600 chars before, "
        ".start() within 500 chars after, sys.platform == 'win32' guard "
        "within 2500 chars before. Watchdog wiring or platform gate is "
        "incorrect (Gate 4 / Gate 7)."
    )


def test_watchdog_uses_isiconic_or_iswindowvisible(
    app_source: str,
) -> None:
    """The watchdog detects taskbar restore by polling native Win32 API
    (IsIconic + IsWindowVisible). Assert at least IsIconic is referenced
    (the critical one — iconic→non-iconic transition signals restore)."""
    assert 'IsIconic' in app_source, (
        "IsIconic Win32 API call missing — the watchdog cannot detect "
        "iconic→non-iconic (minimize→restore) transitions."
    )
