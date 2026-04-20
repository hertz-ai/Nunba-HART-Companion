"""J186 · regional → central promote, peer ledger replicates.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: node becomes central → host_registry re-bootstraps;
agent-ledger replicates. At contract tier: host-registry / ledger
endpoints reachable.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(30)
def test_j186_host_registry_reachable(nunba_flask_app):
    for path in (
        "/api/hive/hosts",
        "/api/hive/registry",
        "/api/admin/hive/hosts",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("host registry endpoint not mounted")


@pytest.mark.timeout(30)
def test_j186_ledger_reachable(nunba_flask_app):
    for path in (
        "/api/distributed/tasks",
        "/api/ledger",
    ):
        r = nunba_flask_app.get(path)
        if r.status_code != 404:
            assert r.status_code < 500
            return
    pytest.skip("ledger endpoint not mounted")
