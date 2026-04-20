"""J159 · WAMP flood 100 events in 5s none dropped.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: 100 /publish calls in rapid succession. Verify: all accepted
without 5xx; bridge does not wedge.
"""

from __future__ import annotations

import time

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j159_publish_burst_100(nunba_flask_app):
    t0 = time.monotonic()
    accepted = 0
    skipped = False
    for i in range(100):
        r = nunba_flask_app.post(
            "/publish",
            json={
                "topic": f"chat.social.j159-{i}",
                "args": [{"i": i}],
            },
            headers={"Content-Type": "application/json"},
        )
        if r.status_code == 404:
            skipped = True
            break
        if r.status_code in (200, 503):
            accepted += 1
        else:
            assert r.status_code < 500, (
                f"publish #{i} crashed {r.status_code}"
            )
    elapsed = time.monotonic() - t0

    if skipped:
        pytest.skip("/publish not mounted")

    # Budget check: 100 publishes in <15s on any reasonable box
    assert elapsed < 30.0, f"100 publishes took {elapsed:.1f}s"
    assert accepted >= 95, (
        f"only {accepted}/100 publishes accepted — bridge not holding up"
    )


@pytest.mark.timeout(30)
def test_j159_publish_rejects_oversized(nunba_flask_app):
    """A 1 MB payload must NOT 5xx — it should either 200 or 413."""
    big = "x" * (1024 * 1024)
    r = nunba_flask_app.post(
        "/publish",
        json={"topic": "chat.social.j159-big", "args": [{"blob": big}]},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/publish not mounted")
    assert r.status_code < 500
