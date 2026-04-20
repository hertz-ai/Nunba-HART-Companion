"""J250 · SPA route matrix — every expected route is wired.

This test locks down the frontend routing contract in MainRoute.js.
When someone renames a page or forgets to register a new route, this
test fails at CI time with a concrete "missing route" message —
before the admin or a user hits a 404 in production.

The approach is deliberately black-box: we grep `MainRoute.js` for
the string `path="/something"` rather than evaluating JSX. The
contract is the set of routes users can actually reach, NOT the
implementation detail of how they're registered.

When a route is legitimately removed, the operator updates the
EXPECTED_ROUTES set with a commit message explaining why.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.journey


_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_MAIN_ROUTE_JS = _REPO_ROOT / "landing-page" / "src" / "MainRoute.js"


# Routes that MUST exist for the product to ship. Each entry is the
# literal `path="..."` string matched in MainRoute.js. Nested routes
# under `<Route path="/social">` are expressed as relative paths
# (e.g. `"profile/:userId"` not `"/social/profile/:userId"`).
EXPECTED_TOP_LEVEL_ROUTES: frozenset[str] = frozenset({
    # Landing / marketing
    "/",
    "/local",            # Nunba offline entry
    "/AboutHevolve",
    "/personalisedlearning",
    "/aboutus",
    "/Plan",
    "/speechtherapy",
    "/trialplan",
    "/contact",
    "/institution",
    "/institution/signup",
    "/signup",
    # Payment
    "/PaymentFailure",
    "/PaymentSuccess",
    "/PendingPaymentPage",
    # Agents
    "/agents",
    "/agents/:agentName",
    # Share-link resolver (J252 depth-test)
    "/s/:token",
    # Docs + Pupit
    "/docs",
    "/pupit",
    # Social app root
    "/social",
    # Admin root + critical sub-pages
    "/admin",
    "/admin/users",
    "/admin/moderation",
    "/admin/agents",
    "/admin/channels",
    "/admin/workflows",
    "/admin/settings",
    "/admin/identity",
    "/admin/models",
    "/admin/providers",
    "/admin/task-ledger",
})


EXPECTED_SOCIAL_NESTED_ROUTES: frozenset[str] = frozenset({
    "profile/:userId",
    "post/:postId",
    "search",
    "achievements",
    "challenges",
    "challenges/:challengeId",
    "seasons",
    "recipes",
    "communities",
    "h/:communityId",
    "tracker",
    "hive",
    "channels",
    "channels/history",
    "settings/backup",
    "settings/appearance",
    "autopilot",
    "tools",
    "marketplace",
    "kids",
    "kids/game/:gameId",
    "kids/progress",
    "kids/create",
    "kids/custom",
    "games",
    "games/:gameId",
    "mindstory",
    "resonance",
    "notifications",
    "regions",
    "regions/:regionId",
    "hub",
    "experiments",
    "compute",
    "encounters",
    "encounters/:encounterId",
    "campaigns",
    "campaigns/:campaignId",
    "campaigns/create",
})


def _extract_path_literals(js_source: str) -> set[str]:
    """Return the set of every `path="..."` literal in the JSX source.

    This matches both double-quoted and brace-wrapped patterns that
    appear in react-router's <Route path="..."> syntax.
    """
    # Simple double-quoted strings (the common case in MainRoute.js)
    return set(re.findall(r'path="([^"]+)"', js_source))


@pytest.mark.timeout(30)
def test_j250_main_route_js_is_readable():
    """The routing file must exist and be non-empty."""
    assert _MAIN_ROUTE_JS.is_file(), (
        f"MainRoute.js not found at {_MAIN_ROUTE_JS} — did the SPA layout "
        f"change? Update this test's path constant."
    )
    source = _MAIN_ROUTE_JS.read_text(encoding="utf-8")
    assert len(source) > 1000, "MainRoute.js suspiciously short"


@pytest.mark.timeout(30)
def test_j250_every_top_level_route_is_registered():
    """Every EXPECTED_TOP_LEVEL_ROUTES entry must appear in MainRoute.js."""
    source = _MAIN_ROUTE_JS.read_text(encoding="utf-8")
    found = _extract_path_literals(source)

    missing = EXPECTED_TOP_LEVEL_ROUTES - found
    assert not missing, (
        f"SPA route contract regressed — these routes disappeared from "
        f"MainRoute.js: {sorted(missing)}. If this is intentional, update "
        f"EXPECTED_TOP_LEVEL_ROUTES and explain why in the commit."
    )


@pytest.mark.timeout(30)
def test_j250_every_social_nested_route_is_registered():
    """Nested routes under /social must all be present."""
    source = _MAIN_ROUTE_JS.read_text(encoding="utf-8")
    found = _extract_path_literals(source)

    missing = EXPECTED_SOCIAL_NESTED_ROUTES - found
    assert not missing, (
        f"/social nested route contract regressed — missing: {sorted(missing)}. "
        f"A user clicking the nav link will 404."
    )


@pytest.mark.timeout(30)
def test_j250_share_token_route_resolves_dynamic_param():
    """Specifically verify the /s/:token route uses a URL param, not a
    hard-coded string. If someone accidentally writes /s/mytoken instead
    of /s/:token, every share link in the wild breaks."""
    source = _MAIN_ROUTE_JS.read_text(encoding="utf-8")
    # The token parameter MUST be a react-router param (leading colon)
    assert 'path="/s/:token"' in source, (
        "Share-link route /s/:token lost its dynamic param — all existing "
        "share URLs would break"
    )


@pytest.mark.timeout(30)
def test_j250_catchall_404_exists():
    """A wildcard <Route path="*"> must be last so unknown paths land
    on the NotFound page, not white-screen."""
    source = _MAIN_ROUTE_JS.read_text(encoding="utf-8")
    assert 'path="*"' in source, (
        "No catch-all `path=\"*\"` route — unknown URLs would render a "
        "blank page"
    )
    # Also confirm a NotFoundPage component exists in the same file.
    assert "NotFoundPage" in source, (
        "NotFoundPage component missing from MainRoute.js — the 404 "
        "handler has no renderer"
    )


@pytest.mark.timeout(30)
def test_j250_kids_routes_are_open_access_except_gated_ones():
    """Kids hub + kids/game/:gameId must be PUBLIC (no RoleGuard). The
    product intent: kids can discover + play games without signing up.
    Progress + game creation legitimately require sign-in.
    """
    source = _MAIN_ROUTE_JS.read_text(encoding="utf-8")

    # Isolate the "kids" section by looking for the route declarations.
    # We check that the kids + kids/game/:gameId routes do NOT have
    # RoleGuard wrappers in their element definitions.
    # Match: <Route path="kids" element={<KidsLearningHub />} />
    hub_match = re.search(
        r'path="kids"\s+element=\{<([^<>]+)', source,
    )
    assert hub_match is not None, "`kids` route not found"
    hub_elem = hub_match.group(1)
    assert "RoleGuard" not in hub_elem, (
        f"`/social/kids` is gated by RoleGuard ({hub_elem!r}) — kids hub "
        f"must be open access"
    )

    game_match = re.search(
        r'path="kids/game/:gameId"\s+element=\{<([^<>]+)', source,
    )
    assert game_match is not None, "`kids/game/:gameId` route not found"
    game_elem = game_match.group(1)
    assert "RoleGuard" not in game_elem, (
        f"`/social/kids/game/:gameId` is gated by RoleGuard ({game_elem!r}) "
        f"— game play must be open access"
    )
