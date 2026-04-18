# tests/coverage — Runtime Coverage Harness

**Goal:** Measure Python coverage WHILE Flask is actively serving real
pytest-journey traffic AND Cypress traffic.  Mock-unit coverage lies —
this harness measures what the user's requests actually exercise.

## Files

- `run_python.sh` / `run_python.ps1` — boot Flask under
  `scripts/coverage_flask_run.py`, run pytest-journey, kill Flask,
  `coverage combine`, `coverage html` + `coverage xml` + `coverage json`.
- `run_python_inproc.sh` / `.ps1` — in-process pytest-journey under
  `coverage run --parallel-mode`, no Flask subprocess (for fast
  iteration; ~5× faster baseline sweep).
- `run_js.sh` / `run_js.ps1` — build instrumented React bundle
  (`NUNBA_INSTRUMENT=1`), start it on :3001, run Cypress, collect
  `__coverage__` dumps, merge via nyc, emit html + json-summary.
- `merge_and_report.py` — merge Python + JS reports into
  `MERGED_SUMMARY.md`.
- `BASELINE.md` — emitted by Phase 2; snapshot of the coverage floor.
- `EXCLUSIONS.md` — the `# coverage: un-hittable` contract.

## Quick start (Windows, PowerShell)

```powershell
# Python side — journey tests under real Flask (in-process client)
.\tests\coverage\run_python_inproc.ps1

# JS side — Cypress against live Flask + instrumented React bundle
.\tests\coverage\run_js.ps1

# Merge
python tests\coverage\merge_and_report.py
```

## How coverage gets captured across the process boundary

- `main.py` (Flask subprocess) imports `scripts.coverage_flask_run`
  which starts `coverage.Coverage(auto_data=True, branch=True)` BEFORE
  any Nunba module-init runs.
- `atexit` + `SIGTERM` / `SIGINT` handlers call `cov.save()` which
  emits `.coverage.<host>.<pid>.<rand>` files under the cwd.
- `run_python.*` scripts `coverage combine` those subprocess files
  together with pytest's own `.coverage` file.
- `.coveragerc` has `parallel = True` which tells coverage to expect
  and merge those parallel-mode files.

## Resource posture

The journey suite takes ~10-15 min to complete under coverage.
Cypress takes ~30-45 min.  Budget 90-120 min total wall clock for a
full baseline refresh.  On CI, the targets run in separate jobs so
total wall clock is dominated by Cypress.

## Thresholds (Phase 5 CI gate)

See `COVERAGE.md` at repo root.
