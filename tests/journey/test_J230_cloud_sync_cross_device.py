"""J230 · Cloud sync across devices: push on A → pull on B.

User requirement (2026-04-18, verbatim):
  "across reinstallls as well with cloud syn restore settings"

Scenario this pins (module-level, no browser):

  Device A:
    admin flips cloud_sync_enabled=true
    user signs in (uid = "user_abc")
    user chats with agent "default"
      → messages = [{"role": "user", "text": "hi"}]
    chat_sync.push(uid, { buckets: { default: { messages, updated_at: 1 } } })

  Device B (fresh reinstall, same signed-in account):
    admin flips cloud_sync_enabled=true
    user signs in (uid = "user_abc")
    chat_sync.pull(uid) → { buckets: { default: { messages: [...], updated_at: 1 } } }
    → frontend writes this into localStorage bucket → history restored

Invariants:
  1. pull BEFORE any push returns empty (no phantom history).
  2. Data pushed from one "device" (instance-level reset) is
     readable from another "device" (fresh module load) as long as
     the same user_id is used.
  3. Two devices pushing overlapping keys → last-writer-wins on the
     per-bucket updated_at; older loses.
  4. Two devices pushing DIFFERENT agent keys → both survive (the
     merge is per-agent, not a blanket replace).

Regression pattern this catches:
  * Someone rewrites push() as a full-blob replace — then device B
    pushing its own bucket would wipe device A's content.
  * Someone drops user_id scoping — then device A's data leaks to
    a different user on device B.
  * Someone couples push to the HTTP handler's request body
    validation, leaving no library-level invariant to assert.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    """Point chat_sync at an isolated tmp dir so tests don't trample
    a real user's cloud blob."""
    from desktop import chat_sync
    monkeypatch.setattr(chat_sync, "_data_dir", lambda: str(tmp_path))
    yield


@pytest.mark.timeout(15)
def test_j230_pull_before_any_push_is_empty():
    """A fresh-install device with no prior push returns the empty
    envelope — NOT a phantom history."""
    from desktop import chat_sync

    blob = chat_sync.pull("user_abc")
    assert blob == {"buckets": {}, "updated_at": 0}, blob


@pytest.mark.timeout(15)
def test_j230_device_a_push_device_b_pull():
    """Push on A → pull on B returns the pushed bucket verbatim."""
    from desktop import chat_sync

    # Device A: push
    payload = {
        "buckets": {
            "default": {
                "messages": [
                    {"role": "user", "text": "hi"},
                    {"role": "assistant", "text": "hello there"},
                ],
                "updated_at": 1000,
            },
        },
        "updated_at": 1000,
    }
    chat_sync.push("user_abc", payload)

    # Device B: pull (same uid)
    blob = chat_sync.pull("user_abc")
    assert "default" in blob["buckets"]
    messages = blob["buckets"]["default"]["messages"]
    assert len(messages) == 2
    assert messages[0]["text"] == "hi"
    assert messages[1]["text"] == "hello there"


@pytest.mark.timeout(15)
def test_j230_different_users_do_not_bleed():
    """Two users on the 'cloud' MUST NOT see each other's buckets.
    If this fails, we have a catastrophic privacy leak."""
    from desktop import chat_sync

    chat_sync.push("user_abc", {"buckets": {"default": {"messages": [{"role": "user", "text": "private A"}], "updated_at": 1000}}})
    chat_sync.push("user_xyz", {"buckets": {"default": {"messages": [{"role": "user", "text": "private B"}], "updated_at": 1000}}})

    a = chat_sync.pull("user_abc")
    b = chat_sync.pull("user_xyz")
    assert a["buckets"]["default"]["messages"][0]["text"] == "private A"
    assert b["buckets"]["default"]["messages"][0]["text"] == "private B"


@pytest.mark.timeout(15)
def test_j230_newer_push_wins_per_bucket():
    """Device A pushes at ts=1000 and device B pushes at ts=2000
    for the same agent_key — the newer one wins."""
    from desktop import chat_sync

    chat_sync.push("user_abc", {"buckets": {"default": {"messages": [{"role": "user", "text": "stale"}], "updated_at": 1000}}})
    merged = chat_sync.push("user_abc", {"buckets": {"default": {"messages": [{"role": "user", "text": "fresh"}], "updated_at": 2000}}})

    assert merged["buckets"]["default"]["messages"][0]["text"] == "fresh"
    assert merged["buckets"]["default"]["updated_at"] == 2000


@pytest.mark.timeout(15)
def test_j230_stale_push_loses_per_bucket():
    """Inverse of the above: if B already pushed ts=2000 and A then
    pushes ts=1000 (late network), A's stale push MUST NOT clobber
    B's fresh data."""
    from desktop import chat_sync

    chat_sync.push("user_abc", {"buckets": {"default": {"messages": [{"role": "user", "text": "fresh"}], "updated_at": 2000}}})
    merged = chat_sync.push("user_abc", {"buckets": {"default": {"messages": [{"role": "user", "text": "stale"}], "updated_at": 1000}}})

    assert merged["buckets"]["default"]["messages"][0]["text"] == "fresh"
    assert merged["buckets"]["default"]["updated_at"] == 2000


@pytest.mark.timeout(15)
def test_j230_different_agents_coexist():
    """Device A pushes for agent 'default', device B pushes for
    agent 'tutor'. After both pushes, a third device pulls and
    sees BOTH buckets — the merge is per-agent, not a blanket
    overwrite of the whole blob."""
    from desktop import chat_sync

    chat_sync.push("user_abc", {"buckets": {"default": {"messages": [{"role": "user", "text": "from A"}], "updated_at": 1000}}})
    chat_sync.push("user_abc", {"buckets": {"tutor": {"messages": [{"role": "user", "text": "from B"}], "updated_at": 1500}}})

    final = chat_sync.pull("user_abc")
    assert set(final["buckets"].keys()) == {"default", "tutor"}
    assert final["buckets"]["default"]["messages"][0]["text"] == "from A"
    assert final["buckets"]["tutor"]["messages"][0]["text"] == "from B"


@pytest.mark.timeout(15)
def test_j230_merge_function_is_pure():
    """merge() must not mutate either input — the caller relies on
    being able to compare before/after."""
    from desktop import chat_sync

    stored = {"buckets": {"default": {"messages": [1], "updated_at": 100}}, "updated_at": 100}
    incoming = {"buckets": {"default": {"messages": [2], "updated_at": 200}}, "updated_at": 200}

    before_stored = dict(stored)
    before_incoming = dict(incoming)
    result = chat_sync.merge(stored, incoming)

    # Winner is incoming because 200 > 100
    assert result["buckets"]["default"]["messages"] == [2]
    # Inputs unchanged
    assert stored == before_stored
    assert incoming == before_incoming
