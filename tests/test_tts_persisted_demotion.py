"""Persisted-TTS-demotion round-trip + self-healing tests.

Bug context — 2026-05-07
------------------------
The TTS ladder in ``tts/tts_engine.py:_select_backend_for_language``
walks a quality-ordered preference list and skips backends in
``_demoted_backends`` (failure-circuit-breaker, Fix B 2026-04-28).
Demotion was SESSION-ONLY: each new boot started ``_demoted_backends``
empty and re-burned 3 failures on a deterministically-broken top
engine before the ladder advanced again. User question (verbatim):

  > which TTS is selected and worked gets selected by default forever
  > until a new things comes along? a last worked TTS gets already
  > check how that works or in place now

Naive answer ("persist the last-worked engine") locks the user out of
better engines that arrive later. Right answer is to persist the
NEGATIVE finding instead: the ladder still walks top-down on every
boot (so newly-installed top engines are picked up automatically),
and persistence merely suppresses known-bad rungs until self-healing
kicks in.

Self-healing axes (any one resets a demotion):
  * TTL — ``_DEMOTION_TTL_SECONDS`` (7 days)
  * Schema bump — ``_TTS_STATE_SCHEMA`` differs → wipe all
  * Hub-install completion → ``clear_persisted_demotions()``
  * Admin reset endpoint → ``clear_persisted_demotions()``

These tests exercise the persistence helpers behaviorally (file IO
through a tmp_path, monkeypatched ``_get_tts_state_path``). They do
NOT touch any real backend / GPU / pip — `auto_init=False` skips the
heavy init path so the suite runs in any environment.
"""
from __future__ import annotations

import json
import os
import time

import pytest


# ────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────


@pytest.fixture
def state_path(tmp_path, monkeypatch):
    """Redirect the persisted-state file to a per-test tmp dir.

    Patches BOTH the bound name in ``tts.tts_engine`` (used by the
    instance methods) so every read/write goes through the tmp dir.
    """
    p = tmp_path / 'tts_state.json'
    from tts import tts_engine as _te

    monkeypatch.setattr(_te, '_get_tts_state_path', lambda: str(p))
    return p


@pytest.fixture
def fresh_engine(monkeypatch):
    """Return a TTSEngine with auto_init disabled so __init__ doesn't
    try to detect hardware / load any backend.

    The ``_load_persisted_demotions`` call IS still wired into
    __init__ (that's the whole point of these tests), so each fixture
    invocation hydrates from whatever the state_path fixture wrote
    just before.
    """
    from tts.tts_engine import TTSEngine
    return TTSEngine(auto_init=False)


# ────────────────────────────────────────────────────────────────────
# 1. FT — Round-trip: demote, save, fresh instance hydrates
# ────────────────────────────────────────────────────────────────────


def test_round_trip_demotion_survives_restart(state_path):
    """A backend demoted by ``_record_backend_failure`` reaching the
    threshold must be loaded back into ``_demoted_backends`` by the
    next instance's ``__init__``. Without this the ladder would
    re-burn 3 failures on every boot."""
    from tts.tts_engine import TTSEngine, BACKEND_CHATTERBOX_TURBO

    eng = TTSEngine(auto_init=False)
    # Drive 3 failures — the threshold — so demotion fires + persists.
    for _ in range(3):
        eng._record_backend_failure(BACKEND_CHATTERBOX_TURBO)

    assert BACKEND_CHATTERBOX_TURBO in eng._demoted_backends
    assert state_path.exists(), (
        "_record_backend_failure crossing the threshold must have "
        "written tts_state.json — it didn't"
    )

    # Fresh instance — simulates next boot.
    eng2 = TTSEngine(auto_init=False)
    assert BACKEND_CHATTERBOX_TURBO in eng2._demoted_backends, (
        "fresh instance did not hydrate the persisted demotion — the "
        "ladder will re-burn 3 failures on every boot"
    )
    assert eng2._is_demoted(BACKEND_CHATTERBOX_TURBO)


# ────────────────────────────────────────────────────────────────────
# 2. NFT — TTL expiry: stale entries are dropped on hydrate
# ────────────────────────────────────────────────────────────────────


def test_expired_entry_is_dropped_on_hydrate(state_path):
    """Persisted entries past ``expires_at`` must NOT pollute
    ``_demoted_backends``. Self-heals transient causes (driver flap,
    weights mid-download) without admin intervention."""
    from tts.tts_engine import TTSEngine, _TTS_STATE_SCHEMA

    now = time.time()
    state_path.write_text(json.dumps({
        'schema': _TTS_STATE_SCHEMA,
        'updated_at': now - 86400,
        'demoted': {
            'chatterbox_turbo': {
                'first_demoted_at': now - 86400 * 30,
                'expires_at': now - 60,    # expired 1 minute ago
                'failures_at_demotion': 3,
            },
            'f5': {
                'first_demoted_at': now - 60,
                'expires_at': now + 86400,  # still alive
                'failures_at_demotion': 3,
            },
        },
    }))

    eng = TTSEngine(auto_init=False)
    assert 'chatterbox_turbo' not in eng._demoted_backends, (
        "expired entry was hydrated — TTL is broken"
    )
    assert 'f5' in eng._demoted_backends, (
        "live entry was incorrectly dropped"
    )


# ────────────────────────────────────────────────────────────────────
# 3. NFT — Schema mismatch wipes everything
# ────────────────────────────────────────────────────────────────────


def test_schema_mismatch_drops_all_demotions(state_path):
    """A schema bump means the persistence layout we no longer
    understand. Drop everything; the next demotion rewrites in the
    current schema. Covers ladder restructuring across Nunba versions."""
    from tts.tts_engine import TTSEngine, _TTS_STATE_SCHEMA

    now = time.time()
    state_path.write_text(json.dumps({
        'schema': _TTS_STATE_SCHEMA + 99,  # future / wrong
        'demoted': {
            'chatterbox_turbo': {
                'first_demoted_at': now,
                'expires_at': now + 86400,
                'failures_at_demotion': 3,
            },
        },
    }))

    eng = TTSEngine(auto_init=False)
    assert eng._demoted_backends == set(), (
        "schema mismatch should drop all demotions — got "
        f"{eng._demoted_backends!r}"
    )


# ────────────────────────────────────────────────────────────────────
# 4. NFT — Piper is never persisted, even if a stale file demands it
# ────────────────────────────────────────────────────────────────────


def test_piper_never_hydrated_even_if_persisted(state_path):
    """Piper is the absolute CPU last-resort. Demoting it would leave
    the engine with no backend. ``_record_backend_failure`` already
    guards Piper from in-memory demotion; the persistence layer must
    refuse to hydrate it too in case a future bug or hand-edit puts
    it in the file."""
    from tts.tts_engine import TTSEngine, BACKEND_PIPER, _TTS_STATE_SCHEMA

    now = time.time()
    state_path.write_text(json.dumps({
        'schema': _TTS_STATE_SCHEMA,
        'demoted': {
            BACKEND_PIPER: {
                'first_demoted_at': now,
                'expires_at': now + 86400,
                'failures_at_demotion': 3,
            },
        },
    }))

    eng = TTSEngine(auto_init=False)
    assert BACKEND_PIPER not in eng._demoted_backends, (
        "Piper was hydrated as demoted — a stale file must never be "
        "able to disable the absolute fallback"
    )


def test_piper_never_persisted_on_save(state_path):
    """If something reaches into ``_demoted_backends`` and adds Piper
    directly (test, future bug, manual debug), ``_save_persisted_demotions``
    must refuse to serialise it so the disk file never holds Piper."""
    from tts.tts_engine import TTSEngine, BACKEND_PIPER

    eng = TTSEngine(auto_init=False)
    eng._demoted_backends.add(BACKEND_PIPER)
    eng._demoted_backends.add('chatterbox_turbo')
    eng._save_persisted_demotions()

    assert state_path.exists()
    written = json.loads(state_path.read_text())
    assert BACKEND_PIPER not in written['demoted'], (
        "Piper leaked into the persisted file — the save filter is broken"
    )
    assert 'chatterbox_turbo' in written['demoted']


# ────────────────────────────────────────────────────────────────────
# 5. FT — clear_persisted_demotions clears all
# ────────────────────────────────────────────────────────────────────


def test_clear_all_persisted_demotions(state_path):
    """``clear_persisted_demotions(None)`` is the hub-install /
    admin-reset hook. Must drop every entry and return the count."""
    from tts.tts_engine import TTSEngine

    eng = TTSEngine(auto_init=False)
    eng._demoted_backends.update({'chatterbox_turbo', 'f5', 'kokoro'})
    eng._save_persisted_demotions()
    assert state_path.exists()

    cleared = TTSEngine.clear_persisted_demotions()
    assert cleared == 3

    written = json.loads(state_path.read_text())
    assert written['demoted'] == {}, (
        "clear_persisted_demotions(None) left rows behind"
    )

    # And a fresh instance hydrates nothing.
    eng2 = TTSEngine(auto_init=False)
    assert eng2._demoted_backends == set()


def test_clear_one_persisted_demotion(state_path):
    """Targeted clear leaves siblings intact."""
    from tts.tts_engine import TTSEngine

    eng = TTSEngine(auto_init=False)
    eng._demoted_backends.update({'chatterbox_turbo', 'f5', 'kokoro'})
    eng._save_persisted_demotions()

    cleared = TTSEngine.clear_persisted_demotions('f5')
    assert cleared == 1

    written = json.loads(state_path.read_text())
    remaining = set(written['demoted'].keys())
    assert remaining == {'chatterbox_turbo', 'kokoro'}


def test_clear_when_no_state_file_returns_zero(state_path):
    """No file → no work → no error."""
    from tts.tts_engine import TTSEngine

    assert not state_path.exists()
    assert TTSEngine.clear_persisted_demotions() == 0
    assert TTSEngine.clear_persisted_demotions('chatterbox_turbo') == 0


def test_clear_unknown_backend_returns_zero(state_path):
    """Clearing a backend that isn't demoted is a no-op (returns 0),
    not an error — admin tooling must be idempotent."""
    from tts.tts_engine import TTSEngine

    eng = TTSEngine(auto_init=False)
    eng._demoted_backends.add('chatterbox_turbo')
    eng._save_persisted_demotions()

    assert TTSEngine.clear_persisted_demotions('nonexistent_backend') == 0
    written = json.loads(state_path.read_text())
    assert 'chatterbox_turbo' in written['demoted'], (
        "unrelated entry was disturbed by clear of a non-demoted backend"
    )


# ────────────────────────────────────────────────────────────────────
# 6. NFT — Failure under threshold does NOT persist (no premature wear)
# ────────────────────────────────────────────────────────────────────


def test_under_threshold_failures_do_not_persist(state_path):
    """Persistence should only fire when demotion fires (i.e. at the
    failure threshold). 1-2 failures must NOT touch disk — that
    avoids file IO on every transient hiccup."""
    from tts.tts_engine import TTSEngine, BACKEND_CHATTERBOX_TURBO

    eng = TTSEngine(auto_init=False)
    eng._record_backend_failure(BACKEND_CHATTERBOX_TURBO)
    eng._record_backend_failure(BACKEND_CHATTERBOX_TURBO)
    # 2 failures — below threshold — no persistence yet.
    assert not state_path.exists(), (
        "tts_state.json was written before the demotion threshold — "
        "wasted disk IO on every transient failure"
    )

    eng._record_backend_failure(BACKEND_CHATTERBOX_TURBO)
    # 3 failures — threshold crossed — persistence should fire.
    assert state_path.exists(), (
        "threshold-crossing failure did NOT persist demotion — the "
        "negative-finding cache is dead"
    )


# ────────────────────────────────────────────────────────────────────
# 7. NFT — Atomic write: the on-disk file is always parseable JSON
# ────────────────────────────────────────────────────────────────────


def test_save_uses_atomic_replace(state_path, monkeypatch):
    """``_save_persisted_demotions`` must write to a temp file then
    ``os.replace`` so a crash mid-write cannot leave a half-written
    file. Verify by asserting that no ``tts_state.*.tmp`` siblings
    are leaked into the directory after a successful save."""
    from tts.tts_engine import TTSEngine

    eng = TTSEngine(auto_init=False)
    eng._demoted_backends.add('chatterbox_turbo')
    eng._save_persisted_demotions()

    siblings = [
        f.name for f in state_path.parent.iterdir()
        if f.name != state_path.name
    ]
    assert not siblings, (
        f"atomic save left temp file siblings: {siblings!r}"
    )

    # And the produced file is parseable JSON with the expected shape.
    parsed = json.loads(state_path.read_text())
    assert parsed['schema'] == 1
    assert 'chatterbox_turbo' in parsed['demoted']


# ────────────────────────────────────────────────────────────────────
# 8. NFT — Corrupt file does not block init
# ────────────────────────────────────────────────────────────────────


def test_corrupt_state_file_does_not_block_init(state_path):
    """A truncated / hand-edited / partially-overwritten state file
    must NOT raise during engine init. Worst case is "we lost the
    cache" — never "TTS won't initialise"."""
    from tts.tts_engine import TTSEngine

    state_path.write_text('{ this is not json ')

    # Must not raise.
    eng = TTSEngine(auto_init=False)
    assert eng._demoted_backends == set()


def test_missing_demoted_key_does_not_block_init(state_path):
    """File exists, schema matches, but no ``demoted`` key — must
    hydrate empty without raising."""
    from tts.tts_engine import TTSEngine, _TTS_STATE_SCHEMA

    state_path.write_text(json.dumps({'schema': _TTS_STATE_SCHEMA}))
    eng = TTSEngine(auto_init=False)
    assert eng._demoted_backends == set()


# ────────────────────────────────────────────────────────────────────
# 9. NFT — Persisted failures_at_demotion is restored to counter
# ────────────────────────────────────────────────────────────────────


def test_hydrate_seeds_consecutive_failures_counter(state_path):
    """On hydrate, ``_consecutive_failures[backend]`` is seeded from
    the persisted ``failures_at_demotion`` so the in-session view is
    consistent (a hydrated-demoted backend already 'looks' like 3
    failures happened)."""
    from tts.tts_engine import TTSEngine, _TTS_STATE_SCHEMA

    now = time.time()
    state_path.write_text(json.dumps({
        'schema': _TTS_STATE_SCHEMA,
        'demoted': {
            'chatterbox_turbo': {
                'first_demoted_at': now,
                'expires_at': now + 86400,
                'failures_at_demotion': 5,
            },
        },
    }))

    eng = TTSEngine(auto_init=False)
    assert eng._consecutive_failures.get('chatterbox_turbo') == 5
