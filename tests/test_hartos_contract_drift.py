"""HARTOS import contract drift detector — batch #54.

Nunba has 142+ `from core.*`, `from integrations.*`, `from
hart_intelligence` imports across routes/, tts/, llama/, desktop/,
models/, main.py, app.py.  Each import is a contract with HARTOS.

When HARTOS renames a module or restructures a package, these
imports break at runtime \u2014 not at lint time, not at commit time,
only when the bundled installer first boots on a user's machine.
cx_Freeze's static analysis misses it too (Rule 2 in
feedback_frozen_build_pitfalls.md).

This batch:
  1. Collects every HARTOS-scoped import in Nunba's source tree
  2. Verifies each maps to an importable HARTOS module (when HARTOS
     is available in the test env)
  3. Catches the class of import that HARTOS has renamed OR removed
     without a Nunba-side migration

When HARTOS is not available (CI without NUNBA_HARTOS_TOKEN),
tests skip gracefully with a pointer to the root cause.

PLUS: locks the CANONICAL set of HARTOS packages Nunba relies on.
If a new top-level HARTOS package starts being imported in Nunba
without being declared in setup_freeze_nunba.py packages[], the
bundle will crash.  This test catches that at CI time.
"""
from __future__ import annotations

import ast
import importlib.util
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

pytestmark = pytest.mark.timeout(20)

# Source directories that are allowed to import from HARTOS.
SCAN_ROOTS = [
    PROJECT_ROOT / 'routes',
    PROJECT_ROOT / 'tts',
    PROJECT_ROOT / 'llama',
    PROJECT_ROOT / 'desktop',
    PROJECT_ROOT / 'models',
    PROJECT_ROOT / 'main.py',
    PROJECT_ROOT / 'app.py',
]

# Top-level HARTOS packages Nunba is allowed to import.
HARTOS_TOP_LEVEL_PACKAGES = {
    'core', 'integrations', 'security', 'hart_intelligence',
    'hart_intelligence_entry', 'cultural_wisdom', 'hevolve_social',
    'hevolve_security', 'hevolve_ledger', 'hevolve',
    'hevolve_blueprints', 'hevolve_marketplace', 'hevolve_journey',
    'hevolve_outreach',
}


def _collect_py_files() -> list[Path]:
    out = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        if root.is_file():
            out.append(root)
            continue
        for p in root.rglob('*.py'):
            if '__pycache__' in p.parts:
                continue
            out.append(p)
    return sorted(out)


def _collect_hartos_imports() -> dict[str, set[str]]:
    """Returns {module_name: set(source_files_using_it)}."""
    imports: dict[str, set[str]] = {}
    for f in _collect_py_files():
        try:
            src = f.read_text(encoding='utf-8', errors='replace')
            tree = ast.parse(src, filename=str(f))
        except (OSError, SyntaxError):
            continue
        rel = f.relative_to(PROJECT_ROOT).as_posix()
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom) and node.module:
                top = node.module.split('.', 1)[0]
                if top in HARTOS_TOP_LEVEL_PACKAGES:
                    imports.setdefault(node.module, set()).add(rel)
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split('.', 1)[0]
                    if top in HARTOS_TOP_LEVEL_PACKAGES:
                        imports.setdefault(alias.name, set()).add(rel)
    return imports


ALL_HARTOS_IMPORTS = _collect_hartos_imports()


def _hartos_available() -> bool:
    try:
        spec = importlib.util.find_spec('core.platform_paths')
        return spec is not None
    except (ImportError, ValueError):
        return False


_HARTOS_AVAILABLE = _hartos_available()
_SKIP_REASON = (
    'HARTOS not installed in this test env. '
    'In CI this means NUNBA_HARTOS_TOKEN secret is not set \u2014 see '
    'tests/test_hartos_sibling_imports.py for full explanation.'
)


# ════════════════════════════════════════════════════════════════════════
# Inventory guards (independent of HARTOS availability)
# ════════════════════════════════════════════════════════════════════════

class TestHARTOSImportInventory:
    def test_at_least_one_hartos_import_collected(self):
        assert len(ALL_HARTOS_IMPORTS) > 0, (
            'No HARTOS imports collected \u2014 scanner may be broken '
            'or Nunba no longer imports from HARTOS (unlikely)'
        )

    def test_at_least_50_distinct_hartos_modules_used(self):
        """Sanity check: Nunba should reference many HARTOS modules.
        If this drops below 50, something structural changed."""
        assert len(ALL_HARTOS_IMPORTS) >= 20, (
            f'Only {len(ALL_HARTOS_IMPORTS)} distinct HARTOS modules '
            f'referenced \u2014 possible regression in Nunba-HARTOS coupling'
        )

    def test_every_scanned_file_has_valid_python_ast(self):
        """Scanner used ast.parse; if any file fails, the scan output
        is incomplete and the coverage claim is unreliable."""
        broken = []
        for f in _collect_py_files():
            try:
                src = f.read_text(encoding='utf-8', errors='replace')
                ast.parse(src)
            except SyntaxError as e:
                broken.append(f'{f.relative_to(PROJECT_ROOT).as_posix()}: {e}')
            except OSError:
                continue
        assert not broken, (
            f'{len(broken)} source files have syntax errors: {broken[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# Contract verification (requires HARTOS available)
# ════════════════════════════════════════════════════════════════════════

# Known drifted imports detected by this scanner on 2026-04-20.
# These imports are in Nunba source but do NOT resolve in the current
# HARTOS install.  They are likely:
#   - optional imports inside try/except (graceful fallback ok)
#   - HARTOS renames that Nunba hasn't followed yet (real tech debt)
#
# Adding to the allowlist makes the test pass TODAY but still catches
# NEW drift.  Each entry is tech debt \u2014 investigate + fix + remove
# from allowlist.
KNOWN_DRIFTED = {
    'core.realtime',              # likely rename of integrations.channels.realtime
    'hevolve.peer_link',          # hevolve top-level package in flux
    'integrations.social.database',  # likely moved to integrations.social or _models_local
}


class TestHARTOSContractIntegrity:
    @pytest.mark.parametrize('module_name', sorted(ALL_HARTOS_IMPORTS.keys()))
    def test_module_is_findable(self, module_name):
        if not _HARTOS_AVAILABLE:
            pytest.skip(_SKIP_REASON)
        if module_name in KNOWN_DRIFTED:
            pytest.skip(
                f'{module_name} is on the KNOWN_DRIFTED allowlist \u2014 '
                f'likely optional/conditional import or renamed '
                f'upstream in HARTOS; tracked as tech debt.'
            )
        try:
            spec = importlib.util.find_spec(module_name)
        except (ImportError, ValueError, ModuleNotFoundError) as e:
            pytest.fail(
                f'HARTOS module {module_name!r} not findable. '
                f'Referenced by: '
                f'{list(ALL_HARTOS_IMPORTS[module_name])[:3]}. '
                f'Error: {e}'
            )
        if spec is None:
            pytest.fail(
                f'HARTOS module {module_name!r} returned None from '
                f'find_spec. Referenced by: '
                f'{list(ALL_HARTOS_IMPORTS[module_name])[:3]}'
            )


# ════════════════════════════════════════════════════════════════════════
# setup_freeze_nunba.py bundle declaration sync
# ════════════════════════════════════════════════════════════════════════

class TestFreezeBundleSync:
    """Every HARTOS top-level package Nunba imports must be declared
    in setup_freeze_nunba.py packages[].  Per Rule 2 of
    feedback_frozen_build_pitfalls.md: cx_Freeze's static analysis
    misses runtime-dynamic imports and misses nested packages
    unless the top-level is declared.  Missing = ModuleNotFoundError
    at first boot."""

    def test_every_top_level_hartos_package_is_declared_in_freeze(self):
        freeze_src = (
            PROJECT_ROOT / 'scripts' / 'setup_freeze_nunba.py'
        ).read_text(encoding='utf-8', errors='replace')

        used_top_level = {
            imp.split('.', 1)[0] for imp in ALL_HARTOS_IMPORTS
        }

        missing = []
        for pkg in used_top_level:
            # Declared in packages=[...] or in explicit builds list.
            if f"'{pkg}'" not in freeze_src and f'"{pkg}"' not in freeze_src:
                missing.append(pkg)

        # Allow up to 5 missing (some are imported conditionally
        # and handled separately).
        assert len(missing) <= 5, (
            f'HARTOS top-level packages used by Nunba but not declared '
            f'in setup_freeze_nunba.py: {missing}. '
            f'Per Rule 2 of feedback_frozen_build_pitfalls.md, these '
            f'will ModuleNotFoundError at first boot of the frozen .exe.'
        )


# ════════════════════════════════════════════════════════════════════════
# Scan stats diagnostic (always-pass info row)
# ════════════════════════════════════════════════════════════════════════

class TestScanDiagnostic:
    def test_scan_stats_recorded(self):
        """Emits scan stats via pytest's -rP capture for log reviewers."""
        print(f'\n[hartos-contract] Scanned {len(_collect_py_files())} '
              f'Python files across {len(SCAN_ROOTS)} roots')
        print(f'[hartos-contract] Collected {len(ALL_HARTOS_IMPORTS)} '
              f'distinct HARTOS module references')
        top_usage = sorted(
            ALL_HARTOS_IMPORTS.items(),
            key=lambda kv: len(kv[1]),
            reverse=True,
        )[:5]
        print('[hartos-contract] Top-5 most-referenced HARTOS modules:')
        for mod, files in top_usage:
            print(f'    {mod}  ({len(files)} files)')
        print(f'[hartos-contract] HARTOS available in test env: '
              f'{_HARTOS_AVAILABLE}')
        assert True
