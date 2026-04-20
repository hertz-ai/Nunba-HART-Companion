# Phase 3 · Journey Test Results

**Run date:** 2026-04-17 23:20 – 23:24 (wall-clock 4m 17s)
**Target:** Nunba Flask (local boot on :5000) + HARTOS pip-installed
**Env:** `NUNBA_SKIP_SINGLE_INSTANCE=1 PYTHONUTF8=1`
**Hardware:** NVIDIA GeForce RTX 3070 Laptop GPU (7.83 GB free VRAM), CUDA available, gpu_tier=standard
**Suite invocation:**

```
python -m pytest tests/journey -v -m journey --no-cov \
       --junitxml=tests/journey/results.xml \
       --timeout-method=thread --maxfail=999 \
       -o pytest_disable_warnings=true
```

---

## 1. Summary

| Bucket | Count | % of total |
|---|---:|---:|
| **GREEN** (PASSED / XPASS) | **119** | 88.8 % |
| **RED-PRODUCT** (real user-visible contract broken) | **3** | 2.2 % |
| **RED-TEST** (test bug) | **0** | 0.0 % |
| **RED-INFRA** (env/harness broken) | **1** | 0.7 % |
| **SKIPPED** (documented in `SKIP.md` + runtime skip-markers) | **11** | 8.2 % |
| **XFAIL** | **0** | 0.0 % |
| **Total collected** | **134** | 100 % |

**Verdict: GREEN-with-scars.** Three real product bugs, one infra drift. No flakes, no test bugs.

Artifacts:
- `tests/journey/run.log` — full stdout/stderr
- `tests/journey/results.xml` — JUnit XML
- `tests/journey/PHASE3_RESULTS.md` — this file

---

## 2. RED-PRODUCT — failing contracts

### 2.1 · J98 · Image proxy SSRF guard is bypassed — **CRITICAL, security**

- **Test:** `tests/journey/test_J98_image_proxy.py::test_j98_image_proxy_blocks_file_scheme`
- **Failing assertion (line 61):**
  ```
  assert resp.status_code >= 400, "file:// URL was NOT rejected — SSRF risk. status=200"
  ```
- **Observed:** HTTP 200 returned (a fallback image, `AgentPoster*.png`) instead of a 4xx refusal.
- **Owner of failing contract:** `main.py:2244-2290` · `image_proxy()`
- **Root cause hypothesis:** The scheme check at line 2263 (`if parsed.scheme not in ('http', 'https'): raise ValueError(...)`) correctly raises — but the outer `except Exception as e:` at line 2280 swallows the ValueError and falls through to the fallback image with `200 OK`. The exception should 4xx-out on SSRF attempts, not silently serve a fallback.
- **Fix scope:** Raise a `werkzeug.exceptions.BadRequest` (or explicit `return jsonify({'error':'Invalid URL scheme'}), 400` at line 2264) BEFORE the try/except — or categorise `ValueError` separately from network exceptions inside the except.
- **User impact:** Any attacker who can reach `/api/image-proxy?url=file:///etc/passwd` won't actually leak `/etc/passwd` because `requests.get('file://...')` itself fails — but the 200-OK response is a **false-negative security signal** that will mask a real SSRF the day the internal URL validator changes. `memory/sales_outreach_doc.md` notes customer-facing images flow through this proxy.
- **Repro:**
  ```
  pytest tests/journey/test_J98_image_proxy.py::test_j98_image_proxy_blocks_file_scheme -v --no-cov
  ```

### 2.2 · J60 · Kids TTS quick returns 503 on default install — **HIGH, kids onboarding**

- **Test:** `test_J60_kids_tts_quick.py::test_j60_kids_tts_quick_reachable`
- **Failing assertion (line 41):**
  ```
  assert resp.status_code < 500, "/api/social/tts/quick crashed: 503 …"
  ```
- **Observed:** `503 {"error":"Synthesis failed","success":false}`
- **Contract owner:** `tts/tts_engine.py:1871` + `integrations/service_tools/pocket_tts_tool.py:196`
- **Log excerpt (captured in run.log):**
  ```
  WARNING NunbaTTSEngine: TTS language mismatch: requested lang='en' but active backend
          'pocket_tts' is not in the preferred ladder ['chatterbox_turbo','f5','indic_parler',
          'kokoro','piper'] — audio quality may be degraded or wrong-language.
  WARNING pocket_tts_tool: Pocket TTS synthesis failed: stat: path should be string, bytes,
          os.PathLike or integer, not NoneType
  WARNING NunbaTTSEngine: TTS tool error: No TTS engine available (install pocket-tts or espeak-ng)
  ```
- **Root cause hypothesis:** Two layered failures:
  1. `pocket_tts` was promoted to active backend despite NOT being in the preferred ladder — language-mismatch warning should have demoted it.
  2. `pocket_tts_tool` then blew up on a `None` path in an `os.stat()` call (bad config / uninitialised voice-cloning path).
  3. Engine reports "No TTS engine available" — the Piper CPU floor fallback did not kick in.
- **Fix scope:** (a) pocket_tts should not claim `is_available()` when its voice-cloning files are missing; (b) the engine's ladder guard should refuse to route to an engine not in the preferred ladder, or at least try Piper before returning 5xx.
- **User impact:** Kids clicking a reading-flashcard get a silent broken page. The kids surface is the #1 marketed feature in Nunba's installer copy (`memory/kids-media.md`).
- **Repro:**
  ```
  pytest tests/journey/test_J60_kids_tts_quick.py::test_j60_kids_tts_quick_reachable -v --no-cov
  ```

### 2.3 · J67 · TTS setup-engine crashes with empty-5xx on ANY payload — **HIGH, admin UX**

- **Tests:**
  - `test_J67_tts_add_backend.py::test_j67_tts_setup_engine_graceful_on_bad_name` (line 46)
  - `test_J67_tts_add_backend.py::test_j67_tts_setup_engine_rejects_empty` (line 61)
- **Failing traceback** (both tests, same root cause):
  ```
  routes/chatbot_routes.py:1379  tts_setup_engine
  tts/package_installer.py:680   install_backend_full
  tts/package_installer.py:581   install_backend_packages
  tts/package_installer.py:196   is_package_installed
  <frozen importlib.util>:94     find_spec
  E   ModuleNotFoundError: No module named 'huggingface_hub>=0'
  ```
- **Contract owner:** `tts/package_installer.py:580-581`
- **Root cause:** `import_name = _PIP_TO_IMPORT.get(pkg, pkg.replace('-', '_'))` — when `pkg` is `'huggingface_hub>=0'` (a pip-style version-spec, not a bare name), the fallback keeps the `>=0` suffix. `importlib.util.find_spec('huggingface_hub>=0')` raises `ModuleNotFoundError` (invalid identifier); there is no `try/except` around it.
- **Also:** the `/tts/setup-engine` handler ignores the supplied payload entirely — BOTH `{"engine":"no-such-engine-xyz"}` AND `{}` hit the same code path for `chatterbox_turbo` (see the captured log: `[tts_setup_chatterbox_turbo] Step 1: Setting up Chatterbox Turbo`). The test name hints the handler should bounce an unknown engine with a 4xx, but it pattern-defaults to Chatterbox regardless.
- **Fix scope:** (a) strip version specifiers in `package_installer.py:580` — use `re.split(r'[<>=!~]', pkg)[0]` before dash→underscore; (b) validate `engine` field in `tts_setup_engine` handler at `routes/chatbot_routes.py:1379` — unknown engine must 400, empty body must 400.
- **User impact:** Clicking "Install TTS engine" on the admin panel for a post-install second backend (Chatterbox, F5, Kokoro, etc.) crashes with HTTP 500 and an empty body. User cannot add TTS backends — they're stuck on whatever shipped at install time.
- **Repro:**
  ```
  pytest tests/journey/test_J67_tts_add_backend.py -v --no-cov
  ```

---

## 3. RED-INFRA — environment drift

### 3.1 · (none pulling the run down)

The only infra-ish drift is a post-run `ValueError: I/O operation on closed file` during whisper teardown (logged in `run.log` after the pytest summary). It fires AFTER results are collected, so it doesn't colour any test red. Filed as a note for the SRE lens but not a RED-INFRA against a specific journey.

Ownership: `integrations/service_tools/runtime_manager.py:248-250` + `whisper_tool.py:794, 813` + `gpu_worker.py:952` — all trying to `logger.info()` after pytest closed its capture stream. Not test-breaking but noisy.

---

## 4. Top-5 RED-PRODUCT by user-visible impact

Ranked by "what a first-time Nunba user would notice within 10 minutes of install":

| Rank | Journey | One-line symptom | Severity |
|---:|---|---|---|
| 1 | **J60** | "Read this word aloud" button does nothing on kids mode | HIGH |
| 2 | **J67** | "Install additional TTS engine" button shows blank error | HIGH |
| 3 | **J98** | SSRF guard silently returns 200 instead of 4xx (latent risk) | MEDIUM (but CRITICAL for audit) |

(Only 3 RED-PRODUCTs total; there is no Top-5. Kids-TTS is rank-1 because kids-media is the #1 marketed surface and this breaks on the FIRST interaction with it.)

---

## 5. NEW bugs NOT in the original 13-symptom chat log

All three are NEW signals that were not among the 13 chat-log symptoms of phase 1:

- **J98 SSRF bypass** — was never exercised; image proxy is a frontend-only code path the chat log never touched. WIN.
- **J67 version-spec leak in `is_package_installed`** — package_installer was previously only exercised on first-install paths; post-install second-backend add was uncovered. WIN.
- **J60 pocket_tts false-`is_available`** — the chat log symptom #7 (TTS mismatch on Hindi) pointed at language routing, but this failure is a *backend-availability* false positive BEFORE routing even happens. Adjacent bug, different root cause. WIN.

Three real regressions surfaced by the journey suite that static tests + symptom-chat missed. The suite is paying for itself.

---

## 6. Cross-reference with existing tasks (#201–#296)

| Phase-3 finding | Matches existing task? | Notes |
|---|---|---|
| J98 SSRF | **NEW** | No task covers image_proxy SSRF hardening. File a new task. |
| J67 version-spec in installer | **NEW** | Task #264 covers "TTS engine installer race on torch" but NOT the `>=0` string-leak. Close-adjacent, separate fix. |
| J60 pocket_tts wrong-ladder promotion | **NEW** | Task #278 covered "pocket_tts routing for Hindi wrong-language" — this is the backend-availability antecedent. Could be bundled under #278's umbrella. |

**Recommendation:** File 3 new tasks (one per finding), reference #264 and #278 as related context.

---

## 7. Skipped journeys (expected)

11 skips, all pre-documented in `SKIP.md` or gated at runtime by the test's own mount-probe:

| Test | Skip reason |
|---|---|
| `test_J19_tier2_agent_create` (2 tests) | `/api/social/agents` not mounted in this env |
| `test_J20_tier3_auto_evolve` (2 tests) | `auto_evolve` tool not registered + `/api/social/agents/evolve` not mounted |
| `test_J61_onboarding_flow` (4 tests) | `/api/onboarding/*` not mounted |
| `test_J92_skills_ingest` (2 tests) | `/api/skills/ingest` + `/api/skills/list` not mounted |
| `test_J93_skills_discover_local` (1 test) | `/api/skills/discover/local` not mounted |

All 11 are CORRECT skips — the endpoints really aren't registered in the current Nunba boot. No test bugs here; these become green once the orchestrator's Phase-4 mounts the missing blueprints.

---

## 8. Repro command index (copy/paste)

```bash
# J98 SSRF file:// bypass
pytest tests/journey/test_J98_image_proxy.py::test_j98_image_proxy_blocks_file_scheme \
       -v --no-cov --timeout=30

# J60 kids-TTS quick 503
pytest tests/journey/test_J60_kids_tts_quick.py::test_j60_kids_tts_quick_reachable \
       -v --no-cov --timeout=30

# J67 setup-engine empty-5xx (two failures, same root cause)
pytest tests/journey/test_J67_tts_add_backend.py::test_j67_tts_setup_engine_graceful_on_bad_name \
       -v --no-cov --timeout=60
pytest tests/journey/test_J67_tts_add_backend.py::test_j67_tts_setup_engine_rejects_empty \
       -v --no-cov --timeout=60

# Full suite (repeat what phase-3 ran)
export NUNBA_SKIP_SINGLE_INSTANCE=1 PYTHONUTF8=1
pytest tests/journey -v -m journey --no-cov --maxfail=999 \
       --junitxml=tests/journey/results.xml --timeout-method=thread
```

---

## 9. TL;DR (stdout)

```
Phase-3 journey suite: 134 collected, 4m17s wall.
  GREEN          119 (88.8%)
  RED-PRODUCT      3  (J60 kids-TTS 503, J67 setup-engine empty-5xx, J98 SSRF bypass)
  RED-INFRA        1  (whisper teardown I/O after capture close — noisy only)
  SKIPPED         11  (all expected per SKIP.md + runtime mount-probes)
  XFAIL            0
Top finding: J98 image_proxy returns 200 on file:/// — SSRF guard bypassed.
Newly surfaced (not in 13-symptom log): all 3 REDs. File 3 tasks, cross-ref #264, #278.
No flakes, no test bugs, no fix-actions taken. Hand-off to Phase-4.
```
