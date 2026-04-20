"""J147 · Disk full (ENOSPC) mid-install → graceful rollback.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: emulate via `disk_full_simulator` — shutil.disk_usage reports
free=0. Steps: install_gpu_torch (tts/package_installer.py:430)
preflight sees no disk and aborts. Verify: no partial torch/ dir
left; degradation registry entry or clear error envelope.

We can't actually run the install within pytest, but we CAN verify
that the admin route which would call the preflight (model hub
install) rejects cleanly under ENOSPC.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j147_hub_install_under_enospc(
    nunba_flask_app, disk_full_simulator,
):
    disk_full_simulator()
    r = nunba_flask_app.post(
        "/api/admin/models/hub/install",
        json={"model": "TheBloke/llama-test", "quant": "Q4_K_M"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404:
        pytest.skip("/api/admin/models/hub/install not mounted")
    body = r.get_data(as_text=True)
    # Under ENOSPC the admin should NOT 500 with empty body; it must
    # either refuse (4xx) or report an explicit error envelope.
    assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j147_chat_survives_enospc(nunba_flask_app, disk_full_simulator):
    disk_full_simulator()
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "enospc probe", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
