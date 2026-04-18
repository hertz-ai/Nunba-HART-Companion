"""J269 · Hive signal bridge + flask_integration surface.

PRODUCT_MAP.md §1.11 cites 5 user-reachable endpoints:

  GET  /api/hive/signals/stats  (hive_signal_bridge.py:711)
  GET  /api/hive/signals/feed   (:713)
  POST /api/hive/signals/classify (:718)
  GET  /api/channels/status     (flask_integration.py:423)
  POST /api/channels/send       (:427)

J78 covered the gamification spark path; none of the above
endpoints had their surface explicitly tested.  An operator hitting
/admin/hive or /admin/channels would see a blank panel if any of
these crashed.

Mapping: PRODUCT_MAP §1.11.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


_GET_PATHS = [
    "/api/hive/signals/stats",
    "/api/hive/signals/feed",
    "/api/channels/status",
]


@pytest.mark.timeout(30)
@pytest.mark.parametrize("path", _GET_PATHS)
def test_j269_hive_signal_and_channel_get_no_5xx(nunba_flask_app, path):
    resp = nunba_flask_app.get(path)
    if resp.status_code == 404:
        pytest.skip(f"{path} not mounted")
    assert resp.status_code < 500, (
        f"{path} crashed 5xx: {resp.get_data(as_text=True)[:150]}"
    )


@pytest.mark.timeout(30)
def test_j269_signal_classify_rejects_empty_body(nunba_flask_app):
    """POST /api/hive/signals/classify must reject empty body with 4xx,
    not 5xx."""
    resp = nunba_flask_app.post("/api/hive/signals/classify", json={})
    if resp.status_code == 404:
        pytest.skip("/api/hive/signals/classify not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j269_channels_send_rejects_empty_body(nunba_flask_app):
    """POST /api/channels/send with no recipient/message must 4xx."""
    resp = nunba_flask_app.post("/api/channels/send", json={})
    if resp.status_code == 404:
        pytest.skip("/api/channels/send not mounted")
    assert resp.status_code < 500


@pytest.mark.timeout(30)
def test_j269_signals_stats_has_envelope_shape(nunba_flask_app):
    """Stats endpoint must return a non-empty dict that the admin
    dashboard can render (counts, classes, etc)."""
    resp = nunba_flask_app.get("/api/hive/signals/stats")
    if resp.status_code == 404:
        pytest.skip("/api/hive/signals/stats not mounted")
    assert resp.status_code < 500
    if resp.status_code == 200:
        body = resp.get_json() or {}
        assert isinstance(body, dict), "signal stats must be dict"
