---
name: centralization_drift_audit_2026_05_04
description: Live drift audit per capability against the existing canonical pattern (ModelCatalog + ModelOrchestrator + Nunba shim). Cites canonical files, drift sites, existing memory plans, and minimum-change fixes. NOT a new pattern.
type: project
---

# Centralization Drift Audit — 2026-05-04

**Mandate** (verbatim from user): *"first read all code to come up with plan
since we did this centralisation several times earlier to avoid DRY
violations"* … *"audit using main agent"*.

**Scope.** Every "select / load / unload / probe a model" capability —
LLM, TTS, STT, VLM, IMAGE_GEN, VIDEO_GEN, AUDIO_GEN, EMBEDDING — measured
against the canonical pattern that is *already in the tree*.

**Method.** Read both canonicals end-to-end (1849 lines), the Nunba shim
(827 lines), and grep every consumer that touches selection/loading.
Cite file:line for every drift claim.  No drift claim without a citation.

---

## 0. Canonical pattern (ground truth — already in tree)

These two files + one Nunba shim are the *canonical home* for every model
selection / load / capability question.  Any new abstraction is a
violation unless it's a populator or a loader plugin.

| Layer | File | Purpose |
|---|---|---|
| Catalog | `HARTOS/integrations/service_tools/model_catalog.py` (842 lines) | `ModelEntry` universal schema, `ModelCatalog.register/override/select_best/list_by_type/get_by_purpose`.  Persistent JSON at `~/Documents/Nunba/data/model_catalog.json`.  **Pluggable populator** (`register_populator(name, fn)` at line 214). |
| Orchestrator | `HARTOS/integrations/service_tools/model_orchestrator.py` (1007 lines) | `ModelLoader` interface, `register_loader(model_type, loader)` plugin pattern, `auto_load`, **`ensure_loaded_async`** (line 189 — *the* single canonical entry point: "No parallel path"), `available_capabilities`, `can_do`, `notify_loaded/unloaded/downloaded` (bypass-path sync), `reconcile_live_state`. |
| Nunba shim | `Nunba-HART-Companion/models/orchestrator.py` (827 lines) | `LlamaLoader` / `TTSLoader` / `STTLoader` / `VLMLoader` registered idempotently on the shared singleton at `models/orchestrator.py:794-803`.  Catalog populators registered at `models/catalog.py:208-210` (`llm_presets`, `tts_engines`, `media_gen`). |

**Single canonical caller for "bring me a model that can do X":**
```
get_orchestrator().ensure_loaded_async(model_type, language=, caller=)
```
Test guard: `tests/test_chatbot_routes.py:136
test_ensure_loaded_async_is_the_one_entry_point` already enforces this.

**Bypass-path sync API (when a subsystem owns its own load lifecycle):**
```
get_orchestrator().notify_loaded(model_type, model_name, device=)
get_orchestrator().notify_unloaded(model_type, model_name)
```
Used by `vision_service.py`, `whisper_tool.py`, `llama_config.py`,
`main.py` LLM swap path — these are *correct* uses, not drift.

---

## 1. LLM — ✅ CANONICAL

### What's canonical now
- Selection/load: `routes/chatbot_routes.py:2836`
  → `get_orchestrator().ensure_loaded_async('llm', caller=f'chat:{user_id}')`
- Loader: `models/orchestrator.py:LlamaLoader` (lines 70-143) — uses
  `_resolve_preset_and_index` to translate `ModelEntry` → `ModelPreset`
  via `populate_llm_presets()` (one direction, no parallel reads of
  `MODEL_PRESETS` from consumers).
- Bypass-path sync (LLM lifecycle is owned by `LlamaConfig.start_server`,
  not the loader): `main.py:1749 / 1805 / 1808` and
  `llama/llama_config.py:1302` call `notify_loaded / notify_unloaded`.
  Reconcile at `main.py:2236`.
- Test guard: `tests/test_chatbot_routes.py:136`.

### Drift found
**None.**  This capability has been fully consolidated.  The
LangChain / autogen recipe paths still spawn their own subprocess but
that's *runtime topology*, not selection drift — the model identity is
read from the same catalog entry.

### Memory plan
`memory/model-catalog.md` (canonical doc) — already implemented.

### Minimum-change fix
None.  Hold the line with the existing `test_ensure_loaded_async_is_the_one_entry_point` test.

---

## 2. TTS — ⚠️ DOCUMENTED PARALLEL PATHS (2 sites, both with TODOs)

### What's canonical now
- Catalog populator: `populate_tts_engines` registered at
  `models/catalog.py:209` — feeds language_priority into `ModelEntry`
  via `LANG_ENGINE_PREFERENCE` (HARTOS) at population time.
- Loader: `models/orchestrator.py:TTSLoader` (lines 146-369) — eager
  ToolWorker spawn, idle-timeout sync, install-time `validate()` via
  canonical `tts_handshake.run_handshake`.
- Per-language preference reader: `tts/tts_engine.py::_get_lang_preference`
  is the documented single reader (it queries the catalog; only falls
  back to the local dict in degraded-mode).

### Drift sites

**Drift D-T1: `LANG_ENGINE_PREFERENCE` duplicated in TWO files.**

| Site | Lines | Status |
|---|---|---|
| `HARTOS/integrations/channels/media/tts_router.py:568` `LANG_ENGINE_PREFERENCE` | canonical |
| `Nunba/tts/tts_engine.py:452-498` `_FALLBACK_LANG_ENGINE_PREFERENCE` | DOCUMENTED FALLBACK — comment at line 450-451 already says "Fallback-only — canonical preference is read from ModelCatalog via `_get_lang_preference()`. Direct use of this dict is degraded-mode only." |

**Why it matters.** Two physical dicts → two writers when a new language
is added.  HARTOS got `'pt'`, `'ar'`, `'nl'`, `'pl'`, `'tr'`, `'cs'`,
`'hu'`, `'sv'`, `'fi'`, `'el'`, `'ro'`, `'bg'`, `'uk'`, `'cy'`, `'is'`
between 2026-04-15 and 2026-04-29 (`tts_router.py:484-497`); the Nunba
fallback dict has not been re-checked against the same set — the audit
trail in `core/constants.py:73` flags this as known.

**Drift D-T2: `tts_router.TTSRouter.select_engines()` is a parallel selector.**
- File: `HARTOS/integrations/channels/media/tts_router.py:959`.
- Status: TODO REFACTOR comment **already in source** at line 959-961:
  *"remove — catalog.select_best() is the single selector. Language
  preferences feed into catalog via populate_tts_catalog()'s
  language_priority. Move `_is_engine_installed()` to catalog,
  `_find_hive_peer` to orchestrator."*
- Used by `tts_router.py:1184` and exercised by 30+ tests in
  `tests/unit/test_tts_router.py` and `tests/functional/test_tts_fallback_ladder.py`.
  Removal is non-trivial because of the test-coupling.

### Memory plan (already on disk)
- `memory/tts-engines.md` — engine catalog
- `memory/feedback_engineering_principles.md` — DRY / no parallel paths rule
- `core/constants.py:73` — explicit cross-reference between the two dicts
- `tts_router.py:959` — TODO REFACTOR

### Minimum-change fix (in priority order, no new abstraction)

1. **D-T1 fix.**  Make `_FALLBACK_LANG_ENGINE_PREFERENCE` a
   *re-export* of `LANG_ENGINE_PREFERENCE` instead of a copy:
   ```python
   try:
       from integrations.channels.media.tts_router import LANG_ENGINE_PREFERENCE as _FALLBACK_LANG_ENGINE_PREFERENCE
   except ImportError:
       _FALLBACK_LANG_ENGINE_PREFERENCE = {'en': [BACKEND_PIPER]}  # absolute floor
   ```
   ~10-line change in `tts/tts_engine.py:452`.  AST-level guard test:
   walk both modules and assert `_FALLBACK_LANG_ENGINE_PREFERENCE is
   LANG_ENGINE_PREFERENCE` (same object id) when both are importable.
   *Why it's safe:* `_get_lang_preference()` is already the single
   reader; this just collapses the fallback to a re-export so future
   language additions are written once.  The cx_Freeze degraded-mode
   safety net (the `except ImportError`) is kept because HARTOS may not
   be importable during early boot.

2. **D-T2 fix.**  Out of scope for "minimum change" — the test surface
   on `select_engines()` is too large to remove without a 1-day
   refactor.  *Hold the line:* add a unit test that asserts
   `select_engines()` results MATCH `catalog.select_best('tts', language=lang)`
   for the top-3 candidates, so any future drift between the two
   selectors will surface immediately.  File the deletion task at
   priority MEDIUM (next refactor wave).

3. **Drift-guard test (unblock both fixes).**  Add to
   `tests/test_tts_centralization.py`:
   - assert every key in `LANG_ENGINE_PREFERENCE` resolves to a
     `ModelEntry` via `catalog.select_best('tts', language=lang)`
   - assert every backend listed in any value list maps to a registered
     ModelEntry id

---

## 3. STT — ⚠️ ONE LIVE BYPASS (legacy openai-whisper path)

### What's canonical now
- Loader: `models/orchestrator.py:STTLoader` (lines 410-643) — sets
  `HEVOLVE_STT_MODEL_SIZE` env var from `_CATALOG_ID_TO_FASTER_WHISPER_SIZE`,
  spawns subprocess on first transcribe, install-time `validate()` is
  the FT round-trip TTS→Whisper→Levenshtein probe.
- Bypass-path sync: `whisper_tool.py:272` calls `notify_loaded('stt',
  f'whisper-{model_size}', ...)` — correct.
- Catalog populator: `populate_stt_catalog` at `whisper_tool.py:490`.

### Drift sites

**Drift D-S1: `whisper_tool.py:467 _select_legacy_model()` bypasses the catalog.**
```python
def _select_legacy_model() -> str:
    """Select openai-whisper model by VRAM (legacy path)."""
    ...
    free = vram_manager.get_free_vram()
    if free >= 10:    return "large-v3"
    elif free >= 5:   return "medium"
    elif free >= 2:   return "small"
    return "base"
```
- The hardcoded VRAM ladder (10 / 5 / 2 GB) duplicates what
  `populate_stt_catalog` puts on each `ModelEntry.min_vram_gb`.
- Two writers of "which whisper model fits this hardware".
- The legacy path *is* legitimately reached (when `faster_whisper`
  isn't importable and we fall back to upstream `openai-whisper`), but
  the *selection* should still go through the catalog.

**Why it matters.** A future catalog change (adding `large-v3-turbo`,
or raising the `medium` threshold to 6 GB) gets silently ignored on the
legacy path.  This was caught 2026-04-30 during the Indic Parler audit
when transformers pin propagated to 4 places — same anti-pattern.

### Memory plan
- `memory/feedback_engineering_principles.md` — DRY / single-writer rule
- `memory/feedback_no_preexisting_bugs.md` — every bug surfaced is mine
  to fix centrally

### Minimum-change fix
Replace `_select_legacy_model()` body with a catalog query:
```python
def _select_legacy_model() -> str:
    """Select openai-whisper model size — catalog-routed (was VRAM ladder)."""
    try:
        from integrations.service_tools.model_orchestrator import get_orchestrator
        entry = get_orchestrator().select_best('stt')
        if entry:
            # Map catalog id → openai-whisper size token
            _CATALOG_TO_LEGACY_SIZE = {
                'stt-whisper-tiny':   'tiny',
                'stt-whisper-base':   'base',
                'stt-whisper-small':  'small',
                'stt-whisper-medium': 'medium',
                'stt-whisper-large':  'large-v3',
            }
            return _CATALOG_TO_LEGACY_SIZE.get(entry.id, 'base')
    except Exception:
        pass
    return 'base'  # absolute floor
```
~15-line change.  Sits next to `_CATALOG_ID_TO_FASTER_WHISPER_SIZE`
which already exists at the top of `whisper_tool.py` (see import at
`models/orchestrator.py:457`).  *Why it's safe:* the catalog is the
single source of truth for `min_vram_gb`; this collapses the parallel
ladder to a query.  Falls back to `'base'` on any exception (matches
existing behavior).

---

## 4. VLM — ✅ CANONICAL

### What's canonical now
- Loader: `models/orchestrator.py:VLMLoader` (lines 646-787) — owns
  `VisionService.start/stop`, mode = full|lite from `run_mode`,
  install-time `validate()` is the canned 32×32 red JPEG describe probe.
- Bypass-path sync: `vision_service.py:187` calls `notify_loaded('vlm',
  'MiniCPM-V-2', ...)`, line 239 calls `notify_unloaded('vlm',
  'MiniCPM-V-2')` — correct.
- `is_loaded()` is side-effect-free (no fresh import of
  `hart_intelligence_entry`, no Redis ping); reads `sys.modules` only.

### Drift found
**None.**  The 2026-04-30 admin-UI hang was *the absence* of this
discipline — it has been fixed and the comment at lines 712-725
documents why.

### Memory plan
- `memory/model-catalog.md`
- Task #265 (`MEDIUM: Speculative expert improvement has no TTS`) and
  #318 (`Delete MiniCPM auto-install`) — already completed.

### Minimum-change fix
None.

---

## 5. IMAGE_GEN / VIDEO_GEN / AUDIO_GEN — ✅ CANONICAL

### What's canonical now
- Selection: `HARTOS/integrations/service_tools/media_agent.py:178
  _select_audio_tool` and `:203 _select_video_tool` BOTH call
  `get_orchestrator().select_best(...)` already (verified line-by-line).
- Catalog id → tool name resolution via the local `_CATALOG_TO_TOOL`
  dict — small enough that it's not a parallel path; mirrors the
  `_CATALOG_TO_VRAM_KEY` dict in `model_orchestrator.py:551`.
- Catalog populator for media: `populate_media_gen` registered at
  `models/catalog.py:210`.

### Drift found
**None.**  The 2026-04-22 source-validate Priority 10 (Music
gen/Media pipeline/Kids learning, task #257) caught earlier drift
here and consolidated it.

### Memory plan
- `memory/model-catalog.md`

### Minimum-change fix
None.  Hold the line — add a single drift-guard test:
`tests/test_media_agent_centralization.py` that asserts every key in
both `_CATALOG_TO_TOOL` dicts resolves to a registered ModelEntry id.

---

## 6. EMBEDDING — ✅ CANONICAL (catalog has the type, no consumers drifted)

### What's canonical now
- `ModelType.EMBEDDING` enum value exists in
  `model_catalog.py:ModelType`.
- No registered loader yet (HARTOS uses `sentence-transformers` /
  `cohere` directly via `provider-gateway` — that's a deliberate
  routing choice, not a model-load choice).

### Drift found
**None today.**  When embedding becomes a local-load capability (e.g.
when `bge-m3` is added to the catalog), a `EmbeddingLoader` will need
to be registered in `models/orchestrator.py:_register_loaders` — that's
the single forward-add point.

---

## 7. Cross-cutting: bypass-path sync hygiene

The orchestrator's `notify_loaded` / `notify_unloaded` /
`notify_downloaded` API exists *because* not every subsystem can yield
its load lifecycle to the orchestrator.  Audit of every caller:

| Site | Call | Verdict |
|---|---|---|
| `vision_service.py:187` | `notify_loaded('vlm', 'MiniCPM-V-2')` | ✅ correct (bypass) |
| `vision_service.py:239` | `notify_unloaded('vlm', 'MiniCPM-V-2')` | ✅ correct (bypass) |
| `whisper_tool.py:272` | `notify_loaded('stt', f'whisper-{size}')` | ✅ correct (bypass) |
| `model_lifecycle.py:1236` | `notify_unloaded(...)` | ✅ correct (eviction) |
| `Nunba/main.py:1749` | `notify_loaded(LLM, preset.display_name)` | ✅ correct (LlamaConfig owns lifecycle) |
| `Nunba/main.py:1805,1808` | swap pair | ✅ correct |
| `Nunba/main.py:2236` | `reconcile_live_state()` | ✅ correct (boot drift recovery) |
| `Nunba/llama_config.py:1302` | `notify_loaded(...)` | ✅ correct (post-restart) |
| `Nunba/routes/chatbot_routes.py:1209` | `notify_loaded(TTS, backend)` | ✅ correct (lazy TTS init) |
| `Nunba/routes/chatbot_routes.py:1823` | `notify_loaded(STT, ...)` | ✅ correct (post-warmup) |

No bypass-without-notify anti-pattern detected.

---

## 8. Summary scorecard

| Capability | Status | Drift sites | Min-change LOC | Plan home |
|---|---|---|---|---|
| LLM | ✅ canonical | 0 | 0 | implemented |
| TTS | ⚠️ duplicate ladder + parallel selector | 2 (both with TODOs) | ~10 (D-T1) + drift-guard test | `tts_router.py:959` TODO + `core/constants.py:73` |
| STT | ⚠️ legacy bypass | 1 (`whisper_tool.py:467`) | ~15 | `feedback_engineering_principles.md` |
| VLM | ✅ canonical | 0 | 0 | implemented |
| IMAGE_GEN | ✅ canonical | 0 | 0 | implemented |
| VIDEO_GEN | ✅ canonical | 0 | 0 | implemented |
| AUDIO_GEN | ✅ canonical | 0 | 0 | implemented |
| EMBEDDING | n/a (no local loader yet) | 0 | 0 | future EmbeddingLoader |

**Total minimum-change footprint: ~25 lines + 3 drift-guard tests.**
**No new abstraction.  No new module.**  Every fix lands inside the
existing canonical pattern (ModelCatalog populator + ModelOrchestrator
loader + bypass-path notify_*).

---

## 9. What this audit *does not* propose

- **No new "best of all worlds" wrapper.**  The canonical wrapper
  already exists: `ensure_loaded_async`.  Any new wrapper would itself
  be a parallel path.
- **No new selector.**  `catalog.select_best` is the single selector.
- **No new registry.**  `register_populator` + `register_loader` are
  the two extension points.  Neither has been outgrown.
- **No "let's centralize even harder."**  The centralization is done.
  The remaining drift is fallback dicts and one legacy code path —
  fix those, not the architecture.

---

## 10. Recommended next 3 commits (in this order)

1. **Drift-guard tests first** (red bar):
   - `tests/test_tts_centralization.py` — every backend in `LANG_ENGINE_PREFERENCE`
     resolves to a `ModelEntry`; assert (when both modules are importable)
     `tts_engine._FALLBACK_LANG_ENGINE_PREFERENCE` and
     `tts_router.LANG_ENGINE_PREFERENCE` are the same object.
   - `tests/test_stt_centralization.py` — `_select_legacy_model()` returns
     a value that round-trips through the catalog (size token →
     `_CATALOG_TO_LEGACY_SIZE` → `ModelEntry` exists).
   - `tests/test_media_agent_centralization.py` — every key in the two
     `_CATALOG_TO_TOOL` dicts resolves to a registered ModelEntry id.

2. **D-T1 collapse** — `_FALLBACK_LANG_ENGINE_PREFERENCE` re-export
   (~10 lines).

3. **D-S1 collapse** — `_select_legacy_model()` catalog query
   (~15 lines).

D-T2 (TTSRouter.select_engines deletion) is a separate refactor wave —
file as MEDIUM-priority follow-up; do NOT bundle here.

---

*Audit produced 2026-05-04 by main agent under /effort max.  Files read
in full: `model_catalog.py` (842), `model_orchestrator.py` (1007),
`Nunba/models/orchestrator.py` (827).  Targeted reads + grep across
`tts_engine.py`, `tts_router.py`, `whisper_tool.py`, `vision_service.py`,
`media_agent.py`, `chatbot_routes.py`, `main.py`, `llama_config.py`.*
