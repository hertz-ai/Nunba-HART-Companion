"""AST-level guards: GREETINGS exists once, lives in core.constants only.

This file enforces Gate 4 (parallel-path) of the Change Protocol for
the TTS handshake greeting dict.  Before this module was added, the
project carried TWO independent definitions of the same concept:

    1. ``tts/verified_synth.py`` defined an inline ``_TEST_PHRASES``
       dict with 17 language entries.
    2. The new handshake work created ``GREETINGS`` in
       ``core.constants`` (HARTOS) with 20 language entries.

The two inevitably drift — the bug class CLAUDE.md calls "parallel
paths always drift".  The cleanup collapsed them into a single
canonical definition in ``HARTOS/core/constants.py`` and rewrote
``verified_synth`` to import it.  This test makes that consolidation
MECHANICAL rather than hopeful: any future PR that re-introduces an
inline greeting-phrase dict in Nunba's tts/ tree will fail this
check.

The guards are INTENTIONALLY AST-level (not regex) so that:
    - Comments mentioning "_TEST_PHRASES" don't trip us.
    - The import alias ``from core.constants import GREETINGS as
      _TEST_PHRASES`` in verified_synth.py is allowed — it's an
      import rename, not a redefinition.
    - A future bad-faith rename like ``_GREETINGS2 = {...}`` is
      caught by the value-shape check (dict literal of
      str → str-containing-letters) rather than by name matching
      a fixed list.

If these tests fail, the remediation is NEVER to "add the new file
to an allowlist here" — it's to import from ``core.constants`` and
delete the local dict.  That's the whole point.
"""
from __future__ import annotations

import ast
import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

# Files under Nunba that MUST NOT declare their own greeting dict.
# We walk these with ast, not regex, so comments and docstrings can
# mention "_TEST_PHRASES" or "greeting" freely.
_TTS_FILES_UNDER_AUDIT = (
    os.path.join(PROJECT_ROOT, "tts", "tts_engine.py"),
    os.path.join(PROJECT_ROOT, "tts", "tts_handshake.py"),
    os.path.join(PROJECT_ROOT, "tts", "verified_synth.py"),
)


def _tree(path: str) -> ast.Module:
    """Parse a file into an AST, raising a readable error if missing."""
    assert os.path.exists(path), (
        f"expected audited TTS file missing: {path} — this guard can't "
        f"check for parallel dicts in a file that doesn't exist"
    )
    with open(path, encoding="utf-8") as f:
        return ast.parse(f.read(), filename=path)


def _iter_assigns(tree: ast.Module):
    """Yield every Assign / AnnAssign node in the module, including
    inside class and function bodies.  We want ALL of them — a
    greeting dict smuggled into a helper function is still a parallel
    path.
    """
    for node in ast.walk(tree):
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            yield node


def _dict_is_lang_to_phrase(value: ast.expr) -> bool:
    """Return True iff `value` is a literal dict mapping short ISO
    codes to non-empty strings.

    Shape heuristic: at least 3 entries, all keys are str constants of
    length 2-5 (matches 'en', 'ta', 'zh', 'hi-Latn'), all values are
    str constants containing at least one alphabetic character.  This
    catches GREETINGS-shaped dicts regardless of what name they're
    bound to — a bad-faith rename to ``_PHRASES`` or ``_HANDSHAKE_TEXT``
    is still flagged.
    """
    if not isinstance(value, ast.Dict):
        return False
    if len(value.keys) < 3:
        return False
    for k, v in zip(value.keys, value.values):
        if not isinstance(k, ast.Constant) or not isinstance(k.value, str):
            return False
        if not 2 <= len(k.value) <= 5:
            return False
        if not isinstance(v, ast.Constant) or not isinstance(v.value, str):
            return False
        if not any(ch.isalpha() for ch in v.value):
            return False
    return True


def _collect_bound_names(node: ast.Assign | ast.AnnAssign) -> list[str]:
    """Return the list of top-level names this assignment binds.

    For ``A = B = {...}`` returns both names; for ``X: dict = {...}``
    returns just ``X``.
    """
    names: list[str] = []
    if isinstance(node, ast.AnnAssign):
        if isinstance(node.target, ast.Name):
            names.append(node.target.id)
    else:
        for tgt in node.targets:
            if isinstance(tgt, ast.Name):
                names.append(tgt.id)
    return names


# ══════════════════════════════════════════════════════════════════════
# Test 1 — no inline GREETINGS-shaped dict literal in Nunba's tts/
# ══════════════════════════════════════════════════════════════════════

def test_no_inline_greeting_dict_in_nunba_tts():
    """No module in ``tts/`` may declare its own lang→phrase dict.

    The one acceptable place is ``HARTOS/core/constants.py`` where
    ``GREETINGS`` lives.  Everyone else imports from there.
    """
    offenders: list[tuple[str, int, str]] = []
    for path in _TTS_FILES_UNDER_AUDIT:
        tree = _tree(path)
        for assign in _iter_assigns(tree):
            value = assign.value
            if value is None:
                continue
            if _dict_is_lang_to_phrase(value):
                names = _collect_bound_names(assign) or ["<unnamed>"]
                offenders.append((
                    os.path.relpath(path, PROJECT_ROOT),
                    assign.lineno,
                    ",".join(names),
                ))
    assert not offenders, (
        "Inline GREETINGS-shaped dict found in Nunba TTS files. "
        "The canonical home is HARTOS/core/constants.py::GREETINGS. "
        "Remove the local dict and import from core.constants.\n"
        + "\n".join(f"  {p}:{ln}  bound as {names}"
                    for p, ln, names in offenders)
    )


# ══════════════════════════════════════════════════════════════════════
# Test 2 — the canonical GREETINGS really exists and covers the core
# cohort (en, ta, hi).  These three are the ones the handshake's prod
# fallback ladder and the Indic cohort cover — if any is missing the
# banner would silently fall back to English even for Tamil/Hindi
# users, which is the whole failure this work is supposed to end.
# ══════════════════════════════════════════════════════════════════════

def test_canonical_greetings_exports_core_langs():
    """core.constants.GREETINGS must define en / ta / hi keys."""
    from core.constants import GREETING_FALLBACK_LANG, GREETINGS
    assert isinstance(GREETINGS, dict)
    for lang in ("en", "ta", "hi"):
        assert lang in GREETINGS, (
            f"GREETINGS missing core cohort language {lang!r} — this is "
            f"the language the handshake will try to greet the user in"
        )
        assert isinstance(GREETINGS[lang], str) and GREETINGS[lang].strip(), (
            f"GREETINGS[{lang!r}] must be a non-empty greeting string"
        )
    assert GREETING_FALLBACK_LANG in GREETINGS, (
        f"GREETING_FALLBACK_LANG={GREETING_FALLBACK_LANG!r} must be a "
        f"valid key in GREETINGS"
    )


# ══════════════════════════════════════════════════════════════════════
# Test 3 — verified_synth imports GREETINGS from core.constants
# instead of redefining it.  This is the specific pattern the
# refactor put in place; regressing it would silently re-introduce
# the parallel path.
# ══════════════════════════════════════════════════════════════════════

def test_verified_synth_imports_greetings_from_core_constants():
    """tts/verified_synth.py must import GREETINGS from core.constants."""
    path = os.path.join(PROJECT_ROOT, "tts", "verified_synth.py")
    tree = _tree(path)
    imported_from_core = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "core.constants":
            for alias in node.names:
                if alias.name == "GREETINGS":
                    imported_from_core = True
                    break
    assert imported_from_core, (
        "tts/verified_synth.py must `from core.constants import GREETINGS` "
        "(optionally `as _TEST_PHRASES` for readability).  Defining its "
        "own test-phrase dict re-introduces the DRY violation the "
        "refactor eliminated."
    )


# ══════════════════════════════════════════════════════════════════════
# Test 4 — tts_handshake uses the canonical import too.  Different
# import style (``from core.constants import GREETINGS, GREETING_FALLBACK_LANG``)
# but same invariant: single source of truth.
# ══════════════════════════════════════════════════════════════════════

def test_tts_handshake_imports_from_core_constants():
    """tts/tts_handshake.py must reference core.constants for phrases."""
    path = os.path.join(PROJECT_ROOT, "tts", "tts_handshake.py")
    tree = _tree(path)
    seen_greetings = False
    seen_fallback = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "core.constants":
            for alias in node.names:
                if alias.name == "GREETINGS":
                    seen_greetings = True
                if alias.name == "GREETING_FALLBACK_LANG":
                    seen_fallback = True
    assert seen_greetings and seen_fallback, (
        "tts/tts_handshake.py must `from core.constants import GREETINGS, "
        "GREETING_FALLBACK_LANG`.  Both are required: the dict for lookup, "
        "the fallback for when the user's lang isn't in it."
    )


if __name__ == "__main__":
    test_no_inline_greeting_dict_in_nunba_tts()
    test_canonical_greetings_exports_core_langs()
    test_verified_synth_imports_greetings_from_core_constants()
    test_tts_handshake_imports_from_core_constants()
    print("All GREETINGS single-source-of-truth guards passed.")
