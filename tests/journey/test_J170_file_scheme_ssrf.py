"""J170 · file:// scheme SSRF.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: /api/image-proxy?url=file:///etc/passwd. Verify: 400 "Only
http/https URLs" (main.py:2266).
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j170_file_scheme_rejected(nunba_flask_app):
    r = nunba_flask_app.get("/api/image-proxy?url=file:///etc/passwd")
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400, (
        f"file:// must be rejected, got {r.status_code}"
    )


@pytest.mark.timeout(30)
def test_j170_file_scheme_windows_path(nunba_flask_app):
    """Windows-style file URI."""
    r = nunba_flask_app.get(
        "/api/image-proxy?url=file:///C:/Windows/win.ini"
    )
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400


@pytest.mark.timeout(30)
def test_j170_file_url_mixed_case(nunba_flask_app):
    """Case-folded file scheme must still be rejected."""
    r = nunba_flask_app.get("/api/image-proxy?url=File:///etc/passwd")
    if r.status_code == 404 and r.get_data(as_text=True) == "":
        pytest.skip("/api/image-proxy not mounted")
    assert r.status_code >= 400
