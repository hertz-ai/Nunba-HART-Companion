# Orchestrator expectations — append-only

## [tick=3 / 2026-05-03] HARTOS/core/health_probe.py [untracked, NEW]

For change: introduce `core.health_probe` as the single canonical source for
"is the daemon running?", "is the LLM up?", "is Flask up?", "is langchain up?",
replacing inline implementations in `integrations/mcp/mcp_server.py` and
`integrations/mcp/mcp_http_bridge.py`.

### Code paths touched
- `HARTOS/core/health_probe.py` — NEW module (147 lines, 4 public probes).
- `HARTOS/integrations/mcp/mcp_server.py` — both `agent_status()` and
  `system_health()` MUST be migrated to call `health_probe.probe_*`.
- `HARTOS/integrations/mcp/mcp_http_bridge.py` — both `_tool_agent_status()`
  and `_tool_system_health()` MUST be migrated.

### Expected post-change state
1. `HEVOLVE_AGENT_ENGINE_ENABLED` env-var is read in EXACTLY 3 places:
   - `core/health_probe.py:71` (degraded fallback only — try/except path)
   - `integrations/agent_engine/__init__.py:68` (start-time gate)
   - deploy/test scaffolding (legitimate writes at install/test time)
   No other module reads it as if it were live state.
2. `pooled_get(f'http://localhost:{get_port("llm")}/health'...)` exists in
   ZERO call sites for liveness — every "is the LLM up?" goes through
   `probe_llm()`.  Network probes used for non-health purposes (e.g.
   `model_bus_service.py` proxy probing) are out of scope for this commit
   but should be considered for a future consolidation.
3. Probes are SIDE-EFFECT FREE per the docstring.  No file writes, no env
   mutations, no WAMP publishes.
4. Probes time out within 200 ms total per the docstring.
5. `mcp_server.py` and `mcp_http_bridge.py` worktree changes are committed
   ATOMICALLY with `health_probe.py` — no half-migration on `main`.
6. Module is shipped via `hart-backend` wheel (`pyproject.toml`
   line 210 `include = ["core*", ...]`).  No cx_Freeze packages[]
   addition needed — Nunba's `setup_freeze_nunba.py:491` excludes
   `core, core.*` and the bundled `python-embed` carries the wheel.

### Known cohabitants (caller graph for the consolidated concern)
- HEVOLVE_AGENT_ENGINE_ENABLED reads (live):
  - `agent_engine/__init__.py:68` — start-time gate (legitimate, not a probe)
  - `social/__init__.py:348` — auto-setter (legitimate, also not a probe;
    documented at probe site as the source of stale-snapshot bug)
  - `security/system_requirements.py:262` — config-validation registry
- `/health` polls of `http://localhost:{llm}/...` outside MCP:
  - `core/agent_tools.py:294`
  - `hart_intelligence_entry.py:1482`
  - `integrations/social/api_audit.py:393`
  - `integrations/agent_engine/model_bus_service.py:139,183,199`
  - `integrations/service_tools/model_onboarding.py:54`
  - `integrations/agent_engine/world_model_bridge.py:1393`
  - `integrations/vlm/vlm_agent_integration.py:62`
  - `integrations/vision/lightweight_backend.py:398`
  - `integrations/social/peer_discovery.py:592`
  Each of these is a probe site that this commit does NOT touch.  They
  are candidates for a future consolidation pass; flag if any of them
  encode the same hardcoded port the docstring complains about.
- Nunba consumers of `probe_llm`:
  - `Nunba-HART-Companion/llama/llama_config.py:75-78` already adopted
    the canonical resolver via `probe_llm`.  This is good — confirms the
    DRY target is being hit on the Nunba side.

### Pass criteria
- Migration in `mcp_http_bridge.py::_tool_system_health` MUST be present
  (currently it still has the two old inline `pooled_get(...llm/health)`
  calls at lines 622 and 627).  This is a partial-migration regression
  in flight that the deep-review must catch.
- Probes do not introduce new parallel paths with `core.platform_paths`,
  `core.constants`, or `core.port_registry`.
- No probe runs `requests.get` without an explicit timeout.
- No probe leaks a token / cookie / auth header.
- `probe_agent_daemon` MUST consult `agent_daemon._running` (the live
  state) and only fall back to the env var on import error.
