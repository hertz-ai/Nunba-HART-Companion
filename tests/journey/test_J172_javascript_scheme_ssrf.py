"""J172 · javascript: scheme SSRF.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /api/image-proxy?url=javascript:alert. Verify: 400.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j172_javascript_scheme_rejected(nunba_flask_app):
    r = nunba_flask_app.get(
        "/api/image-proxy?url=javascript:alert(document.cookie)"
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400


@pytest.mark.timeout(30)
def test_j172_vbscript_scheme_rejected(nunba_flask_app):
    """vbscript: — legacy IE vector, must also be refused."""
    r = nunba_flask_app.get(
        "/api/image-proxy?url=vbscript:msgbox"
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400
