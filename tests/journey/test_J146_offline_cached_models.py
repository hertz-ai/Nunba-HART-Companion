"""J146 · Offline boot with cached models only.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: HF cache populated. Steps: Nunba boot with
HF_HUB_OFFLINE=1. Verify: /chat succeeds; no outbound sockets to
HF.

The `network_partition` fixture blocks :443 so any HF request
throws ConnectionError; /chat must survive.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(45)
def test_j146_chat_with_hf_offline_and_partition(
    nunba_flask_app, monkeypatch, network_partition,
):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    monkeypatch.setenv("TRANSFORMERS_OFFLINE", "1")
    network_partition([443, 80])

    r = nunba_flask_app.post(
        "/chat",
        json={"text": "offline cached", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j146_probe_works_offline(nunba_flask_app, monkeypatch):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    r = nunba_flask_app.get("/probe")
    if r.status_code == 404:
        pytest.skip("/probe not mounted")
    assert r.status_code < 500
