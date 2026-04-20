# Runtime Coverage Baseline — Nunba-HART-Companion

Scope: Python backend only in this pass.  JS baseline follows once
the instrumented React build lands in `landing-page/`.

## Harness

- Flask boots under `python -m coverage run --rcfile=.coveragerc
  --parallel-mode main.py --port 5189` with
  `NUNBA_COVERAGE_ENABLED=1` set so `main.py` registers the
  `/_debug/coverage/{flush,shutdown}` loopback endpoints.
- Pytest-journey runs against the live daemon via the
  `_LiveHTTPAdapter` in `tests/e2e/conftest.py`
  (`NUNBA_LIVE_URL=http://127.0.0.1:5189` +
  `NUNBA_COVERAGE_STRICT=1`).
- `coverage combine` merges `.coverage.*` fragments from BOTH the
  Flask daemon and the in-process pytest runner.
- Reports land in `tests/coverage/python/{htmlcov,coverage.xml,coverage.json}`.
- Entry point: `bash tests/coverage/run_python.sh [target]`.

## Scope of measurement

`source` (`.coveragerc` `[run]`):

| Path | Kind |
|---|---|
| `app.py`, `main.py` | Entry + Flask app |
| `tts/` | TTS engine + language segmenter + verified pipeline |
| `llama/` | llama.cpp spawn + installer + config |
| `routes/` | Flask blueprints (chatbot, hartos_adapter, db, kids_media, upload, …) |
| `core/` | Runtime helpers (language, platform_paths, constants, hub_allowlist, …) |
| `models/` | Catalog, orchestrator, loaders |
| `desktop/` | Tray, indicator_window, chat_settings, setup_wizard, ai_installer, splash_effects |

Omitted: `*/tests/*`, `*/python-embed/*`, `*/build/*`,
`*/landing-page/*`, HARTOS pip paths
(`C:/Users/*/PycharmProjects/HARTOS/*`,
`*/site-packages/{HARTOS,hevolveai,hevolve_database}/*`).

Note: HARTOS code IS exercised at runtime by every HTTP route that
touches the main LLM / tools / memory graph.  We omit HARTOS from
the Nunba budget so that a HARTOS refactor doesn't move the Nunba
number without a Nunba code change.

## Baseline numbers (drive: `tests/journey/test_J257_efficiency_leaderboard.py`, 5 pass / 1 skip)

This is a deliberately tiny drive — ONE journey test file — to
prove the harness works end-to-end.  The real baseline with the
full journey suite + Cypress runs higher; that lands in Phase 2b.

```
TOTAL  line%  8.5   stmts 13102  covered 1383  missed 11719
       branch% 1.6  branches 3994  covered 62  missed 3932
       excluded 409 lines (pragmas + OS/frozen/CUDA guards)
```

## Top 20 uncovered files (by absolute missed lines)

Biggest coverage opportunities — write gap-driven tests against
these first.  `stmt` is executable statement count, `miss` is
missed count, `%` is line coverage.

| % | stmt | missed | file |
|---:|---:|---:|---|
|  0.00% | 1887 | 1887 | `desktop/splash_effects.py` |
|  9.62% | 1715 | 1505 | `routes/chatbot_routes.py` |
| 12.04% | 1229 | 1042 | `tts/tts_engine.py` |
|  8.71% | 1081 |  957 | `llama/llama_config.py` |
|  9.33% |  518 |  451 | `llama/llama_installer.py` |
|  8.77% |  502 |  442 | `tts/package_installer.py` |
| 25.90% |  557 |  392 | `routes/hartos_backend_adapter.py` |
| 13.48% |  387 |  323 | `routes/upload_routes.py` |
| 30.81% |  463 |  309 | `desktop/indicator_window.py` |
|  0.00% |  301 |  301 | `tts/vibevoice_tts.py` |
|  0.00% |  283 |  283 | `desktop/ai_installer.py` |
|  9.39% |  306 |  272 | `models/orchestrator.py` |
| 17.68% |  326 |  257 | `routes/db_routes.py` |
|  8.99% |  259 |  226 | `routes/kids_media_routes.py` |
|  0.00% |  223 |  223 | `desktop/setup_wizard.py` |
|  0.00% |  218 |  218 | `desktop/platform_utils.py` |
|  0.00% |  216 |  216 | `desktop/ai_key_vault.py` |
|  0.00% |  201 |  201 | `tts/piper_tts.py` |
|  0.00% |  177 |  177 | `models/language_bootstrap.py` |
|  0.00% |  162 |  162 | `desktop/tray_handler.py` |

## Triage of the 20 worst

Grouping by what blocks coverage:

1. **GUI / tray / splash modules** (Tkinter-only, never loaded on
   Windows headless runner): `desktop/splash_effects.py`,
   `desktop/indicator_window.py`, `desktop/tray_handler.py`,
   `desktop/setup_wizard.py`, `desktop/ai_installer.py`,
   `desktop/ai_key_vault.py`, `desktop/platform_utils.py`.
   → **Action:** decide per module whether to (a) exclude from
   `source` (if exclusively GUI event loops), (b) split pure logic
   out into testable helpers, or (c) add an xvfb-style Tkinter
   harness.  Phase 3 decision.
2. **TTS engines not exercised by J257** (`tts/tts_engine.py`,
   `tts/piper_tts.py`, `tts/vibevoice_tts.py`,
   `tts/package_installer.py`, `tts/verified_*`): drive via a
   J-series test that `/chat` with `tts=piper` / `indic_parler` /
   `kokoro` and asserts `Content-Type` + non-empty audio.
3. **Llama installer / config** (`llama/llama_installer.py`,
   `llama/llama_config.py`): drive via admin endpoints
   (`/api/admin/llama/*`) and by spawning the embedded server on
   a free port.
4. **Backend adapters / upload / kids** (`routes/*`): drive via
   direct HTTP exercising the full matrix of happy paths +
   400/403/500 branches.
5. **Models orchestrator + language bootstrap** (`models/*`):
   drive via admin model-search / install / uninstall + language
   switch endpoints.

## Phase 3 targets

The full pytest-journey suite + the Cypress SPA suite will push
this number much higher without writing a single new test — most
of the 20 files above are hit by the 183 existing journey tests
that the `/test_J257_*` smoke run did NOT exercise.

Phase 2b: re-run the harness against the FULL `tests/journey`
suite and capture the true baseline before any gap-driven tests
are written.

Phase 3: spawn 4 parallel `model: opus` testing agents to write
gap-driven journey + Cypress specs targeting the un-hit modules
above.

## Reproducibility

```
# Clean slate
rm -f .coverage .coverage.*
rm -rf tests/coverage/python tests/coverage/js landing-page/coverage
rm -rf landing-page/.nyc_output

# Python runtime coverage
bash tests/coverage/run_python.sh tests/journey

# JS runtime coverage (requires instrumented build)
bash tests/coverage/run_js.sh

# Merge + report
python tests/coverage/merge_and_report.py
```

## Exit criteria for Phase 2

✅ `tests/coverage/python/coverage.xml` exists and total >
  0%.
✅ `tests/coverage/python/coverage.json` parseable and
  includes branch metrics.
✅ `tests/coverage/python/htmlcov/index.html` renders.
✅ Fragment flush via `/_debug/coverage/shutdown` reliably
  collects coverage on Windows without `taskkill /F` loss.
✅ Top 20 uncovered files identified with absolute missed-line
  counts → Phase 3 agents have concrete targets.

## Phase 2b snapshot — post-PHASE7 breadth push

After landing PHASE7 (17 new JXXX breadth tests + coverage
harness, commits `dfd9a90e..19f4bb55`), the journey suite grew
from 52 green in PHASE6 to ~256 green across PHASE5+6+7+Liquid
(see `tests/journey/PHASE7_RESULTS.md` for the breakdown).

**Coverage rerun note:** A full `coverage combine` over the
PHASE7 additions was NOT completed in this window — the
session-scoped `nunba_flask_app` fixture hits a known
`vram_manager.detect_gpu` subprocess reader-thread orphan on
some Windows runs (Gate 7 violation tracked as a separate
HARTOS fix task).  When that fix lands, re-run:

```
bash tests/coverage/run_python.sh tests/journey
```

Expected delta: the 17 new tests drive
- `routes/chatbot_routes.py` (was 9.62%) — J267, J270, J271, J273
- `routes/hartos_backend_adapter.py` (was 25.90%) — J261, J266, J270
- `routes/db_routes.py` (was 17.68%) — J275
- `routes/kids_media_routes.py` (was 8.99%) — J272
- `models/orchestrator.py` (was 9.39%) — J266
- Admin blueprints + provider gateway (previously uncovered) — J260, J265, J268
- Flask lifecycle probes (previously lightly covered) — J274

Conservative projection: line-coverage jumps from 8.5% to ~18-22%
after the PHASE7 suite runs under coverage instrumentation.
Branch coverage similar lift from 1.6% toward ~6-8%.  Exact
numbers land when the vram_manager fix clears the fixture-setup
flake.

**Known test-isolation bug found during rerun**: 1 F in J267
appeared at test-position 123 during the ordered rerun but the
same test passes in isolation.  Signal points to J266 leaving
state that J267 reads (session fixture cache leak).  Does NOT
block the breadth coverage delta — the product surface is
verifiable green per-file.  Follow-up: add
`@pytest.fixture(scope="function")` around the memory-graph
writer, OR seed J267 with an explicit `fresh_memory_graph`
fixture that deletes `~/Documents/Nunba/data/memory_graph/*`
before each test.
