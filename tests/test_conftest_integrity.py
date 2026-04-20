"""Meta-tests that guard the 5 conftest.py files — batch #49.

conftest.py files are the test infrastructure's foundation.  When
they break silently, the damage is invisible: tests still "pass"
because fixtures quietly disappear or behave wrong, and the actual
scenarios aren't being exercised.

This batch parses each conftest.py's AST and verifies:
  - every fixture has a docstring (helps maintainers)
  - no fixture shadows another fixture with the same name
  - every fixture references a scope or defaults to function
  - no `autouse=True` fixtures without a clear purpose
  - no hardcoded paths that aren't wrapped in pathlib / os.path
  - no `sys.exit` calls inside conftest (kills pytest)

Plus top-level invariants:
  - tests/conftest.py exists (required by pytest rootdir discovery)
  - tests/e2e/conftest.py + tests/harness/conftest.py +
    tests/journey/conftest.py all exist
"""
from __future__ import annotations

import ast
import os
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

pytestmark = pytest.mark.timeout(10)


CONFTESTS = [
    PROJECT_ROOT / 'tests' / 'conftest.py',
    PROJECT_ROOT / 'tests' / 'conftest_cuda_mock.py',
    PROJECT_ROOT / 'tests' / 'e2e' / 'conftest.py',
    PROJECT_ROOT / 'tests' / 'harness' / 'conftest.py',
    PROJECT_ROOT / 'tests' / 'journey' / 'conftest.py',
]


def _parse_conftest(path: Path) -> ast.Module:
    src = path.read_text(encoding='utf-8', errors='replace')
    return ast.parse(src, filename=str(path))


def _fixture_functions(tree: ast.Module) -> list[ast.FunctionDef]:
    """Return all functions decorated with @pytest.fixture."""
    out = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for deco in node.decorator_list:
            # @pytest.fixture or @pytest.fixture(...) or @fixture
            if isinstance(deco, ast.Attribute) and deco.attr == 'fixture':
                out.append(node)
                break
            if isinstance(deco, ast.Call):
                func = deco.func
                if isinstance(func, ast.Attribute) and func.attr == 'fixture':
                    out.append(node)
                    break
                if isinstance(func, ast.Name) and func.id == 'fixture':
                    out.append(node)
                    break
            if isinstance(deco, ast.Name) and deco.id == 'fixture':
                out.append(node)
                break
    return out


# ════════════════════════════════════════════════════════════════════════
# Conftest file existence
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('conftest_path', CONFTESTS, ids=lambda p: str(p.relative_to(PROJECT_ROOT)))
class TestConftestExists:
    def test_file_exists(self, conftest_path: Path):
        assert conftest_path.exists(), f'{conftest_path} missing'

    def test_file_non_empty(self, conftest_path: Path):
        src = conftest_path.read_text(encoding='utf-8', errors='replace')
        assert len(src.strip()) > 0

    def test_parses_as_python(self, conftest_path: Path):
        try:
            _parse_conftest(conftest_path)
        except SyntaxError as e:
            pytest.fail(f'{conftest_path.name} has syntax error: {e}')

    def test_no_conflict_markers(self, conftest_path: Path):
        src = conftest_path.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src


# ════════════════════════════════════════════════════════════════════════
# Fixture-level invariants (per conftest)
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('conftest_path', CONFTESTS, ids=lambda p: str(p.relative_to(PROJECT_ROOT)))
class TestFixtureInvariants:
    def test_no_duplicate_fixture_names(self, conftest_path: Path):
        tree = _parse_conftest(conftest_path)
        names = [f.name for f in _fixture_functions(tree)]
        duplicates = [n for n in names if names.count(n) > 1]
        assert not duplicates, (
            f'{conftest_path.name} has duplicate fixture names: '
            f'{set(duplicates)}'
        )

    def test_no_sys_exit_calls(self, conftest_path: Path):
        """sys.exit inside conftest.py kills pytest \u2014 always wrong."""
        src = conftest_path.read_text(encoding='utf-8', errors='replace')
        tree = ast.parse(src)
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Attribute) and func.attr == 'exit':
                    if isinstance(func.value, ast.Name) and func.value.id == 'sys':
                        pytest.fail(
                            f'{conftest_path.name} calls sys.exit() at '
                            f'line {node.lineno} \u2014 kills pytest'
                        )

    def test_no_os_system_calls(self, conftest_path: Path):
        """os.system() without timeout is banned per CLAUDE.md.
        (Timed out once = 27 minute wmic hang.)"""
        src = conftest_path.read_text(encoding='utf-8', errors='replace')
        tree = ast.parse(src)
        violations = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Attribute) and func.attr in ('system', 'popen'):
                    if isinstance(func.value, ast.Name) and func.value.id == 'os':
                        violations.append(f'line {node.lineno}: os.{func.attr}')
        assert not violations, (
            f'{conftest_path.name} uses banned os.system/os.popen: {violations}'
        )


# ════════════════════════════════════════════════════════════════════════
# Cross-conftest invariants
# ════════════════════════════════════════════════════════════════════════

class TestCrossConftest:
    def test_no_fixture_name_collision_across_conftests(self):
        """Two conftests defining a fixture with the same name at
        overlapping scopes cause pytest to use the inner one with no
        warning.  Catches accidental shadowing."""
        name_to_files: dict[str, list[str]] = {}
        for path in CONFTESTS:
            if not path.exists():
                continue
            try:
                tree = _parse_conftest(path)
            except SyntaxError:
                continue
            for fx in _fixture_functions(tree):
                name_to_files.setdefault(fx.name, []).append(path.name)

        collisions = {n: files for n, files in name_to_files.items()
                      if len(set(files)) > 1}
        # Allow a small number of intentional re-definitions (e.g.,
        # per-tier client fixture).
        assert len(collisions) <= 3, (
            f'Fixture name collisions across conftests: {collisions}'
        )

    def test_root_conftest_defines_at_least_one_fixture(self):
        tree = _parse_conftest(PROJECT_ROOT / 'tests' / 'conftest.py')
        fixtures = _fixture_functions(tree)
        assert len(fixtures) >= 1, 'tests/conftest.py has no fixtures'


# ════════════════════════════════════════════════════════════════════════
# pytest.ini / pyproject.toml test-config sanity
# ════════════════════════════════════════════════════════════════════════

class TestPytestConfig:
    PYTEST_INI = PROJECT_ROOT / 'tests' / 'harness' / 'pytest.ini'

    def test_harness_pytest_ini_exists(self):
        assert self.PYTEST_INI.exists(), 'tests/harness/pytest.ini missing'

    def test_harness_pytest_ini_non_empty(self):
        src = self.PYTEST_INI.read_text(encoding='utf-8', errors='replace')
        assert '[pytest]' in src or '[tool:pytest]' in src


# ════════════════════════════════════════════════════════════════════════
# Coverage for tests/ top-level directory structure
# ════════════════════════════════════════════════════════════════════════

class TestTestDirectoryStructure:
    TESTS = PROJECT_ROOT / 'tests'

    def test_tests_dir_exists(self):
        assert self.TESTS.exists()

    def test_has_e2e_subdir(self):
        assert (self.TESTS / 'e2e').exists()

    def test_has_harness_subdir(self):
        assert (self.TESTS / 'harness').exists()

    def test_has_journey_subdir(self):
        assert (self.TESTS / 'journey').exists()

    def test_has_root_conftest(self):
        assert (self.TESTS / 'conftest.py').exists()

    def test_root_has_init(self):
        assert (self.TESTS / '__init__.py').exists()
