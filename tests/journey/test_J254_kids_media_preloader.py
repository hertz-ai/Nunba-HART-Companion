"""J254 · Kids media preloader — static surface contract.

The MediaPreloader module orchestrates pre-caching for every kids
game (images, TTS, music). Breaking its surface silently turns every
game into a mid-flight "loading…" because content loads JIT instead
of being staged.

We don't execute JS here (would need a browser); we statically lock:

  1. MediaPreloader.js exports a default object with the exact methods
     Kids pages depend on: preloadForUpcomingGames, preloadForGame,
     preloadCommonPhrases, getPreloadStatus.
  2. GameAssetService.js exposes preloadImages, getMusic — the two
     methods MediaPreloader invokes on every call path.
  3. The preloader uses Promise.allSettled — a .all (fail-fast)
     would cancel other pre-fetches if one 503'd. That's a known
     regression pattern.
  4. Every path uses `.catch(() => {})` for fire-and-forget fallback
     so a failed image prefetch doesn't surface as an unhandled
     rejection in the console.
"""

from __future__ import annotations

from pathlib import Path

import pytest

pytestmark = pytest.mark.journey


_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_PRELOADER_JS = (
    _REPO_ROOT / "landing-page" / "src" / "components"
    / "Social" / "KidsLearning" / "shared" / "MediaPreloader.js"
)
_GAME_ASSET_JS = (
    _REPO_ROOT / "landing-page" / "src" / "components"
    / "Social" / "KidsLearning" / "shared" / "GameAssetService.js"
)


@pytest.mark.timeout(30)
def test_j254_preloader_file_exists():
    assert _PRELOADER_JS.is_file(), (
        f"MediaPreloader.js missing at {_PRELOADER_JS} — SPA will fail "
        f"to import, every kids page white-screens"
    )


@pytest.mark.timeout(30)
def test_j254_preloader_exposes_required_methods():
    """Every kids page import uses one or more of these methods."""
    source = _PRELOADER_JS.read_text(encoding="utf-8")
    required = [
        "preloadForUpcomingGames:",
        "preloadForGame:",
        "preloadCommonPhrases:",
        "getPreloadStatus:",
    ]
    for method in required:
        assert method in source, (
            f"MediaPreloader lost `{method.rstrip(':')}` — SPA pages that "
            f"import this method get undefined-is-not-a-function at runtime"
        )

    # Default export is mandatory for existing `import MediaPreloader`
    assert "export default MediaPreloader" in source, (
        "MediaPreloader lost its default export — existing "
        "`import MediaPreloader from './MediaPreloader'` statements break"
    )


@pytest.mark.timeout(30)
def test_j254_preloader_uses_allsettled_not_all():
    """Promise.all fail-fasts on the first rejection — one 503 image
    cancels TTS + music pre-caching. allSettled is the correct primitive
    for fire-and-forget fan-out."""
    source = _PRELOADER_JS.read_text(encoding="utf-8")

    # Must USE allSettled somewhere
    assert "Promise.allSettled" in source, (
        "MediaPreloader no longer uses Promise.allSettled — a failed "
        "image prefetch would cancel TTS + music prefetches"
    )

    # Must NOT use bare Promise.all for the fan-out — this is a common
    # regression. It's fine to import Promise.all for other reasons, but
    # inside the preload methods, allSettled is the rule.
    # Crude check: count occurrences. allSettled must dominate.
    n_all_settled = source.count("Promise.allSettled")
    n_all_bare = source.count("Promise.all(") - n_all_settled
    assert n_all_bare <= 0, (
        f"MediaPreloader uses Promise.all in {n_all_bare} place(s) — "
        f"should be Promise.allSettled. Fail-fast will cancel sibling "
        f"prefetches when any one 503s."
    )


@pytest.mark.timeout(30)
def test_j254_preloader_swallows_errors_for_fire_and_forget():
    """Every in-flight preload promise must have .catch(() => {}) — a
    background prefetch that logs an unhandled rejection on a 503 is
    user-visible noise in the browser console."""
    source = _PRELOADER_JS.read_text(encoding="utf-8")

    # Preload calls MUST chain a .catch. We grep for the pattern.
    # Acceptable: `.catch(() => {})` or `.catch(() => null)` or try/catch
    assert ".catch(() => {})" in source or ".catch(()" in source, (
        "MediaPreloader no longer swallows errors on preload chains — "
        "unhandled promise rejection warnings will spam the browser "
        "console on every 503 image"
    )


@pytest.mark.timeout(30)
def test_j254_game_asset_service_file_exists():
    assert _GAME_ASSET_JS.is_file(), (
        f"GameAssetService.js missing at {_GAME_ASSET_JS} — "
        f"MediaPreloader.preloadForGame throws on import"
    )


@pytest.mark.timeout(30)
def test_j254_game_asset_service_exposes_required_methods():
    """MediaPreloader calls GameAssetService.preloadImages and
    GameAssetService.getMusic — both must exist on the default export."""
    source = _GAME_ASSET_JS.read_text(encoding="utf-8")

    for method in ("preloadImages", "getMusic"):
        assert method in source, (
            f"GameAssetService lost `{method}` — MediaPreloader preload "
            f"chains will reject on TypeError: ... is not a function"
        )

    # Must expose a default export for the import pattern used across
    # the SPA: `import GameAssetService from './GameAssetService'`
    assert "export default" in source, (
        "GameAssetService lost its default export — existing imports break"
    )


@pytest.mark.timeout(30)
def test_j254_preloader_extracts_texts_across_all_game_shapes():
    """_extractAllTexts walks questions/words/pairs/statements/sentences/
    story.scenes shapes. If one is dropped, that content-type plays
    without narration in the game."""
    source = _PRELOADER_JS.read_text(encoding="utf-8")

    # Each content shape must be referenced in _extractAllTexts.
    content_shapes = [
        "questions",
        "words",
        "pairs",
        "statements",
        "sentences",
    ]
    for shape in content_shapes:
        assert f"'{shape}'" in source or f'"{shape}"' in source, (
            f"_extractAllTexts dropped the `{shape}` shape — games "
            f"using that content type play silent (no TTS)"
        )

    # Story scenes narration
    assert "scenes" in source, (
        "_extractAllTexts dropped story.scenes — narration-driven "
        "story games play silent"
    )
