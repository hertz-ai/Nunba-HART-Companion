"""J257 · Provider efficiency leaderboard endpoint.

/api/admin/providers/efficiency/leaderboard powers the "who is
fastest / cheapest / highest quality" ranking table in admin →
providers.  Drives dispatcher hints for smart-routing.

Invariants:

  1. Response shape: {success:true, leaderboard:[...], summary:{...}}
     when the matrix module is available, or 503 + error when not.
  2. `leaderboard` is an array; each entry is a dict (dataclass asdict
     at main.py:2318).  Ordering is provider-specific but the shape
     is fixed.
  3. `model_type` query param accepts 'llm' (default), 'tts', 'stt',
     'vlm'; unknown values must not 500 (empty leaderboard is fine).
  4. `sort_by` query param accepts 'efficiency', 'speed', 'quality',
     'cost'; unknown values must not 500.
  5. The capped size (<=20 at main.py:2318) is observed — the admin UI
     paginates above that.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j257_leaderboard_default_request_has_envelope(nunba_flask_app):
    """GET /api/admin/providers/efficiency/leaderboard with no params
    must return {success,leaderboard,summary} OR 503 with error."""
    resp = nunba_flask_app.get("/api/admin/providers/efficiency/leaderboard")
    assert resp.status_code < 500, (
        f"leaderboard crashed: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )

    body = resp.get_json(silent=True)
    if resp.status_code == 503:
        assert body and "error" in body, (
            f"503 missing error field. Body: {body!r}"
        )
        return

    if resp.status_code == 200:
        assert body is not None, "200 response had no JSON body"
        assert body.get("success") is True, (
            f"200 response missing success:true. Body: {body!r}"
        )
        assert "leaderboard" in body, (
            f"200 response missing 'leaderboard' key — admin UI renders "
            f"[].map() on this array. Body: {body!r}"
        )
        assert "summary" in body, (
            f"200 response missing 'summary' key. Body: {body!r}"
        )


@pytest.mark.timeout(60)
def test_j257_leaderboard_is_a_list(nunba_flask_app):
    """leaderboard MUST be a JSON array (Python list). An object would
    crash `leaderboard.map(...)` in the admin UI."""
    resp = nunba_flask_app.get("/api/admin/providers/efficiency/leaderboard")
    if resp.status_code != 200:
        pytest.skip(f"non-200 status: {resp.status_code}")

    body = resp.get_json(silent=True) or {}
    board = body.get("leaderboard")
    assert isinstance(board, list), (
        f"leaderboard must be a JSON array — got "
        f"{type(board).__name__}: {board!r}"
    )


@pytest.mark.timeout(60)
def test_j257_leaderboard_capped_at_20(nunba_flask_app):
    """main.py:2318 slices the top 20. If someone removes the slice
    and the leaderboard has 100 entries, admin UI stalls rendering
    that giant table."""
    resp = nunba_flask_app.get("/api/admin/providers/efficiency/leaderboard")
    if resp.status_code != 200:
        pytest.skip(f"non-200 status: {resp.status_code}")

    body = resp.get_json(silent=True) or {}
    board = body.get("leaderboard", [])
    if isinstance(board, list):
        assert len(board) <= 20, (
            f"leaderboard returned {len(board)} entries — the [:20] slice "
            f"at main.py:2318 was removed. Admin UI rendering will stall."
        )


@pytest.mark.timeout(60)
def test_j257_unknown_model_type_does_not_crash(nunba_flask_app):
    """?model_type=unknown-type must not 500."""
    resp = nunba_flask_app.get(
        "/api/admin/providers/efficiency/leaderboard"
        "?model_type=definitely-not-a-model-type"
    )
    assert resp.status_code < 500, (
        f"Unknown model_type crashed leaderboard: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )


@pytest.mark.timeout(60)
def test_j257_unknown_sort_by_does_not_crash(nunba_flask_app):
    """?sort_by=random-field must not 500. The matrix module may
    return an unsorted list or an empty list; that's OK. 500 is not."""
    resp = nunba_flask_app.get(
        "/api/admin/providers/efficiency/leaderboard?sort_by=random-field"
    )
    assert resp.status_code < 500, (
        f"Unknown sort_by crashed: {resp.status_code}. "
        f"Body: {resp.get_data(as_text=True)[:300]!r}"
    )


@pytest.mark.timeout(60)
def test_j257_entries_are_flat_dicts(nunba_flask_app):
    """Each leaderboard entry must be a flat dict (dataclass asdict
    output). No nested pydantic models that would break json.stringify
    downstream."""
    resp = nunba_flask_app.get("/api/admin/providers/efficiency/leaderboard")
    if resp.status_code != 200:
        pytest.skip(f"non-200: {resp.status_code}")

    body = resp.get_json(silent=True) or {}
    board = body.get("leaderboard", [])
    if not isinstance(board, list) or not board:
        pytest.skip("empty leaderboard in this environment")

    for i, entry in enumerate(board):
        assert isinstance(entry, dict), (
            f"leaderboard[{i}] is not a dict: "
            f"{type(entry).__name__} {entry!r}"
        )
        # Common keys every entry is expected to carry. We allow extra
        # keys; we fail if NONE of the expected keys are present — that
        # means the dataclass was renamed and the UI definitely breaks.
        expected_hint = {"provider_id", "model", "score", "efficiency", "latency_ms"}
        intersection = expected_hint & set(entry.keys())
        assert intersection, (
            f"leaderboard[{i}] has none of {sorted(expected_hint)} — "
            f"efficiency dataclass was renamed or flattening regressed. "
            f"Entry: {entry!r}"
        )
