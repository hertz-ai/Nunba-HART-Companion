"""Family A — build pipeline defects.

Tests reproduce shallow-signal / staleness bugs in scripts/build.py
and the post-build validation.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.unit


def test_a1_harness_not_string_grep_only(source_app_py, source_text):
    """A1 — the acceptance harness must be runtime-based, not source grep.

    Proxy check: the --acceptance-test block in app.py must call
    subprocess or urllib; pure `_ac_src.find(...)` counts as shallow.
    FAILS on HEAD because the harness is currently text-match.
    """
    src = source_text(source_app_py)
    acceptance_block_idx = src.find("NUNBA ACCEPTANCE TEST")
    assert acceptance_block_idx > 0, "acceptance harness block not found"
    # Heuristic: a runtime harness uses subprocess/urllib. A shallow one
    # only does _ac_src.find(). Walk forward 10_000 chars (the block is
    # ~200 lines) and measure.
    block = src[acceptance_block_idx:acceptance_block_idx + 20_000]
    has_subprocess = "subprocess" in block
    has_http = ("urllib.request" in block) or ("requests." in block) or ("http.client" in block)
    has_find_grep = block.count("_ac_src.find(") + block.count("_ac_src.count(") >= 3
    assert has_subprocess or has_http, (
        "acceptance harness must launch a subprocess or make an HTTP call; "
        "currently it only greps source strings, which passes when run "
        "from source dir and fails when run against the frozen bundle"
    )


def test_a2_slim_python_embed_keeps_runtime_dist_info(source_build_py, source_text):
    """A2 — slim_python_embed must NOT strip dist-info that transformers
    consults at import time.

    The `KEEP_DIST_INFO_FOR` allowlist approach failed repeatedly (tqdm,
    filelock, regex, tokenizers all got stripped). HEAD should keep ALL
    dist-info. This test is a regression guard: if anyone reintroduces
    the allowlist, it fails.
    """
    src = source_text(source_build_py)
    # The current fix is "keep everything" — continue on any *.dist-info
    assert "KEEP_DIST_INFO_FOR" not in src, (
        "slim_python_embed reintroduced a dist-info allowlist; this "
        "regression previously broke the transformers import chain at "
        "runtime (filelock, tqdm, ...) and must not come back"
    )
    # And the walker must explicitly skip dist-info directories, not
    # strip them.
    assert "d.endswith('.dist-info')" in src and "continue" in src, (
        "slim_python_embed must contain the dist-info-keep branch"
    )


def test_a3_build_writes_head_sha(source_build_py, source_text):
    """A3 — build must fingerprint the current git HEAD so stale
    build/Nunba/ can't ship pre-fix code.

    FAILS on HEAD until build.py writes build/Nunba/BUILD_INFO.txt.
    """
    src = source_text(source_build_py)
    markers = ("BUILD_INFO.txt", "git rev-parse HEAD", "BUILD_SHA")
    assert any(m in src for m in markers), (
        "scripts/build.py must record the git HEAD sha into the bundle "
        "so release provenance + stale-bundle detection is possible"
    )


def test_a4_landing_build_staleness_check(source_build_py, source_text):
    """A4 — frontend bundle staleness check.

    build.py must either always rebuild landing-page/build/ OR compare
    src/ mtime vs build/ mtime before skipping. Currently neither.
    """
    src = source_text(source_build_py)
    assert (
        "landing-page/build" in src
        and ("npm run build" in src or "yarn build" in src)
    ), "scripts/build.py must explicitly rebuild the React bundle"
    # Either unconditional rebuild, or a clear mtime comparison.
    has_mtime_check = "getmtime" in src and "landing-page" in src
    has_unconditional = src.count("npm run build") >= 1 and "if _stale" not in src
    assert has_mtime_check or has_unconditional, (
        "landing-page/build/ must either rebuild unconditionally or use "
        "a source-vs-build mtime check; stale React bundles shipped twice"
    )


def test_a5_bundle_acceptance_falls_back_when_py_absent(source_app_py, source_text):
    """A5 — acceptance harness reads .py source; cx_Freeze may strip it.
    The harness must either ship its checks as runtime calls (see A1)
    or have an explicit fallback when .py is unavailable.
    FAILS on HEAD.
    """
    src = source_text(source_app_py)
    # A fallback path looks like: when _ac_src is empty, consult .pyc
    # (dis.dis) OR invoke the verified-signal function directly.
    has_fallback = (
        "dis.dis" in src
        or "marshal.load" in src
        or "importlib.import_module" in src and "verify_backend_synth" in src
    )
    assert has_fallback, (
        "acceptance harness has no fallback when .py source is stripped "
        "from the bundle; this is what caused 5/8 false FAILs"
    )
