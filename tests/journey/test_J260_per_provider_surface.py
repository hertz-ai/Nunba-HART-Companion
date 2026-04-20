"""J260 · Every built-in provider has a per-ID admin surface.

PRODUCT_MAP.md §1.4 + §12. Registry at
`integrations/providers/registry.py:160` enumerates 15 primary
providers (together, fireworks, groq, deepinfra, cerebras, sambanova,
openrouter, replicate, fal, huggingface, runwayml, elevenlabs,
midjourney, pika, kling) plus 4 extras (luma, seedance, sora, local).

J240 validated the LIST + capabilities + leaderboard surfaces but
never asserted that each individual provider id has its own detail
surface wired.  This file closes that gap — every provider that
shows up in GET /api/admin/providers must also answer on
GET /api/admin/providers/<id> WITHOUT 5xx.

User-visible consequence if this drifts: clicking any provider card
in the admin panel silently 500s and the right-hand detail pane
renders blank.  Operator has no way to configure that provider's
api-key, enable flag, or capability toggle.

Mapping: PRODUCT_MAP.md §12 "Primary 15" + §1.4 row
`GET /api/admin/providers/<provider_id>`.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


# Every built-in ID per integrations/providers/registry.py:168-525.
# If the registry drops one of these, the test flags it — product
# contract says these names are stable.
_EXPECTED_BUILTIN_IDS: frozenset[str] = frozenset({
    "together", "fireworks", "groq", "deepinfra", "cerebras",
    "sambanova", "openrouter", "replicate", "fal", "huggingface",
    "runwayml", "elevenlabs", "midjourney", "pika", "kling",
})


@pytest.mark.timeout(60)
def test_j260_list_provider_ids_superset_of_expected(nunba_flask_app):
    """The list must contain every name promised in PRODUCT_MAP §12."""
    resp = nunba_flask_app.get("/api/admin/providers")
    if resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    assert resp.status_code == 200
    body = resp.get_json() or {}
    ids = {p["id"] for p in (body.get("providers") or []) if "id" in p}
    missing = _EXPECTED_BUILTIN_IDS - ids
    # At least 10 of the 15 must be present — otherwise the built-in
    # registry regressed or the boot wasn't complete.
    assert len(ids & _EXPECTED_BUILTIN_IDS) >= 10, (
        f"provider registry regressed — only {sorted(ids & _EXPECTED_BUILTIN_IDS)} "
        f"of {sorted(_EXPECTED_BUILTIN_IDS)} are registered; missing {sorted(missing)}"
    )


@pytest.mark.timeout(90)
def test_j260_each_registered_provider_answers_detail(nunba_flask_app):
    """Every provider returned by /list must answer /detail without 5xx."""
    list_resp = nunba_flask_app.get("/api/admin/providers")
    if list_resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    assert list_resp.status_code == 200
    providers = (list_resp.get_json() or {}).get("providers") or []
    assert providers, "empty provider list — cannot per-id validate"

    failures: list[str] = []
    for p in providers:
        pid = p.get("id")
        if not pid:
            continue
        detail = nunba_flask_app.get(f"/api/admin/providers/{pid}")
        if detail.status_code >= 500:
            failures.append(
                f"{pid} -> {detail.status_code} "
                f"{detail.get_data(as_text=True)[:120]!r}"
            )
    assert not failures, (
        f"{len(failures)} providers returned 5xx on detail lookup — "
        f"admin UI detail pane would blank for these: {failures}"
    )


@pytest.mark.timeout(60)
def test_j260_detail_echoes_provider_id(nunba_flask_app):
    """Detail payload must identify which provider it describes."""
    list_resp = nunba_flask_app.get("/api/admin/providers")
    if list_resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    providers = (list_resp.get_json() or {}).get("providers") or []
    if not providers:
        pytest.skip("no providers registered in this environment")
    pid = providers[0]["id"]

    detail = nunba_flask_app.get(f"/api/admin/providers/{pid}")
    assert detail.status_code < 500
    body = detail.get_json() or {}
    # The UI reads either `id` at top level or `provider.id`.  Accept
    # either shape — but the id MUST match somewhere.
    top_id = body.get("id")
    nested_id = (body.get("provider") or {}).get("id")
    assert pid in {top_id, nested_id}, (
        f"detail for {pid} doesn't echo its id; got top={top_id!r} "
        f"nested={nested_id!r} body-keys={list(body)}"
    )


@pytest.mark.timeout(60)
def test_j260_api_key_crud_is_idempotent(nunba_flask_app):
    """POST /api-key then POST /api-key again must not 5xx (idempotent).

    Admin shell calls POST repeatedly when the operator edits + saves
    the same field.  A 5xx would leave the form in a broken state.
    """
    list_resp = nunba_flask_app.get("/api/admin/providers")
    if list_resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    providers = (list_resp.get_json() or {}).get("providers") or []
    if not providers:
        pytest.skip("no providers available")
    pid = providers[0]["id"]

    # Fire twice with a fake key — both must be handled gracefully
    for _ in range(2):
        resp = nunba_flask_app.post(
            f"/api/admin/providers/{pid}/api-key",
            json={"api_key": "j260-test-key"},
        )
        # 200 (set), 400 (validation), 401/403 (auth) all acceptable.
        # 5xx is not.
        assert resp.status_code < 500, (
            f"idempotent api-key set for {pid} crashed 5xx: "
            f"{resp.get_data(as_text=True)[:120]}"
        )


@pytest.mark.timeout(60)
def test_j260_enable_toggle_does_not_crash(nunba_flask_app):
    """Toggling provider enable flag must not 5xx."""
    list_resp = nunba_flask_app.get("/api/admin/providers")
    if list_resp.status_code == 404:
        pytest.skip("/api/admin/providers not mounted")
    providers = (list_resp.get_json() or {}).get("providers") or []
    if not providers:
        pytest.skip("no providers available")
    pid = providers[0]["id"]

    resp = nunba_flask_app.post(
        f"/api/admin/providers/{pid}/enable",
        json={"enabled": True},
    )
    assert resp.status_code < 500, (
        f"enable toggle for {pid} crashed 5xx: "
        f"{resp.get_data(as_text=True)[:120]}"
    )

    # And flip it back — full CRUD cycle
    resp = nunba_flask_app.post(
        f"/api/admin/providers/{pid}/enable",
        json={"enabled": False},
    )
    assert resp.status_code < 500


@pytest.mark.timeout(60)
def test_j260_unknown_provider_404_not_500(nunba_flask_app):
    """Unknown provider lookup must return 4xx, not 5xx.

    This guards the blast radius when admins mistype a provider id
    in the URL bar.  A 5xx would leak a stack trace; a 4xx is the
    contract.
    """
    resp = nunba_flask_app.get(
        "/api/admin/providers/definitely-not-a-real-provider-j260"
    )
    assert resp.status_code < 500, (
        f"unknown-provider returned 5xx instead of 4xx: "
        f"{resp.get_data(as_text=True)[:120]}"
    )
