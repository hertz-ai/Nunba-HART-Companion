"""Family D — acceptance harness honesty.

The harness itself is a shallow-signal lie: greps source strings.
Passes 8/8 from source dir, fails 5/8 from frozen bundle dir.
"""
from __future__ import annotations

import re

import pytest

pytestmark = pytest.mark.unit


def test_d1_harness_makes_at_least_one_runtime_call(source_app_py, source_text):
    """FAILS if the --acceptance-test block makes no real runtime call.

    This used to literal-string-grep for ``subprocess.run(`` which
    broke on aliases like ``import subprocess as sp; sp.run(...)`` —
    the check was testing variable names, not behavior.

    Now we AST-parse the block and track import aliases so
    ``sp.run(...)`` resolves to ``subprocess.run`` regardless of how
    the code names it.  The test asserts that at least one Call node
    resolves to a runtime-call primitive.
    """
    import ast

    src = source_text(source_app_py)
    tree = ast.parse(src)

    # Locate `if getattr(args, 'acceptance_test', False):` at module scope.
    accept_node = None
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.If)
            and isinstance(node.test, ast.Call)
            and isinstance(node.test.func, ast.Name)
            and node.test.func.id == "getattr"
            and len(node.test.args) >= 2
            and isinstance(node.test.args[1], ast.Constant)
            and node.test.args[1].value == "acceptance_test"
        ):
            accept_node = node
            break
    assert accept_node is not None, "acceptance_test block not found"

    # Runtime-call primitives (dotted targets).  Calls to any of these,
    # resolved through import aliases, count as a real runtime call.
    RUNTIME_APIS = {
        "subprocess.run",
        "subprocess.Popen",
        "subprocess.call",
        "subprocess.check_call",
        "subprocess.check_output",
        "urllib.request.urlopen",
        "http.client.HTTPConnection",
        "requests.get",
        "requests.post",
        "importlib.import_module",
    }

    # Build alias map: local name → dotted target from Import/ImportFrom
    # nodes inside the block.
    #   import subprocess                → 'subprocess'   → 'subprocess'
    #   import subprocess as sp          → 'sp'           → 'subprocess'
    #   from urllib import request       → 'request'      → 'urllib.request'
    #   from urllib import request as r  → 'r'            → 'urllib.request'
    #   from importlib import import_module as imp
    #                                    → 'imp'          → 'importlib.import_module'
    aliases: dict[str, str] = {}
    for sub in ast.walk(accept_node):
        if isinstance(sub, ast.Import):
            for a in sub.names:
                local = a.asname or a.name.split(".")[0]
                aliases[local] = a.name
        elif isinstance(sub, ast.ImportFrom):
            mod = sub.module or ""
            for a in sub.names:
                local = a.asname or a.name
                aliases[local] = f"{mod}.{a.name}" if mod else a.name

    def _resolve(func_node: ast.expr) -> str:
        """Return the resolved dotted path of a Call.func, or ''."""
        parts: list[str] = []
        cur = func_node
        while isinstance(cur, ast.Attribute):
            parts.append(cur.attr)
            cur = cur.value
        if isinstance(cur, ast.Name):
            parts.append(aliases.get(cur.id, cur.id))
        else:
            return ""
        return ".".join(reversed(parts))

    hits: list[str] = []
    for sub in ast.walk(accept_node):
        if isinstance(sub, ast.Call):
            resolved = _resolve(sub.func)
            if resolved in RUNTIME_APIS:
                hits.append(resolved)

    assert hits, (
        "acceptance block makes no resolved runtime call "
        "(subprocess / urllib / http.client / requests / "
        "importlib.import_module).  At least one real runtime "
        "primitive must fire when the block executes."
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
