# Hive MoE Architecture Map — Read-the-Code Audit

**Scope.** Maps the *actually implemented* paths for cross-tier intelligence sharing, dynamic expert routing, and peer fan-out across Nunba (flat), HARTOS regional, and HARTOS central. Every claim cites `path:line`. No claim is from product docs.

**Method.** Read-first audit of the load-bearing files: `hart_intelligence_entry.py` (8473L), `speculative_dispatcher.py`, `dispatch.py`, `world_model_bridge.py`, `model_registry.py`, `compute_mesh_service.py`, `expert_agents/registry.py`, `core/peer_link/{link.py,link_manager.py,channels.py}`, `integrations/distributed_agent/{api.py,task_coordinator.py,host_registry.py}`, `integrations/social/{realtime.py,fleet_command.py,federated_aggregator.py}`, `hevolveai/embodied_ai/learning/hive_mind.py`. Cross-referenced every "hive", "peer", "expert", "fan-out", "delegate" symbol with grep across both repos.

---

## 1. Tier topology and trust boundary

| Tier | DB | Trust | Source |
|---|---|---|---|
| `flat` | SQLite (NullPool, WAL) | Single-user, in-process | `_ecosystem-context.md:33` |
| `regional` | MySQL (QueuePool) | LAN-trusted | `_ecosystem-context.md:34` |
| `central` | MySQL | JWT-auth required | `_ecosystem-context.md:35` |

PeerLink `TrustLevel` enum (`core/peer_link/link.py:46`): `SAME_USER`, `PEER`, `RELAY`. Trust ratchet at `link.py:144` — `set_trust(new_trust)` only allows upgrades. Same-user link is **unencrypted** ("your own devices"); cross-user PRIVATE channels are encrypted at the link layer (`channels.py:9-12`).

ConnectionBudget per tier in `link_manager.py`: flat=10, regional=50, central=200 (constructor defaults).

**Verdict.** Tiers exist as DB/trust separations. They are **not** pre-wired into a unified "Hive MoE expert pool" by any single dispatch primitive — see §4-§7.

---

## 2. Channel registry — what flows where

`core/peer_link/channels.py:28-99`. Ten channels, IDs `0x00`-`0x09`:

| Channel | ID | Class | Reliable | Real consumer |
|---|---|---|---|---|
| control | 0x00 | SYSTEM | yes | Handshake/heartbeat (`link.py:385`) |
| compute | 0x01 | PRIVATE | yes | `compute_mesh_service.offload_inference` (`compute_mesh_service.py:228`) |
| dispatch | 0x02 | PRIVATE | yes | NO live caller in chat path (grep) |
| gossip | 0x03 | OPEN | no | `peer_discovery.gossip.broadcast` (consumed by `world_model_bridge.distribute_skill_packet:889`) |
| federation | 0x04 | OPEN | yes | Federated post delivery (social) |
| **hivemind** | 0x05 | PRIVATE | yes | **`world_model_bridge.query_hivemind:728`** — only call site for chat-class queries |
| events | 0x06 | OPEN | no | EventBus cross-device |
| ralt | 0x07 | OPEN | yes | Skill availability gossip |
| sensor | 0x08 | PRIVATE | no | Frame upload |
| messages | 0x09 | PRIVATE | yes | DMs / channel messages |

`ChannelDispatcher` (`channels.py:121`) is a per-channel handler registry; subsystems `register(channel, handler)` and incoming messages dispatch through it. **It exists but is bypassed by every chat path** — chat does not flow over channels.

---

## 3. Chat dispatch sequence — where the question hits

```
POST /chat   (hart_intelligence_entry.py:5371 chat())
  ↓ guards: GuardrailEnforcer.before_dispatch  (line 5631)
  ↓ secret_redactor                            (line 5641)
  ↓ budget_gate.estimate_llm_cost_spark        (line 5649)
  ↓ prompt_guard.check_prompt_injection        (line 5680)
  ↓
  if speculative + prompt_id  → dispatcher.dispatch_speculative (5660)
  if create_agent flag        → autogen CREATE flow             (5867)
  ↓
  draft-first branch (line 5801, default ON):
    dispatcher.dispatch_draft_first(prompt, user_id, prompt_id,
                                    agent_persona=custom_prompt,
                                    preferred_lang=preferred_lang)
        ↓ speculative_dispatcher.py:179
        ↓ get_draft_model() → Qwen3.5-0.8B (model_registry.py:113-128)
        ↓ skip if non-Latin script (line 236)
        ↓ _check_draft_first_gates: TCP probe :8081 (line 408)
        ↓ _dispatch_to_model(draft_model, draft_prompt, ...)  (line 261)
        ↓ _parse_draft_envelope → {reply, delegate, confidence,
                                    is_casual, is_correction,
                                    is_create_agent, channel_connect,
                                    language_change}            (line 612)
        ↓ if delegate in ('local','hive'):
              _pick_expert_for_delegate(delegate)               (line 651)
                'local' → registry.get_fast_model() (Qwen3.5-4B)
                'hive'  → registry.get_expert_model() ELSE get_fast_model()
              _schedule_expert_background (ThreadPoolExecutor.submit, line 605)
        ↓ RETURN draft.reply SYNCHRONOUSLY  (line 5847 _chat_reply)
  ↓
  if no draft reply  → get_ans() (line 4741) — full LangChain ReAct
```

**Where peer fan-out would sit:** between line 320 (`if delegate in ('local','hive'):`) and line 322 (`expert_pending = self._schedule_expert_background(...)`). It does not sit there. `_pick_expert_for_delegate('hive')` returns a single `ModelBackend` from `model_registry`.

---

## 4. The "delegate=hive" branch — what it actually does

`integrations/agent_engine/speculative_dispatcher.py:651-668`:

```python
def _pick_expert_for_delegate(self, delegate: str):
    if delegate == 'local':
        return self._registry.get_fast_model()
    if delegate == 'hive':
        expert = self._registry.get_expert_model()    # cloud LLM
        if expert: return expert
        return self._registry.get_fast_model()        # graceful local fallback
    return None
```

`get_expert_model()` (`model_registry.py:147-159`) returns the *single* highest-`accuracy_score` registered model in `_models` excluding DRAFT tier. Default expert candidates (`model_registry.py:378-411`):
- `gpt-4.1-azure` (acc 0.92, EXPERT) — only if `AZURE_OPENAI_API_KEY` set
- `claude-sonnet` (acc 0.93, EXPERT) — only if `ANTHROPIC_API_KEY` set

If neither key is set, `get_expert_model()` returns the local 4B (acc 0.60). `delegate='hive'` collapses to "call cloud model OR same local 4B". **It is not "consult N peer experts".**

---

## 5. The expert background task — single-model dispatch

`speculative_dispatcher.py:685-739` `_expert_background_task`:

1. Build `_build_expert_prompt` (line 743) — concatenates original + fast response with reviewer instruction.
2. `_dispatch_to_model(expert_model, ...)` (line 772) — bundled mode: direct POST to that one model's `/v1/chat/completions` (line 821). HTTP mode: POST to `{HEVOLVE_BASE_URL}/chat` (line 845).
3. `_is_meaningful_improvement` (line 756) — Jaccard word-overlap < 0.5.
4. If improved: `_deliver_expert_response` (line 852) — publishes text to WAMP `com.hertzai.hevolve.chat.{user_id}` (line 858) and triggers TTS via `_tts_synthesize_and_publish` (line 867).

**No fan-out, no fusion, no peer aggregation.** A single expert model receives the prompt; its single reply may or may not replace the standby.

`_expert_pool` (line 57) is a `ThreadPoolExecutor` — it pools Python *threads*, not models or peers. Misleadingly named.

---

## 6. PeerLink `collect()` — the only real fan-out primitive

`core/peer_link/link_manager.py:166-189`:

```python
def collect(self, channel: str, timeout_ms: int = 1000) -> List[dict]:
    """Broadcast and collect responses from all peers.
    Used by HiveMind for distributed thought fusion."""
    responses = []
    with self._lock:
        links = list(self._links.values())
    timeout_s = timeout_ms / 1000.0
    for link in links:
        if not link.is_connected: continue
        try:
            result = link.send(channel, {'type': 'query'},
                              wait_response=True, timeout=timeout_s)
            if result: responses.append(result)
        except Exception: pass
    return responses
```

This is the fan-out: synchronously asks every connected PeerLink for a response. **Sole call site for the `hivemind` channel:** `world_model_bridge.query_hivemind` (`world_model_bridge.py:728`).

`query_hivemind` is invoked from (grep across HARTOS):
- `integrations/agent_engine/ip_protection_tools.py:141, 171` — IP collision scoring
- `integrations/agent_engine/commercial_api.py:432` — commercial endpoint
- `integrations/robotics/intelligence_api.py:381, 657` — robotics

**ZERO call sites in `hart_intelligence_entry.py`, `speculative_dispatcher.py`, `routes/chat*`, or any chat-path file.** The chat pipeline does not fan out across peers, ever.

---

## 7. WorldModelBridge — dual-mode but chat-blind

`integrations/agent_engine/world_model_bridge.py`:

- `_init_in_process` (line 270): tries `from hart_intelligence import get_learning_provider, get_hive_mind`. If HevolveAI is pip-installed AND `_init_learning_pipeline()` succeeded (`hart_intelligence_entry.py:1232`), the bridge holds direct refs to `_provider` and `_hive_mind`.
- `query_hivemind` (line 640) — three-stage:
  1. **In-process** (line 683-710): calls `_hive_mind.think_together_distributed(local_thought, local_agent_id, timeout_ms)`.
  2. **PeerLink** (line 724-738): `link_manager.collect('hivemind', timeout_ms)` — returns `{thoughts: responses, source: 'peerlink', peer_count: ...}`.
  3. **HTTP** (line 744-758): `POST {api_url}/v1/hivemind/think`.
- `record_interaction` (line 316) — every chat completion is fed to HevolveAI for continual learning AND mirrored to `ConversationEntry` (`_persist_to_conversation_entry:394`). This is the *only* link between chat and hive learning, and it is **write-only** (records, does not query).

`_hive_mind` (initialized in `hart_intelligence_entry.py:1291`: `_hive_mind = HiveMind(max_agents=100)`) is consumed by:
- `world_model_bridge.query_hivemind` (above) — but never from chat
- `world_model_bridge.get_hivemind_agents` (line 811) — admin/dashboard
- `world_model_bridge.get_learning_stats` (line 762) — admin/dashboard
- The `/v1/stats`, `/health` endpoints (`hart_intelligence_entry.py:7006, 7073`)

**Verdict.** The HiveMind runtime exists in process but the chat path does not consult it.

---

## 8. HiveMind class — fusion math is real

`hevolveai/embodied_ai/learning/hive_mind.py:568` (class `HiveMind`):

- `register_agent(agent_id, agent_type, latent_dim, capabilities, modality, ...)` (line 1131) — stores `AgentSpec` (line 99).
- `fuse_thoughts(thoughts, method)` (line 1428) — supports `mean`, `confidence_weighted`, `attention`, `max`. Reality-grounded boost (`reality_signature` 0.0-1.0 → 0.75x-1.5x conf; line 1465).
- `think_together(agent_thoughts, confidences, reality_signatures)` (line 1512) — projects to common space, optionally gates via honeycomb topology (line 1541-1576), fuses.
- `think_together_distributed(local_thought, local_agent_id, timeout_ms)` (line 2204) — publishes to WAMP, polls `thought_buffer` for remote thoughts (line 2254-2266), fuses up to 5 remote thoughts.

**Single `register_agent` call in HARTOS:** `hart_intelligence_entry.py:1292`. Registers the local instance only. There is no code path that auto-registers peer instances when a PeerLink upgrades to PEER trust.

Hence `think_together` always operates on `{local}` unless WAMP delivers remote thoughts into `thought_buffer` — and the hivemind WAMP wiring is HevolveAI-internal (`_wamp_connected` gate at line 2241), not consumed by the chat dispatcher.

---

## 9. Distributed agent / coordinator — agent-level work, not chat tokens

`integrations/distributed_agent/`:

- `api.py:24` — `distributed_agent_bp = Blueprint('distributed_agent', __name__)`.
- `api.py:90` `POST /api/distributed/tasks/announce` — receive task announcements via gossip.
- `api.py:207` `POST /api/distributed/tasks/claim` — agent claims work.
- `api.py:232` `POST /api/distributed/tasks/<id>/submit` — submit result.
- `api.py:272` `POST /api/distributed/goals` — submit decomposed goal.
- `task_coordinator.py:52` `submit_goal(objective, decomposed_tasks, context)` — creates parent + child tasks in `SmartLedger`.
- `task_coordinator.py:107` `claim_next_task(agent_id, capabilities)` — atomic via `DistributedTaskLock`, capability-matched.
- `task_coordinator.py:195` `submit_result` — SHA-256 hash for verification, publishes via PubSub.
- `host_registry.py:39` `register_host(capabilities, compute_budget)` — stores in Redis `distributed_agent:hosts`. **Auto-discovers model capabilities** from `ModelOrchestrator.available_capabilities()` (`host_registry.py:73-92`) — flat strings like `'tts'`, `'audio_gen:music_gen'`.
- `host_registry.py:148` `get_hosts_with_capability(capability)` — capability-matched host pick.

**Connection to chat dispatch:** `dispatch.py:168 _get_distributed_coordinator` is used by `dispatch_goal` (line 310) — the **agent-goal** entry point used by `agent_daemon`, **not** by `/chat`. `/chat` never lands in this code.

This subsystem distributes *long-running goal execution* across hosts. It is not a token-stream fan-out and not invoked per chat turn.

---

## 10. ComputeMesh — same-user device aggregation

`integrations/agent_engine/compute_mesh_service.py`:

- Class `ComputeMeshService` (line 67). **Same-user-only by design** ("Different users NEVER share compute through this service" — line 5-6).
- `MeshPeer` (line 35) carries `loaded_models`, `available_compute`, `latency_ms`.
- `discover_peers` (line 139) — pulls peer list from `/api/social/peers`, probes each at `:6796/mesh/status`.
- `offload_inference(peer_id, model_type, prompt, options)` (line 196) — PeerLink first via `compute` channel (line 228), HTTP fallback to `:6796/mesh/infer`.
- `offload_to_best_peer(model_type, prompt, options)` (line 257) — score = `model_loaded_bonus + compute - latency`.

**Call sites of `offload_to_best_peer` (grep):**
- `hart_intelligence_entry.py:4218` — PDF parse fallback (no local vision model)
- `hart_intelligence_entry.py:4426` — visual context fallback (`parse_visual_context`)
- `core/agent_tools.py:356` — agent tool helper
- `integrations/channels/media/tts_router.py:559` — TTS fallback
- `integrations/agent_engine/video_orchestrator.py:365` — video gen
- `integrations/agent_engine/model_bus_service.py:688` — model bus

**Zero call sites in `/chat` text dispatch.** Chat completion never reaches `offload_to_best_peer`. The mesh exists for *modal tool offload* (PDF/vision/TTS/video), not for collective LLM thinking.

---

## 11. ExpertAgentRegistry — a phone book, not a network

`integrations/expert_agents/registry.py:67` `ExpertAgentRegistry`:

- 96 `ExpertAgent` dataclasses (line 53), each with `agent_id`, `name`, `category`, `endpoint`, `capabilities`.
- Every initial endpoint is `http://localhost:8000/v1/chat/completions` (e.g. line 125, 143, 161, 179, 197) — placeholder, all the same llama-server.

Consumers (grep):
- `create_recipe.py:204, 991, 2548, 3363` — `match_expert_for_context` to bias autogen agent prompt construction (selects which "expert persona" to inject).
- `reuse_recipe.py:81, 1653` — same persona-selection use.
- `hart_cli.py:1493, 1523, 1550` — CLI inspection.
- `integrations/openclaw/hart_skill_server.py:150` — agent_network helper.

**Verdict.** This is a *prompt-template phonebook* of expert personas, not a runtime network of distinct expert nodes. No call site sends one query to `python_expert` and another to `database_expert` and fuses results.

---

## 12. Fleet command — central → node push, signed

`integrations/social/fleet_command.py`:

- `VALID_COMMAND_TYPES` frozenset (line 29) — `config_update`, `halt`, `restart`, etc.
- `FleetCommandService.push_command(target_node_id, command_type, payload, signed_by)` (line 53) — central tier publishes command, signed.
- `push_broadcast(command_type, payload, tier_filter)` (line 111) — fan-out to all nodes by tier.
- `execute_command(cmd)` (line 232) — local executor on each node.

This is **command-and-control** (one-way central → nodes). Not chat collaboration.

---

## 13. FederatedAggregator — training-time delta sync

`integrations/agent_engine/federated_aggregator.py`:

- `_get_hmac_secret` (line 79), `_sign_delta` (line 87), `_verify_delta_signature` (line 106), `register_peer_hmac_secret` (line 153) — HMAC trust.
- `FederatedAggregator.tick()` (line 215) — extract local delta → broadcast via `peer_deltas` channel → aggregate inbound → apply.
- Channels: `peer_deltas`, `embedding_deltas`, `lifecycle_deltas`, `resonance_deltas`, `recipe_deltas`.

This synchronizes **learned weights / metrics**, not in-flight inference. Runs every Nth daemon tick, not per-chat.

---

## 14. Real-time push — Crossbar WAMP

`integrations/social/realtime.py`:

- `_authorize_topic_for_user_id(topic, user_id)` (line 60) — public-prefix or `.{user_id}` suffix gate.
- `publish_event(topic, data, user_id)` (line 85) — `MessageBus.publish` (line 102) → fallback HTTP `:8088/publish` (line 109-115).
- `on_notification(user_id, payload)` (line 138) — publishes `chat.social` topic + SSE broadcast.

Topics that the chat path actually publishes to:
- `com.hertzai.hevolve.chat.{user_id}` — agent thinking, final replies (`speculative_dispatcher._deliver_expert_response:858`)
- `com.hertzai.pupit.{user_id}` — TTS audio URLs (`_tts_synthesize_and_publish` in hart_intelligence_entry.py)

WAMP is the **delivery substrate** (server → frontend). It is not a peer-to-peer fusion fabric for inference.

---

## 15. Where each tier *could* contribute — and where the wiring stops

| Capability | Wired? | Citation |
|---|---|---|
| flat user can ask central's GPT-4 | YES | `_pick_expert_for_delegate('hive')` → `get_expert_model()` returns cloud expert if API key set (`speculative_dispatcher.py:651-668`, `model_registry.py:378-411`). Single model, not a pool. |
| flat user can fan-out to N regional peers | NO | `link_manager.collect('hivemind')` exists but no chat code calls it. `query_hivemind` is invoked by IP/commercial/robotics endpoints only. |
| regional can offload chat to flat peers | NO | Chat dispatch never calls `offload_to_best_peer`. |
| same-user multi-device shares VLM/TTS/PDF | YES | `compute_mesh_service.offload_to_best_peer` from PDF/visual/TTS/video tools. **Same user only**. |
| central auto-discovers regional models | YES | `host_registry.register_host` auto-pulls capabilities from `ModelOrchestrator` (`host_registry.py:73-92`). Surfaced via `get_hosts_with_capability` — used for goal dispatch, not chat. |
| agent A dynamically calls agent B | PARTIAL | LangChain tools registered by `get_tools` (`hart_intelligence_entry.py:2696`); `_handle_agentic_router_tool` (line 2525) sets thread-local flag; `agentic_router.find_matching_agent` matches goals to existing agents. There's no first-class "agent-to-agent RPC" channel — it's prompt-mediated routing. |

---

## 16. The expert picker — ONE place

```
speculative_dispatcher.py:651  _pick_expert_for_delegate(delegate)
   └→ model_registry.py:113   get_draft_model    (DRAFT tier, lowest latency)
   └→ model_registry.py:130   get_fast_model     (any non-DRAFT, lowest latency)
   └→ model_registry.py:147   get_expert_model   (any non-DRAFT, highest accuracy)
   └→ model_registry.py:161   get_local_model    (is_local=True only)
   └→ model_registry.py:173   get_model_by_policy(policy, task_source)
                              policies: local_only | local_preferred | any
```

There is no per-prompt routing function that says "this prompt looks like Python ⇒ python_expert; this prompt looks like SQL ⇒ database_expert". Routing decisions are: **draft tier → fast tier → expert tier**, single model per tier per call.

---

## 17. Peer fan-out — REAL vs GAP

| Component | REAL or GAP | Where |
|---|---|---|
| Per-channel broadcast primitive | REAL | `link_manager.broadcast` (`link_manager.py:138`) |
| Per-channel collect-responses primitive | REAL | `link_manager.collect` (`link_manager.py:166`) |
| Tensor-fusion math | REAL | `hive_mind.fuse_thoughts` (`hive_mind.py:1428`); `attention`, `confidence_weighted`, `mean`, `max` |
| Distributed think loop | REAL | `hive_mind.think_together_distributed` (`hive_mind.py:2204`) — but only fuses what's in `thought_buffer` |
| Bridge that calls collect on `hivemind` channel | REAL | `world_model_bridge.query_hivemind:728` |
| Chat path consulting query_hivemind | **GAP** | Zero call sites of `query_hivemind` in `hart_intelligence_entry.py` or `speculative_dispatcher.py` |
| Auto-register peer instances into HiveMind agent registry on PeerLink upgrade | **GAP** | `link_manager.upgrade_peer:193` does not call `hive_mind.register_agent` |
| Capability-routed expert pick (e.g. SQL→database_expert) | **GAP** | `_pick_expert_for_delegate` only routes by tier (`local`/`hive`), not by capability |
| Cross-user expert pool | **GAP** | `compute_mesh_service.py:5-6` explicitly forbids it |

---

## 18. Response fuser — where the math runs and where the chat ends

**Math exists (`hive_mind.py:1428-1510`):** four fusion methods, attention is full self-attention with cosine-similarity scoring (line 1484).

**Chat-path consumer of fusion: NONE.**

The chat path's "fusion" is `_is_meaningful_improvement` (`speculative_dispatcher.py:756`) — Jaccard word overlap between fast and expert reply. If `<0.5`, expert reply is delivered; otherwise the user keeps the draft. This is selection, not fusion.

If you want a Hive MoE expert pool for chat, the **specific** wiring change is one of:

1. **In `speculative_dispatcher._pick_expert_for_delegate('hive')` (line 662),** instead of returning a single `get_expert_model()`, pick top-K experts (by `model_registry.list_models(tier=EXPERT)`) and dispatch all in parallel via `_expert_pool.submit`. Then in `_expert_background_task` collect their replies and call `hive_mind.fuse_thoughts(thoughts, method='attention')` to fuse text-as-thoughts (need an encoder — would require the in-process HevolveAI bridge).

2. **In `speculative_dispatcher.dispatch_draft_first` after line 322,** add a new branch `if delegate == 'hive' and bridge.is_in_process(): bridge.query_hivemind(prompt, timeout_ms=...)` and merge the returned thoughts/peer_count into the response envelope.

3. **In `link_manager.upgrade_peer` (line 193),** when a peer is upgraded to PEER trust, call `hive_mind.register_agent(agent_id=peer_id, agent_type='remote_peer', latent_dim=2048, capabilities=[...])` so `think_together` actually has remote agents to fuse.

None of these three exist today.

---

## Three-question answer (code-grounded)

**Q1. Can flat/regional/central users share intelligence as a Hive MoE expert pool?**
**PARTIAL.** Same-user devices share via `compute_mesh_service` (modal tool offload only — vision/TTS/video). Cross-tier chat goes to a single cloud expert via `_pick_expert_for_delegate('hive') → get_expert_model()` — that's "one cloud LLM", not "pool". The fan-out primitives (`link_manager.collect`, `hive_mind.fuse_thoughts`) exist but no chat code calls them.

**Q2. Can an agent dynamically call other expert agents?**
**PARTIAL.** `ExpertAgentRegistry` (96 personas) is consulted by `create_recipe.match_expert_for_context` to bias prompt construction — agent A *becomes* the expert, it does not *call* a separate expert agent. `_handle_agentic_router_tool` (`hart_intelligence_entry.py:2525`) routes a request to a matching existing agent, but that's serial re-dispatch, not parallel consultation. Distributed task coordinator (`distributed_agent/api.py`) lets agents claim tasks from a shared pool — agent-level work distribution, not "agent A asks agent B mid-turn".

**Q3. Where is the expert picker, peer fan-out, response fuser — REAL vs GAP?**
- **Picker (REAL but tier-only):** `speculative_dispatcher.py:651` `_pick_expert_for_delegate`. Tier-based, not capability-based.
- **Peer fan-out primitive (REAL):** `link_manager.py:166` `collect`. **Wire to chat (GAP).**
- **Fusion math (REAL):** `hive_mind.py:1428` `fuse_thoughts`. **Wire to chat (GAP).**
- **In-flight bridge (REAL):** `world_model_bridge.query_hivemind:640` calls collect+fuse end-to-end. **Called from chat (GAP).**

---

## §19 — Recipe Creation Pipeline (`create_recipe.py`, 4844L)

The agentic pipeline that turns a natural-language goal into a 6-agent autogen GroupChat, a persistent SmartLedger task DAG, and a saved recipe replayable by §20.

### §19.1 Entry chain
- **API entry:** `recipe(user_id, text, prompt_id, file_id, request_id)` — `create_recipe.py:4675`. Called from `hart_intelligence_entry.get_response_group` (creation-mode dispatch).
- **Session boot:** `initialize_with_resume(user_id, prompt_id)` — `create_recipe.py:4599`. Reloads SmartLedger if one exists on disk, else builds fresh.
- **Agent factory:** `create_agents(user_id, task, prompt_id)` — `create_recipe.py:760`. Returns the 6-agent ensemble and wires the GroupChat.

### §19.2 The 6 autogen agents (single-user, in-process)
| Agent | Role | Tools |
|---|---|---|
| `Assistant` | Persona + cultural wisdom + goal-aware prompt | No tools — plans/routes only |
| `Helper` | Generic tool host | ~30 tools (vision, memory, scheduler, google_search, consult_expert, create_new_agent, execute_windows_or_android_command, execute_coding_task, Generate_video) |
| `Executor` | Python code runner (work_dir="coding", no Docker) | Code execution only |
| `StatusVerifier` | JSON-schema verdicts over Assistant output | No tools — status reporter |
| `UserProxy` (`User`) | Author — human/synthetic messages | `human_input_mode="NEVER"`, 0 auto-reply |
| `ChatInstructor` | Side-channel kick-off proxy | `"TERMINATE"` default reply |

All built at `create_recipe.py:760-2289`. GroupChat at `create_recipe.py:2287` with `speaker_selection_method=state_transition`, `role_for_select_speaker_messages='user'` (Qwen3.5 Jinja fix), `send_introductions=False`.

### §19.3 Speaker routing (`state_transition` at `create_recipe.py:1766`)
Regex over `messages[-1]["content"]`:
- `@Helper` / `@helper` → Helper
- `@Executor` / `@executor` → Executor
- `@StatusVerifier` → StatusVerifier
- `@user {…}` / user-directed JSON → UserProxy
- `TERMINATE` → None (stop)
- Otherwise → `"auto"` (autogen selector LLM)

Watchdog heartbeat at `create_recipe.py:1773` preempts the chain if the user types again (`create_recipe.py:1791`).

### §19.4 Expert injection — prompt decoration only
`match_expert_for_context(_actions_text)` — `create_recipe.py:2548` (also 204, 991, 3363). Returns `{name, prompt_block}`. `_expert_block` is concatenated into Assistant's system_message. **The matched expert is never instantiated as a separate agent.** `consult_expert` tool at `create_recipe.py:1001` does the same at runtime — returns the `prompt_block` text, caller keeps acting as the expert.

### §19.5 Ledger binding
`create_action_with_ledger` at `create_recipe.py:3186`:
1. `backend = get_production_backend()` — Redis if available, JSON fallback (`agent_ledger.factory`).
2. `ledger = create_ledger_from_actions(user_id, prompt_id, actions, backend=backend)` — one Task per planned action, ordered by `prerequisites`.
3. `register_ledger_for_session(user_prompt, ledger)` — ActionState → Task auto-sync.
4. `TaskDelegationBridge(a2a_context, ledger)` — wires `a2a_context.skill_registry` delegations into the ledger.
5. `user_tasks[user_prompt].set_ledger(ledger)` — Action instance knows its backing Task.

### §19.6 Execution + dynamic discovery
- **Task routing:** after each autogen turn, `complete_action_and_route(action_id, outcome, result)` — `create_recipe.py:2976` — calls `ledger.complete_task_and_route`, unblocks dependent Tasks, returns `get_next_executable_task()`.
- **Autonomy gate:** `should_continue_autonomously` — `create_recipe.py:3118` — uses the ledger's next-task output; no heuristic.
- **LLM task discovery:** `detect_and_add_dynamic_tasks` — `create_recipe.py:3035` — Assistant can propose a NEW Task; `ledger.add_dynamic_task(desc, ctx)` (`core.py:2325`) runs an LLM classifier to decide `child|sibling|sequential|conditional|independent`, sets prereqs/delegation/scheduling/retry, attaches to DAG.
- **Hallucination defense:** `create_recipe.py:3498-3572` — LLM-claimed `action_id` cross-referenced against pipeline state; `_claimed_task.verify_integrity()` (SHA-256 over task data) rejects corrupted replays.
- **Recipe persistence:** per action at `create_recipe.py:2043, 2089` → `{PROMPTS_DIR}/{prompt_id}_{flow}_{action_id}.json`; per flow at `_save_flow_recipe` (`create_recipe.py:4333`) → `{prompt_id}_{flow}_recipe.json`. Single writer = no parallel save path.
- **Tool execution fan-out:** `execute_windows_or_android_command` (`create_recipe.py:1006`) is the 3-tier VLM path (in-process → HTTP `:9890/autogen_response` → WAMP `com.hertzai.hevolve.action.{user_id}`). `execute_coding_task` (`create_recipe.py:1431`) spawns subprocess to KiloCode/Claude/OpenCode/Aider/Claw and is explicitly marked "LEAF tool — never re-dispatches to /chat".
- **Ingest hook:** `_unified_ingest_hook` (`create_recipe.py:2311`) — every GroupChat message mirrors to SimpleMem + shared LangChain buffer + `PersistentChatHistory` + `MemoryGraph`.

---

## §20 — Recipe Reuse Pipeline (`reuse_recipe.py`, 3639L)

When `get_flow_number(user_id, prompt_id)` resolves to a previously-saved recipe, chat bypasses creation and replays the stored actions under the same 6-agent ensemble.

### §20.1 Lookup
- **Recipe load:** `reuse_recipe.py:839` — opens `{PROMPTS_DIR}/{prompt_id}_{role_number}_recipe.json`, populates `recipes[user_prompt]` and `final_recipe[prompt_id]`.
- **Role gating:** `reuse_recipe.py:875-879` — only actions where `action['persona'] == role` run for this user_proxy.
- **VLM merge:** `load_vlm_agent_files(prompt_id, role_number)` at `reuse_recipe.py:853` — replaces or appends VLM-generated actions onto the stored recipe (same `action_id` wins).

### §20.2 Ledger resume
`reuse_recipe.py:891-919`:
1. `user_tasks[user_prompt] = Action(role_actions)` — rebuild Action instance from stored JSON.
2. Backend: same `get_production_backend()` + `create_ledger_from_actions`.
3. First action jumped straight to `ASSIGNED` → `IN_PROGRESS` via `safe_set_state(user_prompt, 1, …)` — no re-planning phase.
4. `set_ledger(ledger)` attaches so ActionState → ledger auto-sync continues.
5. `TaskDelegationBridge` rebuilt if missing (`reuse_recipe.py:913-916`).

### §20.3 Agent-to-agent in reuse mode
Same 6-agent ensemble (`create_agents_for_user` at `reuse_recipe.py:792`), same regex `state_transition`, same tools. Expert consult is the same `match_expert_for_context` pattern at `reuse_recipe.py:1653-1654` — prompt decoration, not invocation. **Reuse does NOT call another agent's recipe as a sub-routine.** To "call agent B", the stored recipe must contain a `create_new_agent` action or a `delegate_to_specialist` tool call, both of which route through `TaskDelegationBridge` in-process.

### §20.4 Divergence from create
- Prompt says *"use the pre-tested Recipe, do not create new implementations unless it fails"* (`reuse_recipe.py:970`).
- `experience_hints` block (`reuse_recipe.py:936-941`) injects prior-run telemetry from `recipe_experience.build_experience_hints(individual_recipe)` — dead-ends to avoid, known-good params to reuse.
- Personality + resonance profile preloaded from `core.agent_personality.load_personality(str(prompt_id))` (`reuse_recipe.py:944-957`) so the reused agent keeps its persona.
- No `create_agents` retry loop — if the stored recipe's actions fail, control returns to StatusVerifier and may escalate via `add_dynamic_task` (same mechanism as §19.6).

---

## §21 — Agent Ledger (`agent-ledger-opensource`, ~5519L, 9 files)

Framework-agnostic persistent task DAG. The spine that ties create_recipe, reuse_recipe, and distributed_agent together. MIT-licensed, zero required deps; Redis/Mongo/Postgres optional.

### §21.1 Package surface (`agent_ledger/__init__.py:38-89`)
- `SmartLedger`, `Task`, `TaskType`, `TaskStatus`, `ExecutionMode`, `TaskLocality`, `TaskSensitivity` — core.
- `BlockedReason`, `FailureReason`, `PendingReason` — sub-state enums.
- `get_production_backend`, `create_ledger_from_actions`, `enable_vlm_integration` — utilities.
- `TaskGraph`, `TaskStateMachine`, `analyze_ledger` — DAG analytics.
- `StorageBackend`, `InMemoryBackend`, `RedisBackend`, `JSONBackend`, `MongoDBBackend`, `PostgreSQLBackend` — pluggable persistence.
- `TaskVerification`, `TaskBaseline`, `LedgerPubSub`, `AgentHeartbeat`, `DistributedTaskLock` — distributed-tier features (Redis-required).

### §21.2 Task state machine (`core.py:105-168`, `_validate_transition` at `core.py:568-619`)
15 states: `PENDING, DEFERRED, IN_PROGRESS, DELEGATED, PAUSED, USER_STOPPED, BLOCKED, COMPLETED, FAILED, CANCELLED, TERMINATED, SKIPPED, NOT_APPLICABLE, ROLLED_BACK, RESUMING`. Terminal: {COMPLETED, FAILED, CANCELLED, TERMINATED, SKIPPED, NOT_APPLICABLE, ROLLED_BACK}. Validated transition table — bypassing it is logged + refused.

### §21.3 Task fields that matter for the hive
- **Ownership:** `owner_node_id`, `owner_user_id`, `owner_prompt_id`, `ownership_history` — `core.py:280-284`. `claim/release/transfer` at `core.py:1019-1092`.
- **Locality + sensitivity:** `TaskLocality ∈ {LOCAL_ONLY, REGIONAL, GLOBAL}` (`core.py:171`), `TaskSensitivity ∈ {PUBLIC, INTERNAL, CONFIDENTIAL, SECRET}` (`core.py:177`). `can_distribute()` at `core.py:1225` returns False only for `LOCAL_ONLY` or `SECRET`. `can_distribute_to_region()` at `core.py:1239` gates at REGIONAL/GLOBAL.
- **Integrity:** `data_hash` + `result_hash` SHA-256 (`core.py:1247-1277`, `verify_integrity()`, `seal_integrity()`).
- **Budget/SLA:** `spark_budget`, `time_budget_s`, `timeout_s`, `deadline`, `sla_target_s`, `sla_breached` (`core.py:287-298`). `is_budget_exhausted()` + `is_sla_breached()` — agent decides action, ledger just reports.
- **Heartbeat per-task:** `last_heartbeat_at`, `heartbeat_interval_s`, `status_messages[]` bounded to 50 entries (`core.py:1149-1199`).

### §21.4 Dependency engine (`core.py:1934-2015` `_handle_task_completion`)
BFS walk: when Task X completes, collect every Task with `X in prerequisites` OR `X in dependent_task_ids`, deliver messages, `remove_blocking_task(X)`, auto-resume if `BLOCKED → PENDING → RESUMING`, then enqueue *their* dependents. Full chain unblocked in one pass. Emits `task_completed` event.

### §21.5 Dynamic task discovery (`core.py:2325-2506` `add_dynamic_task`)
LLM classifier (`_classify_task_relationship` at `core.py:2508`) returns JSON with `relationship, prerequisites, blocked_by, condition, delegation, scheduling, retry_config, can_run_parallel_with`. All 9 classification outcomes wired to real Task fields. If LLM call fails → `"independent"` default. `_get_default_llm_client` (`core.py:2618`) explicitly raises `NotImplementedError` — package stays framework-agnostic; callers pass their own.

### §21.6 Orchestration (`core.py:2632-2806`)
- `get_next_executable_task()` — filter non-terminal non-BLOCKED/DELEGATED/DEFERRED, sort by priority desc, then per-task gate: children complete → prereqs complete → outcome condition satisfied → blockers resolved → return.
- `get_parallel_executable_tasks()` — same gates but requires `execution_mode == PARALLEL` + `pending_reason == 'ready'`.
- `complete_task_and_route(task_id, outcome, result)` — marks done (success ⇒ `complete()`, failure ⇒ retry up to `max_retries` then `FAILED`), notifies dependents via `received_messages`, unblocks parent via `_check_and_unblock_parent`, returns next task.

### §21.7 Distributed-tier features (Redis-required, all optional)
- **`DistributedTaskLock` (`distributed.py`, 128L):** Redis `SET NX EX` for atomic claim, Lua `check-then-delete` for safe release. `reclaim_stale_tasks(heartbeat)` cross-refs lock owner vs heartbeat liveness — dead agent's locks get freed.
- **`LedgerPubSub` (`pubsub.py`, 142L):** Redis PUBSUB on `agent_ledger:task_update`, `:delegation`, `:agent_announce`, `:heartbeat`, `:verification`. Listener thread drops self-originated messages. `SmartLedger._generate_event` (`core.py:2017-2059`) auto-broadcasts `task_completed` → `publish_task_update` with result_hash; `task_delegated` → `publish_delegation` with from_agent/to_agent. Activated via `ledger.enable_pubsub(redis_client)` at `core.py:1374`.
- **`AgentHeartbeat` (`heartbeat.py`, 129L):** Redis `SETEX` every 30s with 90s TTL. `is_agent_alive(agent_id)`, `get_alive_agents()`, `get_stale_agents(known_ids)`. Daemon thread, stops on process exit. Activated via `ledger.enable_heartbeat(redis_client, host_info)` at `core.py:1380`.
- **`TaskVerification` (`verification.py`, 236L):** SHA-256 over sorted-JSON result. `record_verification(task_id, hash, verifier, verified)` → Redis list `agent_ledger:verification:{task_id}`. `get_verification_status` computes consensus (majority verified). `requires_verification(min_verifiers=2)` gates trust.
- **`TaskBaseline` (`verification.py:109`):** per-ledger snapshots for compare-to-previous diffs (task_count, status-change list, new/removed tasks).

### §21.8 Factory selection (`factory.py:23-93`)
`create_production_ledger(agent_id, session_id)` tries Redis first → MongoDB → JSON. `create_ledger_from_environment` reads `REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/USE_REDIS/MONGO_*`. `get_or_create_ledger` singleton-caches by `agent_id_session_id`. This is why create_recipe/reuse_recipe both use `get_production_backend()` and get the same ledger across a session.

---

## §22 — Connection to the MoE / Agent-to-Agent Question

Restating §18-Q2 with recipe+ledger evidence in hand.

### §22.1 Within a single user_prompt (same tier, same process)
- **Decoration (`match_expert_for_context`):** agent A becomes the matched expert by prompt concatenation. Not A→B.
- **Tool delegation (`delegate_to_specialist` at `create_recipe.py:1634`):** `TaskDelegationBridge.delegate_task_with_tracking(parent_task_id, from_agent='assistant', task_description, required_skills, context)` — looks up a matching `a2a_context.skill_registry` entry (in-process skill objects), marks parent task `DELEGATED`, returns result. The "specialist" is a function object already registered on the SAME process's skill_registry, not a remote agent. Emits `task_delegated` event → `LedgerPubSub.publish_delegation` IF PubSub enabled.
- **Dynamic child spawn (`add_dynamic_task`):** LLM classifies a new need; ledger attaches a child/sibling/sequential Task under the same ledger. Still same process. The new Task runs under the SAME 6-agent GroupChat.
- **`create_new_agent` tool:** creates a new `prompt_id` (new recipe, new agent config) persisted to disk. Next user message to that `prompt_id` boots a fresh GroupChat. Not in-turn hand-off; a new session.

### §22.2 Across a single user, multiple devices (same tier)
- `compute_mesh_service` (already covered §10) only distributes MODAL tools (vision, TTS, video) — unchanged. Recipe+ledger run on the originating device.

### §22.3 Across tiers (flat ↔ regional ↔ central) — WHERE AGENT-TO-AGENT BECOMES REAL
All paths below require shared Redis. If Redis is unavailable, `get_production_backend` falls back to JSON file storage — which is local-only, and all the distributed events become no-ops.

1. **Heartbeat (`AgentHeartbeat.start()`):** each process self-registers `agent_ledger:heartbeat:{agent_id}` in Redis. Any node sharing Redis can `is_agent_alive(agent_id)` or `get_alive_agents()`. This is the agent "phonebook" across tiers.
2. **Announcement (`LedgerPubSub.publish_agent_announce(capabilities, host_info)`):** nodes can broadcast their skill list. A receiver (distributed_agent coordinator) can route `delegate_task` to an agent whose `capabilities` match. NO code in HARTOS today listens to `CHANNEL_AGENT_ANNOUNCE` during chat — it's defined but not subscribed in the chat path.
3. **Delegation broadcast (`LedgerPubSub.publish_delegation`):** fired from `SmartLedger._generate_event` when `delegate_task` runs and PubSub is enabled (`core.py:2051-2057`). Any subscribing node sees `{task_id, from_agent, to_agent, description}`. The *receiving* agent must (a) be subscribed, (b) have a handler that claims `to_agent == self.agent_id`, (c) claim the Task via `DistributedTaskLock.try_claim_task`, (d) execute, (e) `complete_delegation`, (f) the originating ledger observes via `publish_task_update` and calls `complete_delegation` on its copy.
4. **Completion broadcast (`LedgerPubSub.publish_task_update`):** fires automatically on `task_completed` events with `result_hash`. Cross-tier listeners can verify via `TaskVerification.record_verification`.
5. **Verification request (`publish_verification_request`):** an originating agent can ask N peers to re-compute result + hash and record verified/rejected. `requires_verification(min_verifiers=2)` is the gate. Basis for cross-tier trust.
6. **Stale reclaim (`DistributedTaskLock.reclaim_stale_tasks(heartbeat)`):** if the delegated-to agent dies mid-task, any peer can reclaim — owner released, Task returns to PENDING, another agent (any tier) can claim.

**All 6 primitives exist.** What's missing in HARTOS is a subscriber loop that joins a `distributed_agent` service to PubSub and actually acts on `CHANNEL_DELEGATION`/`CHANNEL_AGENT_ANNOUNCE` for chat-originated Tasks. §9 `distributed_agent/api.py` has task CRUD endpoints and a coordinator, but the chat path (`hart_intelligence_entry.get_response_group` → `create_recipe.recipe`) does NOT publish `enable_pubsub(redis_client)` on its ledger by default. Until `init_social(app)` (or equivalent boot) calls `ledger.enable_pubsub(...)` for the session ledger, cross-tier delegation is silent.

### §22.4 Verdict
**§22.4 YES/PARTIAL/NO: PARTIAL.** The ledger ships a complete signed-delegation + heartbeat + lock + verify stack across Redis PubSub (`distributed.py`, `pubsub.py`, `heartbeat.py`, `verification.py`), and `core.py:2037-2058` auto-broadcasts `task_completed`/`task_delegated` whenever `enable_pubsub` was called. But the chat pipeline (create_recipe/reuse_recipe) never calls `ledger.enable_pubsub(redis_client)`; agents only delegate *within* the same process's `a2a_context.skill_registry`. The plumbing to turn recipe A on tier X into a delegated Task executed by recipe B on tier Y is installed but unwired at the chat boot site. Flip one switch at recipe init (`if redis_backend: ledger.enable_pubsub(redis_backend.redis_client); ledger.enable_heartbeat(...)` + subscribe a handler) and cross-tier agent-to-agent becomes real.

---

## §23 — Recipe × Agent Ledger × MoE: Joint Data Flow

```
  ┌───────────────────────── USER TIER (flat, single device) ─────────────────────────┐
  │                                                                                     │
  │  User msg ──► /chat ──► hart_intelligence_entry.get_response_group                  │
  │                            │                                                         │
  │                            ▼                                                         │
  │                 speculative_dispatcher.dispatch_draft_first  (0.8B classifier)       │
  │                            │                                                         │
  │              ┌─────────────┼──────────────┬──────────────┐                            │
  │              ▼             ▼              ▼              ▼                             │
  │         casual_conv    agentic CREATE  agentic REUSE   delegate='hive'                 │
  │         (main 4B)         │                │             (single cloud LLM)            │
  │                           ▼                ▼              via _pick_expert_for_delegate│
  │                  create_recipe.recipe  reuse_recipe.recipe         (§18 current)       │
  │                           │                │                                            │
  │                           ▼                ▼                                            │
  │      ┌────────── 6-agent autogen GroupChat (Assistant+Helper+Executor+Verify+UserProxy+│
  │      │          ChatInstructor)   — speaker_selection = state_transition (regex)       │
  │      │                                                                                  │
  │      │  prompt decorated with:                                                          │
  │      │    • match_expert_for_context → prompt_block (96 experts, Jaccard)                │
  │      │    • cultural_wisdom.get_cultural_prompt()                                        │
  │      │    • core.agent_personality + resonance_profile                                   │
  │      │    • recipe_experience.build_experience_hints (reuse only)                        │
  │      │                                                                                   │
  │      │  tools (via @Helper, @Executor):                                                  │
  │      │    • consult_expert          ─► returns prompt_block (NOT invocation)             │
  │      │    • delegate_to_specialist  ─► TaskDelegationBridge (in-process skill_registry)  │
  │      │    • create_new_agent        ─► creates NEW prompt_id + recipe on disk            │
  │      │    • execute_coding_task     ─► subprocess KiloCode/Claude/OpenCode (LEAF)        │
  │      │    • execute_windows_or_android_command ─► VLM 3-tier (in-proc | :9890 | WAMP)    │
  │      │    • search_long_term_memory / save_to_long_term_memory (SimpleMem + MemoryGraph) │
  │      └──────────────────┬──────────────────────────────────────────────────────────────  │
  │                         │                                                                 │
  │                         ▼                                                                 │
  │          ┌──── SmartLedger (agent_ledger) ───────────────────────────────────────┐        │
  │          │  Task DAG   |   15-state machine   |   parent/child/sibling           │        │
  │          │  claim/release/transfer (ownership)  |   data_hash + result_hash      │        │
  │          │                                                                        │        │
  │          │  create_ledger_from_actions(user_id, prompt_id, actions,               │        │
  │          │    backend=get_production_backend())    ← Redis → JSON fallback        │        │
  │          │                                                                        │        │
  │          │  add_dynamic_task(desc, ctx)  ← LLM classifier chooses                 │        │
  │          │    relationship/prereqs/delegation/scheduling                          │        │
  │          │                                                                        │        │
  │          │  complete_task_and_route(task_id, outcome, result)                     │        │
  │          │   ├─ _handle_task_completion(task) → BFS unblock dependents            │        │
  │          │   ├─ _check_and_unblock_parent(task_id)                                │        │
  │          │   └─ returns next task via get_next_executable_task()                  │        │
  │          │                                                                        │        │
  │          │  Persistence: {prompt_id}_{flow}_{action}.json + {prompt_id}_{flow}_   │        │
  │          │               recipe.json (single writer _save_flow_recipe)            │        │
  │          │  Memory mirror: _unified_ingest_hook → SimpleMem + LangChain buffer +  │        │
  │          │                 PersistentChatHistory + MemoryGraph                    │        │
  │          └────┬───────────────────────────────────────────────────────────────────┘        │
  └───────────────┼─────────────────────────────────────────────────────────────────────────── ┘
                  │   enable_pubsub(redis)  [OPTIONAL — NOT called by chat boot today]
                  ▼
     ┌─────── SHARED REDIS (REGIONAL / CENTRAL) ─────────────────────────────┐
     │                                                                         │
     │  agent_ledger:heartbeat:{agent_id}   ← 30s SETEX, 90s TTL                │
     │  agent_ledger:lock:{task_id}         ← SET NX EX + Lua release           │
     │                                                                         │
     │  PUBSUB channels:                                                       │
     │    agent_ledger:task_update    ← auto (task_completed + result_hash)     │
     │    agent_ledger:delegation     ← auto (task_delegated)                   │
     │    agent_ledger:agent_announce ← manual (capability broadcast)           │
     │    agent_ledger:heartbeat      ← (manual)                                │
     │    agent_ledger:verification   ← publish_verification_request            │
     │                                                                         │
     │  Redis lists:                                                           │
     │    agent_ledger:verification:{task_id}   ← consensus tally               │
     │                                                                         │
     └────────────┬────────────────────────────────────────────────────────────┘
                  │
                  ▼
     ┌─────── PEER TIER (regional / central node, separate process) ─────────┐
     │                                                                         │
     │  Would-be agent_ledger subscriber:                                      │
     │    pubsub.subscribe([CHANNEL_DELEGATION, CHANNEL_AGENT_ANNOUNCE],       │
     │                      handler)                                           │
     │    handler: if msg["to_agent"] == self.agent_id:                        │
     │      DistributedTaskLock.try_claim_task(task_id, self.agent_id)         │
     │      … execute the task under its OWN create_recipe/reuse_recipe …      │
     │      SmartLedger.complete_delegation(task_id, result)                   │
     │      (auto publishes task_update back to origin)                        │
     │                                                                         │
     │  STATUS IN HARTOS TODAY: no handler is registered. distributed_agent/   │
     │  api.py has task CRUD endpoints and a coordinator but the chat-ledger   │
     │  bind (enable_pubsub) never fires, so cross-tier agent-to-agent is      │
     │  SILENT. Wiring is a ~10-line change at recipe init.                    │
     └─────────────────────────────────────────────────────────────────────────┘

  LEGEND:  real+wired ── | real+unwired  --  | mental gap [×]
           single-writer recipe persistence: ONLY _save_flow_recipe; no parallel path.
           single-writer language pref: core.user_lang.set_preferred_lang (see §3 spec).
```

**Bottom line:** the recipe pipeline owns planning+execution; the agent_ledger owns the Task DAG plus optional distributed trust primitives; cross-tier agent-to-agent is fully plumbed but chat never flips `enable_pubsub` on the session ledger. Fix is one boot-time call + one subscriber loop.
