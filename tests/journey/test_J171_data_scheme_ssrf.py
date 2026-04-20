"""J171 · data: scheme SSRF.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /api/image-proxy?url=data:text/html,<script>.
Verify: 400 same guard.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j171_data_scheme_rejected(nunba_flask_app):
    r = nunba_flask_app.get(
        "/api/image-proxy?url=data:text/html,<script>alert(1)</script>"
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400


@pytest.mark.timeout(30)
def test_j171_data_png_rejected(nunba_flask_app):
    """Even data:image/png must be refused — we're an http(s) proxy."""
    r = nunba_flask_app.get(
        "/api/image-proxy?url=data:image/png;base64,iVBORw0KGgo="
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400
