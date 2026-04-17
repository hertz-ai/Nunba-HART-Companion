"""Family M — accessibility (WCAG 2.1 AA lens).

Pure-source-scan checks over the React tree. Cypress + axe-core cover
runtime checks; those live outside this harness in docs.yml.

Each assertion here maps to a WCAG success criterion and is
recoverable in a single patch if it fails.
"""

from __future__ import annotations

import re

import pytest

pytestmark = pytest.mark.unit


@pytest.fixture(scope="module")
def react_src(project_root):
    p = project_root / "landing-page" / "src"
    if not p.exists():
        pytest.skip("landing-page/src absent")
    return p


def test_m1_skip_link_present(react_src):
    """WCAG 2.4.1 Bypass Blocks — skip-to-main-content link must
    exist in the app shell.
    """
    hits = []
    for p in react_src.rglob("*.js"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "Skip to main content" in t or 'href="#main-content"' in t:
            hits.append(p.name)
    assert hits, (
        "no skip-link in React app shell (WCAG 2.4.1 Bypass Blocks)"
    )


def test_m2_images_have_alt(react_src):
    """WCAG 1.1.1 Non-text Content — every <img> needs alt (may be empty
    for decorative images but must be present).
    """
    pat_img = re.compile(r"<img\b[^>]*>", re.IGNORECASE)
    bad = []
    for p in react_src.rglob("*.js"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in pat_img.finditer(t):
            tag = m.group(0)
            if "alt=" not in tag and "alt =" not in tag:
                bad.append((p.name, tag[:80]))
    assert not bad, (
        f"{len(bad)} <img> tags missing alt attribute (WCAG 1.1.1). "
        f"First 3: {bad[:3]}"
    )


def test_m3_buttons_accessible(react_src):
    """WCAG 4.1.2 Name, Role, Value — every Button / button needs
    either text content OR an aria-label.
    """
    # Pattern: <Button ... /> or <button ... /> with empty body.
    pat_empty = re.compile(
        r"<(Button|button)\b([^>]*)(?:/>|>\s*</\1>)",
        re.IGNORECASE,
    )
    bad = []
    for p in react_src.rglob("*.js"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in pat_empty.finditer(t):
            attrs = m.group(2)
            if "aria-label" not in attrs and "aria-labelledby" not in attrs:
                bad.append((p.name, m.group(0)[:80]))
    assert not bad, (
        f"{len(bad)} empty <button>/<Button> without aria-label "
        f"(WCAG 4.1.2). First 3: {bad[:3]}"
    )


def test_m4_focus_ring_not_suppressed_globally(react_src):
    """WCAG 2.4.7 Focus Visible — global `outline: none` without a
    replacement focus style breaks keyboard navigation.
    """
    bad = []
    for p in list(react_src.rglob("*.css")) + list(react_src.rglob("*.scss")):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        # Global outline: none on *, body, html, :focus (without :focus-visible paired)
        if re.search(r"(\*|body|html|:focus)\s*\{[^}]*outline\s*:\s*none", t):
            # Acceptable if the same file defines :focus-visible
            if ":focus-visible" not in t:
                bad.append(p.name)
    assert not bad, (
        f"global outline:none suppresses focus ring without :focus-visible "
        f"replacement in: {bad} (WCAG 2.4.7)"
    )


def test_m5_reduced_motion_honored(react_src):
    """WCAG 2.3.3 Animation from Interactions — CSS/JS must respect
    `prefers-reduced-motion`. Heuristic: any file with keyframes/
    animation should have a @media (prefers-reduced-motion: reduce)
    block somewhere in the project.
    """
    has_animation = False
    has_reduced_motion = False
    for p in list(react_src.rglob("*.css")) + list(react_src.rglob("*.js")):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "@keyframes" in t or "animation:" in t or "transition:" in t:
            has_animation = True
        if "prefers-reduced-motion" in t:
            has_reduced_motion = True
        if has_animation and has_reduced_motion:
            break
    if has_animation and not has_reduced_motion:
        pytest.fail(
            "app ships animations without a prefers-reduced-motion "
            "respecting block (WCAG 2.3.3)"
        )
