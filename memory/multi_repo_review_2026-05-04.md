# Multi-Repo Review — Changes Since 2026-05-01

**Review run**: 2026-05-04 (3-day window)
**Date interpretation**: User wrote "1/5/2026" — interpreted as **1 May 2026** (DD/MM, India convention). If you meant 5 January 2026 (MM/DD), tell me to re-run.

## Methodology (per user directive)

> "understanding changed files by reading them fully before updating the review comment, the review should cite and say what why with reasoning on why it's a DRY violation or not following SRP or what it has broken etc"

- Each reviewer agent reads changed files in **full**, not grep snippets.
- Each finding cites **file:line** + the actual code paste.
- Each finding gives **WHY** — citing the specific principle violated (DRY because <duplicate at>; SRP because <2 responsibilities>; broken because <runtime failure path>; layering because <core imports integrations>; etc.).
- Severities: CRITICAL / HIGH / MEDIUM / LOW / NIL (= verified clean).

## Repo activity in window

| Repo | Commits | Files | Status |
|---|---|---|---|
| **Nunba-HART-Companion** | 5 | 6 | reviewed (see § 1) |
| **HARTOS** | 28 | 36 | reviewed (see § 2) |
| **Nunba-Companion-iOS** | 29 | 276 (~15 native + manifest, rest mirrored RN) | reviewed (see § 3) |
| Hevolve | 0 | 0 | no activity in window |
| Hevolve_Database | 0 | 0 | no activity in window |
| Hevolve_React_Native | 0 | 0 | no activity in window |
| ridesnap | 0 | 0 | repo too new to anchor |

## Review process

1. Diff per repo with `git log --before "1 May 2026 23:59"` to find base SHA.
2. Three parallel `reviewer` agents (model: opus per CLAUDE.md MAX EFFORT) — one per active repo.
3. Each agent reads all changed files end-to-end, applies 12-point engineering checklist (DRY, SRP, parallel paths, layering, original intent, concurrency, robustness, FT, NFT, security, multi-OS, frozen-build).
4. Findings consolidated below with full citations.

---

## § 1 — Nunba-HART-Companion (6 files / 5 commits)

**Status**: ✅ review complete — 0 CRITICAL / 1 HIGH / 3 MEDIUM / 2 LOW / 5 NIL

### Commits
- `49f923b2` refactor(chat): kill parallel recipe-file check that double-stripped prompt_id
- `ff788fef` fix(admin): send JWT bearer to /api/agent-engine/ledger/* fetches
- `b719eb47` fix(chat): hard-route to autogen when recipe missing locally (no silent fallback)
- `cbb08971` fix(admin): abort freeze on missing agent_ledger + surface ledger errors
- `2b10dfb9` fix(stop-api): use HARTOS resolver, default to HARTOS local /api/vlm/stop

### Files reviewed
- `app.py`
- `landing-page/src/pages/admin/TaskLedgerPage.js`
- `main.py`
- `routes/chatbot_routes.py`
- `routes/hartos_backend_adapter.py`
- `scripts/setup_freeze_nunba.py`

### Findings

#### HIGH

##### `routes/chatbot_routes.py:2424-2430` — step-4 force-create-agent for non-numeric `_agent_id_legacy` violates the documented "synthetic-string silent fallback" contract
**Citation:**
```python
if _agent_id_legacy:
    logger.warning('Recipe missing locally for agent_id=%r - forcing '
                   'create_agent=True (no casual fallback to local_assistant)',
                   _agent_id_legacy)
    return ({'id': _agent_id_legacy, 'type': 'local'},
            _agent_id_legacy, 'local', _pid_int, True)
```
Conflicts with surviving design comment at `chatbot_routes.py:2329-2331`:
> "Any client-minted synthetic string ('orphan_49', 'ghost_*', etc.) silently falls back to default instead of returning 400 — the user keeps chatting under Hevolve."

**Why broken:** When `agent_id_legacy` is a non-numeric string AND registry lookup at step 2 missed AND digit-coerce at step 3 missed, that's the "synthetic/orphan string" case the docstring above promised would silent-fallback. The new branch instead forces `create_agent=True`, which sends Nunba into HARTOS `gather_info → create_recipe` for a bogus identifier. Worse: `hartos_backend_adapter.py:565` will coerce `prompt_id=None` while passing `create_agent=True` — HARTOS mints fresh agent at arbitrary id, NOT the "missing" one the caller named. Two parts of the same function now disagree about handling synthetic IDs — that's the "two implementations always drift" antipattern manifest *within* a single function.

**Why DRY-clean:** Single `_resolve_agent` site, no duplicate logic.
**Why SRP-clean:** One function, one responsibility.

**Fix:** Restrict step 4 forced-create to the **prompt_id-with-missing-recipe** case only. Drop lines 2424-2430. Let synthetic strings fall through to step 5 (default casual fallback) per the lines 2329-2331 contract.

#### MEDIUM

##### `routes/chatbot_routes.py:2378-2379` — misleading docstring promises a "compat wrapper" that doesn't exist
**Citation:** Docstring promises "compat wrapper below this function" for legacy 4-tuple unpack callers. Grep confirms: only one caller of `_resolve_agent` exists (line 2435), it correctly unpacks the 5-tuple. Function is closure-local inside `chat_route()` — no external callers possible.

**Why misleading:** Future maintainer searching for "compat wrapper" finds nothing.

**Fix:** Strike the last sentence.

##### `app.py:1612-1624` + `main.py:308-319` — `DEFAULT_STOP_API_URL` and `call_stop_api` duplicated across two entry points (pre-existing DRY violation, NOT introduced here, but symmetric fix in both files makes pain visible)
**Citation:** `app.py:1619-1624` mirrors `main.py:315-319` verbatim. `call_stop_api()` bodies at `app.py:3700-3766` and `main.py:838-917` are near-identical re-implementations of the same payload + POST.

**Why DRY-violated:** Two writers for "notify cloud trainer to stop". Both got the same fix this commit. CLAUDE.md Gate 4: "One DISPATCH PATH per verb." Identical resolver imports, identical no-op gate logic (`app.py:3706-3716` ≈ `main.py:876-886`), identical `_do_stop` thread/inline POST.

**Why pre-existing:** `git log -S "def call_stop_api"` shows both introduced in initial commit `96661414`. Per memory rule "NO PRE-EXISTING BUG dismissal" — flag for follow-up consolidation, not silently duplicate the no-op gate.

**Fix (defer to follow-up):** Extract canonical `core.stop_api.call_stop_api(args, logger)` in HARTOS or `desktop/`. Both entry points import. Track in `memory/`.

##### `landing-page/src/pages/admin/TaskLedgerPage.js:30-33` — `_authHeaders` reimplements the canonical `axiosFactory.js:28-32` interceptor instead of using `createApiClient`
**Citation:**
```js
const _authHeaders = () => {
  const token = localStorage.getItem('access_token');
  return token ? {Authorization: `Bearer ${token}`} : {};
};
```
Compare canonical at `services/axiosFactory.js:1-11`: *"Single factory for authenticated axios instances. All API services should use createApiClient() instead of duplicating interceptors."*

**Why DRY-violated:** Same value, two readers. CLAUDE.md Gate 4: "One SOURCE OF TRUTH per constant" applies to localStorage reads too. Two implementations always drift — if tomorrow someone migrates SPA to a refresh-token-aware reader (e.g. `useAuth()` hook) or rotates the localStorage key name, `TaskLedgerPage` will silently 401.

**Why partially defensible:** `/api/agent-engine/*` doesn't fit the existing `adminApiClient` baseURL (`/api/admin`); no `agentEngineApi` client exists in `services/`. Building one is more work than 4-line manual fetch.

**Fix:** Add `agentEngineApi = createApiClient('${API_BASE_URL}/api/agent-engine')` to `services/socialApi.js`. Replace `fetch + _authHeaders` with `agentEngineApi.get('/ledger/tasks', {params})`. Cypress + Jest mocks already work against createApiClient mocks.

#### LOW

##### `routes/hartos_backend_adapter.py:680-682` + `707-709` — list-vs-dict coercion duplicated across two transports
**Citation:** Identical 2-line normalization on in-process AND HTTP paths. The fix correctly identifies the bug (HARTOS returns raw list; `chatbot_routes.py:2210` calls `.get('error')` → AttributeError silently swallowed) but the comment at 673-679 is a model citation of root-cause analysis.

**Why ship-acceptable:** Per `feedback_dry_overengineering.md` "repeated METHOD CALLS to one canonical API are NOT DRY violations". 2-line normalization mirrored across 2 sites is borderline; extracting helper saves 4 lines but adds a name. Both call sites in same function — cognitive distance tiny.

**Fix (cosmetic):** Inline `_normalize_prompts(data)` private helper, use both sites. Not worth a separate commit.

##### `scripts/setup_freeze_nunba.py:797-803` — error message mixed-separator on Windows
**Citation:** RuntimeError prints raw `_agent_ledger_candidates` (line 800) — `os.path.normpath` only applied AFTER match (line 794). On Windows, error shows `..\..\HARTOS\agent-ledger-opensource\agent_ledger`; on macOS/Linux `../../HARTOS/...` — fine, just inconsistent.

**Fix (cosmetic):** `+ "\n  - ".join(os.path.normpath(p) for p in _agent_ledger_candidates)`.

#### NIL (5 verified clean)

- `app.py:3706-3716` + `main.py:876-886` — no-op gate when `args.stop_api_url` is falsy correctly returns True (caller treats as "ok, nothing to do"), logs INFO with env var name, short-circuits before POST. Matches HARTOS `core/config_cache.py:175-207` design intent.
- `routes/chatbot_routes.py:2547-2563` — kill-the-parallel-recipe-file-check refactor is correct. Old inline `os.path.isfile` block defeated `_resolve_agent` step 4 force-create signal. Single source of truth: `_resolve_agent`. Real DRY win, no signature changes.
- `routes/hartos_backend_adapter.py:670-682` — list→dict coerce at boundary (adapter is authoritative shape-translator). Fix correctly normalizes at the boundary, not at every consumer.
- `landing-page/src/pages/admin/TaskLedgerPage.js:36-58` + `109-117` — error visibility fix correct. `setErrorMsg` + dedicated error block elevates failure into UI. Satisfies `feedback_audit_evidence_discipline.md`.
- `scripts/setup_freeze_nunba.py:776-803` + `484-498` — Gate 6 discipline correct. Excludes list keeps `core/integrations/security/agent_ledger/hevolve_database` out of cx_Freeze `lib/`; hard-fail at 797-803 ensures `include_files` populated. Two-rail design per `feedback_hartos_bundle_srp.md` ("TWO locations, never three").

### Nunba verdict: **REWORK before next bundle build, ship-acceptable for dev runs**

**Must-fix before ship:**
1. **`chatbot_routes.py:2424-2430`** — drop the `_agent_id_legacy` branch in step 4. Restrict force-create to missing-recipe-prompt_id case only. Synthetic strings continue silent-fallback per lines 2329-2331 contract.
2. **`chatbot_routes.py:2378-2379`** — strike the "compat wrapper below this function" sentence; it's not true.
3. **`landing-page/src/pages/admin/TaskLedgerPage.js`** — add `agentEngineApi` to `services/socialApi.js`, replace manual fetch + `_authHeaders` with the client.

**Track for follow-up (out of scope of this commit cluster):** consolidate `app.py::call_stop_api` and `main.py::call_stop_api` into a single canonical helper.

---

## § 2 — HARTOS (36 files / 28 commits)

**Status**: ✅ review complete — 2 CRITICAL / 5 HIGH / 8 MEDIUM / 8 LOW / 11 NIL

### Top commits
- `7b5d740` test(api): drift-guard for /api/agent-engine/ledger/* aggregator
- `6656dfb` feat(prompts-backup): boot-time snapshot + retention of prompts/ dir
- `b0322ae` feat(recipe-sync): cross-device recipe-file push + pull-on-demand
- `37ce293` fix(vlm): surface coordinate + strategy in loop's extracted_responses
- `bd2b4c5` refactor(vlm): single source of truth for point_action -> action_json shape
- `15f9b8d` fix(logging): kill 4 noise sources from offline/dev install
- `dfdba6b` fix(api): rewrite ledger endpoints against real SmartLedger API
- `a9bd42d` fix(packaging): include agent_ledger as transitive dep of hart-backend
- `78aebc6` feat(vlm): exec-test mode + occluded targets + Android spec
- `1945ef4` feat(vlm): Android client + iOS stubs + P2P inference resolver (Phases 8-10)
- `1ad39b7` feat(window_capture): macOS Quartz + Linux X11/XComposite + Wayland portal stub
- `52a39f0` feat(vlm): safety layer - rate limit, blocklist, audit log
- `5b7b818` refactor(vlm): consolidate 3 parsers -> 1
- `a9efde9` feat(vlm): per-window click translation + post-click verify
- `77fb44b` feat(vlm): complementary path router (keystone)
- `0fa2cb0` refactor(vlm-bench): single aggregator (summarize_bucket)
- `3c5cb3d` refactor(dpi): single source of truth in core/dpi_awareness.py
- `693ccad` feat(window_capture): occlusion + multi-monitor + PrintWindow capture
- `9326416` test(vlm): no-regression gate (--gate / --bump-baseline)
- `2c9a219` fix(lifecycle): pin VLM-main LLM (was pressure_evict_only — silently died)

### Files reviewed (36 total)
**Source** (22): MANIFEST.in, core/{config_cache, dpi_awareness, http_pool, prompts_backup, recipe_sync}.py, create_recipe.py, hart_intelligence_entry.py, integrations/agent_engine/api.py, integrations/remote_desktop/window_capture.py, integrations/service_tools/model_orchestrator.py, integrations/social/peer_discovery.py, integrations/vlm/{android_companion_protocol.md, local_computer_tool, local_loop, mobile, parser, qwen3vl_backend, safety}.py, pyproject.toml, security/origin_attestation.py, setup.py

**Tests** (14): test_api_agent_engine_ledger, test_model_lifecycle_pinning, test_prompts_backup, test_recipe_sync, test_remote_desktop_window_capture, test_vlm_gate, test_vlm_mobile_p2p, test_vlm_parser, test_vlm_qwen3vl, test_vlm_safety, vlm_benchmark_baseline.{json,md}, vlm_gate_lib, vlm_grounding_benchmark

### Findings

#### CRITICAL

##### `hart_intelligence_entry.py:7912-7920` — Path traversal in download_recipe_bundle
**Citation:**
```python
@app.route('/prompts/sync/<prompt_id>', methods=['GET'])
def download_recipe_bundle(prompt_id):
    blob_path = os.path.join(_RECIPE_BLOB_DIR, f'{prompt_id}.json')
    if not os.path.isfile(blob_path):
        return jsonify({'error': 'not_found'}), 404
    try:
        with open(blob_path, 'r', encoding='utf-8') as f:
            envelope = json.load(f)
```
**Why:** Flask's default URL converter for `<prompt_id>` is `string` which forbids `/` but **allows `..`**. `GET /prompts/sync/..%2F..%2Fetc%2Fpasswd` reaches the handler with `prompt_id='../../etc/passwd'`. `os.path.join(_RECIPE_BLOB_DIR, '../../etc/passwd.json')` resolves outside the blob dir; `os.path.isfile` returns True for any readable file. The companion `upload_recipe_bundle` at `:7891` writes `f'{prompt_id}.json'` from arbitrary JSON body with no validation — lets a malicious uploader overwrite arbitrary `.json` files reachable from `_RECIPE_BLOB_DIR/..`. Asymmetric defense: `core/recipe_sync.py:230-234` correctly rejects `/`, `\`, leading `.` on the CLIENT side, but the server doesn't. **Broken because**: server-side input validation absent on a route that opens user-controlled paths.
**Fix:** Validate `prompt_id` against the same UUID/integer regex used by `_LEDGER_FILENAME` (codebase already has the pattern). Add `os.path.realpath` containment check post-join.

##### `hart_intelligence_entry.py:7322-7372` — `vlm_stop` route lacks any auth/CSRF gate
**Citation:**
```python
@app.route('/api/vlm/stop', methods=['POST'])
def vlm_stop():
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    prompt_id = data.get('prompt_id')
    ...
    if prompt_id:
        found = request_stop(str(user_id), str(prompt_id))
```
**Why:** Every other admin/control endpoint in `agent_engine/api.py` requires `@require_auth` (verified vs `api.py:303`). `vlm_stop` is a control-plane API that takes `user_id` from the body verbatim. **Broken because**: any unauthenticated client on the same host (or via CSRF in a logged-in user's browser, no token check) can POST `{"user_id":"<victim>"}` to bulk-stop another user's active VLM loops. Bundled Nunba binds localhost:5000 (mitigates remote attack but not CSRF). Regional/central tier exposes the server.
**Fix:** Apply `@require_auth`. Bind operation to `g.user.id`; ignore body `user_id` (or require it to equal `g.user.id`).

#### HIGH

##### `integrations/vlm/local_loop.py:262` — Iteration setup outside try/finally; Event leaks on early-exit paths
**Citation:** Lines 259-261 comment claims "no try/finally — exceptions never escape this scope" but lines 264-282 (stop-check, ETA-check, logger.info before iteration's try) can raise. **SRP/Robustness violation**: `_register_session` claims session ownership but the cleanup path in `_unregister_session` is reachable only through happy-path post-loop code. Dictionary growth unbounded. **Fix:** Wrap iteration body in `try/finally: _unregister_session(user_id, prompt_id)`.

##### `integrations/vlm/qwen3vl_backend.py:494-517` — `prefer_local` branch produces undocumented tier orders, no test
**Citation:** else-branch builds `tiers` conditionally on `prefer_local`. **Future-proofing/DRY**: when `prefer_local=False AND local_available=False` neither branch fires — local skipped entirely with no doc. No caller sets `prefer_local=False` (verified by grep — only one occurrence at `:492`). **Fix:** Replace conditional list-building with explicit data-driven `TIER_ORDERS` table; drop `prefer_local` (dead parameter).

##### `core/recipe_sync.py:212-219` — Skip-pull-on-checksum-match reads disk N times (build_envelope opens every recipe sub-file)
**Citation:** Lines 212-219 call `build_envelope` (line 102-107 opens every `{prompt_id}*.json`) just to compare checksums. For 30-file multi-flow recipe, 30 disk reads on every pull. **Performance**: comment "saves a writable-disk roundtrip" undersells the cost. **Fix:** Compute single-file checksum on `f'{prompt_id}.json'` only, OR persist last-pulled checksum in sidecar `.checksum` file (O(1) read).

##### `integrations/social/peer_discovery.py:863-879` — Loopback Sybil exemption uses `host.startswith('127.')` which matches `127.example.com`
**Citation:**
```python
_is_loopback = host in ('localhost', '127.0.0.1', '::1', '0.0.0.0',) or host.startswith('127.')
```
**Why:** `urlparse('http://127.example.com').hostname == '127.example.com'` matches `.startswith('127.')`. **Broken because**: hostname-based check should be IPv4 dotted-quad anchored. **Fix:** Use `ipaddress.ip_address(host).is_loopback` with try/except for non-IP literals; only `localhost` qualifies as alphabetic loopback.

##### `integrations/vlm/qwen3vl_backend.py:560-569` — `_is_local_vlm_available` does 1s HTTP probe on every dispatch_inference call
**Citation:** `pooled_get(health_url, timeout=1)` called from `dispatch_inference` (line 494) on every inference. **Performance** vs chat budget 1.5s/CLAUDE.md: 0-1000ms latency added per call. **Fix:** Cache probe with 5s TTL — same pattern as `core/health_probe.py` (which has its own probe-caching anti-patterns flagged separately).

##### `security/origin_attestation.py:46` vs `pyproject.toml:10` vs `setup.py:147` — License field disagreement
**Citation:** `'license': 'Apache-2.0'` (origin_attestation) vs `license = {text = "BSL-1.1"}` (pyproject) vs `license="BSL-1.1"` (setup.py). **DRY/single source of truth violated**: `ORIGIN_IDENTITY['license']` feeds the `ORIGIN_FINGERPRINT` SHA-256. Brand consistency lie — wheel ships BSL but federation attestation claims Apache. **Fix:** Reconcile — likely `BSL-1.1` is correct (per setup.py + LICENSE file). Bumping the fingerprint requires baselining federated peers.

#### MEDIUM

##### `integrations/vlm/local_computer_tool.py:106-139` — `get_active_window_info` runs PowerShell on every action
PowerShell startup 200-500ms cold, ~80ms warm. Called from `_check_reasoning_mismatch` (line 176) on every `execute_action`. The function only fires when reasoning contains `'minimize'/'close'/'switch to'/'click on'` — but "click on" is broad. Add-Type compiles a C# class on every invocation. **Fix:** Replace with `ctypes.windll.user32.GetForegroundWindow() + GetWindowTextW` (already pattern in `window_capture.py:289`).

##### `integrations/vlm/safety.py:184-188` — AuditLogger silently disables itself on dir-create failure
`self.path = None` disables every subsequent `log()` (line 215) when `~/.nunba/audit` can't be created. Single WARNING, then runs without audit forever — but safety guards (`safety=True`) assume audit IS happening. **Security regression masquerading as graceful degradation.** **Fix:** Either fail-closed (refuse safety layer when audit configured but unavailable) or fall back to `core.platform_paths.get_data_dir()` (matches existing pattern).

##### `hart_intelligence_entry.py:6491-6508` — Recipe pull-on-demand can block chat by 13s on cloud-down
`pull_recipe` uses `timeout=(3, 10)` = up to 13s connect+read on chat hot path. Plus `Retry(total=2, backoff_factor=0.5)` on remote adapter = ~1s extra per retry. Chat budget is 1.5s. **Fix:** Tighten to (1, 3) AND background the pull (fire-and-forget thread). OR gate behind `core.circuit_breaker.PeerBackoff` (already used at peer_discovery.py:211).

##### `integrations/remote_desktop/window_capture.py:359-362` — `xdotool search --name '.'` missing log when xdotool absent
`subprocess.check_output` raises `FileNotFoundError` if xdotool not installed; caught by broad `except Exception:` at 345-346 with no diagnostic. macOS branch (line 1182) logs at debug. **Fix:** add `logger.debug(f"xdotool unavailable: {e}")`.

##### `core/http_pool.py:135-150` — `pooled_post` LLM logging eagerly consumes resp body
`resp.json()` consumes body before caller. requests caches the parsed body so the second call is cheap, but if the LLM endpoint returns invalid JSON, `resp.json()` raises (swallowed) and the caller's retry sees the same exception. **Fix:** Log raw text length, not parsed JSON. Better: `Session.hooks['response']`.

##### `integrations/vlm/local_computer_tool.py:687-679` — `open_file_gui` shells out unquoted path on POSIX
`shell_cmd = f'open {path}'` with no `shlex.quote`. VLM-derived `path = "foo; rm -rf ~"` becomes literal `open foo; rm -rf ~`. Denylist in `_handle_shell_command_tool` is defense-in-depth, not primary boundary. Windows path uses `os.startfile` (safe — no shell). **Fix:** `shlex.quote(path)` OR `subprocess.run(['xdg-open', path])` — no shell.

##### `tests/unit/test_model_lifecycle_pinning.py:288-289` — Test mutates singleton; cross-test pollution
`mlm = get_model_lifecycle_manager(); mlm._models.clear()` — leaks state across tests. Fragile to pytest ordering. **Fix:** Drive every test through `_fresh_manager()` OR pytest fixture that snapshots+restores.

##### `integrations/vlm/local_loop.py:551-557` — Safety env-flag reads on every iteration
`os.environ.get(...)` 2x per iteration of 30-iteration loop. If operator changes env mid-loop, iterations alternate safe/unsafe. **Fix:** Hoist env reads to before the for-loop.

#### LOW

##### `core/recipe_sync.py:165-171` — `pull_recipe` bypasses pooled_get
Calls `get_http_session().get(...)` directly — push correctly uses `pooled_post`. **DRY violation** in same file: asymmetric. **Fix:** `from core.http_pool import pooled_get`.

##### `integrations/vlm/safety.py:108-114` — `recent_action_times.maxlen` based on initial config
maxlen frozen at construction; runtime config reload doesn't propagate. **NIT** — doc note.

##### `tests/unit/test_vlm_safety.py:230-231` — Test mutates singleton's config
`guard.config = SafetyConfig(...)` — `reset_session_guard()` resets counters but not config. Cross-test pollution.

##### `integrations/vlm/qwen3vl_backend.py:271-298` — `_get_os_context` PowerShell similarly bloated
Same issue as `get_active_window_info`; called twice per `point_and_act`. ~500ms+ each. **Fix:** ctypes-based foreground-window query.

##### `hart_intelligence_entry.py:7868` — `_RECIPE_BLOB_DIR` uses `..` in path
`os.path.join(PROMPTS_DIR, '..', 'recipe_blobs')` — makes path-traversal mitigation harder. **Fix:** `os.path.join(os.path.dirname(PROMPTS_DIR), 'recipe_blobs')`.

##### `core/dpi_awareness.py:83` — Failed call doesn't set `_dpi_aware_set` (verified clean — flag set ONLY on success)

##### `integrations/vlm/parser.py:160-174` — Brace walk doesn't track string-literal state
`{` inside `"reasoning": "the {Save} button"` confuses depth count. **Fix:** track quote-toggle state, OR use `json.JSONDecoder.raw_decode`.

##### `integrations/agent_engine/api.py:262` — `_iter_ledgers` regex `^...$` correctly anchored (verified clean)

#### NIL (verified clean — 11 items)
- `core/dpi_awareness.py` single source of truth correctly extracts duplicate from window_capture.py (per `3c5cb3d`)
- `integrations/vlm/parser.py` Phase 5 consolidation legit — three shims onto `parse_vlm_action`
- `integrations/service_tools/model_orchestrator.py:683-714` VLM-main pinning sound; test coverage in `test_model_lifecycle_pinning.py` covers purpose + id-pattern fallback
- `tests/vlm_gate_lib.py` aggregator extraction clean
- `integrations/remote_desktop/window_capture.py` `_compute_occlusion` perf cap (OCCLUSION_INNER_CAP=100) bounded correctly
- `integrations/vlm/safety.py` blocklist replaces-not-extends per documented intent
- `integrations/vlm/local_loop.py:97-167` stop registry threading model correct
- `integrations/social/peer_discovery.py:478-485` seed peer announcement correctly threaded
- `core/prompts_backup.py` boot snapshot retention correct + tested
- `MANIFEST.in` LICENSE inclusion fixes prior boot WARNING
- `setup.py` + `pyproject.toml` agent_ledger vendoring is correct setuptools idiom

#### Outstanding from prior session — re-verified
- **`memory/vlm_best_of_all_worlds_plan.md` DOES exist** (22.6KB, modified 2026-05-03 16:34). Prior-session claim "doesn't exist on disk" was wrong. NIL.
- **No CI workflow runs `--gate`** — confirmed gap. MEDIUM ecosystem-level.
- **`vlm_grounding_benchmark.py` STRATEGY/TARGET aggregator migrations** — re-checked: STRATEGY (lines 336-361) and TARGET (363-373) STILL use old per-call inline aggregation. Only METHOD SUMMARY (line 583) was migrated. **MEDIUM partial DRY.**

### HARTOS verdict: **REWORK before broad rollout**

Top 5 must-fix:
1. `hart_intelligence_entry.py:7912 + 7891` — validate `prompt_id` regex on upload + download recipe-bundle endpoints; add realpath containment check
2. `hart_intelligence_entry.py:7322` — add `@require_auth` on vlm_stop; bind to `g.user.id`
3. `security/origin_attestation.py:46` — reconcile license vs pyproject/setup.py
4. `integrations/vlm/local_loop.py:262` — wrap iteration body in try/finally
5. `hart_intelligence_entry.py:6491` + `core/recipe_sync.py:185` — tighten timeouts + background the pull (13s on chat path violates 1.5s budget)

---

## § 3 — Nunba-Companion-iOS (~15 native + manifest, 276 mirrored RN files NOT reviewed here)

**Status**: ✅ review complete — 4 CRITICAL / 5 HIGH / 6 MEDIUM / 5 LOW / 7 NIL

### Top commits
- `2105da0` fix(app): bump splash hold 1.5s -> 3s for cold-launch headroom
- `0121860` fix(app): use react-native-safe-area-context SafeAreaView + provider
- `e7cee91` fix(ios): preprocessor RCT_DEV=0 on React-* pods to kill dev mode
- `38f9630` fix(ios): force-disable RN dev mode to use embedded bundle in CI
- `5d0c031` ci(ios): compile JS bundle to Hermes bytecode
- `dd6594d` fix(ios): bypass Metro probing when embedded bundle is present
- `b04605a` fix(ios): two real bugs surfaced by the smoke-test screenshot
- `e76269e` fix(bundle): vendor 3 reclassified hooks (multiplayer/mic/speech)
- `342bf98` fix(bundle): vendor PNG assets + drop dead-asset-ref files
- `e490a0c` Phase 3+4: smoke test expansion + auth re-check on AppState change
- `31b6f35` Phase 1+2: Vendor 227 components, wire 50+ routes in App.tsx

### Native iOS files reviewed
- `ios/NunbaCompanion/AppDelegate.swift`
- `ios/NunbaCompanionUITests/SmokeUITests.swift`
- `ios/Podfile`
- `ios/project.yml`
- `App.tsx`
- `index.js`
- `js/native-bridge/shared-modules.d.ts`
- `.github/workflows/validate.yml`
- `docs/NUNBA_PARITY.md`
- `docs/SHARED_JS_MANIFEST.json`

Plus 5 spot-check `js/shared/components/...` files for manifest accuracy.

### Findings

#### CRITICAL

##### `App.tsx:367-376, 322-341` — splash-text race is the smoke-test contract; 3s `setTimeout` is brittle by design
**Citation:** Line 332-340:
```tsx
const finish = (token: string | null) => {
  setIsAuthed(!!(token && token.length > 0));
  setTimeout(() => setAuthReady(true), 3000);
};
```
Only place "Nunba Companion" StaticText renders pre-auth-resolution is line 371. Once `authReady=true`, splash unmounts; the only remaining render is Stack header `options={{title: 'Nunba Companion'}}` on `MainScreen` (line 397) — but navigator is built with `screenOptions={{ headerShown: false }}` (line 387), so that title NEVER renders.

**Why broken (Original Intent + FT coverage):** The XCUITest contract is `app.staticTexts["Nunba Companion"]` (`SmokeUITests.swift:180`). That text is observable for exactly the splash-hold window. Two of the four smoke tests gate on `waitForRootText` returning true. **Without `headerShown:true`-driven persistence, the test contract IS the splash hold.** A future "remove splash hold to speed up cold launch" silently breaks smoke tests with no obvious correlation. Commit history confirms it's already a fragile band-aid: 1.5s → 3s in two consecutive commits (`5d5bb3b`, `2105da0`) chasing flake.

**Fix:** Either (a) `headerShown: true` for `MainScreen`, OR (b) render `<Text accessibilityIdentifier="root-loaded" style={{height:0,width:0}}>NunbaCompanionReady</Text>` post-`authReady`; smoke test polls for the identifier OR splash text. (c) Replace test predicate with `app.windows.firstMatch.exists && app.state == .runningForeground`.

##### `App.tsx:235-252, 408-410, 466` — `<PendingNativeDeps>` placeholder ships in production with NO feature-flag gate
**Citation:**
```tsx
function PendingNativeDeps({route}: any) {
  return (...
    <Text style={styles.subtitle}>
      Pending native dependency. Track in docs/PORT_MANIFEST.md
      (Phase 5: Tier-2 native).
```
Wired at lines 408-410 (CreateMissedConnection, MissedConnectionDetail, MissedConnectionsMap) and 466 (QRScanner).

**Why broken (UX + backwards-compat):** Four user-reachable routes display dev-facing text ("Track in docs/PORT_MANIFEST.md (Phase 5: Tier-2 native)") to end users. Deep-link config (199-230) registers handlers for `encounters` and `MissedConnection*` paths — a deep-link from email/share lands a user on this screen. **App Store will reasonably flag as "incomplete feature shipped as placeholder"**.

**Fix:** Gate routes behind runtime feature flag (polished "Coming soon" + "Notify me" CTA), OR hide entry points until native deps land. At minimum replace strings with end-user-safe copy.

##### `.github/workflows/validate.yml:257-281, 561-585` — JS bundle + Hermes pipeline duplicated verbatim across iPhone + iPad jobs
**Citation:** Lines 257-281 (iPhone) and 561-585 (iPad) are byte-identical 25-line blocks: same `npx react-native bundle` + same hermesc step + same warning message + same fallback. Pod-install retry block (315-331 vs 608-619) ALSO duplicates with subtle drift: iPhone retries with `--repo-update`, iPad without — real semantic drift introduced by copy-paste.

**Why DRY-violated:** Workflow file is policy + mechanism conflated. Same change must be applied in two places. **Fix:** Extract composite GitHub Action `.github/actions/build-rn-bundle/action.yml` + `.github/actions/install-pods/action.yml`. Both jobs `uses:` the same step. Also factor "Select latest installed Xcode 16.x" (lines 220-234 vs 529-538) — verbatim duplicate.

##### `.github/workflows/validate.yml:391-440 vs 653-669` — iPad job missing simctl pre-boot, UDID resolution, log streaming, post-test grep that iPhone has
**Citation:** iPhone job has `Resolve iPhone simulator UDID (arm64-specific)` (352-389) + pre-boot + log stream + `exit ${TEST_EXIT:-0}` (440). iPad job (621-669) has `Pick iPad device name` only — no UDID resolve, no pre-boot, no log streaming, no console capture. iPad simply runs `xcodebuild test` (664).

**Why broken (Parallel-path + multi-OS-topology consistency):** iPhone job's complexity exists for documented reasons (log streamer must agree on UDID; bootstatus hangs without timeout). Same failure modes for iPad; iPad job is silently weaker. When iPad smoke fails, no logs captured — debugging requires another iteration.

**Fix:** Mirror iPhone job's pre-boot + log stream + UDID resolution to iPad. Extract as shared composite action — solves both this and the bundle/pod duplication together.

#### HIGH

##### `docs/SHARED_JS_MANIFEST.json:13-31, 358-367` — manifest contradicts itself
**Citation:** `deviceCapabilityStore.js` and `notificationStore.js` listed in `groups.stores.files` (17, 27) AND in `deliberately_excluded` (359-367) saying "iOS uses APNs; rewrite in js/ios/". Filesystem matches `files` array (both files present in `js/shared/`). **`deliberately_excluded` is stale doc lying about actual state.**

**Fix:** Remove the two store entries from `deliberately_excluded`. Move "RECLASSIFIED (now vendored)" entries (367-377) to a "history" log, not current-policy "excluded" list.

##### `docs/SHARED_JS_MANIFEST.json:5` — `synced_at: 2026-05-01T19:32:49.973Z` is stale
**Citation:** `"synced_from_commit": "a64e3878 + components-bulk-vendor"`. Diff shows 11 new file additions since 2026-05-01 plus 9 store renames `stores/X.js` → `X.js`. CI sync-drift job (138-195) clones `Hevolve_React_Native@CameraOrientationUpdate` — if `synced_from_commit` doesn't match what was copied, drift detection fires false-positive/negative.

**Fix:** Have `scripts/sync-from-android.js` write actual upstream SHA into `synced_at` + `synced_from_commit` after successful sync; assert in `validate-manifest.js` that both are valid SHA + ISO-timestamp. Convert "components-bulk-vendor" branch label to real commit SHA.

##### `ios/NunbaCompanion/AppDelegate.swift:36-40` — three layers of dev-mode disable; two redundant given the third
**Citation:** Podfile preprocessor `RCT_DEV=0` + `provider.enableDev = false` + NSUserDefaults `RCT_enableDev=false`. Swift comment at 27-35 even self-contradicts: "the volatile domain RN writes from setDefaults wins. Compile-time is the only reliable fix."

**Why DRY-violated:** Three implementations of "dev mode off". If compile-time is the only reliable fix, the runtime overrides ARE belt-and-suspenders left in place after the real fix landed.

**Fix:** Delete lines 36-40. Update comment to: "RCT_DEV=0 enforced at preprocess time in Podfile lines 50-63 — only reliable channel. Runtime overrides via NSUserDefaults are racy."

##### `ios/Podfile:50-63` — preprocessor injection set against ALL React-* targets without exclusion list; mutates array reference
**Citation:**
```ruby
if target.name.start_with?('React') || ...
  existing = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
  existing = [existing] if existing.is_a?(String)
  existing << 'RCT_DEV=0'
```
**Why broken:** `target.name.start_with?('React')` catches `ReactCommon`, possibly third-party `ReactiveCocoa`/`ReactiveSwift`. CocoaPods regenerates pod targets on each install — `existing` could already include `'RCT_DEV=0'` and the `<< 'RCT_DEV=0'` appends again. **Each `pod install` accumulates duplicates in xcconfig.**

**Fix:** `existing |= ['RCT_DEV=0']` (Ruby's union-assign on arrays). Better — explicit allowlist: `RCT_TARGETS = %w[React-Core React-RCTAppDelegate ...]; if RCT_TARGETS.include?(target.name)`.

##### `App.tsx:51-120` — 50+ `lazy(() => import('./js/shared/...'))` calls; no shared route registry
**Citation:** Lines 51-120 are 50+ near-identical lazy() calls; lines 390-470 are 50+ near-identical `<Stack.Screen>` declarations. Same name appears 3+ times (declaration, type map, Stack.Screen).

**Why DRY/scalability-violated:** Adding one screen requires editing 4 places: lazy-loader, type map, Stack.Screen, and (if deep-linkable) `linking.config.screens`. Per CLAUDE.md "Registry/plugin pattern over if/elif chains."

**Fix:** Define single array `const ROUTES: Array<{name, loader, options?, deepLink?}>` and `.map()` over it for both `linking.config` and `<Stack.Screen>`. Reduces 4-place changes to 1, type system verifies `linking.config.screens` keys subset `RootStackParamList`. Reuse same shape Hevolve_React_Native's `home.routes.js` uses for iOS↔Android parity.

#### MEDIUM

##### `App.tsx:313, 316, 322` + `index.js:4-12` — unconditional `console.log` tracers in production
`--dev=false` bundles still execute `console.log` → Hermes host bridge → NSLog. Every render hits "render called". **Fix:** Wrap in `if (__DEV__) console.log(...)` or add `babel-plugin-transform-remove-console`. CI passes `--dev false` to bundler — adding `--minify true` (currently missing) + Babel plugin would also help.

##### `App.tsx:245-247` — `route.name === 'QRScanner'` ternary is brittle string-match
When 5th placeholder route added, ternary silently buckets to maps message. Else-branch claims "react-native-maps" but it IS already in package.json — message already false. **Fix:** Pass placeholder details via route params or route-keyed map.

##### `ios/NunbaCompanionUITests/SmokeUITests.swift:179-209` — `waitForRootText` polls SpringBoard buttons by hardcoded label list
`["Allow", "OK", "Allow While Using App", "Allow Once"]` — localized strings. Non-en-US runner images break. iOS 17 added "Maybe Later" / "Continue". **Fix:** `springboard.alerts.firstMatch.buttons.firstMatch.tap()` regardless of label, or inspect `alerts.element.label` for permission type.

##### `.github/workflows/validate.yml:435-438` — grep pipe to head can hide failures via `set -o pipefail`
`grep -E "..." 2>/dev/null | head -300 || echo "(no lines)"` — grep returning 1 propagates through pipe with pipefail set. `|| echo` saves but ALSO masks genuine grep error (file unreadable returns 2). **Fix:** `grep -E "..." file 2>/dev/null || true; echo "(filtered output above)"`.

##### `App.tsx:325-339` — auth-callback no timeout; splash hangs forever if `OnboardingModule.getAccessToken` never invokes callback
No `Promise.race` with timeout. Native module crash → splash hang → smoke test 60s timeout but with misleading "splash text rendered" success path. **Fix:** Wrap with `setTimeout(() => finish(null), 5000)`. Guard against double-invocation: `let called = false`.

##### `tsconfig.json:8-25` — strictness reduced to bypass vendored shared/ rather than typing the boundary
`allowJs: false`, `checkJs: false`, `skipLibCheck: true`, plus `js/native-bridge/shared-modules.d.ts` declares `declare module './js/shared/*'` as `any`. `js/native-bridge/` is named for the type-contract boundary, but actual NativeModule contracts (OnboardingModule, MicAmplitudeModule, etc.) are typed nowhere. Drift only caught at runtime.

**Fix:** Add `js/native-bridge/OnboardingModule.d.ts`, `MicAmplitudeModule.d.ts`, `SpeechRecognizerModule.d.ts` with public method signatures.

#### LOW

- `ios/project.yml:46` — `DEVELOPMENT_TEAM: ''` empty string. **Fix:** Remove the line entirely.
- `App.tsx:481` — `subtitle: {color: '#A7A9BE'}` non-canon color (canon `#0F0E17/#6C63FF/#FF6B6B` per `project_hevolve_sub_brand_canon.md`). **Fix:** import from `js/shared/theme/colors.js`.
- `App.tsx:260, 372` — `ActivityIndicator color="#6B63F4"` — typo or off-by-one for canon `#6C63FF`. **Fix:** `#6C63FF` from theme.
- `ios/Podfile:14-15` — `$RNFirebaseAsStaticFramework = true` set unconditionally; no Firebase pods declared. Dead code. **Fix:** Remove or comment why pre-enabled.
- `App.tsx:114, 179, 188, 408-410, 466` + `js/native-bridge/shared-modules.d.ts:14-17` — TODOs without ticket links; redundant wildcard module declarations.

#### NIL (7 verified clean)

- `ios/NunbaCompanion/AppDelegate.swift:103-130` APNs handler `override` keywords correct
- `ios/Podfile:11` `prepare_react_native_project!` + `use_react_native!` standard RN 0.81 boilerplate
- `docs/SHARED_JS_MANIFEST.json` group counts (stores 18 / theme 2 / utils 3 / hooks 10 / services 23 / components 225 / image-assets 15) match filesystem find counts; spot-checked files exist at declared paths
- `App.tsx:265-293` `ScreenErrorBoundary` correct React class component; FT-tested via `withGuards`
- `Info.plist` permission strings user-facing; pass App Store 5.1.1
- `.github/workflows/validate.yml:138-195` sync-drift job correctly hard-fails on missing token; pinned to `CameraOrientationUpdate` branch matching manifest declaration
- iPhone test step `exit ${TEST_EXIT:-0}` (440) properly surfaces captured xcodebuild exit; not masking failure

### iOS verdict: **REWORK BEFORE MERGE**

Top 3 must-fix:
1. **`App.tsx` `<PendingNativeDeps>`** — replace dev-internal copy. App Store will flag.
2. **Extract shared `build-rn-bundle` composite action** — kills 25-line bundle/Hermes block × 2 jobs + asymmetric pre-boot/log-stream divergence. Solves three CRITICAL findings together.
3. **Decouple smoke test from splash hold** — stable `accessibilityIdentifier="root-loaded"` post-`authReady`; 5s bound on `OnboardingModule.getAccessToken`.

---

## § 4 — Cross-Repo Patterns

Looking across all 3 repo reviews, four recurring antipatterns surface:

### 4.1 — Auth/security hardening regression around new feature surface (Pattern: defense asymmetry)

| Site | Issue |
|---|---|
| HARTOS `hart_intelligence_entry.py:7912` | `download_recipe_bundle` accepts unvalidated `prompt_id` → path traversal |
| HARTOS `hart_intelligence_entry.py:7891` | `upload_recipe_bundle` writes `f'{prompt_id}.json'` from arbitrary body |
| HARTOS `hart_intelligence_entry.py:7322` | `vlm_stop` has zero auth gate; takes `user_id` from body |
| Nunba `core/recipe_sync.py:230-234` | Client-side validates path correctly — but server doesn't ⚠ asymmetric |

**Pattern**: Recipe-sync feature (commit `b0322ae`) added matched client/server, but only the client side enforces input validation. VLM-stop endpoint (commit `7b74389` + Nunba commit `2b10dfb9`) is similar — Nunba uses canonical resolver, HARTOS server skipped auth. **Lesson**: when adding a paired client/server endpoint, validate at BOTH sides; don't trust one side because the other does.

### 4.2 — DRY drift introduced when feature lands in two entry points

| Site | Issue |
|---|---|
| Nunba `app.py:1612-1624` + `main.py:308-319` | `DEFAULT_STOP_API_URL` resolver duplicated; both got identical fix this round |
| Nunba `app.py:3700-3766` + `main.py:838-917` | `call_stop_api()` body duplicated |
| Nunba `landing-page/.../TaskLedgerPage.js:30-33` | `_authHeaders` parallel to canonical `axiosFactory.js:28-32` |
| HARTOS `setup.py:147` + `pyproject.toml:10` + `security/origin_attestation.py:46` | License field disagrees (Apache vs BSL-1.1) — three sources, three answers |
| iOS `.github/workflows/validate.yml:257-281` + `561-585` | JS bundle + Hermes pipeline duplicated iPhone↔iPad jobs |
| iOS `App.tsx:51-120, 390-470` | 50+ `lazy()` + 50+ `<Stack.Screen>` for same screens — 4-place change for each addition |

**Pattern**: Same value/logic exists in 2-3 places; symmetric fixes land but don't consolidate. Per CLAUDE.md Gate 4: "One DISPATCH PATH per verb. One SOURCE OF TRUTH per constant." Pre-existing duplications stay un-fixed even when both copies got touched in the same commit.

### 4.3 — Silent failure / observability gaps around feature degradation

| Site | Issue |
|---|---|
| Nunba `chatbot_routes.py:2424-2430` | Step-4 force-create-agent for synthetic strings sends bogus payloads to HARTOS silently |
| HARTOS `integrations/vlm/safety.py:184-188` | AuditLogger silently disables itself on dir-create failure — single WARNING, then runs without audit forever |
| HARTOS `integrations/vlm/local_loop.py:262` | `_register_session` Event leaks on early-exit paths |
| iOS `App.tsx:325-339` | Auth-callback no timeout; splash hangs forever if native module never invokes callback |
| iOS `validate.yml:435-438` | grep pipe with pipefail can hide failures via `|| echo` |

**Pattern**: Failure modes degrade to silent-success rather than fail-loud-or-fail-closed. The audit-evidence-discipline rule from `MEMORY.md` exists precisely to combat this — but the new code keeps re-introducing it. **Lesson**: every "fall back to X on error" decision needs an explicit observability check ("how does the operator find out this branch fired?"). At minimum, surface to UI/log with severity.

### 4.4 — Performance budget violations on hot paths

| Site | Issue | Budget |
|---|---|---|
| HARTOS `qwen3vl_backend.py:560-569` | `_is_local_vlm_available` 1s probe per dispatch | chat 1.5s |
| HARTOS `hart_intelligence_entry.py:6491-6508` | `pull_recipe` 13s timeout on chat path | chat 1.5s |
| HARTOS `local_computer_tool.py:106-139` | PowerShell 200-500ms per VLM action × N iterations | per-iteration responsiveness |
| iOS `App.tsx:332` | 3s splash hold to satisfy smoke test | UX (every cold launch pays this) |

**Pattern**: Prober/setup/teardown calls embedded in hot loops with no caching. Budgets exist (per CLAUDE.md "1.5s chat, 300ms draft, sub-ms cache") but aren't enforced in CI. **Lesson**: any new helper that calls into PowerShell/HTTP/disk on a per-iteration loop needs an explicit cache OR pre-loop hoist; budget violations should fail a perf-gate test.

### 4.5 — Cross-repo verification gap

The HARTOS↔Nunba contract has multiple touchpoints that crossed in this window:
- HARTOS `hartos_backend_adapter` shape (list-vs-dict) ← consumed by Nunba `chatbot_routes:2210`
- HARTOS `/api/agent-engine/ledger/*` ← consumed by Nunba `TaskLedgerPage.js`
- HARTOS `/api/vlm/stop` ← consumed by Nunba `app.py::call_stop_api` + `main.py::call_stop_api`
- HARTOS `core.config_cache.get_stop_api_url` ← imported by Nunba both entry points

Nunba's reviewer correctly verified each touchpoint's shape; HARTOS's reviewer flagged the auth gap on the server side. **Together they catch what one alone would miss** — confirms the multi-perspective review approach. None of the 3 repos individually would have caught the path-traversal at `download_recipe_bundle`, because the consuming Nunba code uses the well-validated client `pull_recipe`, masking the server gap.

---

## Verdict

### Severity counts

| Severity | Nunba | HARTOS | iOS | **Total** |
|---|---|---|---|---|
| **CRITICAL** | 0 | 2 | 4 | **6** |
| **HIGH** | 1 | 5 | 5 | **11** |
| **MEDIUM** | 3 | 8 | 6 | **17** |
| **LOW** | 2 | 8 | 5 | **15** |
| **NIL** (verified clean) | 5 | 11 | 7 | **23** |
| **Total findings** | 6 | 23 | 13 | **42** |
| Plus NIL verifications | 5 | 11 | 7 | 23 |

### Overall verdict: **REWORK BEFORE NEXT BROAD SHIP**

The 3-day window has substantial good work — VLM Phase 1-10 is meaningful infrastructure; the brand-canon constant + recipe-sync + prompts-backup features are real progress. Tests added with the rewrites are non-trivial coverage. Memory + index discipline is consistently applied.

But six CRITICAL findings — two each in HARTOS server (path traversal + missing auth) and iOS (user-facing dev copy + smoke-test fragility + bundle pipeline duplication) — block ship until addressed.

### Must-fix before next ship (top 6)

1. **HARTOS `hart_intelligence_entry.py:7912` + `7891`** — validate `prompt_id` regex on upload + download recipe-bundle endpoints; add `os.path.realpath` containment check. Server-side parity with `core/recipe_sync.py:230-234` client-side validation.
2. **HARTOS `hart_intelligence_entry.py:7322`** — add `@require_auth` on `vlm_stop`; bind to `g.user.id`; ignore body `user_id`.
3. **Nunba `routes/chatbot_routes.py:2424-2430`** — drop the `_agent_id_legacy` branch in step 4. Restrict force-create to missing-recipe-prompt_id case only. Synthetic strings must continue silent-fallback per the lines 2329-2331 contract.
4. **iOS `App.tsx` `<PendingNativeDeps>`** — replace dev-internal copy with end-user-safe text. App Store will flag.
5. **iOS `.github/workflows/validate.yml`** — extract shared `build-rn-bundle` composite action; mirror iPhone job's pre-boot + log-stream + UDID resolution to iPad. Fixes 3 CRITICALs.
6. **iOS `App.tsx:332` + `SmokeUITests.swift:180`** — decouple smoke-test contract from splash hold. Add `accessibilityIdentifier="root-loaded"` post-`authReady`; 5s bound on `OnboardingModule.getAccessToken`.

### Defer to follow-up

7. HARTOS `security/origin_attestation.py:46` — reconcile license disagreement (BSL-1.1 vs Apache-2.0); fingerprint will bump.
8. HARTOS `integrations/vlm/local_loop.py:262` — wrap iteration in try/finally; current comment claiming exceptions never escape is wrong for early-exit paths.
9. HARTOS `integrations/vlm/safety.py:184-188` — fail-closed on AuditLogger init failure (or fall back to `core.platform_paths.get_data_dir()`).
10. HARTOS `integrations/vlm/qwen3vl_backend.py:560` — cache `_is_local_vlm_available` probe (5s TTL).
11. HARTOS `hart_intelligence_entry.py:6491` + `core/recipe_sync.py:185` — tighten timeouts to (1s, 3s) AND background the pull. 13s on chat path violates 1.5s budget.
12. HARTOS `integrations/vlm/local_computer_tool.py:106` + `qwen3vl_backend.py:268` — replace PowerShell shellouts with ctypes-based foreground-window queries.
13. Nunba `routes/chatbot_routes.py:2378-2379` — strike misleading "compat wrapper" docstring sentence.
14. Nunba `landing-page/.../TaskLedgerPage.js` — add `agentEngineApi = createApiClient(...)` to `services/socialApi.js`; replace manual fetch with client.
15. iOS `App.tsx:51-120` + `390-470` — replace 50+ `lazy()` calls with single `ROUTES` array.
16. iOS `App.tsx:313, 316, 322` + `index.js:4-12` — gate `console.log` tracers under `__DEV__`.
17. iOS `js/native-bridge/` — type the NativeModule contracts (`OnboardingModule.d.ts` etc.) instead of declaring as `any`.
18. iOS `Podfile:50-63` — `existing |= ['RCT_DEV=0']` (union-assign) to prevent xcconfig duplicate accumulation.
19. iOS `docs/SHARED_JS_MANIFEST.json` — fix self-contradicting `deliberately_excluded` entries; pin `synced_from_commit` to actual SHA.

### Pre-existing items confirmed (out of scope but tracked)

20. Nunba `app.py::call_stop_api` + `main.py::call_stop_api` — pre-existing DRY violation, symmetric fix this round; consolidate to canonical helper in HARTOS or `desktop/`.
21. HARTOS no CI workflow runs `--gate` for VLM grounding benchmark.
22. HARTOS `tests/vlm_grounding_benchmark.py:336-373` — STRATEGY/TARGET aggregator migrations to `summarize_bucket` incomplete.

### Testing note

Per the AUDIT EVIDENCE DISCIPLINE memory rule, **none of the 6 CRITICAL findings have been runtime-verified yet** — the agents identified them via code reading + cross-reference, not by running an exploit. The path-traversal finding in particular needs a curl reproducer before remediation lands; the vlm_stop CSRF needs a same-host POST test. Recommended next step: write reproducers for the 2 HARTOS CRITICALs as failing tests in `tests/unit/`, then patch.

### Files reviewed across all 3 repos

- **Nunba**: 6 source files, ESLint sanity-checked
- **HARTOS**: 22 source + 14 test files (most read in full; large files like `create_recipe.py`, `hart_intelligence_entry.py` read in sections covering the diff regions)
- **iOS**: ~15 native + manifest files in full; 5 spot-checked from vendored `js/shared/components/` for manifest accuracy

Total ~57 files actually-reviewed (excluding the ~261 vendored RN copies on iOS that are reviewed in their canonical RN home, not here).
