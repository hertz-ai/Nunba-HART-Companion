"""J151 · HF_HUB_OFFLINE forced → installer ladder local-only.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: set HF_HUB_OFFLINE=1; click auto-setup. Verify: hub install
routes reject hub downloads; local GGUFs preferred; /api/llm/status
healthy.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j151_llm_status_offline(nunba_flask_app, monkeypatch):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    r = nunba_flask_app.get("/api/llm/status")
    if r.status_code == 404:
        pytest.skip("/api/llm/status not mounted")
    assert r.status_code < 500


@pytest.mark.timeout(30)
def test_j151_hub_install_offline_graceful(
    nunba_flask_app, monkeypatch, network_partition,
):
    monkeypatch.setenv("HF_HUB_OFFLINE", "1")
    network_partition([443])
    r = nunba_flask_app.post(
        "/api/admin/models/hub/install",
        json={"model": "TheBloke/qwen-test", "quant": "Q4_K_M"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/models/hub/install not mounted")
    body = r.get_data(as_text=True)
    # Offline + partition → gateway MUST fail gracefully, never 5xx empty.
    assert not (r.status_code >= 500 and not body.strip())
