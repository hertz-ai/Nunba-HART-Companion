"""J233 · File-sync per-user quota enforcement (U9, task #412).

Scenario:
  Malicious or misconfigured client uploads many large files; quota
  must refuse the one that would exceed the cap and all prior stores
  remain intact.  The check is cheap enough to run on every store()
  so a disk-fill DoS cannot succeed on a single process.

Invariants:
  1. store() refuses with ValueError containing 'quota exceeded' when
     the incoming file would push the user past their cap.
  2. A refused upload leaves NO partial blob, NO sidecar — atomicity.
  3. Per-file max cap is enforced even when the user's quota has
     plenty of room — prevents a single 10 GB file from OOMing.
  4. Quota is per-user: user A's usage doesn't consume user B's.

Regression patterns caught:
  * Someone caches usage in memory and forgets to invalidate — next
    store lets the user slip over.
  * Someone checks quota AFTER writing — the blob already hit disk.
  * Someone shares a single global quota across all users — fairness
    and privacy (usage is a side-channel signal) suffer.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.fixture(autouse=True)
def _tight_quota(tmp_path, monkeypatch):
    monkeypatch.setenv('NUNBA_DATA_DIR', str(tmp_path))
    # 512 KB quota, 128 KB per-file cap.
    monkeypatch.setenv('NUNBA_FILE_SYNC_USER_QUOTA', str(512 * 1024))
    monkeypatch.setenv('NUNBA_FILE_SYNC_MAX_FILE', str(128 * 1024))
    import importlib

    from desktop import file_sync
    importlib.reload(file_sync)
    monkeypatch.setattr(file_sync, '_data_dir', lambda: str(tmp_path))
    yield


@pytest.mark.timeout(15)
def test_j233_quota_blocks_overflow_store():
    from desktop import file_sync
    for i in range(4):
        file_sync.store('user_q', (b'\x01' * (100 * 1024)) + str(i).encode(),
                        name=f'a{i}.bin')
    with pytest.raises(ValueError, match='quota exceeded'):
        # 4 × 100KB = 400KB used; next 120KB would push to 520KB > 512KB.
        file_sync.store('user_q', b'\x02' * (120 * 1024), name='overflow.bin')


@pytest.mark.timeout(15)
def test_j233_refused_upload_leaves_no_trace(tmp_path):
    from desktop import file_sync
    file_sync.store('user_q', b'\x01' * (100 * 1024), name='one.bin')
    file_sync.store('user_q', b'\x02' * (100 * 1024), name='two.bin')
    file_sync.store('user_q', b'\x03' * (100 * 1024), name='three.bin')
    file_sync.store('user_q', b'\x04' * (100 * 1024), name='four.bin')
    usage_before = file_sync.usage('user_q')
    with pytest.raises(ValueError):
        file_sync.store('user_q', b'\x05' * (120 * 1024), name='reject.bin')
    usage_after = file_sync.usage('user_q')
    # Refused upload MUST NOT change on-disk state.
    assert usage_before == usage_after


@pytest.mark.timeout(15)
def test_j233_single_file_cap_independent_of_quota_free():
    """Even on a pristine user (full quota available), a single file
    larger than the per-file cap is refused."""
    from desktop import file_sync
    big = b'\x00' * (256 * 1024)  # 256 KB > 128 KB cap
    with pytest.raises(ValueError, match='per-file cap'):
        file_sync.store('user_q', big, name='huge.bin')


@pytest.mark.timeout(15)
def test_j233_per_user_quota_isolation():
    """user A saturating their quota has zero effect on user B."""
    from desktop import file_sync
    for i in range(5):
        file_sync.store('user_a', (b'\x01' * (100 * 1024)) + str(i).encode(),
                        name=f'{i}.bin')
    # user_a near saturation; user_b must still accept uploads.
    r = file_sync.store('user_b', b'\x02' * (100 * 1024), name='fresh.bin')
    assert r is not None and r['size'] == 100 * 1024


@pytest.mark.timeout(15)
def test_j233_usage_reports_quota_bytes():
    from desktop import file_sync
    file_sync.store('user_q', b'small', name='a.txt')
    u = file_sync.usage('user_q')
    assert u['quota_bytes'] == 512 * 1024  # fixture env
    assert u['bytes'] == 5
    assert u['files'] == 1
