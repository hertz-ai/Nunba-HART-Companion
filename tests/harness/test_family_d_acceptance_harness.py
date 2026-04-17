"""Family D — acceptance harness honesty.

The harness itself is a shallow-signal lie: greps source strings.
Passes 8/8 from source dir, fails 5/8 from frozen bundle dir.
"""
from __future__ import annotations

import re
import pytest

pytestmark = pytest.mark.unit


def test_d1_harness_makes_at_least_one_runtime_call(source_app_py, source_text):
    """FAILS on HEAD. The --acceptance-test block contains no
    subprocess.Popen, no urllib.request.urlopen, no http.client call.
    It only greps source.
    """
    src = source_text(source_app_py)
    m = re.search(r"NUNBA ACCEPTANCE TEST.*?(?=\n\S|\Z)", src, flags=re.DOTALL)
    assert m, "acceptance harness block not found"
    block = m.group(0)
    calls = sum([
        block.count("subprocess.Popen("),
        block.count("subprocess.run("),
        block.count("urllib.request.urlopen("),
        block.count("http.client.HTTPConnection("),
        block.count("requests.get("),
        block.count("requests.post("),
    ])
    assert calls > 0, (
        "acceptance harness is pure text-grep; must make at least one "
        "runtime call (subprocess + HTTP) to verify user-visible behavior"
    )


def test_d2_harness_same_verdict_across_cwd(source_app_py, source_text):
    """FAILS on HEAD: reads app.py via two cwd-dependent fallback
    paths.  If app.py is not at the first candidate (frozen bundle),
    checks silently succeed in source cwd and fail in bundle cwd.
    A honest harness must refuse to run from source cwd, or hard-fail
    if its source inputs are unavailable.
    """
    src = source_text(source_app_py)
    # Look for one of three patterns:
    #  1) refuses to run if not frozen — "if not getattr(sys, 'frozen'"
    #  2) hard-fails if _ac_src is empty — FATAL
    #  3) runs real assertions that don't depend on _ac_src at all
    has_refuse = "if not getattr(sys, 'frozen'" in src and "--acceptance-test" in src
    has_hard_fail = "_ac_src == ''" in src and ("raise" in src or "sys.exit(" in src)
    assert has_refuse or has_hard_fail, (
        "acceptance harness silently succeeds when source file is absent "
        "(false PASS); must refuse or hard-fail instead"
    )


def test_d3_harness_exit_code_correlates_to_real_behavior(source_app_py, source_text):
    """FAILS on HEAD. Harness exit code is decoupled from any real
    end-to-end call.  A green harness must imply at least one
    user-visible path was actually exercised.
    """
    src = source_text(source_app_py)
    # Rough check: within the harness block, exit code decisions must
    # depend on something other than _ac_src.find results only.
    m = re.search(r"NUNBA ACCEPTANCE TEST.*?(?=\n\S|\Z)", src, flags=re.DOTALL)
    assert m
    block = m.group(0)
    findonly = block.count("_ac_src.find(") + block.count("_ac_src.count(")
    assert findonly < 5 or "subprocess" in block or "urlopen" in block, (
        "harness has ≥5 _ac_src.find checks and zero subprocess/HTTP — "
        "its exit code is decoupled from user-visible behaviour"
    )
