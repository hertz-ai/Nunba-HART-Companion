"""J92 · Ingest skill.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/skills/* mounted via hart_intelligence_entry.

Steps
-----
1. POST /api/skills/ingest
2. GET  /api/skills/list

Verifiable outcomes
-------------------
* Reachable; non-5xx-with-empty-body.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j92_ingest_reachable(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/skills/ingest",
        json={
            "name": "j92-test-skill",
            "description": "journey test",
            "manifest": {},
        },
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/skills/ingest not mounted")
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j92_skills_list_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/skills/list")
    if resp.status_code == 404:
        pytest.skip("/api/skills/list not mounted")
    assert resp.status_code < 500
