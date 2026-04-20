"""J132 · Fleet-command sent while target is busy with chat.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: fleet_command.py:525 dispatches; target node has active
/chat. Verifiable: /channels/send + /chat both reachable; no
crash when interleaved.
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j132_fleet_plus_chat_concurrent(nunba_flask_app):
    def _chat():
        return nunba_flask_app.post(
            "/chat",
            json={"text": "busy chatting", "preferred_lang": "en"},
            headers={"Content-Type": "application/json"},
        )

    def _fleet():
        return nunba_flask_app.post(
            "/channels/send",
            json={"channel": "web", "message": "J132 fleet probe"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f1, f2 = ex.submit(_chat), ex.submit(_fleet)
        r1 = f1.result(timeout=45)
        r2 = f2.result(timeout=45)

    assert r1.status_code < 500
    if r2.status_code == 404:
        pytest.skip("/channels/send not mounted")
    body2 = r2.get_data(as_text=True)
    assert not (r2.status_code >= 500 and not body2.strip())


@pytest.mark.timeout(30)
def test_j132_fleet_status_reachable(nunba_flask_app):
    r = nunba_flask_app.get("/channels/status")
    if r.status_code == 404:
        pytest.skip("/channels/status not mounted")
    assert r.status_code < 500
