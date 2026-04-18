# Coverage Exclusions — Un-hittable Lines

This file documents the `# coverage: un-hittable, rationale=...`
contract.  Lines listed here are **legitimately un-reachable** by
any functional test (pytest-journey or Cypress) without fault
injection.  Every other uncovered line is fair game for a test.

## Categories

1. **Platform gates** — `if sys.platform == "darwin"` branches are
   un-hittable on the Windows CI runner.  The `.coveragerc`
   `exclude_also` list already filters these.
2. **Frozen-binary gates** — `if getattr(sys, "frozen", False)` only
   fires inside a cx_Freeze bundle, which the coverage harness does
   NOT launch (coverage.py can't trace a cx_Freeze-frozen binary).
3. **CUDA-only hot paths** — `if torch.cuda.is_available()` branches
   on a runner without a GPU.  The synthetic_cuda fixture covers the
   classifier logic; the real kernel-launch branches are
   CPU-un-runnable.
4. **OOM / disk-full handlers** — `except MemoryError`,
   `except OSError as e: if e.errno == errno.ENOSPC`.  Triggering
   these requires a dedicated fault-injection harness that's out of
   scope for the runtime coverage gate.
5. **Main-script guards** — `if __name__ == "__main__":`.  The
   `.coveragerc` `exclude_also` already skips this.

## How to add an exclusion

Annotate the source line:

```python
if sys.platform == "darwin":
    ...  # coverage: un-hittable, rationale=Mac-only; CI runs Windows+Linux
```

Then append a row below:

| File | Line(s) | Rationale |
|---|---|---|
| _(none yet — Phase 3 will populate)_ | | |

## Per-category counts (Phase 4 output)

Will be filled in after the final iteration.

| Category | Count |
|---|---:|
| Platform gates | 0 |
| Frozen-binary gates | 0 |
| CUDA-only hot paths | 0 |
| OOM / disk-full handlers | 0 |
| Main-script guards | 0 |
| **Total un-hittable** | **0** |

## Thresholds

CI gate (see `COVERAGE.md`) enforces:
- Python line coverage ≥ N%
- Python branch coverage ≥ M%
- JS line coverage ≥ P%

where N/M/P are Phase-4 asymptote minus 2% slack.
