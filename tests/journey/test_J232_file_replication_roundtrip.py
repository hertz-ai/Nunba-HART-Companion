"""J232 · File replication roundtrip across devices (U9, task #412).

User requirement (2026-04-24):
  "Documents can be sent and downloaded like whatsapp? sending to my
  Agent and retrieving via my agent in another device"

Scenario:
  Device A uploads `diagram.png` through the agent chat flow →
  file_sync.store() writes to ~/Documents/Nunba/data/file_sync/<uid>/.
  The ChatMessage.attachments row carries `{file_id, sha256, name, mime,
  size}`.  Device B, subscribed via chat.new WAMP, sees the message
  and pulls the attachment bytes via file_sync.fetch(<uid>, <file_id>).

Invariants:
  1. fetch() before any store returns (None, None) — no phantom files.
  2. store() then fetch() on the SAME user returns the identical bytes.
  3. file_id == SHA256(bytes) — content-addressed so clients never
     trust a server-provided id.
  4. Same user re-storing the same content is idempotent (dedup).
  5. Two users storing identical bytes must NOT share the blob —
     cross-user dedup would leak existence via presence probe.
  6. list_since() gives each device a way to enumerate its backlog
     on first sync, ordered by created_at ASC for cursor progression.

Regression patterns caught:
  * Someone makes store() trust a client-supplied file_id — attacker
    can overwrite another file by guessing the id.
  * Someone switches to cross-user dedup to save disk — privacy leak.
  * Someone drops the SHA256 verification — tampered bytes flow.
"""

from __future__ import annotations

import hashlib

import pytest

pytestmark = pytest.mark.journey


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    """Point file_sync at an isolated tmp dir per test."""
    monkeypatch.setenv('NUNBA_DATA_DIR', str(tmp_path))
    import importlib

    from desktop import file_sync
    importlib.reload(file_sync)
    monkeypatch.setattr(file_sync, '_data_dir', lambda: str(tmp_path))
    yield


@pytest.mark.timeout(15)
def test_j232_fetch_before_store_returns_none():
    from desktop import file_sync
    sha = hashlib.sha256(b'never stored').hexdigest()
    assert file_sync.fetch('user_abc', sha) == (None, None)


@pytest.mark.timeout(15)
def test_j232_roundtrip_same_user_identical_bytes():
    """Device A stores; Device B (same uid, same data_dir) fetches."""
    from desktop import file_sync
    data = b'\x89PNG\r\n\x1a\n' + b'fake-image-body' * 32

    meta = file_sync.store('user_abc', data, name='diagram.png', mime='image/png')
    got_bytes, got_meta = file_sync.fetch('user_abc', meta['file_id'])
    assert got_bytes == data
    assert got_meta['sha256'] == hashlib.sha256(data).hexdigest()
    assert got_meta['mime'] == 'image/png'
    assert got_meta['name'] == 'diagram.png'


@pytest.mark.timeout(15)
def test_j232_file_id_equals_sha256():
    """Content-addressed: client verifies by independently hashing."""
    from desktop import file_sync
    data = b'content-addressed integrity'
    meta = file_sync.store('user_abc', data, name='x.txt', mime='text/plain')
    assert meta['file_id'] == hashlib.sha256(data).hexdigest()
    assert meta['sha256'] == meta['file_id']


@pytest.mark.timeout(15)
def test_j232_store_idempotent_same_user_same_content():
    from desktop import file_sync
    data = b'the same 42 bytes written twice..............'
    a = file_sync.store('user_abc', data, name='1.txt', mime='text/plain')
    b = file_sync.store('user_abc', data, name='renamed.txt', mime='text/markdown')
    assert a['file_id'] == b['file_id']
    # First write wins on metadata — name/mime preserved.
    assert b['name'] == '1.txt'
    assert b['mime'] == 'text/plain'
    # Usage is counted once, not twice.
    u = file_sync.usage('user_abc')
    assert u['files'] == 1
    assert u['bytes'] == len(data)


@pytest.mark.timeout(15)
def test_j232_cross_user_no_dedup_no_leak():
    """user A's copy and user B's copy must be independent."""
    from desktop import file_sync
    data = b'secret plan.pdf bytes'
    file_sync.store('user_abc', data, name='plan.pdf', mime='application/pdf')
    file_sync.store('user_xyz', data, name='plan.pdf', mime='application/pdf')
    file_sync.delete('user_abc', hashlib.sha256(data).hexdigest())
    # user_xyz's copy must survive.
    b_bytes, b_meta = file_sync.fetch('user_xyz', hashlib.sha256(data).hexdigest())
    assert b_bytes == data
    assert b_meta is not None


@pytest.mark.timeout(15)
def test_j232_list_since_cursor_progression():
    """Device B enumerates its backlog via list_since(cursor)."""
    from desktop import file_sync
    for i in range(4):
        file_sync.store('user_abc', f'payload-{i}'.encode(),
                        name=f'f{i}.txt', mime='text/plain')
    full = file_sync.list_since('user_abc', 0)
    assert len(full) == 4
    # Cursor past the most recent returns empty.
    last_cursor = max(int(m['created_at']) for m in full)
    assert file_sync.list_since('user_abc', last_cursor) == []


@pytest.mark.timeout(15)
def test_j232_delete_cleans_up_blob_and_meta(tmp_path):
    """After delete, neither blob nor sidecar may remain on disk."""
    import os

    from desktop import file_sync
    meta = file_sync.store('user_abc', b'ephemeral', name='e.txt')
    assert file_sync.delete('user_abc', meta['file_id']) is True

    root = tmp_path / 'file_sync' / 'user_abc'
    remaining = []
    if root.exists():
        for dirpath, _dirs, files in os.walk(str(root)):
            remaining.extend(files)
    assert not remaining, f"files survived delete: {remaining}"
