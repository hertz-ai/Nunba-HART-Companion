"""J255 · Provider capability matrix endpoint contract.

/api/admin/providers/capabilities is the endpoint the admin UI hits
when rendering "what can this Nunba instance do right now" — LLM,
TTS, STT, VLM, image-gen tick marks. If the endpoint regresses
(wrong envelope / crashes / 403 without an env bypass) the admin
dashboard degrades to blank cards.

Contract locked:

  1. GET /api/admin/providers returns a list (may be empty) under a
     consistent JSON envelope — never 500.
  2. GET /api/admin/providers/capabilities returns {success:true,
     capabilities:{...}} OR a 503 with {error:"..."} if the provider
     gateway module is not installed. Never 500.
  3. GET /api/admin/providers/gateway/stats — similar contract.
  4. GET /api/admin/providers/<bogus> on a missing ID must 404, not
     blow up.

These tests drive the REAL Flask app (live or in-process per
conftest), so any handler crash surfaces as a failing assertion
with concrete evidence.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j255_providers_list_endpoint_does_not_crash(nunba_flask_app):
    """GET /api/admin/providers must return a JSON body with status <500."""
    resp = nunba_flask_app.get("/api/admin/providers")
    assert resp.status_code < 500, (
        f"GET /api/admin/providers crashed: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )
    body = resp.get_json(silent=True)
    assert body is not None or resp.status_code in (401, 403), (
        f"Response body was non-JSON at status {resp.status_code} — "
        f"admin UI expects JSON. Raw: "
        f"{resp.get_data(as_text=True)[:200]!r}"
    )


@pytest.mark.timeout(60)
def test_j255_capabilities_endpoint_has_consistent_envelope(nunba_flask_app):
    """GET /api/admin/providers/capabilities must return either:
      - 200 + {success:true, capabilities:{...}} when gateway is present
      - 503 + {error:"..."} when gateway module not installed
      - 401/403 when auth-gated and no admin token

    Anything else — and specifically 500 — is a regression."""
    resp = nunba_flask_app.get("/api/admin/providers/capabilities")
    assert resp.status_code < 500, (
        f"capabilities endpoint crashed: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )

    body = resp.get_json(silent=True) or {}
    if resp.status_code == 200:
        assert body.get("success") is True, (
            f"200 response missing success:true — admin UI won't render "
            f"the capability grid. Body: {body!r}"
        )
        # capabilities may be an empty dict (no providers configured),
        # but it MUST be present as a key.
        assert "capabilities" in body, (
            f"200 response missing 'capabilities' key. Body: {body!r}"
        )
    elif resp.status_code == 503:
        assert "error" in body, (
            f"503 response missing error hint — admin UI can't tell the "
            f"user what to install. Body: {body!r}"
        )


@pytest.mark.timeout(60)
def test_j255_gateway_stats_has_consistent_envelope(nunba_flask_app):
    """gateway/stats must return 200 + {success:true, ...} or 503 + error.
    Never 500."""
    resp = nunba_flask_app.get("/api/admin/providers/gateway/stats")
    assert resp.status_code < 500, (
        f"gateway/stats crashed: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )

    if resp.status_code == 200:
        body = resp.get_json(silent=True) or {}
        assert body.get("success") is True, (
            f"200 response missing success:true. Body: {body!r}"
        )


@pytest.mark.timeout(60)
def test_j255_bogus_provider_id_returns_404_or_401(nunba_flask_app):
    """GET /api/admin/providers/<bogus> must 404 (or 401/403 if
    auth-gated) — never 500."""
    resp = nunba_flask_app.get(
        "/api/admin/providers/definitely-not-a-real-provider-xyz-12345"
    )
    assert resp.status_code < 500, (
        f"bogus provider id crashed handler: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )
    # Must be a 4xx — not a 200 that would confuse the admin UI.
    assert 400 <= resp.status_code < 500, (
        f"Expected 4xx for unknown provider id, got {resp.status_code}. "
        f"A 200 for a bogus ID would mean the admin UI can't detect "
        f"typos in provider selection."
    )


@pytest.mark.timeout(60)
def test_j255_provider_test_endpoint_rejects_bogus_id_cleanly(nunba_flask_app):
    """POST /api/admin/providers/<bogus>/test must 4xx cleanly, not 5xx.

    The admin 'Test Provider' button hits this endpoint with the
    selected provider id; a 500 on a typo crashes the UI."""
    resp = nunba_flask_app.post(
        "/api/admin/providers/bogus-prov-id/test", json={}
    )
    assert resp.status_code < 500, (
        f"provider test endpoint crashed on bogus id: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )
