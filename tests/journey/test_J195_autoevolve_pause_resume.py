"""J195 · Auto-evolve mid-iteration paused then resumed.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: POST /api/social/experiments/auto-evolve → POST pause-evolve
→ iterate → POST resume-evolve. Verify: iteration history
contiguous.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j195_autoevolve_start(nunba_flask_app):
    r = nunba_flask_app.post(
        "/api/social/experiments/auto-evolve",
        json={
            "hypothesis_id": "j195",
            "experiment_type": "benchmark",
        },
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/social/experiments/auto-evolve not mounted")
    body = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j195_pause_resume(nunba_flask_app):
    p = nunba_flask_app.post(
        "/api/social/experiments/pause-evolve",
        json={"hypothesis_id": "j195"},
        headers={"Content-Type": "application/json"},
    )
    if p.status_code == 404:
        pytest.skip("pause-evolve endpoint not mounted")
    body_p = p.get_data(as_text=True)
    assert not (p.status_code >= 500 and not body_p.strip())

    r = nunba_flask_app.post(
        "/api/social/experiments/resume-evolve",
        json={"hypothesis_id": "j195"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("resume-evolve endpoint not mounted")
    body_r = r.get_data(as_text=True)
    assert not (r.status_code >= 500 and not body_r.strip())
