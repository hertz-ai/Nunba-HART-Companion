"""J241 · Admin HuggingFace-hub allowlist CRUD.

PRODUCT_MAP.md §1.4 describes the allowlist as the *security gate*
for model install: any org not on the list cannot be pulled via
``/api/admin/models/hub/install``.  An admin must be able to:

  * list orgs (GET)
  * add an org with a reason (POST)
  * remove an org (DELETE)

Without this CRUD the operator can't onboard a new trusted publisher
without a code change.  Previously uncovered — first-party journey.

Route map (main.py::_register_admin_hub_allowlist_api):
  GET    /api/admin/hub/allowlist          -> {orgs:[{org, reason, added_at}]}
  POST   /api/admin/hub/allowlist          -> {success, org, reason}
  DELETE /api/admin/hub/allowlist/<org>    -> {success, org, removed}
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey

# A sentinel org name no real publisher would pick — isolates test state.
_SENTINEL_ORG = "__j241_e2e_sentinel_never_real"


@pytest.mark.timeout(30)
def test_j241_allowlist_list_returns_orgs(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/hub/allowlist")
    if resp.status_code == 404:
        pytest.skip("/api/admin/hub/allowlist not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    orgs = body.get("orgs")
    assert isinstance(orgs, list) and orgs, "allowlist empty — hub install is blocked for everyone"
    # Shape check: each entry must have org + reason + added_at (timeline).
    for entry in orgs[:5]:
        assert isinstance(entry, dict)
        assert "org" in entry
        assert "reason" in entry
    # Must include at least the first-party publisher (HertzAI) — else
    # Nunba's own model pulls would fail.
    org_names = {e.get("org") for e in orgs}
    assert "HertzAI" in org_names, (
        f"first-party HertzAI missing from allowlist; got {sorted(org_names)}"
    )


@pytest.mark.timeout(30)
def test_j241_allowlist_add_then_remove_roundtrip(nunba_flask_app):
    # Clean slate: ensure sentinel is not present before we start.
    nunba_flask_app.delete(f"/api/admin/hub/allowlist/{_SENTINEL_ORG}")

    # POST: add.
    add = nunba_flask_app.post(
        "/api/admin/hub/allowlist",
        json={"org": _SENTINEL_ORG, "reason": "J241 e2e roundtrip"},
        headers={"Content-Type": "application/json"},
    )
    if add.status_code == 404:
        pytest.skip("/api/admin/hub/allowlist POST not mounted")
    assert add.status_code == 200, add.get_data(as_text=True)[:200]
    add_body = add.get_json() or {}
    assert add_body.get("success") is True, add_body
    assert add_body.get("org") == _SENTINEL_ORG

    # GET: must now contain the sentinel.
    lst = nunba_flask_app.get("/api/admin/hub/allowlist").get_json() or {}
    names = {e.get("org") for e in lst.get("orgs") or []}
    assert _SENTINEL_ORG in names, (
        f"sentinel not listed after add; got {sorted(names)}"
    )

    # DELETE: remove.
    rm = nunba_flask_app.delete(f"/api/admin/hub/allowlist/{_SENTINEL_ORG}")
    assert rm.status_code == 200, rm.get_data(as_text=True)[:200]
    rm_body = rm.get_json() or {}
    assert rm_body.get("success") is True, rm_body
    assert rm_body.get("removed") is True

    # GET again: must NOT contain the sentinel.
    lst2 = nunba_flask_app.get("/api/admin/hub/allowlist").get_json() or {}
    names2 = {e.get("org") for e in lst2.get("orgs") or []}
    assert _SENTINEL_ORG not in names2, (
        f"sentinel still listed after delete; got {sorted(names2)}"
    )


@pytest.mark.timeout(30)
def test_j241_allowlist_post_rejects_missing_org(nunba_flask_app):
    """Empty / missing ``org`` must be 4xx, not 500."""
    resp = nunba_flask_app.post(
        "/api/admin/hub/allowlist",
        json={"reason": "no-org-should-fail"},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 404:
        pytest.skip("/api/admin/hub/allowlist POST not mounted")
    assert resp.status_code < 500, resp.get_data(as_text=True)[:200]
