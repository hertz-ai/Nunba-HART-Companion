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

run_tier() {
    local name="$1"; shift
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  $name"
    echo "════════════════════════════════════════════════════════════"
    "$@"
    local rc=$?
    if [ $rc -ne 0 ]; then
        FAILED+=("$name (exit $rc)")
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

# ── 2. Main pytest suite — everything under tests/ except harness
run_tier "pytest main" \
    $PYTEST tests/ --ignore=tests/harness -v --tb=short

# ── 3. Defect-harness suite
run_tier "pytest harness (unit+integration)" \
    $PYTEST tests/harness -m "unit or integration" -v --tb=short --rootdir tests/harness

# ── 4. Optional: live tier
if [ "${NUNBA_LIVE:-0}" = "1" ]; then
    run_tier "pytest harness (live)" \
        $PYTEST tests/harness -m "live" -v --tb=short --rootdir tests/harness
fi

# ── 5. Optional: Cypress
if [ "${NUNBA_CYPRESS:-0}" = "1" ] && [ -d landing-page ]; then
    run_tier "cypress e2e" \
        bash -c "cd landing-page && npx cypress run --browser chrome"
fi

# ── 6. Optional: staging probes
if [ "${NUNBA_STAGING:-0}" = "1" ] && [ -x scripts/staging_e2e_probe.sh ]; then
    run_tier "staging probes" bash scripts/staging_e2e_probe.sh
fi

# ── Aggregate
echo ""
echo "════════════════════════════════════════════════════════════"
if [ ${#FAILED[@]} -eq 0 ]; then
    echo "  ✓ ALL TIERS PASSED"
    exit 0
else
    echo "  ✗ FAILED TIERS (${#FAILED[@]}):"
    for f in "${FAILED[@]}"; do echo "    - $f"; done
    exit 1
fi
