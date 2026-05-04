"""Regression for #102 — TTS probe failures must reach the agent
self-heal pipeline.

Background: 2026-05-04 audit confirmed only TWO production sites
called handle_exception() (gpu_worker.py:501 + package_installer.py:1001).
Every TTS probe failure (chatterbox CUDA crash, f5_tts argparse exit,
indic_parler missing transitive, kokoro/melo missing primary) wrote
to the per-backend .err sidecar and stopped — the agent never saw it.

Fix: tts/verified_synth.py::_surface_backend_exception now ALSO
dispatches handle_exception(category='tts.probe', agent_remediation=True)
so a self_heal AgentGoal lands in the queue.  Best-effort: probe
must never raise, so the dispatch is wrapped.

This test pins the contract — it verifies the expected category,
severity, and remediation flag without depending on the actual
GoalManager / DB.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import patch, MagicMock

import pytest

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)


def test_surface_backend_exception_dispatches_to_handle_exception():
    """When _surface_backend_exception is called with a probe failure,
    it must (a) write the .err sidecar (existing contract), AND
    (b) call core.error_advice.handle_exception with category='tts.probe',
    severity='high', agent_remediation=True (new contract).
    """
    from tts.verified_synth import _surface_backend_exception

    # Capture handle_exception calls without hitting GoalManager / DB.
    captured = {}

    def fake_handle_exception(exc, *, category, severity, agent_remediation,
                              context=None):
        captured['exc'] = exc
        captured['category'] = category
        captured['severity'] = severity
        captured['agent_remediation'] = agent_remediation
        captured['context'] = context

    fake_ea = MagicMock()
    fake_ea.handle_exception = fake_handle_exception

    with patch.dict(sys.modules, {'core.error_advice': fake_ea}):
        try:
            raise RuntimeError("synthetic backend failure")
        except RuntimeError as e:
            _surface_backend_exception('chatterbox_turbo', e)

    # Existing contract: function returned without raising
    # (no assertion needed — would have raised above)

    # New contract: handle_exception was called
    assert captured, (
        "handle_exception was NOT called — probe failures still bypass "
        "the agent self-heal pipeline"
    )
    assert captured['category'] == 'tts.probe', (
        f"Wrong category — expected 'tts.probe' so a self-heal goal can "
        f"be filtered/grouped distinctly from install/synth failures. "
        f"Got: {captured['category']!r}"
    )
    assert captured['severity'] == 'high', (
        f"Wrong severity — probe failures are high-severity (engine "
        f"won't work for the user) but not critical (chat still has "
        f"fallback engines).  Got: {captured['severity']!r}"
    )
    assert captured['agent_remediation'] is True, (
        "agent_remediation MUST be True — the whole point is to file "
        "a self_heal AgentGoal so the coding agent investigates"
    )
    assert isinstance(captured['exc'], RuntimeError), (
        "The original exception must propagate to handle_exception so "
        "the traceback + fingerprint are preserved (5-min throttle keys "
        "on category+fingerprint to prevent goal storms)"
    )
    ctx = captured.get('context') or {}
    assert ctx.get('backend') == 'chatterbox_turbo', (
        f"Context must carry the backend name for the agent prompt. "
        f"Got context: {ctx!r}"
    )
    assert 'err_log_path' in ctx, (
        "Context must include err_log_path so the agent can read the "
        "full .err sidecar (the prompt only carries the last 20 frames)"
    )


def test_surface_backend_exception_swallows_handle_exception_failure():
    """If handle_exception itself raises (import failure, GoalManager
    blew up, etc.), _surface_backend_exception must STILL not raise —
    the probe-must-never-raise contract is non-negotiable.
    """
    from tts.verified_synth import _surface_backend_exception

    fake_ea = MagicMock()
    fake_ea.handle_exception = MagicMock(
        side_effect=RuntimeError("simulated handle_exception failure")
    )

    with patch.dict(sys.modules, {'core.error_advice': fake_ea}):
        try:
            raise ValueError("the original probe failure")
        except ValueError as e:
            # Must not raise even though handle_exception will throw
            _surface_backend_exception('f5_tts', e)
    # If we got here without an exception, the contract holds.
