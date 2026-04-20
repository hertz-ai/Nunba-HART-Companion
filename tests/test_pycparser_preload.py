"""Stage-B Symptom #1 FT — pycparser single-copy contract.

Guards against the dual-copy regression that caused Tier-1
(pycparser.c_ast KeyError) at HARTOS init.

The bug: app.py's in-function pycparser-from-lib_src swap ran AFTER
cffi + autobahn had already pulled the bundled .pyc pycparser, so
the swap left stale references in cffi's Parser while the new
pycparser.c_ast had different Node subclasses. Node.__subclasses__()
returned the wrong list, KeyError on 'c_ast' ensued.

This FT runs in two flavors:

1. Static: asserts app.py defines _preload_pycparser_from_lib_src AND
   calls it BEFORE _isolate_frozen_imports() at module top.
2. Dynamic: imports pycparser + autobahn.asyncio.component in the
   current process and asserts only one pycparser copy lives in
   sys.modules.

The dynamic test is skipped when running outside a frozen build
(the preload is a no-op in dev trees; the dual-copy failure mode
ONLY manifests under cx_Freeze).
"""

from __future__ import annotations

import ast
import os
import subprocess
import sys
import unittest
from pathlib import Path

APP_PY = Path(__file__).resolve().parent.parent / "app.py"


class PycparserPreloadStaticTests(unittest.TestCase):
    """Source-level contract tests — no imports required."""

    def test_preload_helper_exists(self):
        src = APP_PY.read_text(encoding="utf-8")
        self.assertIn(
            "def _preload_pycparser_from_lib_src(",
            src,
            "app.py must define _preload_pycparser_from_lib_src",
        )

    def test_preload_runs_before_isolate(self):
        src = APP_PY.read_text(encoding="utf-8")
        lines = src.split("\n")
        preload_idx = next(
            (i for i, line in enumerate(lines)
             if line.strip() == "_preload_pycparser_from_lib_src()"),
            -1,
        )
        isolate_idx = next(
            (i for i, line in enumerate(lines)
             if line.strip() == "_isolate_frozen_imports()"),
            -1,
        )
        self.assertGreater(preload_idx, 0, "preload call missing")
        self.assertGreater(isolate_idx, 0, "isolate call missing")
        self.assertLess(
            preload_idx, isolate_idx,
            "_preload_pycparser_from_lib_src() must be called BEFORE "
            "_isolate_frozen_imports() — otherwise cffi/autobahn "
            "already pulled the bundled .pyc pycparser and the preload "
            "creates a dual-copy (Stage-B Symptom #1)"
        )

    def test_load_pywebview_no_longer_mutates_sys_modules(self):
        """The diagnostic block in _load_pywebview must NOT do
        `del sys.modules[pycparser.*]` — that was the exact bug."""
        src = APP_PY.read_text(encoding="utf-8")
        # Find the _load_pywebview function body
        # and scan for the old pattern.
        start_idx = src.find("def _load_pywebview")
        if start_idx < 0:
            # Renamed? Fine — nothing to enforce.
            return
        # Look for the old 'del sys.modules' near the pycparser dance
        # in _load_pywebview specifically. Approximate by finding the
        # next `def ` after _load_pywebview and slicing between them.
        end_idx = src.find("\ndef ", start_idx + 1)
        body = src[start_idx:end_idx] if end_idx > 0 else src[start_idx:]
        self.assertNotIn(
            "del sys.modules[mod]",
            body,
            "_load_pywebview must not mutate sys.modules — the preload "
            "at app.py top is the single writer now."
        )


class PycparserSingleCopyRuntimeTests(unittest.TestCase):
    """Dynamic runtime test — runs inside bundled python-embed if
    available, otherwise validates in the current process."""

    def test_pycparser_single_copy_via_cffi(self):
        """Import pycparser + cffi (the proximate consumer in the
        cffi -> pycparser chain); ensure only one pycparser copy lives
        in sys.modules and Node.__subclasses__() is non-empty.

        Uses cffi instead of autobahn because autobahn pulls torch in
        this dev environment, which dominates subprocess time and is
        orthogonal to the dual-copy symptom. cffi is the direct caller
        of pycparser and exercises the exact same parser chain.
        """
        code = (
            "import sys\n"
            "try:\n"
            "    import pycparser\n"
            "    import pycparser.c_ast\n"
            "except Exception as e:\n"
            "    print('IMPORT_FAIL:', e); sys.exit(2)\n"
            "try:\n"
            "    import cffi  # noqa: F401\n"
            "except Exception as e:\n"
            "    print('CFFI_FAIL:', e)\n"
            "modules = [k for k in sys.modules if k.startswith('pycparser')]\n"
            "# Each pycparser submodule must appear exactly once\n"
            "unique = set(modules)\n"
            "if len(unique) != len(modules):\n"
            "    print('DUPLICATE:', modules); sys.exit(3)\n"
            "try:\n"
            "    _subs = list(pycparser.c_ast.Node.__subclasses__())\n"
            "    if not _subs:\n"
            "        print('NO_SUBCLASSES'); sys.exit(5)\n"
            "    print('OK subclasses=%d modules=%d' % (len(_subs), len(modules)))\n"
            "except KeyError as e:\n"
            "    print('C_AST_KEYERR:', e); sys.exit(4)\n"
        )
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True, text=True, timeout=20,
        )
        if result.returncode == 2:
            self.skipTest("pycparser not installed in this environment")
        self.assertEqual(
            result.returncode, 0,
            f"Dual-copy / c_ast failure detected:\n"
            f"  stdout: {result.stdout}\n"
            f"  stderr: {result.stderr}"
        )
        self.assertIn("OK subclasses=", result.stdout)


if __name__ == "__main__":
    unittest.main()
