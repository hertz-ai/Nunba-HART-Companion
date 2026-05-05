"""Regression guard for the Indic Parler TTS bundling chain.

Root cause (2026-04-18, frozen_debug.log 11:36:40):
  Indic Parler TTS worker crashed with
  `ModuleNotFoundError: No module named 'sympy'`.
  torch._dynamo (imported transitively through transformers at model
  load) does `import sympy` at the top of
  torch/utils/_sympy/functions.py.  python-embed shipped sympy's
  dist-info but not the package itself — scripts/build.py's
  slim_python_embed() was aggressively deleting the sympy/ directory
  with the (stale) comment "transitive dep only".

This test prevents three regressions from recurring:

  1. Someone removes `sympy` / `mpmath` from deps.EMBED_DEPS → the
     python-embed build no longer installs them → Indic Parler crashes.
  2. Someone re-adds `sympy` to build.slim_python_embed.unused_packages
     → the snapshot is stripped after install → Indic Parler crashes.
  3. Someone removes `sympy` from setup_freeze_nunba.packages[] → Gate
     6 of CLAUDE.md's Change Protocol is violated (cx_Freeze tracer
     can't see runtime-dynamic imports inside gpu_worker subprocesses).

All three checks are AST-level: we parse the source files rather than
importing them, so the tests run without cx_Freeze / deps installed.
"""
from __future__ import annotations

import ast
import os
import sys

import pytest

_SCRIPTS = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'scripts'))
if _SCRIPTS not in sys.path:
    sys.path.insert(0, _SCRIPTS)


# ─────────────────────────────────────────────────────────────────────
# Indic Parler / torch._dynamo transitive-import chain.
#
# Every package here is imported at module-load time by the `parler_tts`
# import chain (directly or transitively via `transformers` →
# `torch._dynamo`).  Missing any one of them breaks Indic Parler TTS
# worker startup in the frozen build.
# ─────────────────────────────────────────────────────────────────────
INDIC_PARLER_REQUIRED_EMBED_DEPS = (
    # torch 2.10 hard-declares sympy>=1.13.3; torch._dynamo imports it
    # at module-load time (torch/utils/_sympy/functions.py line 18).
    'sympy',
    # sympy's one hard dep (mpmath<1.4,>=1.1.0).  Listed explicitly so
    # --no-deps installs don't silently drop it.
    'mpmath',
    # transformers dependency_versions_check fires at import time; every
    # one of these must be present or parler_tts crashes before it
    # loads the model.
    'transformers',
    'tokenizers',
    'safetensors',
    'huggingface_hub',
    'regex',
    'tqdm',
    'pyyaml',
    'sentencepiece',
    'accelerate',
    'packaging',
    # torchaudio is parler_tts.streamer's `import torchaudio` trigger
    # and is required by the save-audio path.
    'torchaudio',
    # numpy is imported at module load by parler_tts.streamer.
    'numpy',
)


def test_embed_deps_contains_indic_parler_chain():
    """deps.EMBED_DEPS must include every module the Indic Parler
    gpu_worker subprocess imports at load time."""
    import deps

    missing = [
        p for p in INDIC_PARLER_REQUIRED_EMBED_DEPS
        if p not in deps.EMBED_DEPS
    ]
    assert not missing, (
        f"EMBED_DEPS is missing Indic Parler transitive deps: {missing}. "
        f"Add them to scripts/deps.py:EMBED_DEPS so python-embed installs "
        f"them (see tests/test_freeze_packages_complete.py docstring for "
        f"the full root-cause analysis of the 2026-04-18 regression)."
    )


def test_sympy_pin_satisfies_torch_requirement():
    """torch 2.10 declares sympy>=1.13.3.  Our pin must satisfy that
    or pip resolution will fail during the python-embed install."""
    import deps

    sympy_pin = deps.EMBED_DEPS.get('sympy')
    assert sympy_pin is not None, \
        "sympy removed from EMBED_DEPS — Indic Parler will crash at load."

    # Parse major.minor.patch and compare to torch's floor (1.13.3).
    parts = [int(p) for p in sympy_pin.split('.') if p.isdigit()]
    assert len(parts) >= 3, f"sympy pin '{sympy_pin}' not fully parseable"
    major, minor, patch = parts[0], parts[1], parts[2]

    # torch 2.10: Requires-Dist: sympy>=1.13.3
    torch_floor = (1, 13, 3)
    assert (major, minor, patch) >= torch_floor, (
        f"sympy=={sympy_pin} is below torch's floor of "
        f"{'.'.join(str(x) for x in torch_floor)}. Bump the pin in "
        f"scripts/deps.py:EMBED_DEPS."
    )


# ─────────────────────────────────────────────────────────────────────
# Guard against re-adding sympy to slim_python_embed's strip list.
# ─────────────────────────────────────────────────────────────────────

def _extract_unused_packages_from_build_py() -> list[str]:
    """Parse scripts/build.py and return the `unused_packages` list
    literal inside `slim_python_embed`.

    Walks the AST rather than importing build.py because build.py
    pulls in cx_Freeze at module load, which is not installed on the
    CI test matrix.
    """
    build_py = os.path.join(_SCRIPTS, 'build.py')
    with open(build_py, encoding='utf-8') as fh:
        tree = ast.parse(fh.read(), filename=build_py)

    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == 'slim_python_embed':
            for sub in ast.walk(node):
                if (
                    isinstance(sub, ast.Assign)
                    and len(sub.targets) == 1
                    and isinstance(sub.targets[0], ast.Name)
                    and sub.targets[0].id == 'unused_packages'
                    and isinstance(sub.value, ast.List)
                ):
                    values = []
                    for elt in sub.value.elts:
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                            values.append(elt.value)
                    return values
    pytest.fail(
        "Could not locate `unused_packages = [...]` in "
        "scripts/build.py:slim_python_embed — test needs updating."
    )


def test_slim_python_embed_does_not_strip_sympy():
    """build.slim_python_embed must not delete sympy/ or mpmath/ from
    python-embed.  The 2026-04-18 regression was caused by an over-
    aggressive strip: sympy was listed in `unused_packages` with the
    comment 'transitive dep only', but torch._dynamo imports it at
    model load time.
    """
    stripped = _extract_unused_packages_from_build_py()

    assert 'sympy' not in stripped, (
        "`sympy` is in slim_python_embed.unused_packages — this will "
        "delete sympy/ from python-embed/Lib/site-packages/ after the "
        "install step, breaking Indic Parler TTS.  torch._dynamo's "
        "torch/utils/_sympy/functions.py imports sympy at load time."
    )
    assert 'mpmath' not in stripped, (
        "`mpmath` is in slim_python_embed.unused_packages — this will "
        "delete sympy's only hard dependency (sympy imports mpmath at "
        "module-load for all floating-point paths)."
    )


# ─────────────────────────────────────────────────────────────────────
# Guard against removing sympy from setup_freeze_nunba.packages[]
# (Gate 6: cx_Freeze tracer misses runtime-dynamic imports).
# ─────────────────────────────────────────────────────────────────────

def _extract_packages_list_from_setup_freeze() -> list[str]:
    """Parse scripts/setup_freeze_nunba.py and return the literal
    strings inside build_exe_options['packages'].

    Walks the AST rather than importing the module because importing
    setup_freeze_nunba.py has heavy build-time side effects (writes
    to .ico, tries to import cx_Freeze, does pip subprocess calls).
    """
    setup_py = os.path.join(_SCRIPTS, 'setup_freeze_nunba.py')
    with open(setup_py, encoding='utf-8') as fh:
        tree = ast.parse(fh.read(), filename=setup_py)

    # Find: build_exe_options = { ... "packages": [ ... ] ... }
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == 'build_exe_options'
            and isinstance(node.value, ast.Dict)
        ):
            for key, value in zip(node.value.keys, node.value.values):
                if (
                    isinstance(key, ast.Constant)
                    and key.value == 'packages'
                    and isinstance(value, ast.List)
                ):
                    return [
                        elt.value for elt in value.elts
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                    ]
    pytest.fail(
        "Could not locate build_exe_options['packages'] in "
        "scripts/setup_freeze_nunba.py — test needs updating."
    )


def test_setup_freeze_packages_contains_sympy():
    """cx_Freeze's module tracer only follows static `import`
    statements in the main exe's entry points.  Indic Parler imports
    sympy through torch._dynamo inside a gpu_worker subprocess — a
    dynamic import path cx_Freeze cannot see.  Per CLAUDE.md Gate 6
    (feedback_frozen_build_pitfalls.md Rule 1), such modules must be
    declared explicitly in packages[]."""
    packages = _extract_packages_list_from_setup_freeze()
    assert 'sympy' in packages, (
        "`sympy` is missing from build_exe_options['packages'] in "
        "scripts/setup_freeze_nunba.py.  Gate 6 (CLAUDE.md Change "
        "Protocol): cx_Freeze's tracer cannot follow sympy's import "
        "chain through torch._dynamo running in gpu_worker "
        "subprocesses.  Add 'sympy' to packages[] to keep the "
        "declaration explicit."
    )


# ─────────────────────────────────────────────────────────────────────
# SRP single-source-of-truth for HARTOS packages in the Nunba bundle.
#
# HARTOS packages (core / integrations / security) live in TWO
# legitimate runtime locations:
#   1. Install root (top-level `core/`, `integrations/`, `security/`)
#      — produced by `include_files` in setup_freeze_nunba.py.  This
#      is the canonical copy for the main Nunba.exe runtime.
#   2. python-embed/Lib/site-packages/ — produced by `pip install -e
#      ./HARTOS` (sibling-deps installer at top of setup_freeze_nunba)
#      and kept fresh by build.py's HARTOS sync.  This is the canonical
#      copy for SUBPROCESS runtimes (gpu_worker, llama, parler).
#
# cx_Freeze's static tracer wants to ALSO bundle these into `lib/`
# whenever main.py does any `from core.X import Y`.  That third copy
# is a parallel path: `lib/` sits earlier on sys.path than the install
# root, so a partial `lib/<pkg>/` shadows the canonical full copy and
# the .exe crashes with `ModuleNotFoundError` on any function-local
# import the tracer missed.
#
# Four production outages have been variants of this shadow problem:
#   - 2026-04-21: dev `.venv\Lib\site-packages` shadow
#   - 2026-04-24: bundle's own lib/ stripped by sys.path scrubber
#   - 2026-04-25: stale user `%APPDATA%\Roaming\Python\…\site-packages`
#   - 2026-04-26: partial `lib/core/` from cx_Freeze tracer
#
# Each was patched in app.py with more sys.path scrubbing — fixing the
# symptom, not the root cause.  The SRP fix is the cx_Freeze-level
# `excludes` block guarded by this test: cx_Freeze stops trying to be
# the bundler for HARTOS code, leaving the two legitimate paths (top-
# level via include_files, python-embed via pip) as the only routes.
# ─────────────────────────────────────────────────────────────────────

_HARTOS_EXCLUDED_PACKAGES = (
    'core',
    'integrations',
    'security',
    'agent_ledger',
    'hevolve_database',
)


def test_setup_freeze_excludes_hartos_packages():
    """SRP guard: cx_Freeze must NOT bundle HARTOS packages into lib/.

    They live at the install root (include_files) for the main exe and
    in python-embed/Lib/site-packages/ for subprocesses.  A third copy
    in lib/<pkg>/ shadows the install-root copy and crashes the .exe
    with ModuleNotFoundError on any function-local import cx_Freeze's
    tracer skipped (the shadow is partial because the tracer only
    follows module-scope imports)."""
    setup_py = os.path.join(_SCRIPTS, 'setup_freeze_nunba.py')
    with open(setup_py, encoding='utf-8') as fh:
        tree = ast.parse(fh.read(), filename=setup_py)

    excludes = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == 'build_exe_options'
            and isinstance(node.value, ast.Dict)
        ):
            for key, value in zip(node.value.keys, node.value.values):
                if (
                    isinstance(key, ast.Constant)
                    and key.value == 'excludes'
                    and isinstance(value, ast.List)
                ):
                    excludes = [
                        elt.value for elt in value.elts
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                    ]
                    break
    assert excludes, "Could not locate build_exe_options['excludes']"

    missing = [p for p in _HARTOS_EXCLUDED_PACKAGES if p not in excludes]
    assert not missing, (
        f"setup_freeze_nunba.py excludes[] missing HARTOS packages: "
        f"{missing}.  Without these excludes, cx_Freeze's static tracer "
        f"will create a partial lib/<pkg>/ that shadows the canonical "
        f"top-level install-root copy.  See module docstring for the "
        f"4-outage history this guard prevents."
    )


def test_setup_freeze_does_not_pull_hartos_into_packages():
    """Inverse guard: HARTOS packages must NOT be in packages[] either.

    Listing them in packages[] would force cx_Freeze to bundle them
    into lib/<pkg>/ — exactly the shadow we exclude against.  This
    test catches well-meaning regressions like 'add core to packages[]
    so cx_Freeze includes the whole tree' (the 2026-04-26 first-pass
    fix that pointed in the wrong direction)."""
    packages = _extract_packages_list_from_setup_freeze()
    leaked = [
        p for p in packages
        if p in _HARTOS_EXCLUDED_PACKAGES
        or any(p.startswith(prefix + '.') for prefix in _HARTOS_EXCLUDED_PACKAGES)
    ]
    assert not leaked, (
        f"setup_freeze_nunba.py packages[] leaks HARTOS modules: "
        f"{leaked}.  HARTOS code is bundled via include_files (top-"
        f"level) + pip install -e (python-embed/site-packages); listing "
        f"any HARTOS module in packages[] tells cx_Freeze to ALSO bundle "
        f"a third copy in lib/, re-introducing the shadow problem this "
        f"file's docstring documents."
    )


def test_setup_freeze_excludes_does_not_list_sympy():
    """Guard against re-adding sympy to the excludes list.  The
    excludes list was the dual of the symptoms above — if sympy is
    both in packages[] and excludes[], cx_Freeze will silently drop
    it (excludes wins)."""
    setup_py = os.path.join(_SCRIPTS, 'setup_freeze_nunba.py')
    with open(setup_py, encoding='utf-8') as fh:
        tree = ast.parse(fh.read(), filename=setup_py)

    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id == 'build_exe_options'
            and isinstance(node.value, ast.Dict)
        ):
            for key, value in zip(node.value.keys, node.value.values):
                if (
                    isinstance(key, ast.Constant)
                    and key.value == 'excludes'
                    and isinstance(value, ast.List)
                ):
                    strings = [
                        elt.value for elt in value.elts
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str)
                    ]
                    assert 'sympy' not in strings, (
                        "`sympy` is in build_exe_options['excludes'] — "
                        "this conflicts with its presence in packages[] "
                        "and will re-introduce the Indic Parler crash."
                    )
                    assert 'sympy.tests' not in strings, (
                        "`sympy.tests` is in excludes — acceptable in "
                        "theory, but the primary guard wants sympy "
                        "treated as a first-class declared package."
                    )
                    return
    pytest.fail(
        "Could not locate build_exe_options['excludes'] in "
        "scripts/setup_freeze_nunba.py — test needs updating."
    )
