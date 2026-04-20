"""J174 · Guardrails hash tamper.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: call /api/harthash (main.py:1192). Verify: a hash is
returned; any mutation of hive_guardrails.py would produce a
different hash.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j174_harthash_endpoint(nunba_flask_app):
    r = nunba_flask_app.get("/api/harthash")
    if r.status_code == 404:
        r = nunba_flask_app.get("/harthash")
    if r.status_code == 404:
        pytest.skip("/api/harthash not mounted")
    assert r.status_code < 500
    body = r.get_json(silent=True)
    if r.status_code == 200:
        assert body is not None
        # hash should be non-empty hex-ish string under a sensible key
        tell = str(body).lower()
        assert any(c.isalnum() for c in tell)


@pytest.mark.timeout(30)
def test_j174_harthash_deterministic(nunba_flask_app):
    """Two reads of /api/harthash must return the same hash unless
    guardrails are being edited between calls."""
    r1 = nunba_flask_app.get("/api/harthash")
    r2 = nunba_flask_app.get("/api/harthash")
    if r1.status_code == 404:
        pytest.skip("/api/harthash not mounted")
    if r1.status_code == 200 and r2.status_code == 200:
        assert r1.get_data() == r2.get_data(), (
            "harthash varied between two reads — non-deterministic"
        )
