#!/usr/bin/env bash
# Full multi-process Python coverage:
#   1. Boot main.py directly under `python -m coverage run --parallel-mode`
#      on :5189 (simpler + more reliable than a runpy wrapper, which
#      triggers a silent exit on Windows + coverage.py under the
#      HARTOS module-init chain).
#   2. Run pytest-journey with NUNBA_LIVE_URL=http://127.0.0.1:5189
#      + NUNBA_COVERAGE_STRICT=1 so the `nunba_flask_app` fixture
#      uses the `_LiveHTTPAdapter` against the instrumented daemon.
#   3. Call /_debug/coverage/shutdown (registered in main.py when
#      NUNBA_COVERAGE_ENABLED=1) to flush + exit Flask gracefully.
#   4. `coverage combine` merges pytest's .coverage with the Flask
#      fragments.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"

PORT="${NUNBA_COVERAGE_PORT:-5189}"
# Accept multiple targets (space-separated) or a default.  Pytest
# is invoked with "$@" so "run_python.sh a b c" targets three files.
if [ $# -eq 0 ]; then
    set -- "tests/journey"
fi

echo ">>> Cleaning prior coverage data..."
rm -f .coverage .coverage.* 2>/dev/null || true
rm -rf tests/coverage/python/htmlcov tests/coverage/python/coverage.xml tests/coverage/python/coverage.json 2>/dev/null || true
mkdir -p tests/coverage/python

echo ">>> Starting Flask under coverage on :$PORT ..."
NUNBA_DISABLE_TTS_WARMUP=1 \
NUNBA_DISABLE_LLAMA_AUTOSTART=1 \
NUNBA_DISABLE_HARTOS_INIT=1 \
NUNBA_SKIP_SINGLE_INSTANCE=1 \
NUNBA_COVERAGE_ENABLED=1 \
HARTOS_MCP_DISABLE_AUTH=1 \
PYTHONUNBUFFERED=1 \
python -X utf8 -m coverage run --rcfile=.coveragerc --parallel-mode main.py --port "$PORT" \
    > tests/coverage/flask_stdout.log \
    2> tests/coverage/flask_stderr.log &
FLASK_PID=$!

cleanup() {
    # Graceful shutdown via debug endpoint — the ONLY reliable Windows
    # path because taskkill /F bypasses atexit and loses the fragment.
    curl -s -o /dev/null -X POST "http://127.0.0.1:$PORT/_debug/coverage/shutdown" 2>/dev/null || true
    sleep 2
    # If still alive, try POSIX signal path.  On Windows bash this is
    # also best-effort — Python process may ignore.
    kill -TERM "$FLASK_PID" 2>/dev/null || true
    sleep 1
    kill -KILL "$FLASK_PID" 2>/dev/null || true
    wait "$FLASK_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo ">>> Waiting up to 180s for Flask /status ..."
for i in $(seq 1 180); do
    if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/status" 2>/dev/null | grep -q 200; then
        echo "    Flask ready after ${i}s"
        break
    fi
    sleep 1
done

echo ">>> Running pytest against live Flask..."
echo "    Targets: $*"
set +e
NUNBA_LIVE_URL="http://127.0.0.1:$PORT" \
NUNBA_COVERAGE_STRICT=1 \
HARTOS_MCP_DISABLE_AUTH=1 \
python -X utf8 -m pytest "$@" \
    -v \
    -p no:randomly \
    --timeout=120 \
    --no-cov \
    -ra
PYTEST_EXIT=$?
set -e

echo ">>> Flushing coverage (graceful shutdown) ..."
curl -s -X POST "http://127.0.0.1:$PORT/_debug/coverage/shutdown" -w "\n%{http_code}\n" 2>&1 | tail -3 || true
# Let the Flask process actually exit
sleep 2

echo ">>> Combining parallel-mode fragments..."
python -m coverage combine --rcfile=.coveragerc || true

echo ">>> Emitting reports..."
python -m coverage html --rcfile=.coveragerc \
    --directory=tests/coverage/python/htmlcov \
    --skip-covered --skip-empty || true
python -m coverage xml --rcfile=.coveragerc \
    -o tests/coverage/python/coverage.xml || true
python -m coverage json --rcfile=.coveragerc \
    -o tests/coverage/python/coverage.json || true
python -m coverage report --rcfile=.coveragerc --skip-covered --skip-empty | tail -20 || true

echo ">>> Done."
exit "$PYTEST_EXIT"
