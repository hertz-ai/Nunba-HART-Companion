#!/usr/bin/env bash
# Build the React bundle with istanbul instrumentation, serve it on
# :3001, run Cypress against it with Flask on :5000, collect coverage.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO/landing-page"

echo ">>> Building instrumented bundle (NUNBA_INSTRUMENT=1)..."
NUNBA_INSTRUMENT=1 CYPRESS_COVERAGE=true npm run build

echo ">>> Starting static server on :3001..."
npx serve -s build -l 3001 > ../tests/coverage/serve_stdout.log 2>&1 &
SERVE_PID=$!
trap "kill $SERVE_PID 2>/dev/null || true" EXIT

echo ">>> Running Cypress..."
npx cypress run --browser chrome \
    --config baseUrl=http://localhost:3001 \
    || CY_EXIT=$?

echo ">>> Emitting nyc reports..."
npx nyc report \
    --report-dir coverage \
    --reporter html --reporter json-summary --reporter text-summary \
    || true

echo ">>> Done.  Reports under landing-page/coverage/"
exit ${CY_EXIT:-0}
