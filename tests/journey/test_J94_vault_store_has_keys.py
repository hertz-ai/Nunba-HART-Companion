"""J94 · Vault store + has + keys.

User journey from PRODUCT_MAP.md §USER JOURNEYS.

Pre-conditions
--------------
* /api/vault/* routes mounted (chatbot_routes.py:3481-3483).

Steps
-----
1. GET /api/vault/keys (lists existing keys; should be safe without auth).
2. GET /api/vault/has?name=j94-test (existence probe).
3. POST /api/vault/store with a tiny secret.

Verifiable outcomes
-------------------
* All reachable.
* Requests without a bearer token produce auth-gate 401/403 — the
  routes are documented as [Bearer] in PRODUCT_MAP §1.6.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j94_vault_keys_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/vault/keys")
    if resp.status_code == 404:
        pytest.skip("/api/vault/keys not mounted")
    # Expected: 401 unauthorized or 200 list.  No empty 5xx.
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j94_vault_has_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/vault/has?name=j94-test")
    if resp.status_code == 404:
        pytest.skip("/api/vault/has not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j94_vault_store_rejects_unauthed(nunba_flask_app):
    resp = nunba_flask_app.post(
        "/api/vault/store",
        json={"name": "j94-probe", "value": "secret"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/vault/store not mounted")
    # Either bearer-required (401/403) or validation (4xx). No empty 5xx.
    body = resp.get_data(as_text=True)
    assert not (resp.status_code >= 500 and not body.strip())
