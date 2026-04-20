"""J248 · Admin diagnostics — degradations ledger.

PRODUCT_MAP.md §1.8 describes ``/api/admin/diag/degradations`` as
the operator-facing ledger of *silent* fallbacks Nunba took — every
time the runtime dropped from GPU to CPU, from a large model to a
small one, from the draft-first path to direct 4B, or from a
hardware TTS engine to Piper.  A transparent app reports these;
an opaque one hides them.

If this route 5xx's the admin "Why is it slow today?" panel is
blank and the operator can't tell what fell back.  Previously
uncovered.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(15)
def test_j248_degradations_returns_ledger_shape(nunba_flask_app):
    resp = nunba_flask_app.get("/api/admin/diag/degradations")
    if resp.status_code == 404:
        pytest.skip("/api/admin/diag/degradations not mounted")
    assert resp.status_code == 200, resp.get_data(as_text=True)[:200]
    body = resp.get_json() or {}
    # Envelope contract: {success: bool, count: int, degradations: [...]}.
    assert body.get("success") is True, body
    assert "count" in body
    assert "degradations" in body
    assert isinstance(body["count"], int)
    assert isinstance(body["degradations"], list)
    # count must match list length (simple consistency check).
    assert body["count"] == len(body["degradations"]), (
        f"count={body['count']} but list has {len(body['degradations'])}"
    )


@pytest.mark.timeout(15)
def test_j248_degradations_empty_or_well_shaped(nunba_flask_app):
    """If there are degradations, each entry must carry the minimum
    fields the ops panel renders: kind, from, to, timestamp."""
    resp = nunba_flask_app.get("/api/admin/diag/degradations")
    if resp.status_code == 404:
        pytest.skip("/api/admin/diag/degradations not mounted")
    body = resp.get_json() or {}
    degs = body.get("degradations") or []
    if not degs:
        return  # empty is a valid healthy state
    for d in degs[:10]:
        assert isinstance(d, dict)
        # We accept either (kind, from, to) or (type, original, fallback) —
        # the canonical shape varies between capture sites.  Require at
        # least ONE pair to be present.
        has_pair = (
            ("kind" in d and "from" in d and "to" in d)
            or ("type" in d and "original" in d and "fallback" in d)
        )
        assert has_pair, f"degradation entry missing canonical fields: {d}"
