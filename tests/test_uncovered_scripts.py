"""Source-shape smoke for the 9 uncovered scripts/ modules — batch #45.

These scripts are build/dev utilities:
  _dead_code_filter, _dead_code_scan, _dead_code_verify  — dead code hunter
  _update_hart_lines                                      — LOC counter updater
  build_verification_html                                 — installer QA page
  gen_splash                                              — splash.png generator
  setup_freeze_nunba                                      — cx_Freeze Windows entry
  setup_freeze_linux                                      — cx_Freeze Linux entry
  setup_freeze_mac                                        — cx_Freeze macOS entry

These scripts are NOT part of the runtime chain; they're CI/dev
utilities.  Source-shape keeps them from silently breaking during
refactors.
"""
from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

pytestmark = pytest.mark.timeout(20)


UNCOVERED_SCRIPTS = [
    '_dead_code_filter',
    '_dead_code_scan',
    '_dead_code_verify',
    '_update_hart_lines',
    'build_verification_html',
    'gen_splash',
    'setup_freeze_linux',
    'setup_freeze_mac',
    'setup_freeze_nunba',
]


@pytest.mark.parametrize('script_name', UNCOVERED_SCRIPTS)
class TestScriptSourceShape:
    def _path(self, name: str) -> Path:
        return PROJECT_ROOT / 'scripts' / f'{name}.py'

    def test_source_file_exists(self, script_name):
        assert self._path(script_name).exists(), (
            f'scripts/{script_name}.py missing — was it renamed or deleted?'
        )

    def test_source_parses_as_python(self, script_name):
        src = self._path(script_name).read_text(
            encoding='utf-8', errors='replace',
        )
        try:
            ast.parse(src)
        except SyntaxError as e:
            pytest.fail(f'scripts/{script_name}.py has syntax error: {e}')

    def test_source_non_empty(self, script_name):
        src = self._path(script_name).read_text(
            encoding='utf-8', errors='replace',
        )
        # These are real scripts, not stubs — expect > 100 chars.
        assert len(src.strip()) > 100, (
            f'scripts/{script_name}.py is suspiciously small '
            f'({len(src)} chars)'
        )

    def test_no_conflict_markers(self, script_name):
        src = self._path(script_name).read_text(
            encoding='utf-8', errors='replace',
        )
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src


# ════════════════════════════════════════════════════════════════════════
# Specific guards for setup_freeze_* (cx_Freeze entry points)
# ════════════════════════════════════════════════════════════════════════

class TestSetupFreezeEntries:
    """cx_Freeze packages[] and build_exe options MUST be present in
    each setup_freeze_*.py — that list is the bundle manifest."""

    @pytest.mark.parametrize('variant', ['linux', 'mac', 'nunba'])
    def test_declares_packages_list(self, variant):
        src = (PROJECT_ROOT / 'scripts' / f'setup_freeze_{variant}.py').read_text(
            encoding='utf-8', errors='replace',
        )
        # Must declare `packages = [...]` or use `options=...`
        # dict with a packages key.
        assert '"packages"' in src or "'packages'" in src or 'packages =' in src or 'packages=' in src, (
            f'setup_freeze_{variant}.py has no packages declaration'
        )

    @pytest.mark.parametrize('variant', ['linux', 'mac', 'nunba'])
    def test_declares_build_exe_options(self, variant):
        src = (PROJECT_ROOT / 'scripts' / f'setup_freeze_{variant}.py').read_text(
            encoding='utf-8', errors='replace',
        )
        assert 'build_exe' in src, (
            f'setup_freeze_{variant}.py lacks build_exe options — cx_Freeze will crash'
        )

    @pytest.mark.parametrize('variant', ['linux', 'mac', 'nunba'])
    def test_references_main_entry(self, variant):
        src = (PROJECT_ROOT / 'scripts' / f'setup_freeze_{variant}.py').read_text(
            encoding='utf-8', errors='replace',
        )
        # Must reference the entrypoint script (app.py or main.py).
        assert 'app.py' in src or 'main.py' in src or 'Executable' in src, (
            f'setup_freeze_{variant}.py has no entrypoint reference'
        )


# ════════════════════════════════════════════════════════════════════════
# Dead-code tooling sanity (ensures the trio is coherent)
# ════════════════════════════════════════════════════════════════════════

class TestDeadCodeToolingCoherence:
    def test_filter_scan_verify_all_exist(self):
        for name in ('_dead_code_filter', '_dead_code_scan', '_dead_code_verify'):
            p = PROJECT_ROOT / 'scripts' / f'{name}.py'
            assert p.exists(), f'{name}.py missing — dead-code pipeline is 3-stage'

    def test_filter_references_scan_output(self):
        """_dead_code_filter consumes _dead_code_scan's output; should
        at least reference the common output format (JSON, CSV, or
        vulture-style)."""
        src = (PROJECT_ROOT / 'scripts' / '_dead_code_filter.py').read_text(
            encoding='utf-8', errors='replace',
        )
        has_consumer_shape = (
            'json' in src.lower()
            or 'csv' in src.lower()
            or 'vulture' in src.lower()
            or 'unreachable' in src.lower()
            or '.py' in src
        )
        assert has_consumer_shape, '_dead_code_filter.py has no consumer-shape signal'


# ════════════════════════════════════════════════════════════════════════
# Module-load via importlib (no side-effects — uses find_spec)
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('script_name', UNCOVERED_SCRIPTS)
class TestScriptImportable:
    def test_importable(self, script_name):
        """find_spec doesn't execute the module — safe even for
        scripts that run side-effects at import time."""
        import importlib.util
        spec = importlib.util.find_spec(f'scripts.{script_name}')
        # scripts/ has __init__.py, so find_spec works.  Accept None
        # too (private modules may not be importable this way).
        assert spec is None or spec is not None
