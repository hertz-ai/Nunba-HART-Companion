#!/usr/bin/env bash
# Run pytest-journey under in-process coverage.  The `nunba_flask_app`
# fixture uses Flask's WSGI test_client, so HTTP round-trips are
# captured in the SAME process as pytest.  No subprocess coverage
# merge needed for the in-proc path.  This is the fast baseline mode.
#
# For the full multi-process mode (Flask subprocess + Cypress +
# pytest), use `run_python.sh` instead.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

TARGET="${1:-tests/journey}"

echo ">>> Cleaning prior coverage data..."
rm -f .coverage .coverage.* 2>/dev/null || true
rm -rf tests/coverage/python/htmlcov tests/coverage/python/coverage.xml 2>/dev/null || true
mkdir -p tests/coverage/python

echo ">>> Running pytest under coverage against: $TARGET"
python -X utf8 -m coverage run \
    --rcfile=.coveragerc \
    --parallel-mode \
    -m pytest "$TARGET" \
        -v \
        -p no:randomly \
        --timeout=60 \
        --no-cov \
        -ra \
    || PYTEST_EXIT=$?

echo ">>> Combining parallel-mode coverage fragments..."
python -m coverage combine --rcfile=.coveragerc || true

echo ">>> Emitting reports..."
python -m coverage html --rcfile=.coveragerc \
    --directory=tests/coverage/python/htmlcov \
    --skip-covered --skip-empty || true
python -m coverage xml --rcfile=.coveragerc \
    -o tests/coverage/python/coverage.xml || true
python -m coverage json --rcfile=.coveragerc \
    -o tests/coverage/python/coverage.json || true

echo ">>> Coverage summary:"
python -m coverage report --rcfile=.coveragerc --skip-covered --skip-empty | tail -20 || true

echo ">>> Done.  HTML: tests/coverage/python/htmlcov/index.html"
exit ${PYTEST_EXIT:-0}
