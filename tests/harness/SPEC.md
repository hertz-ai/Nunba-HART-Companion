# User-Defect Reproduction Test Spec

Purpose
    Reproduce every user-observable defect we have captured across
    Nunba + HARTOS over this multi-week session. Test FAILS on HEAD
    (proves the defect exists) → fix → test PASSES (proves the fix).
    No shallow signals. No mocks of the code under test. Real calls
    into existing source, parametrised across every backend / model
    where the defect family applies.

Non-negotiables
    1. Must run on GitHub Actions (ubuntu-latest, windows-latest).
    2. No cx_Freeze bundle dependency for CI-tier tests.
    3. No GPU dependency for CI-tier tests.
    4. No model-weight download > 50 MB for CI-tier tests.
    5. Tests that need real weights / GPU / bundled binary are marked
       `@pytest.mark.live` and skipped by `pytest -m "not live"`.
    6. Every parametrised family enumerates the full backend/model set
       from the single source of truth (not a hard-coded subset).

Tiers
    tier_unit        — pure Python, <1s per test, no network, no Flask
    tier_integration — Flask test-client (Werkzeug), real HTTP calls,
                       no GPU, piper-only for real TTS.  Seconds.
    tier_live        — real GPU TTS, real HF downloads, real cx_Freeze
                       bundle. Local developer box or self-hosted
                       runner only. Minutes-to-hours.

Pytest markers
    @pytest.mark.unit
    @pytest.mark.integration
    @pytest.mark.live

CI runs:  `pytest tests/harness -m "unit or integration" -q`
Local run: `pytest tests/harness -q` (everything)

---

## Backend / model enumeration (SSoT)

All backend lists come from source constants — never hard-coded in
tests.

    TTS_BACKENDS       → tts.tts_engine._BACKEND_TO_REGISTRY_KEY.keys()
                           {f5, chatterbox_turbo, chatterbox_ml,
                            indic_parler, cosyvoice3, kokoro, piper}
    TTS_AUTO_INSTALL   → TTS_BACKENDS \ {piper}   # piper is bundled
    LLM_MODELS         → models in model_catalog where type='llm'
    STT_MODELS         → whisper_{tiny,base,small,medium}, faster-whisper variants
    VLM_MODELS         → minicpm_v2, qwen3.5-4b-vl, qwen3-0.8b-vl
    AUDIO_GEN_MODELS   → ace-step, diff-rhythm
    VIDEO_GEN_MODELS   → ltx2
    ALL_AUTO_INSTALL   → TTS_AUTO_INSTALL ∪ LLM_MODELS ∪ STT_MODELS
                         ∪ VLM_MODELS ∪ AUDIO_GEN_MODELS
                         ∪ VIDEO_GEN_MODELS

Tests that exercise "every auto-install flow" parametrise over
ALL_AUTO_INSTALL. Tests that exercise TTS-specific behaviour
parametrise over TTS_AUTO_INSTALL.

---

## Defect catalogue

Each defect has a family id and zero or more parametrise axes. Test
naming is `test_<family>_<axis>` so CI reports show exactly which
backend/model surfaced which defect.

### Family A — Build pipeline

| ID | Defect | Tier | Axis |
|----|--------|------|------|
| A1 | Acceptance harness greps source strings; passes against source dir, fails against frozen bundle — same binary, two truths. | unit | — |
| A2 | `slim_python_embed` allowlist silently strips dist-info that transformers needs at runtime (filelock, tqdm, etc.). | unit | SSoT of required dist-info |
| A3 | Build completes without fingerprinting `git HEAD`, so a stale `build/Nunba/` can ship pre-fix code. | unit | — |
| A4 | `landing-page/build/` reused across builds; stale React bundle ships. | unit | — |
| A5 | cx_Freeze can strip `.py` source in bundle, breaking text-grep-based post-install checks. | unit | — |

### Family B — TTS auto-install (per backend)

Parametrised over `TTS_AUTO_INSTALL`.

| ID | Defect | Tier |
|----|--------|------|
| B1 | "Ready" card fires on pip exit, not on synth — proxy signal. | unit |
| B2 | Auto-install doesn't verify model weights downloaded; first synth stalls while Ready card lies. | integration |
| B3 | Boot picks backend for default `preferred_lang='en'` before reading `hart_language.json`. | unit |
| B4 | Obsolete in-flight install not cancelled when user changes language. | unit |
| B5 | Hung pip subprocess never times out; "Step 1/2" card hangs forever. | integration |
| B6 | Warmup triggers installs outside the user's language ladder. | unit |
| B7 | `_auto_install_failed` set is never cleared; transient failure disables backend permanently. | unit |
| B8 | Auto-install selects same backend twice due to race between `_try_auto_install_backend` invocations. | unit |
| B9 | Selected backend not in the lang-capable set for the user's language (Chatterbox Turbo for Tamil). | unit |

### Family C — Generic auto-install (per model type)

Parametrised over `ALL_AUTO_INSTALL`.

| ID | Defect | Tier |
|----|--------|------|
| C1 | No verified-signal probe per model type — only TTS has one (`verify_backend_synth`). LLM/STT/VLM/audio/video rely on shallow signals. | unit |
| C2 | Auto-install progress card shows "Step N/M" with no wallclock-based stall detection. | integration |
| C3 | Failed install is not surfaced as a user-visible error — silent fallback. | unit |
| C4 | Disk space not checked before pulling a 5GB model; fails mid-download with cryptic error. | unit |

### Family D — Acceptance harness honesty

| ID | Defect | Tier |
|----|--------|------|
| D1 | Harness greps source strings, never launches subprocess, never calls HTTP. | unit |
| D2 | Harness reports 8/8 PASS from source cwd, 5/8 FAIL from bundle cwd. | unit |
| D3 | Harness exit code is decoupled from user-visible behaviour (no audio round-trip, no LLM probe). | integration |

### Family E — Chat round-trip (the actual user experience)

| ID | Defect | Tier |
|----|--------|------|
| E1 | `preferred_lang` defaulting to `'en'` bypasses `hart_language.json` for the first message. | integration |
| E2 | LLM `/health` returns 200 while `/v1/chat/completions` errors on empty prompt — user sees "Starting the local AI engine" retry storm. | integration |
| E3 | Response text produced but no audio URL in SSE event — user sees text, hears nothing. | integration |
| E4 | Audio URL points at scheme/host the frontend can't fetch from (`file://`, wrong port). | integration |
| E5 | SSE event for audio uses a type the React frontend isn't subscribed to. | integration |
| E6 | Draft-first skip-gate not firing for non-Latin languages; Tamil routed through 0.8B model producing garbage. | unit |

### Family F — Logs

| ID | Defect | Tier |
|----|--------|------|
| F1 | Every `open(log_path, 'w')` in the hot path truncates across restarts, destroying autostart evidence. | unit |
| F2 | Session-banner missing so log readers can't tell run boundaries. | unit |

### Family G — Startup

| ID | Defect | Tier |
|----|--------|------|
| G1 | Single-instance guard races with autostart; two instances can bind :5000. | integration |
| G2 | ResourceGovernor memory cap is applied before webview starts, causing SIGKILL on cold boot. | unit |
| G3 | pywebview handler `_trace()` calls are swallowed by the buffered logger. | unit |

### Family H — VRAM / Model orchestration

| ID | Defect | Tier |
|----|--------|------|
| H1 | `vram_manager.allocate()` writes dict entry without calling `can_fit()`. | unit |
| H2 | LLM evicted mid-session when TTS loads; no priority pinning. | unit |
| H3 | Parallel model load requests both win `can_fit()` and overcommit the GPU. | unit |

### Family I — Runtime frozen-bundle

| ID | Defect | Tier |
|----|--------|------|
| I1 | pycparser dual-copy (cffi bundled + lib_src source) → `KeyError: 'pycparser.c_ast'` at frozen boot. | live |
| I2 | `_trace_import` sys.modules mutation leaves half-loaded modules; second import raises. | live |
| I3 | Whisper transcription failure loop spins at ~2 Hz with no backoff or circuit breaker. | unit |

### Family J — Frontend audio playback

| ID | Defect | Tier |
|----|--------|------|
| J1 | `/local` chat route's SentencePipeline `on_audio_ready` is not wired to the React audio element. | integration |
| J2 | Browser autoplay policy blocks first `<audio>.play()`; no user-gesture retry. | (JSDom only; marked live otherwise) |
| J3 | Served audio URL uses a relative path that the installed host can't resolve. | integration |

---

## Execution protocol (TDD)

    Phase 1  Write the spec (this file) and get user sign-off.
             ← you are here
    Phase 2  Write conftest, pytest.ini, GH Actions workflow.
    Phase 3  Write all tests per the catalogue. Every test FAILS on
             HEAD before any fix is written. Commit the red suite.
    Phase 4  Run all tests. Capture red counts per family. Publish
             to tests/harness/reports/ as timestamped JSON.
    Phase 5  Fix in parallel batches (A, B, C, … independently).
             After each batch, rerun the suite. Record green deltas.
    Phase 6  Full green → ship. No human-manual test required.

Ship signal
    `pytest tests/harness -q` exits 0 on CI AND the live tier passes
    on a developer box with GPU. Either one alone is necessary but
    not sufficient.

---

## Living document

New defects discovered during the session get a new id in the
relevant family + a test. The spec grows; it is never shortened.
When a defect is superseded by a deeper root-cause, note it but
keep the old id as an alias with a `supersedes:` pointer, so
regression tests don't disappear.
