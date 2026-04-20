# CLAUDE.md — Nunba-HART-Companion

Guidance for Claude Code (claude.ai/code) working in this repository.

## Project Overview

**Nunba — Local Mind Companion.**  A desktop/web app that hosts
HARTOS as a pip dependency and delivers multimodal agentic chat
(Qwen3-4B + 0.8B draft, F5/Indic Parler/Kokoro TTS, Whisper STT,
MiniCPM VLM) to end users.  Ships as a cx_Freeze installer on
Windows, standalone on macOS/Linux.

**Relationship to HARTOS:** Nunba imports HARTOS (`hart-backend`
pip package).  HARTOS's `core/`, `integrations/`, `security/`
packages are bundled inside Nunba's `python-embed/Lib/site-packages`.
**Nunba must NOT create its own `core/`, `integrations/`, `security/`,
or `models/` directories** — namespace collision under cx_Freeze
silently hides whichever package's `__init__.py` loads second (see
`memory/feedback_frozen_build_pitfalls.md` Rule 2).

## Repo Layout

| Path | Purpose |
|---|---|
| `app.py` | cx_Freeze entry — splash, path isolation, frozen fixes, webview, tray |
| `main.py` | Flask app, blueprint registrations, deferred threads, admin API |
| `routes/` | Flask blueprints (chat, auth, adapter, kids_media, hartos_backend_adapter) |
| `tts/` | TTS engine (F5/Piper/Kokoro/Indic Parler/CosyVoice3/Chatterbox), VRAM manager |
| `llama/` | llama-server spawn + config (main + draft) |
| `desktop/` | Tray, splash, indicator window, ai_installer, platform_utils |
| `scripts/` | `build.py`, `setup_freeze_nunba.py`, `deps.py`, install generators |
| `landing-page/` | React SPA (admin, chat, social, kids, onboarding) — served from `/static` by Flask |
| `tests/` | pytest + 37 MCP/HF tests + draft-cohort tests |
| `bench/` | Indic cohort benchmark (50 prompts × 2 branches) |

## Common Commands

### Build + Install (Windows)
```bash
cd C:\Users\sathi\PycharmProjects\Nunba-HART-Companion
python scripts/build.py        # Preflight: 20GB disk + psutil check.  cx_Freeze + installer.
```
Running installer places app in `C:\Program Files (x86)\HevolveAI\Nunba\`.
Logs: `~/Documents/Nunba/logs/{gui_app,server,langchain,startup_trace,frozen_debug}.log`.

### Dev Run (no freeze)
```bash
python main.py --port 5000
```

### Tests
```bash
pytest tests/ -v                    # full suite
pytest tests/test_mcp_auth.py -v    # 15 MCP auth tests
pytest tests/test_hub_install_safety.py -v  # 22 HF install gate tests
```

### Frontend
```bash
cd landing-page
npm run build                       # production bundle → landing-page/build/
npx eslint src/ --max-warnings 1500 # hard-gated in CI (quality.yml)
npx react-scripts test --watchAll=false  # Jest
```

### E2E staging (Docker, full-stack probe)
```bash
docker compose -f docker-compose.staging.yml up -d
bash scripts/staging_e2e_probe.sh   # 8 endpoint probes
docker compose down -v
```

## Architecture

```
User ──▶ React SPA (:5000/*) ──▶ Flask (main.py)
                                  │
                                  ├── /chat ──▶ HARTOS hart_intelligence (pip)
                                  │              │
                                  │              ├── Qwen3-4B main (:8080 via llama-server)
                                  │              ├── Qwen3-0.8B draft (:8081, cohort-gated)
                                  │              ├── TTS engine (GPU ladder → Piper CPU fallback)
                                  │              └── Whisper STT (CPU)
                                  │
                                  ├── /api/admin/* ──▶ admin endpoints (models, channels, diag, hub)
                                  ├── /api/social/* ──▶ HARTOS social_bp
                                  ├── /api/mcp/local/* ──▶ HARTOS MCP HTTP bridge (bearer auth)
                                  └── /backend/health ──▶ core.gpu_tier classification
```

### Key Flows
- **Chat turn**: user msg → draft-first dispatcher (if cohort-gate on) → main LLM → TTS synth → SSE push → WAMP pupit topic
- **Model install**: admin UI → `/api/admin/models/hub/search` → `/hub/install` (4 supply-chain gates) → HARTOS orchestrator download → loader → VRAM manager
- **Language selection**: frontend writes `hart_language.json` via `/chat` body → `core.user_lang` canonical reader (single source) → consumed by boot (draft gate, TTS warmup) + runtime (dispatcher, LLM prompt)

## Data Paths (user-writable, cross-platform)

Use `core.platform_paths.get_data_dir()` / `get_log_dir()`:
- `~/Documents/Nunba/data/` — DBs, hart_language.json, agent_data, memory_graph
- `~/Documents/Nunba/logs/` — all logs
- `~/.nunba/site-packages/` — runtime-pip-installed packages (CUDA torch, TTS engines)
- `%LOCALAPPDATA%/Nunba/mcp.token` (Windows) — MCP bearer token

**NEVER write to `C:\Program Files (x86)\HevolveAI\Nunba\`** — read-only
for non-admin users.  Task #250 regression: `hive_task_protocol` was
writing there and silently failing.

## CI / GitHub Actions

| Workflow | Jobs | Gate |
|---|---|---|
| `quality.yml` | python-quality (3-OS matrix), frontend-quality (ubuntu), cypress-e2e (4-shard ubuntu + windows smoke) | ruff/pytest/pip-audit hard-gated; ESLint hard-gated (<1500 warn); Jest hard-gated; Cypress hard-gated |
| `e2e-staging.yml` | docker-compose up → 8 probes → down | push/nightly |
| `docs.yml` | MkDocs build + deploy | on push |
| `build.yml` | cx_Freeze installer + Azure Trusted Signing | on tag |

---

## Change Protocol — Standing Rules for EVERY Edit

**Applies to every change: bug fix, feature, refactor, test, doc,
build config.  No exceptions.  The protocol is the standing contract
that overrides ship-mode urgency.  When the user asks for a fix, the
10 gates below are what we do, in order, before a single character
is written to disk.**

Cross-references — these memory files are authoritative companions:
- `memory/feedback_engineering_principles.md` — DRY / SRP / no parallel paths
- `memory/feedback_frozen_build_pitfalls.md` — cx_Freeze rules, new-module discipline
- `memory/feedback_review_checklist.md` — the `/review` skill's checklist
- `memory/feedback_multi_os_review.md` — Win/macOS/Linux compat gates
- `memory/feedback_verify_imports.md` — `ast.parse` is syntax-only
- `memory/feedback_no_coauthor.md` — commit-message hygiene

### Gate 0 — Intent Before Edit (BLOCKING)

Before typing any edit, answer in writing (in chat or internal
reasoning):

1. **What is the user actually asking for?**  State the success
   criterion they'd verify against.
2. **What does the existing code do, and WHY does it exist that
   way?**  Read the function, its docstring, its callers, and at
   least one adjacent test.  If there's no test, that's a data point.
3. **What will break if I change it?**  Enumerate downstream effects
   — frontend, backend, CI, build, installed users.
4. **Is there already a canonical helper / constant / abstraction
   for this concern?**  If yes, USE it — don't create a second.  If
   no, decide where the canonical home should live before writing code.

Skipping Gate 0 is the #1 source of this codebase's DRY / parallel-
path regressions.  **Never edit on autopilot.**

### Gate 1 — Caller Audit (BLOCKING)

For any function / class / constant / file being modified, enumerate
ALL callers before the edit.  Use the `Grep` tool with file-globs
across BOTH repos (Nunba + HARTOS):

```
grep pattern: <symbol>
path:         C:\Users\sathi\PycharmProjects
glob:         *.py OR *.js OR *.jsx
exclude:      .venv, __pycache__, python-embed, node_modules, build/
```

Record each caller.  If the signature / return shape / side effect
changes, EVERY caller must be updated; every caller's test must pass.

Extra audit triggers:
- Module-level constants / frozensets → grep `import <name>` + all
  iteration / membership sites.
- Decorators / classes → every call site, every subclass.
- HTTP routes → frontend `fetch` + `scripts/staging_e2e_probe.sh`.
- WAMP topics → every publisher + every subscriber.
- cx_Freeze-bundled modules → every `import X` in app.py, main.py,
  routes/, AND `scripts/setup_freeze_nunba.py:packages[]`.

### Gate 2 — DRY Gate (BLOCKING)

Before introducing ANY new:
- Constant / frozenset / dict / list literal with domain meaning
- Helper function with "save X", "load X", "format X", "validate X"
- Class with "Manager", "Handler", "Registry", "Wrapper"
- Configuration default

…run a search for existing equivalents in BOTH repos.  If ≥ 1 exists,
EXTEND or IMPORT.  Never copy.

Real violations this session:
- 4 parallel `frozenset({...})` for "non-Latin script langs" in 4
  files → now `core.constants.NON_LATIN_SCRIPT_LANGS`.
- 3 inline thread-dump implementations → now `core.diag`.
- 2 `_TRUSTED_HF_ORGS` sets (hardcoded + admin-editable JSON) →
  now `core.hub_allowlist.HubAllowlist`.
- 2 `core/` directories (HARTOS + Nunba) → Nunba's deleted.

### Gate 3 — SRP Gate (BLOCKING)

Every function does exactly one thing.  If name has "and",
docstring lists > 1 responsibility, or it mixes pure compute + I/O
side-effect — SPLIT.

Canonical split pattern:
- `pure_compute(x) -> result` — no I/O
- `persist(result) -> bool` — atomic write only
- `on_change(subscribers, old, new)` — event dispatch only

This session's fix: `_persist_language` did validate + read + write +
evict-draft (4 jobs).  Split into `core.user_lang.set_preferred_lang`
(write) + `model_lifecycle._evict_draft_on_non_latin_switch`
(eviction subscriber via `on_lang_change` bus).

### Gate 4 — Parallel-Path Gate (BLOCKING)

Parallel path = "second implementation of a concept that already
has a canonical one."  Parallel paths always drift.

Enforce:
1. One WRITER per persisted value (e.g., `hart_language.json` has
   exactly ONE writer: `core.user_lang.set_preferred_lang`).
2. One SOURCE OF TRUTH per constant (e.g., `NON_LATIN_SCRIPT_LANGS`
   lives in `core.constants`; everyone imports).
3. One DISPATCH PATH per verb (e.g., chat response goes through the
   draft-first dispatcher, not through a parallel `direct_to_4B`
   shortcut).

If a parallel path is temporarily unavoidable (migration), document
with TODO that NAMES the deletion date.  Never ship silently.

### Gate 5 — Test-First for Non-Trivial Changes (BLOCKING)

If the change:
- Alters a public contract, OR
- Adds a new abstraction / module, OR
- Fixes a regression that slipped through static review

…write the test FIRST.  Run it; confirm it fails.  Then implement.
Then confirm it passes.

Tests that belong in every refactor:
- AST-level "no inline duplicate" check (catches DRY regressions)
- Behavioral test for the change's intent
- Boundary test (ENOSPC, empty input, malformed input)
- Regression test for any bug the change is fixing

Example from this session: `tests/test_lang_constants.py` walks AST
of `speculative_dispatcher.py`, `hart_intelligence_entry.py`,
`tts_engine.py` and FAILS if any `_skip_draft_langs =
frozenset({...})` is re-introduced.  That's how DRY gets enforced
mechanically, not by hoping.

### Gate 6 — cx_Freeze Bundle Accounting (BLOCKING for new modules)

Every new `.py` file that will be imported at runtime in a bundled
install MUST be listed in `scripts/setup_freeze_nunba.py` `packages[]`.
cx_Freeze's module tracer only follows static `import` statements —
it misses runtime-dynamic imports (builtins registration,
`importlib.import_module`, `__main__` lookup).

Checklist:
- [ ] New module declared in `packages[]`
- [ ] `__init__.py` present in every new package directory
- [ ] No name collision with HARTOS packages (Nunba must NOT have
      its own `core/`, `integrations/`, `security/`, `models/`)
- [ ] Local `python scripts/build.py` boot-tested (or at minimum
      `python -c "from new.module import X"` against frozen python-embed)

Skipping Gate 6 = `ModuleNotFoundError` at the installed .exe's
first boot.  This happened 2026-04-15 with `core.diag`.

### Gate 7 — Multi-OS / Multi-Topology Surface Check

Every change touching filesystem paths, subprocess, env vars, or IPC
must be validated against:
- OS: Windows (primary), macOS, Linux
- Topology: flat (desktop), regional (edge), central (cloud)

Hard rules:
- `os.popen` / `os.system` without timeout → BANNED (caused the
  27-minute `wmic` hang, 2026-04-15).  Use `subprocess.run(timeout=N)`
  or `shutil.*` native primitives.
- Hard-coded `C:\\` paths → wrap in `sys.platform == 'win32'` check
  or use `pathlib.Path.home()`.
- `requests.get/post` / `urllib.urlopen` / `socket.connect` → MUST
  have explicit timeout + handler for `TimeoutError` /
  `ConnectionError`.
- Writes to `C:\Program Files` → always fail on non-admin; route to
  `~/Documents/Nunba/data/` via `core.platform_paths`.
- Linux-only wheels (uvloop, faiss-cpu, bitsandbytes) → add
  `sys_platform` markers in `requirements.txt` so Win/macOS pytest
  matrix doesn't fail-install.

### Gate 8 — Review Perspectives Before Commit

Before pushing, pass the diff through these specialist lenses
mentally (or spawn the agent if large):

- **architect**: matches existing package structure?  Any layering
  violation (integrations → core is OK; core → integrations BANNED)?
- **reviewer**: DRY, SRP, parallel-path, missing tests.
- **ciso / ethical-hacker**: new ingress?  Untrusted input?  Secrets
  in logs?
- **sre**: failure mode on disk-full / OOM / network-down?
- **performance-engineer**: budget impact (chat 1.5s, draft 300ms,
  cache <1ms)?
- **product-owner**: what does the user see differently?
- **test-generator**: FT + NFT coverage added?

Use the `/review` skill on large diffs.

### Gate 9 — Commit Discipline

- **Atomic**: one commit = one logical change.  Cross-repo refactor
  = two commits (one per repo).
- **Title**: conventional-commits (`fix(lang): …`, `refactor(core): …`,
  `feat(admin): …`).  ≤ 72 chars.
- **Body**: what was narrow, what became broad.  Cite the violation
  pattern + the canonical home.  Reference test file that guards
  regression.
- **No `Co-Authored-By: Claude`**.
- **Never force-push to main**; never `--no-verify`.
- Push after local tests pass — enables CI + E2E staging to catch
  bundle / import issues the local env didn't.

---

## When the User Says "Just Fix It"

Do all 10 gates anyway.  Explain briefly what you're doing; don't
ask permission for each gate.  Ship slower but correctly.

The pattern "user asks → claude rushes → introduces parallel path →
user asks again → claude rushes again" is the enemy.  Honor the
protocol even when urgency seems to reward skipping it; the urgency
is almost always caused by a prior skipped gate.

---

## Build-Validator Mandate

Every refactor touching module boundaries, imports, or new files
must end with:

```bash
python scripts/build.py    # or at least: python -c "from new.module import *"
```

Static review agents (reviewer, architect, test-generator, devops)
do NOT catch cx_Freeze bundling issues.  The only defense is running
the actual build.  Budget 5 minutes for this; it's cheaper than a
crashed installer at the user's desktop.
