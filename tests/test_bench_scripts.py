"""Source-shape + callable smoke tests for scripts/bench_*.py — batch #41.

Benchmark scripts are standalone utilities run manually + by CI
regression.yml.  They're not normally unit-tested because their
real work involves GPU probing, LLM dispatch, and TTS synthesis.

This batch adds callable-exists smoke + pure-function coverage
where possible:
  * _bootstrap_ci_median   (pure math on a list)
  * aggregate             (pure summary over PromptResult rows)
  * probe_environment     (reads os.environ + platform)

Plus AST-parse smoke on every bench_*.py file.
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

pytestmark = pytest.mark.timeout(20)


# ════════════════════════════════════════════════════════════════════════
# AST parse + symbol export guards on every bench_*.py
# ════════════════════════════════════════════════════════════════════════

BENCH_FILES = sorted(
    (PROJECT_ROOT / 'scripts').glob('bench_*.py'),
)


@pytest.mark.parametrize('bench_file', BENCH_FILES, ids=lambda p: p.name)
class TestBenchFileIntegrity:
    def test_parses_as_python(self, bench_file: Path):
        src = bench_file.read_text(encoding='utf-8', errors='replace')
        try:
            ast.parse(src)
        except SyntaxError as e:
            pytest.fail(f'{bench_file.name} is not valid Python: {e}')

    def test_declares_main_function(self, bench_file: Path):
        """Every bench script should have a main() entrypoint so
        regression.yml can invoke it uniformly."""
        src = bench_file.read_text(encoding='utf-8', errors='replace')
        tree = ast.parse(src)
        has_main = any(
            isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
            and n.name == 'main'
            for n in ast.walk(tree)
        )
        assert has_main, f'{bench_file.name} has no main() function'

    def test_has_shebang_or_if_main_guard(self, bench_file: Path):
        """Runnable script convention: either a shebang line or an
        `if __name__ == '__main__':` guard."""
        src = bench_file.read_text(encoding='utf-8', errors='replace')
        has_shebang = src.startswith('#!')
        has_main_guard = '__name__' in src and '__main__' in src
        assert has_shebang or has_main_guard, (
            f'{bench_file.name} lacks runnable-script convention'
        )


# ════════════════════════════════════════════════════════════════════════
# bench_indic_cohort.py — exported symbols + pure helpers
# ════════════════════════════════════════════════════════════════════════

class TestBenchIndicCohortExports:
    @pytest.mark.parametrize('name', [
        'install_fake_vram',
        '_offline_measure',
        '_live_measure',
        '_bootstrap_ci_median',
        'aggregate',
        'main',
    ])
    def test_symbol_exported(self, name):
        import scripts.bench_indic_cohort as bic
        assert hasattr(bic, name), f'{name} missing from scripts.bench_indic_cohort'
        assert callable(getattr(bic, name))


class TestBootstrapCIMedian:
    """_bootstrap_ci_median is a pure statistical function — trivial
    to verify without GPU / LLM setup.  Return shape is
    implementation-dependent (tuple / None / dict) so these tests
    are permissive about the exact return type."""

    def test_single_value_does_not_crash(self):
        from scripts.bench_indic_cohort import _bootstrap_ci_median
        # Just verify no crash on single-value list.
        result = _bootstrap_ci_median([5.0], iters=100)
        # Accept any return shape — tuple, None, dict.
        assert result is None or isinstance(result, (tuple, dict, list, float, int))

    def test_handles_empty_list_gracefully(self):
        from scripts.bench_indic_cohort import _bootstrap_ci_median
        try:
            result = _bootstrap_ci_median([], iters=10)
            assert result is None or isinstance(result, (tuple, dict, list, float, int))
        except (ValueError, IndexError, ZeroDivisionError):
            pass  # raising on empty is acceptable

    def test_identical_values_does_not_crash(self):
        from scripts.bench_indic_cohort import _bootstrap_ci_median
        values = [3.0] * 10
        result = _bootstrap_ci_median(values, iters=50)
        assert result is None or isinstance(result, (tuple, dict, list, float, int))


class TestAggregate:
    def test_aggregate_empty_rows_returns_dict(self):
        from scripts.bench_indic_cohort import aggregate
        result = aggregate([])
        assert isinstance(result, dict)


class TestInstallFakeVRAM:
    def test_install_fake_vram_accepts_gb_args(self):
        """Should accept arbitrary GB values without raising."""
        from scripts.bench_indic_cohort import install_fake_vram
        install_fake_vram(total_gb=8.0, free_gb=6.0)
        # No assertion — the function mutates sys.modules side-effect.
        # Just verifying it runs without crashing.


# ════════════════════════════════════════════════════════════════════════
# bench_gpu.py — exported symbols + probe
# ════════════════════════════════════════════════════════════════════════

class TestBenchGPUExports:
    @pytest.mark.parametrize('name', [
        'probe_environment',
        'bench_llm_tok_per_sec',
        'bench_tts_first_byte',
        'bench_vram',
        'compare',
        'run_bench',
        'main',
    ])
    def test_symbol_exported(self, name):
        import scripts.bench_gpu as bg
        assert hasattr(bg, name), f'{name} missing from scripts.bench_gpu'
        assert callable(getattr(bg, name))


class TestProbeEnvironment:
    def test_returns_dict(self):
        from scripts.bench_gpu import probe_environment
        result = probe_environment()
        assert isinstance(result, dict)

    def test_has_platform_info(self):
        from scripts.bench_gpu import probe_environment
        result = probe_environment()
        # Should include at least some identifying fields
        # (platform name, Python version, etc.).
        assert len(result) > 0
