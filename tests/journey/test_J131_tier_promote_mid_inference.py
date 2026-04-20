"""J131 · Hive node tier promote mid-inference.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: flat node. Steps: HEVOLVE_RESTART_REQUESTED fires during chat
stream (main.py:2911). Verifiable at contract tier: tier status
endpoint reachable; setting restart flag does NOT re-exec the test
process.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j131_tier_status_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/api/v1/system/tiers")
    if r.status_code == 404:
        r = nunba_flask_app.get("/api/system/tier")
    if r.status_code == 404:
        pytest.skip("tier-status endpoint not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j131_chat_during_restart_flag_setting(nunba_flask_app, monkeypatch):
    """Setting HEVOLVE_RESTART_REQUESTED in env must NOT crash the
    in-flight request — the watcher fires on a background timer."""
    monkeypatch.setenv("HEVOLVE_RESTART_REQUESTED", "1")
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "during restart flag", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
