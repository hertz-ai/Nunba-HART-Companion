"""J96 · Publish bridge.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /publish HTTP → WAMP bridge mounted (main.py:2491).

Steps
-----
1. POST /publish with {topic, args}.
2. Validate error paths.

Verifiable outcomes
-------------------
* 200 (router running) OR 503 (router down) OR 400 (missing topic).
* Never silent 500.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j96_publish_roundtrip(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/publish",
        json={"topic": "system.test.j96", "args": [{"msg": "hello"}]},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    assert resp.status_code in (200, 503), (
        f"/publish unexpected {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )


@pytest.mark.timeout(30)
def test_j96_publish_missing_topic(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/publish",
        json={"args": [{"x": 1}]},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    # 400 (validation) or 503 (router down) — both documented.
    assert resp.status_code in (400, 503)


@pytest.mark.timeout(30)
def test_j96_publish_handles_string_args(nunba_flask_app):
    """crossbarhttp3 legacy: args may arrive as a single JSON-encoded
    string (main.py:2510).  The bridge must handle it gracefully."""
    resp = nunba_flask_app.post(
        "/publish",
        json={"topic": "system.test.j96", "args": '{"msg":"string-wrapped"}'},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/publish not mounted")
    assert resp.status_code in (200, 503)
