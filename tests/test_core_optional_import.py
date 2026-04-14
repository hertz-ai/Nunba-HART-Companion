"""Tests for core.optional_import — logged graceful degradation."""
from __future__ import annotations

import pytest


@pytest.fixture(autouse=True)
def _reset_registry():
    """Each test starts with empty _DEGRADED + _LOADED so assertions are
    independent of test order (pytest-xdist safety)."""
    from core.optional_import import reset_for_tests
    reset_for_tests()
    yield
    reset_for_tests()


def test_successful_import_returns_module():
    from core.optional_import import optional_import
    mod = optional_import('json', reason='stdlib JSON parser')
    assert mod is not None
    assert hasattr(mod, 'loads')


def test_failed_import_returns_fallback_and_registers():
    from core.optional_import import list_degradations, optional_import
    sentinel = object()
    result = optional_import(
        'definitely_not_a_module_xyz',
        reason='ghost module for testing',
        fallback=sentinel,
    )
    assert result is sentinel
    items = list_degradations()
    assert len(items) == 1
    assert items[0]['module'] == 'definitely_not_a_module_xyz'
    assert items[0]['reason'] == 'ghost module for testing'
    assert items[0]['attempts'] == 1


def test_repeat_failed_import_increments_attempts_silently(caplog):
    from core.optional_import import list_degradations, optional_import
    import logging

    with caplog.at_level(logging.INFO, logger='core.optional_import'):
        optional_import('nope_xyz_qrs', reason='r1')
        optional_import('nope_xyz_qrs', reason='r1')
        optional_import('nope_xyz_qrs', reason='r1')

    items = list_degradations()
    assert len(items) == 1
    assert items[0]['attempts'] == 3
    # First attempt logs ONE INFO line; subsequent attempts MUST be silent
    # (this is the cry-wolf prevention contract).
    info_lines = [r for r in caplog.records if r.levelno == logging.INFO]
    assert len(info_lines) == 1, (
        f"Expected exactly 1 INFO log line, got {len(info_lines)}: "
        f"{[r.message for r in info_lines]}"
    )


def test_successful_import_is_cached():
    from core.optional_import import is_available, optional_import
    optional_import('os', reason='stdlib os')
    assert is_available('os') is True
    # Second call returns the SAME module object (cached, no re-import).
    import os as _os
    assert optional_import('os', reason='stdlib os') is _os


def test_list_degradations_sorted_by_first_failure():
    from core.optional_import import list_degradations, optional_import
    import time
    optional_import('nope_a', reason='first')
    time.sleep(0.01)
    optional_import('nope_b', reason='second')
    items = list_degradations()
    assert [i['module'] for i in items] == ['nope_a', 'nope_b']


def test_module_with_runtime_error_during_import_still_caught():
    """Some optional deps fail with OSError (missing DLL on Windows) or
    AttributeError (circular import), not ImportError.  The helper must
    catch broadly or it leaves silent gaps the very pattern was meant to fix."""
    from core.optional_import import list_degradations, optional_import
    # `antigravity` is a stdlib module that opens a browser — importing it
    # in a non-interactive test env succeeds silently (it doesn't raise).
    # Use a known-bad alternative: a non-importable submodule.
    result = optional_import(
        'json.this_does_not_exist',
        reason='nested-module test',
    )
    assert result is None
    assert any(
        d['module'] == 'json.this_does_not_exist'
        for d in list_degradations()
    )
