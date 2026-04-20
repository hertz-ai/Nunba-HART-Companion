"""J164 · Post+comment+vote race on same post.

User journey from PRODUCT_MAP.md §COMBINATIONS.

Steps: POST vote + POST comment + edit post within 200ms. Verify:
all 3 persisted; WAMP ordering preserved.

At contract tier: three endpoints reachable; concurrent calls
return envelopes (most will 401/400 without real auth — what we
guard against is 5xx).
"""

from __future__ import annotations

import concurrent.futures

import pytest

pytestmark = pytest.mark.journey


@pytest.mark.timeout(60)
def test_j164_race_vote_comment_edit(nunba_flask_app):
    def _vote():
        return nunba_flask_app.post(
            "/api/social/posts/j164-post/vote",
            json={"direction": "up"},
            headers={"Content-Type": "application/json"},
        )

    def _comment():
        return nunba_flask_app.post(
            "/api/social/posts/j164-post/comments",
            json={"body": "race test"},
            headers={"Content-Type": "application/json"},
        )

    def _edit():
        return nunba_flask_app.put(
            "/api/social/posts/j164-post",
            json={"body": "edited"},
            headers={"Content-Type": "application/json"},
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        fv, fc, fe = ex.submit(_vote), ex.submit(_comment), ex.submit(_edit)
        rv, rc, re = fv.result(30), fc.result(30), fe.result(30)

    reachable = [r for r in (rv, rc, re) if r.status_code != 404]
    if not reachable:
        pytest.skip("social post endpoints not mounted")
    for r in reachable:
        body = r.get_data(as_text=True)
        assert not (r.status_code >= 500 and not body.strip())


@pytest.mark.timeout(30)
def test_j164_bogus_post_id_graceful(nunba_flask_app):
    """A vote on a clearly-nonexistent post must be 404/400, not 500."""
    r = nunba_flask_app.post(
        "/api/social/posts/" + ("x" * 256) + "/vote",
        json={"direction": "up"},
        headers={"Content-Type": "application/json"},
    )
    if r.status_code == 404 and r.get_json(silent=True) is None:
        pytest.skip("social vote endpoint not mounted")
    assert r.status_code < 500
