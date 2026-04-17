#!/usr/bin/env bash
# run_all_regression.sh — single entry-point for every local or CI test tier.
#
# Runs:
#   1. ruff check + format (fast static)
#   2. Main pytest suite (tests/, EXCLUDES tests/harness)
#   3. Defect-harness suite (tests/harness, unit + integration marks)
#   4. Optional: live tier (tests/harness -m live)         — NUNBA_LIVE=1
#   5. Optional: Cypress E2E (landing-page)                 — NUNBA_CYPRESS=1
#   6. Optional: staging probes (scripts/staging_e2e_probe) — NUNBA_STAGING=1
#
# Exits non-zero if ANY tier fails. Aggregates failure reasons at the end so
# CI logs point at every gap, not just the first.

set -u
cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"

FAILED=()
PYTHON="${PYTHON:-python}"
PYTEST="$PYTHON -m pytest"
export NUNBA_SKIP_SINGLE_INSTANCE=1

# Belt-and-suspenders: ensure pytest-timeout + coverage tooling are
# present.  Hung tests are a silent failure class; low coverage is
# the same bug class one level up.
$PYTHON -m pip install --quiet pytest-timeout pytest-cov coverage 2>/dev/null || true

# Wipe old coverage fragments from a prior run so we measure only
# this invocation.  `coverage combine` at the end aggregates what
# every pytest tier produced via --cov parallel mode.
$PYTHON -m coverage erase 2>/dev/null || true

run_tier() {
    local name="$1"; shift
    local t0=$(date +%s)
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  $name"
    echo "════════════════════════════════════════════════════════════"
    # GitHub Actions notice — pollable mid-run via `gh api
    # /repos/.../check-runs/<id>/annotations`.  Emits the tier start
    # so a long-running tier (like Cypress) is visible externally.
    echo "::notice title=tier start::$name"
    "$@"
    local rc=$?
    local elapsed=$(( $(date +%s) - t0 ))
    if [ $rc -ne 0 ]; then
        FAILED+=("$name (exit $rc)")
        echo "::warning title=tier FAILED::$name exit=$rc elapsed=${elapsed}s"
    else
        echo "::notice title=tier ok::$name elapsed=${elapsed}s"
    fi
    return 0  # never short-circuit; we want every tier's result
}

# ── 1. Static analysis
if command -v ruff >/dev/null 2>&1 || $PYTHON -m ruff --version >/dev/null 2>&1; then
    run_tier "ruff check"  $PYTHON -m ruff check .
    run_tier "ruff format" $PYTHON -m ruff format --check .
else
    echo "[skip] ruff not installed"
fi

# ── 2. Main pytest suite — everything under tests/ except harness + e2e
#      pytest-cov runs in parallel mode; each tier appends to .coverage.*
#      --timeout=300 + thread method: individual hung tests killed at 5min
#      so a single hung test can't eat the whole workflow budget.
run_tier "pytest main" \
    $PYTEST tests/ --ignore=tests/harness --ignore=tests/e2e \
    --cov --cov-append -v --tb=short \
    --timeout=300 --timeout-method=thread

# ── 3. Defect-harness suite (static assertions; low cov contribution)
run_tier "pytest harness (unit+integration)" \
    $PYTEST tests/harness -m "unit or integration" --cov --cov-append \
    -v --tb=short --rootdir tests/harness \
    --timeout=300 --timeout-method=thread

# ── 3b. E2E suite — the source of real runtime coverage
run_tier "pytest e2e" \
    $PYTEST tests/e2e --cov --cov-append -v --tb=short --rootdir tests/e2e \
    --timeout=300 --timeout-method=thread

# ── 4. Optional: live tier
if [ "${NUNBA_LIVE:-0}" = "1" ]; then
    run_tier "pytest harness (live)" \
        $PYTEST tests/harness -m "live" --cov --cov-append \
        -v --tb=short --rootdir tests/harness \
        --timeout=600 --timeout-method=thread
fi

# ── 5. Cypress — ALWAYS RUN (unless explicitly disabled).  This drives
#      hundreds of real backend routes via the React UI; without it the
#      Python coverage number is a huge under-count.  Flask runs under
#      coverage.py parallel mode via scripts/coverage_flask_run.py so
#      every handler Cypress hits is recorded.
if [ "${NUNBA_CYPRESS:-1}" != "0" ] && [ -d landing-page ]; then
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  Cypress E2E (Flask under coverage, React driven by Chrome)"
    echo "════════════════════════════════════════════════════════════"
    echo "::notice title=cypress::phase=begin (Flask+React+Cypress)"
    _CY_T0=$(date +%s)

    # Boot Flask under coverage.py.  Parallel mode → .coverage.* fragment.
    echo "::notice title=cypress flask::phase=boot port=5000"
    $PYTHON scripts/coverage_flask_run.py --port 5000 \
        > flask-coverage.log 2>&1 &
    _FLASK_PID=$!

    # Wait for Flask to start listening (hard cap: 120s).
    _FLASK_UP=0
    for _i in $(seq 1 120); do
        if curl -s -o /dev/null -m 1 http://127.0.0.1:5000/health; then
            _FLASK_UP=1
            break
        fi
        sleep 1
    done
    if [ "$_FLASK_UP" = "1" ]; then
        echo "::notice title=cypress flask::phase=listening pid=$_FLASK_PID elapsed=${_i}s"
    else
        echo "::warning title=cypress flask::phase=FAILED did not listen on :5000 within 120s"
        echo "---- flask-coverage.log (tail) ----"
        tail -n 80 flask-coverage.log || true
    fi

    # Boot the React dev server if no prod build is serving at :3000.
    _REACT_PID=""
    if [ ! -d landing-page/build ]; then
        echo "::notice title=cypress react::phase=boot port=3000 (no prod build)"
        (cd landing-page && BROWSER=none PORT=3000 npm start > ../react-dev.log 2>&1 &)
        _REACT_PID=$!
        _REACT_UP=0
        for _i in $(seq 1 180); do
            if curl -s -o /dev/null -m 1 http://127.0.0.1:3000; then
                _REACT_UP=1
                break
            fi
            sleep 1
        done
        if [ "$_REACT_UP" = "1" ]; then
            echo "::notice title=cypress react::phase=listening elapsed=${_i}s"
        else
            echo "::warning title=cypress react::phase=FAILED did not listen on :3000 within 180s"
            echo "---- react-dev.log (tail) ----"
            tail -n 80 react-dev.log || true
        fi
    else
        echo "::notice title=cypress react::phase=skipped (landing-page/build exists)"
    fi

    # Drive the browser suite.  `timeout 7200` (120min) is the hard cap;
    # the 57-spec suite in one shot regularly runs 30-60min on a single
    # runner.  quality.yml shards the same suite 4-way (each ~30min cap)
    # for faster signal — this regression job is the consolidated view.
    # GH Actions default job timeout is 6h, so 2h budget here leaves
    # plenty of room for coverage combine + report at the end.
    echo "::notice title=cypress run::phase=starting cypress npx run (cap=7200s/120min)"
    cd landing-page && timeout 7200 npx cypress run --browser chrome
    _CY_RC=$?
    cd "$REPO_ROOT"
    _CY_ELAPSED=$(( $(date +%s) - _CY_T0 ))
    if [ $_CY_RC -eq 124 ]; then
        echo "::warning title=cypress run::phase=TIMEOUT 7200s (120min) wallclock hit"
    elif [ $_CY_RC -eq 0 ]; then
        echo "::notice title=cypress run::phase=ok elapsed=${_CY_ELAPSED}s"
    else
        echo "::warning title=cypress run::phase=FAILED rc=$_CY_RC elapsed=${_CY_ELAPSED}s"
    fi

    # Graceful shutdown so coverage atexit fires.
    echo "::notice title=cypress::phase=shutdown (flush coverage)"
    kill -TERM $_FLASK_PID 2>/dev/null || true
    wait $_FLASK_PID 2>/dev/null || true
    if [ -n "$_REACT_PID" ]; then
        kill -TERM $_REACT_PID 2>/dev/null || true
    fi
    echo "::notice title=cypress::phase=end total=${_CY_ELAPSED}s rc=$_CY_RC"

    if [ $_CY_RC -ne 0 ]; then
        FAILED+=("cypress e2e (exit $_CY_RC)")
    fi
fi

# ── 6. Optional: staging probes
if [ "${NUNBA_STAGING:-0}" = "1" ] && [ -x scripts/staging_e2e_probe.sh ]; then
    run_tier "staging probes" bash scripts/staging_e2e_probe.sh
fi

# ── Combine coverage from every tier and enforce the 99% gate.
#      .coveragerc has fail_under=99 so coverage.report exits non-zero
#      below threshold.  This is the hard quality gate.
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  coverage combine + gate (fail_under=99)"
echo "════════════════════════════════════════════════════════════"
$PYTHON -m coverage combine 2>/dev/null || true
run_tier "coverage gate (>=99% runtime)" \
    $PYTHON -m coverage report --precision=1 --skip-covered --skip-empty
$PYTHON -m coverage xml -o coverage.xml 2>/dev/null || true
$PYTHON -m coverage html -d .coverage-html 2>/dev/null || true

# ── Aggregate tier verdict
echo ""
echo "════════════════════════════════════════════════════════════"
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "  ✓ ALL TIERS PASSED + COVERAGE GATE GREEN"
    exit 0
else
    echo "  ✗ FAILED TIERS (${#FAILED[@]}):"
    for f in "${FAILED[@]}"; do echo "    - $f"; done
    echo ""
    echo "  Coverage gate enforces >=99% runtime coverage."
    echo "  Convert the remaining source-grep tests to real e2e drivers"
    echo "  (see tests/e2e/ for the pattern) to close the gap."
    exit 1
fi
