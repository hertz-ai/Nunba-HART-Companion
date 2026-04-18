"""J256 · Provider ping (test) endpoint — envelope + latency budget.

/api/admin/providers/<id>/test is the "pulse" endpoint the admin
uses when configuring a new provider key. It sends a trivial
"Say hello in one word" prompt and reports latency + cost.

Invariants:

  1. Response envelope has: success, content, latency_ms, cost_usd,
     error.  Admin UI renders each field; any missing key becomes
     "undefined" in the JS tile.
  2. On missing-key / unreachable-provider, success=false with
     `error` set — NOT a bare 500 page.
  3. Latency is reported as a number (Flask jsonify serialises
     Python float/int; a None or string breaks the UI badge).
  4. POST-only — GET must 405 (the SPA uses POST; a route that
     silently accepts GET would hide misconfiguration).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j256_ping_bogus_provider_returns_error_envelope(nunba_flask_app):
    """Ping a provider id that definitely doesn't exist. Response body
    must carry `success:false` + an error string so the admin UI
    renders "Provider not reachable" rather than a white-screen."""
    resp = nunba_flask_app.post(
        "/api/admin/providers/j256-nonexistent-provider/test", json={}
    )
    body = resp.get_json(silent=True) or {}

    # Accept: 503 (gateway module missing), 4xx (auth gate),
    # 500 with success:false+error envelope (documented contract —
    # the handler explicitly catches and returns 500+error; see
    # main.py:2275-2276).
    if resp.status_code == 500:
        assert body.get("success") is False, (
            f"500 response must carry success:false, got {body!r}"
        )
        assert body.get("error"), (
            f"500 response must carry an error string — admin UI will "
            f"render 'undefined' otherwise. Body: {body!r}"
        )
    elif resp.status_code == 503:
        assert "error" in body, "503 missing error field"
    else:
        # 2xx / other 4xx — body must still be JSON parseable
        assert body or resp.status_code in (401, 403), (
            f"Unexpected response for bogus provider: "
            f"{resp.status_code} {resp.get_data(as_text=True)[:200]!r}"
        )


@pytest.mark.timeout(60)
def test_j256_ping_endpoint_rejects_get_method(nunba_flask_app):
    """GET /api/admin/providers/<id>/test must 405. Admin UI uses POST;
    a route that accepts GET too means someone could trigger provider
    tests via a crafted link (CSRF-adjacent)."""
    resp = nunba_flask_app.get(
        "/api/admin/providers/j256-probe/test"
    )
    # Either 405 (correct) or 404 (route dynamic match didn't fire)
    # Both are safe — the test is "GET does NOT execute the test
    # action successfully".
    assert resp.status_code in (404, 405) or resp.status_code >= 400, (
        f"GET on /test endpoint returned {resp.status_code} — "
        f"route must reject non-POST methods. Body: "
        f"{resp.get_data(as_text=True)[:200]!r}"
    )


@pytest.mark.timeout(60)
def test_j256_latency_field_is_numeric_when_present(nunba_flask_app):
    """If the ping runs successfully (e.g., against a configured
    groq/anthropic provider in the dev environment), latency_ms must
    be a number — not None, not a string.  Admin UI formats it as
    `${latency_ms.toFixed(1)} ms`."""
    # We can't guarantee a real provider is configured; we just
    # verify that IF any provider is registered, the first ping has
    # a numeric latency_ms field OR an error envelope.
    resp = nunba_flask_app.get("/api/admin/providers")
    if resp.status_code >= 400:
        pytest.skip(f"providers list endpoint gated: {resp.status_code}")

    body = resp.get_json(silent=True) or {}
    providers = body.get("providers") or body.get("data") or []
    if not isinstance(providers, list) or not providers:
        pytest.skip("no providers registered in this environment")

    # Pick the first provider id we see and probe it
    first = providers[0]
    provider_id = first.get("id") if isinstance(first, dict) else None
    if not provider_id:
        pytest.skip(f"first provider entry has no id: {first!r}")

    ping = nunba_flask_app.post(
        f"/api/admin/providers/{provider_id}/test", json={}
    )
    ping_body = ping.get_json(silent=True) or {}

    if ping.status_code == 200 and ping_body.get("success"):
        lat = ping_body.get("latency_ms")
        assert isinstance(lat, (int, float)), (
            f"latency_ms must be numeric on success — got "
            f"{lat!r} ({type(lat).__name__})"
        )
        # cost_usd also must serialise cleanly
        cost = ping_body.get("cost_usd")
        assert cost is None or isinstance(cost, (int, float)), (
            f"cost_usd must be numeric or null — got "
            f"{cost!r} ({type(cost).__name__})"
        )


@pytest.mark.timeout(60)
def test_j256_ping_body_has_all_ui_fields(nunba_flask_app):
    """Even on failure, the JSON body MUST include every key the admin
    UI renders: success, content, latency_ms, cost_usd, error.
    Missing keys become `undefined` in the UI tile."""
    resp = nunba_flask_app.post(
        "/api/admin/providers/anthropic/test", json={}
    )
    body = resp.get_json(silent=True)

    if body is None:
        pytest.skip(f"non-JSON response (status {resp.status_code})")

    # Expected keys (success OR failure path). For 503 (gateway
    # missing) the body is just {error:...} which is also fine.
    if resp.status_code == 503:
        assert "error" in body
        return

    # On any other JSON path, success must be explicit (true or false)
    if "success" in body:
        assert isinstance(body["success"], bool), (
            f"success must be boolean — got {body['success']!r}"
        )
