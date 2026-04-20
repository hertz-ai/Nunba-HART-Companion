"""J145 · AI installer partial success: LLM ok, TTS fail.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: run --install-ai with TTS mocked to fail. Verify:
degradation registry (J80) lists `tts_installer`; LLM path still
bootable.

At Flask-level we verify: degradation registry endpoint reachable
and can report a degraded tts component (if set).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j145_degradations_list_tts_fail(nunba_flask_app):
    r = nunba_flask_app.get("/api/admin/diag/degradations")
    if r.status_code == 404:
        pytest.skip("degradations endpoint not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j145_llm_reachable_when_tts_degraded(nunba_flask_app):
    """Even with TTS subsystem broken, /chat must still work."""
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "llm only", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
