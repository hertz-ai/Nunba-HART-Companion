"""Tests for the python-embed invalidation mechanism.

Background (from git history + 2026-04-16 user report):

Three prior commits fixed the "Indic Parler ModuleNotFoundError: regex"
symptom at the deps.py layer:
  * 481f25a (2026-04-10) pinned regex/numpy/tqdm/pyyaml in EMBED_DEPS
  * 31e480e (2026-04-14) included EMBED_DEPS in requirements.txt
  * 0c6274f (2026-04-14) preserved .dist-info metadata

None of them reached the user because build.py preserves the
python-embed/ snapshot across builds and only rebuilds when the
directory is entirely missing.  Any EMBED_DEPS addition made after the
snapshot was first built got ignored forever.

This test suite locks in the invalidation contract so the fix can't
regress a fourth time.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Make scripts/ importable for these tests
_SCRIPTS = os.path.join(os.path.dirname(__file__), '..', 'scripts')
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)


# ─────────────────────────────────────────────────────────────────────
# Hash gate — any EMBED_DEPS edit must change the hash
# ─────────────────────────────────────────────────────────────────────

def test_hash_is_stable_across_dict_order():
    """Hash must be order-independent.  Python dict ordering is
    insertion-preserving, but we sort keys before hashing so that
    editing deps.py to alphabetize entries doesn't trigger a rebuild."""
    import deps
    h1 = deps.compute_embed_deps_hash()
    original = deps.EMBED_DEPS
    try:
        deps.EMBED_DEPS = {k: original[k] for k in sorted(original)}
        h2 = deps.compute_embed_deps_hash()
        assert h1 == h2, "Reordering keys must not change hash"
    finally:
        deps.EMBED_DEPS = original


def test_hash_changes_when_version_bumped():
    """Bumping any pinned version must change the hash — otherwise
    the snapshot cache wins and the bump never takes effect."""
    import deps
    h1 = deps.compute_embed_deps_hash()
    original = deps.EMBED_DEPS
    try:
        deps.EMBED_DEPS = {**original, 'regex': '9999.99.99'}
        h2 = deps.compute_embed_deps_hash()
        assert h1 != h2, "Version bump must change hash"
    finally:
        deps.EMBED_DEPS = original


def test_hash_changes_when_package_added():
    """This is the regression-critical case.  When 481f25a added
    `regex` to EMBED_DEPS, the hash (if it had existed) should have
    changed — forcing build.py to rebuild python-embed and include
    the new package."""
    import deps
    h1 = deps.compute_embed_deps_hash()
    original = deps.EMBED_DEPS
    try:
        deps.EMBED_DEPS = {**original, '__test_newpkg': '1.0.0'}
        h2 = deps.compute_embed_deps_hash()
        assert h1 != h2, "Adding a package must change hash"
    finally:
        deps.EMBED_DEPS = original


def test_hash_changes_when_package_removed():
    import deps
    h1 = deps.compute_embed_deps_hash()
    original = deps.EMBED_DEPS
    try:
        deps.EMBED_DEPS = {k: v for k, v in original.items() if k != 'regex'}
        h2 = deps.compute_embed_deps_hash()
        assert h1 != h2, "Removing a package must change hash"
    finally:
        deps.EMBED_DEPS = original


def test_hash_is_short_hex_string():
    """Hash gets written to python-embed.hash on disk — keep it short
    and pure hex so the file is trivial to compare manually."""
    import deps
    h = deps.compute_embed_deps_hash()
    assert len(h) == 16, "Expected 16-char hash"
    assert all(c in '0123456789abcdef' for c in h), "Expected pure hex"


# ─────────────────────────────────────────────────────────────────────
# Presence gate — belt-and-braces check catches stale snapshots
# ─────────────────────────────────────────────────────────────────────

def test_missing_embed_packages_empty_dir(tmp_path):
    """An empty site-packages returns ALL EMBED_DEPS as missing —
    that's the cold-start / fresh-clone signal."""
    import deps
    missing = deps.missing_embed_packages(str(tmp_path))
    assert set(missing) == set(deps.EMBED_DEPS.keys()), (
        "Every EMBED_DEPS package must be flagged missing in an empty dir"
    )


def test_missing_embed_packages_regex_specifically(tmp_path):
    """The concrete regression we're guarding against: `regex` directory
    absent from the snapshot even though the rest is populated.  Must
    be flagged so build.py can top it up."""
    import deps
    # Populate all deps EXCEPT regex
    for name in deps.EMBED_DEPS:
        if name == 'regex':
            continue
        (tmp_path / deps.embed_package_dir_name(name)).mkdir()

    missing = deps.missing_embed_packages(str(tmp_path))
    assert missing == ['regex'], (
        "Only regex should be flagged when every other package is present"
    )


def test_missing_embed_packages_all_present(tmp_path):
    """When every package directory exists, nothing missing."""
    import deps
    for name in deps.EMBED_DEPS:
        (tmp_path / deps.embed_package_dir_name(name)).mkdir()
    assert deps.missing_embed_packages(str(tmp_path)) == []


def test_embed_package_dir_name_handles_exceptions():
    """pyyaml → yaml, opencv-python → cv2, etc.  These are the
    packages whose import name differs from the pip name.  Getting
    them wrong means missing_embed_packages falsely flags them."""
    import deps
    assert deps.embed_package_dir_name('pyyaml') == 'yaml'
    assert deps.embed_package_dir_name('faiss-cpu') == 'faiss'
    assert deps.embed_package_dir_name('opencv-python') == 'cv2'
    assert deps.embed_package_dir_name('scikit-learn') == 'sklearn'
    # Default: hyphen → underscore
    assert deps.embed_package_dir_name('sentence-transformers') == 'sentence_transformers'
    # No transformation needed
    assert deps.embed_package_dir_name('regex') == 'regex'
    assert deps.embed_package_dir_name('numpy') == 'numpy'


# ─────────────────────────────────────────────────────────────────────
# Wiring invariant — build.py must actually call these helpers
# ─────────────────────────────────────────────────────────────────────

def test_build_py_calls_invalidation_helpers():
    """AST-level check that build.py imports and calls the hash +
    presence helpers.  Without this, someone could add the helpers to
    deps.py but forget to wire them into build.py — repeating the
    exact pattern that caused the 3-times-fixed regex bug.
    """
    import ast
    build_py = os.path.join(os.path.dirname(__file__), '..',
                             'scripts', 'build.py')
    with open(build_py, encoding='utf-8') as f:
        tree = ast.parse(f.read())

    names_referenced = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Name):
            names_referenced.add(node.id)
        elif isinstance(node, ast.Attribute):
            names_referenced.add(node.attr)
        elif isinstance(node, ast.ImportFrom) and node.module == 'deps':
            for alias in node.names:
                names_referenced.add(alias.name)

    assert 'compute_embed_deps_hash' in names_referenced, (
        "build.py must call compute_embed_deps_hash — otherwise the "
        "EMBED_DEPS change detection never fires and stale snapshots "
        "get reused forever (the exact regex bug)"
    )
    assert 'missing_embed_packages' in names_referenced, (
        "build.py must call missing_embed_packages as the belt-and-"
        "braces top-up check after the hash gate"
    )
