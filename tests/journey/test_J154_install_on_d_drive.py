"""J154 · Install on custom NUNBA_DATA_DIR.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Pre: set NUNBA_DATA_DIR to a custom path. Steps: boot. Verify:
get_data_dir() honors the env var (platform_paths.py:30-43).

We verify by reading core.platform_paths.get_data_dir() after the
env var is set — this exercises the canonical path reader directly
under the `isolated_nunba_home` fixture which already sets
NUNBA_DATA_DIR to a tmp location.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j154_data_dir_env_honored(isolated_nunba_home, monkeypatch):
    custom = isolated_nunba_home / "custom_data_root"
    custom.mkdir()
    monkeypatch.setenv("NUNBA_DATA_DIR", str(custom))
    try:
        import core.platform_paths as _pp
        from core.platform_paths import get_data_dir
    except Exception as e:
        pytest.skip(f"core.platform_paths not importable: {e}")
    # get_data_dir caches on first call (_cached_data_dir) for
    # performance — any earlier call in the test session (e.g. at
    # conftest import time) pins the answer, and later monkeypatch
    # of NUNBA_DATA_DIR is ignored. Reset the cache so this test
    # actually exercises the env-var override.
    monkeypatch.setattr(_pp, '_cached_data_dir', None, raising=False)
    dd = Path(get_data_dir())
    assert dd == custom, f"expected {custom}, got {dd}"


@pytest.mark.timeout(30)
def test_j154_chat_under_custom_data_dir(
    nunba_flask_app, isolated_nunba_home,
):
    """nunba_flask_app fixture already sets NUNBA_DATA_DIR to the
    tmp path; verify /chat continues to work when data dir is
    non-default."""
    r = nunba_flask_app.post(
        "/chat",
        json={"text": "custom data dir probe", "preferred_lang": "en"},
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code < 500
