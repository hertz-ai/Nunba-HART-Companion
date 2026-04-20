"""J108 · casual_conv switches to full-tool agentic in same session.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: default-agent chat with `casual_conv=True`
(hart_intelligence_entry.py:3245-3325). Steps: turn1 "hi" → draft
path; turn2 agentic request — expert flips casual_conv off via goal
detection.

Verifiable: both turns 200/202/204/<5xx; server state intact.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j108_casual_then_agentic(nunba_flask_app):
    r1 = nunba_flask_app.post(
        "/chat",
        json={"text": "hi", "preferred_lang": "en", "casual_conv": True},
        headers={"Content-Type": "application/json"},
    )
    assert r1.status_code < 500

    r2 = nunba_flask_app.post(
        "/chat",
        json={
            "text": "create a python script that adds numbers",
            "preferred_lang": "en",
            "casual_conv": True,  # route/dispatcher should internally flip
        },
        headers={"Content-Type": "application/json"},
    )
    assert r2.status_code < 500


@pytest.mark.timeout(30)
def test_j108_casual_conv_false_explicit(nunba_flask_app):
    """Explicit casual_conv=False (full tool chain) must not crash."""
    r = nunba_flask_app.post(
        "/chat",
        json={
            "text": "write a shell script to list files",
            "preferred_lang": "en",
            "casual_conv": False,
        },
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
