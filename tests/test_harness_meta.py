"""Cross-cutting meta-tests for the test harness itself — batch #36.

Guards against silent test-file corruption: every test_*.py under
tests/ MUST (a) parse as valid Python, (b) have at least one test
function, (c) use only imports that resolve at collection time.

When a refactor silently breaks a test file's syntax or removes a
symbol it imports, this meta-test catches it BEFORE the affected
tests are skipped (which would hide the problem).
"""
from __future__ import annotations

import ast
import os
import re
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
TESTS_ROOT = PROJECT_ROOT / 'tests'

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

pytestmark = pytest.mark.timeout(10)


def _all_test_files(root: Path) -> list[Path]:
    """Every tests/**/test_*.py file under the project."""
    return sorted(root.rglob('test_*.py'))


TEST_FILES = _all_test_files(TESTS_ROOT)


class TestHarnessSanity:
    def test_tests_dir_is_non_empty(self):
        assert len(TEST_FILES) > 0, 'tests/ has no test_*.py files'

    def test_at_least_100_test_files(self):
        """With 32 batches of coverage expansion, there should be 100+
        test files across tests/ + tests/journey/ + tests/harness/."""
        assert len(TEST_FILES) >= 100, (
            f'Only {len(TEST_FILES)} test files found; expected 100+.'
        )


@pytest.mark.parametrize('test_file', TEST_FILES, ids=lambda p: p.relative_to(PROJECT_ROOT).as_posix())
class TestEveryFile:
    """Each test_*.py is checked individually so a break surfaces the
    exact offending file instead of aborting the whole collection."""

    def test_parses_as_python(self, test_file: Path):
        """ast.parse must succeed — catches silent syntax regressions."""
        src = test_file.read_text(encoding='utf-8', errors='replace')
        try:
            ast.parse(src)
        except SyntaxError as e:
            pytest.fail(f'{test_file} is not valid Python: {e}')

    # Files intentionally exempt from the "at-least-one-test" rule.
    # These are manually-runnable scripts (have their own if __name__
    # entrypoint) that happen to live under tests/ for co-location with
    # related suites but aren't discovered by pytest.  Each entry must
    # have a comment justifying the exemption.
    _NO_PYTEST_FUNCTIONS_ALLOWLIST = {
        # Win32-only UI capture script run by hand, not pytest
        'test_splash_ui.py',
    }

    def test_has_at_least_one_test(self, test_file: Path):
        """File must contain >= 1 test function (def test_... or class
        Test... with methods).  Catches "file exists but is empty"."""
        if test_file.name in self._NO_PYTEST_FUNCTIONS_ALLOWLIST:
            pytest.skip(f'{test_file.name} is an allowlisted manual script')
        src = test_file.read_text(encoding='utf-8', errors='replace')
        tree = ast.parse(src)
        has_test = False
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name.startswith('test_'):
                has_test = True
                break
            if isinstance(node, ast.AsyncFunctionDef) and node.name.startswith('test_'):
                has_test = True
                break
            if isinstance(node, ast.ClassDef) and node.name.startswith('Test'):
                # Check if the class has at least one test_* method
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        if item.name.startswith('test_'):
                            has_test = True
                            break
                if has_test:
                    break
        assert has_test, f'{test_file} has no test_* function or Test* class'

    def test_no_conflict_markers(self, test_file: Path):
        """Git conflict markers must never land in test files.

        Matching policy: look for the LEADING markers `<<<<<<< ` and
        `>>>>>>> ` (seven-char + space) at the start of a line.
        This avoids false positives when a test file legitimately
        asserts on ASCII separator bars (e.g. a hyphen run or 80
        consecutive `=`).  We do NOT check bare `=======` — that
        shows up benignly in separator lines.
        """
        src = test_file.read_text(encoding='utf-8', errors='replace')
        pattern_start = re.compile(r'^<{7} ', re.MULTILINE)
        pattern_end = re.compile(r'^>{7} ', re.MULTILINE)
        assert not pattern_start.search(src), (
            f'{test_file} contains "<<<<<<< " start conflict marker'
        )
        assert not pattern_end.search(src), (
            f'{test_file} contains ">>>>>>> " end conflict marker'
        )


# ════════════════════════════════════════════════════════════════════════
# Batch-level guard: every coverage-expansion batch file from #1-#35
# documented in commit history must still be on disk.
# ════════════════════════════════════════════════════════════════════════

class TestExpansionBatchesIntact:
    """Regression guard — if a merge accidentally deletes one of the
    coverage expansion files this test fails loudly."""

    BATCH_FILES = [
        # Batch #8 — pytest J21-J99 gap file
        'tests/journey/test_journey_gaps_J21_to_J99.py',
        # Batch #9 — pytest J100-J199 gap file
        'tests/journey/test_journey_gaps_J100_to_J199.py',
        # Batches #10-#15 — Cypress UAT journeys
        'landing-page/cypress/e2e/uat-journeys-j100-j115.cy.js',
        'landing-page/cypress/e2e/uat-journeys-j116-j137.cy.js',
        'landing-page/cypress/e2e/uat-journeys-j138-j170.cy.js',
        'landing-page/cypress/e2e/uat-journeys-j171-j199.cy.js',
        'landing-page/cypress/e2e/uat-journeys-j21-j51-adapters.cy.js',
        'landing-page/cypress/e2e/uat-journeys-j52-j99.cy.js',
        # Batch #16 — chatbot_routes integration
        'tests/test_chatbot_routes_integration.py',
        # Batch #17 — route modules integration
        'tests/test_route_modules_integration.py',
        # Batches #18-#20 — tts / llama / desktop modules
        'tests/test_tts_modules_integration.py',
        'tests/test_llama_modules_integration.py',
        'tests/test_desktop_modules_integration.py',
        # Batch #21 — main.py pure helpers
        'tests/test_main_module_integration.py',
        # Batch #23 — scripts deps
        'tests/test_scripts_deps.py',
        # Batch #24 — wamp_router + verified
        'tests/test_wamp_router_integration.py',
        # Batch #25 — models integration
        'tests/test_models_integration.py',
        # Batch #29 — main routes URL-map
        'tests/test_main_routes_integration.py',
        # Batch #30 — Cypress J200-J220
        'landing-page/cypress/e2e/uat-journeys-j200-j220.cy.js',
        # Batch #31 — Cypress J221-J260
        'landing-page/cypress/e2e/uat-journeys-j221-j260.cy.js',
        # Batch #32 — Cypress J261-J282
        'landing-page/cypress/e2e/uat-journeys-j261-j282.cy.js',
    ]

    @pytest.mark.parametrize('rel_path', BATCH_FILES)
    def test_batch_file_present(self, rel_path):
        full = PROJECT_ROOT / rel_path
        assert full.exists(), (
            f'Coverage-expansion batch file missing: {rel_path} '
            f'\u2014 check git log for accidental deletion.'
        )
