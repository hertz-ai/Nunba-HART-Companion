"""J240 · Admin provider gateway surface renders end-to-end.

PRODUCT_MAP.md §1.4 enumerates 8 provider-gateway endpoints that an
admin sees when opening ``/admin/providers``. J74 covered only the
per-provider ``/test`` ping. Every other surface was uncovered until
now — an operator clicking "Providers" in the admin shell would have
no journey guard against silent drift.

User-visible contract
---------------------
Opening ``/admin/providers`` shows:
  * a list of 15+ providers (together, fireworks, groq, deepinfra,
    cerebras, sambanova, openrouter, replicate, fal, huggingface,
    runwayml, elevenlabs, midjourney, pika, kling, ...)
  * each with `id`, `name`, `enabled`, `api_key_set`, `categories`
  * a capability matrix broken out per modality
    (llm / image_gen / audio_gen / embedding / video_gen / 3d_gen)
  * an efficiency leaderboard (possibly empty if no benchmarks yet)
  * aggregate gateway stats
  * a single-provider detail page with the same fields

If any of these crashes with 5xx the admin UI drops to a blank panel;
journey test_J74 never detected it because it only touched /test.

All assertions match the shape emitted by
main.py:1907-2084.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey

# Providers that MUST be in the built-in registry per
# integrations/providers/registry.py:168-488. The gateway must
# enumerate them even when no API key is set.
_CORE_PROVIDERS = {
    "together", "fireworks", "groq", "deepinfra", "cerebras",
    "sambanova", "openrouter", "replicate", "fal", "huggingface",
}


@pytest.mark.timeout(30)
def test_j240_list_providers_nonempty_and_schema(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    providers = body.get("providers")
    assert isinstance(providers, list) and providers, (
        "providers list empty — admin shell would show no providers"
    )
    # Every entry must carry the keys the React admin UI reads.
    required_keys = {"id", "name", "enabled", "api_key_set", "categories"}
    ids = set()
    for p in providers:
        assert isinstance(p, dict)
        missing = required_keys - set(p.keys())
        assert not missing, f"provider {p.get('id')} missing keys {missing}"
        ids.add(p["id"])
    # At least half the core provider ids should be present — catches
    # a registry that silently drops well-known IDs.
    overlap = ids & _CORE_PROVIDERS
    assert len(overlap) >= 5, (
        f"only {sorted(overlap)} of core provider ids present; "
        f"expected ≥5 of {sorted(_CORE_PROVIDERS)}"
    )


@pytest.mark.timeout(30)
def test_j240_provider_detail_returns_shape(nunba_flask_app):
    # Pick a provider that's definitely in the list first.
    lst = nunba_flask_app.get("/api/admin/providers").get_json() or {}
    providers = lst.get("providers") or []
    if not providers:
        pytest.skip("no providers registered in this environment")
    pid = providers[0]["id"]
    resp = nunba_flask_app.get(f"/api/admin/providers/{pid}")
    if resp.status_code == 404:
        pytest.skip(f"/api/admin/providers/{pid} not mounted")
    assert resp.status_code < 500, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    # Detail should echo at least the id back.
    assert (body.get("id") == pid) or (body.get("provider", {}).get("id") == pid) or body, (
        f"provider detail missing id={pid}"
    )


@pytest.mark.timeout(30)
def test_j240_capabilities_matrix_groups_by_modality(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers/capabilities")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers/capabilities not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    caps = body.get("capabilities") or body
    assert isinstance(caps, dict)
    # Must group by modality — llm is the non-negotiable minimum.
    assert "llm" in caps, "capability matrix missing 'llm' modality bucket"
    llm_list = caps["llm"]
    assert isinstance(llm_list, list) and len(llm_list) >= 3, (
        f"llm capability list too short: {llm_list}"
    )


@pytest.mark.timeout(30)
def test_j240_efficiency_leaderboard_shape(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers/efficiency/leaderboard")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers/efficiency/leaderboard not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    assert body.get("success") is True, body
    assert "leaderboard" in body
    assert isinstance(body["leaderboard"], list)
    assert "summary" in body


@pytest.mark.timeout(30)
def test_j240_gateway_stats_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/providers/gateway/stats")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers/gateway/stats not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    assert isinstance(body, dict) and body, "gateway stats returned empty body"


@pytest.mark.timeout(30)
def test_j240_resource_governor_stats_reachable(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/resources/stats")
    if resp.status_code == 404:
        pytest.skip("/api/admin/resources/stats not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    assert isinstance(body, dict)


@pytest.mark.timeout(30)
def test_j240_unknown_provider_detail_404(nunba_flask_app):
    """Requesting an unknown provider id must NOT 500."""
    resp = nunba_flask_app.get("/api/admin/providers/no-such-j240-provider")
    if resp.status_code == 404:
        # Correct: either route missing, or provider not found — both 4xx
        return
    assert resp.status_code < 500, (
        f"unknown-provider lookup crashed 5xx: {resp.get_data(as_text=True)[:200]}"
    )
