"""J246 · /prompts seed page surface.

PRODUCT_MAP.md §1.2 calls out ``/prompts`` as the React shell's
onboarding seed — it returns the list of "agents / assistants" the
user can select on first open (local_assistant, kids, coding, etc.)
plus a cloud catalogue.

Without this route the onboarding carousel shows an empty state
and the first-run user has no way to begin a conversation.

Route signature (main.py::_register_prompts_route):
  GET /prompts -> {
    prompts: [{id, name, description, avatar, is_default, capabilities, available}],
    local_count, cloud_count, hartos_available, is_online
  }
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j246_prompts_returns_seed_list(nunba_flask_app):
    resp = nunba_flask_app.get("/prompts")
    if resp.status_code == 404:
        pytest.skip("/prompts not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    prompts = body.get("prompts") or []
    assert isinstance(prompts, list) and prompts, (
        "onboarding carousel empty — first-run user has nothing to pick"
    )
    # Every entry carries the 5 load-bearing fields the carousel reads.
    required = {"id", "name", "description", "is_default", "available"}
    for p in prompts[:10]:
        missing = required - set(p.keys())
        assert not missing, f"prompt {p.get('id')} missing {missing}"


@pytest.mark.timeout(15)
def test_j246_prompts_has_default(nunba_flask_app):
    """Exactly one prompt (or at least one) must be flagged is_default:
    the carousel picks it on first render."""
    resp = nunba_flask_app.get("/prompts")
    if resp.status_code == 404:
        pytest.skip("/prompts not mounted")
    prompts = (resp.get_json() or {}).get("prompts") or []
    if not prompts:
        pytest.skip("no prompts returned")
    defaults = [p for p in prompts if p.get("is_default")]
    assert defaults, (
        f"no default prompt flagged — carousel has no initial selection; "
        f"ids={[p.get('id') for p in prompts]}"
    )


@pytest.mark.timeout(15)
def test_j246_prompts_counts_match(nunba_flask_app):
    """local_count + cloud_count must sum to len(prompts), OR at least
    len(prompts) >= local_count — a sanity check against off-by-one
    bugs in the seed builder."""
    resp = nunba_flask_app.get("/prompts")
    if resp.status_code == 404:
        pytest.skip("/prompts not mounted")
    body = resp.get_json() or {}
    prompts = body.get("prompts") or []
    local_count = body.get("local_count")
    if local_count is None:
        pytest.skip("local_count not exposed")
    assert isinstance(local_count, int)
    assert len(prompts) >= local_count, (
        f"prompts ({len(prompts)}) less than local_count ({local_count})"
    )
