# Hevolve / HARTOS / Nunba ecosystem context

**This file is the shared knowledge base. Every specialist agent in this directory reads from it so their reviews are grounded in the same architectural reality.**

## The five repos

| Repo | Role | Path | Pip-installable | Primary tech |
|---|---|---|---|---|
| **Hevolve_Database** | Canonical data layer — 156+ SQLAlchemy models, migrations, class names `SocialUser` / `SocialPost` | `hertz-ai/Hevolve_Database` | yes | Python, SQLAlchemy, MySQL (canonical), SQLite (flat) |
| **HARTOS** | Runtime agentic layer — LangChain + autogen + draft-first dispatcher + model lifecycle + service tools | `C:\Users\sathi\PycharmProjects\HARTOS` | yes | Python, Flask, LangChain, autogen, llama.cpp |
| **Nunba-HART-Companion** | Desktop companion — own React SPA + Python Flask host + llama-server + TTS/STT/VLM runtime | `C:\Users\sathi\PycharmProjects\Nunba-HART-Companion` | no (desktop bundle via cx_Freeze) | Python, React, Flask, llama.cpp, Crossbar WAMP |
| **Hevolve** | Cloud web frontend — Hevolve.ai site, social features, admin console | `hertz-ai/Hevolve` (separate repo) | no | React, hosted |
| **Hevolve_React_Native** | Android/iOS companion with Liquid UI overhaul | `C:\Users\sathi\StudioProjects\Hevolve_React_Native` | no | React Native, Zustand, Java/Kotlin native layer |

**Nunba ≠ Hevolve web.** Two separate React codebases. Frontend changes must go to BOTH when relevant. Nunba uses BrowserRouter, `/social/*` routes, `/local` for chat.

**Hevolve_Database is CANONICAL.** HARTOS's `_models_local.py` is a standalone fallback with simpler class names. New models must land in BOTH.

## Dependency chain

```
Nunba → HARTOS (pip) → hevolve-database + hevolveai (transitive)
Hevolve_React_Native → HARTOS API (HTTP) + Crossbar WAMP
Hevolve web → HARTOS API (HTTP) + Hevolve_Database (direct DB)
```

Nunba and HARTOS share ~80% of the Python surface but Nunba bundles its own `python-embed/` and its own llama-server binary. A code change to HARTOS must also be a safe change for Nunba's bundled copy.

## Topology tiers (`HEVOLVE_NODE_TIER`)

| Tier | DB | Trust model | Typical deployment |
|---|---|---|---|
| `flat` | SQLite (NullPool, WAL, busy_timeout=3s) | Single-user, in-process trusted | Nunba desktop (bundled via cx_Freeze) |
| `regional` | MySQL (QueuePool, pool_size=20) | LAN-trusted or gateway-auth'd | Small office, on-prem |
| `central` | MySQL | Publicly exposed, Bearer JWT required on protected paths | Cloud (Hevolve.ai) |

`security/middleware.py::_apply_api_auth` has TWO path tuples:
- `ADMIN_PATHS = ('/api/admin',)` — auth required on EVERY tier (fix B1 from 2026-04-11)
- `NETWORK_PROTECTED_PATHS` — auth required only on central

## Ports

| Port | Service | Notes |
|---|---|---|
| 5000 | Nunba Flask | SPA host + /chat + /api/* |
| 5460 | WebSocket | VisionService frame receiver |
| 6777 | HARTOS Flask | Alt port on some deployments |
| 6778 | langchain_gpt_api | Intent routing |
| 8080 | Main llama-server | 4B-VL with mmproj (eager-boot) |
| 8081 | Draft llama-server | 0.8B-VL caption/classifier (eager-boot, **pinned** in lifecycle) |
| 8088 | Crossbar | WAMP router (all realtime push) |
| 9891 | MiniCPM sidecar | **may be parallel path to 0.8B — see T8** |

## Model lifecycle policy (post-2026-04-12 fix)

`ModelState` has two eviction-policy flags (`integrations/service_tools/model_lifecycle.py`):

- `pinned=True` — always ACTIVE, never evicted. Applied to the draft 0.8B which is first-contact for every chat.
- `pressure_evict_only=True` — survives passive idle sweep, still evicts under real VRAM/RAM/CPU pressure. Applied to main 2B/4B chat LLMs.
- Neither flag (default) — passive idle eviction per `idle_timeout_s`. Applied to whisper, TTS engines, minicpm, mobilevlm.

## Real-time push

**ALL push uses Crossbar WAMP** — never SSE, never raw WebSocket. This is non-negotiable.

| Topic | Purpose |
|---|---|
| `com.hertzai.hevolve.chat.{user_id}` | Agent thoughts, thinking bubbles, final chat replies |
| `com.hertzai.pupit.{user_id}` | TTS audio URLs (frontend subscribes and plays) |
| `com.hertzai.hevolve.game.{session_id}` | Kids game state |
| `com.hertzai.longrunning.log` | Task status events for dashboards |

Web uses a Web Worker (`crossbarWorker.js`) + `gameRealtimeService.js` bridge. React Native uses native Java `AutobahnConnectionManager` → `DeviceEventEmitter` → `realtimeService.js`.

## Chat routing pipeline

```
User message → /chat endpoint (hart_intelligence_entry.py)
    ↓
[first contact] draft 0.8B classifier (speculative_dispatcher.dispatch_draft_first)
    ↓ emits {reply, delegate, is_casual, is_correction, is_create_agent, channel_connect, confidence}
    ├─ delegate=none + confident → return draft reply as final (no LLM hop)
    ├─ delegate=local → schedule local FAST model (4B) in background
    ├─ delegate=hive → schedule EXPERT model (cloud) in background
    ↓
Full LangChain ReAct path OR reuse path (chat_agent from reuse_recipe)
    ↓
_chat_reply helper (hart_intelligence_entry.py) → fires TTS synth + publishes to pupit topic
```

**Chat intent classification is owned by the draft 0.8B.** No Python-side regex/keyword classifiers allowed anywhere in the pipeline. Callers that want to skip HTTP for casual messages must consult the draft's `is_casual` flag.

## Action + profile fetch (`core/user_context.py`)

Single canonical resolver for `(user_details, actions)` tuple. Three call sites (hart_intelligence_entry, create_recipe, reuse_recipe) all delegate. Two speed layers:
1. 30-second per-user TTL cache via `core.session_cache.TTLCache`
2. 1.5-second hard hot-path budget via `ThreadPoolExecutor.submit(...).result(timeout=...)` with background refresh on timeout

## Known broken / noisy state (2026-04-11 log audit)

| Issue | Severity | Status |
|---|---|---|
| Chatterbox + CosyVoice metadata missing in python-embed | 🔴 TTS ladder | pending |
| Backend 5-min GIL stalls | 🟠 latency | daemon heartbeat cascade fixed, root cause unknown |
| HMAC secret Access denied on `agent_data/` | 🟠 federation | pending |
| Origin attestation: missing LICENSE file | 🟡 cosmetic | pending |
| Agent engine blueprint dup registration | 🟡 dup init | pending |
| MiniCPM sidecar unhealthy after 120s | 🟡 VLM | **may be parallel path to 0.8B — T8** |
| NunbaVault decryption fails on machine identity change | 🟡 migration | pending |
| M1 compute-relay caller_authid binding | 🔴 security | pending |
| gpu_worker race cluster | 🟠 races | pending |

## Engineering principles (enforced by reviewer + specialist agents)

1. **No parallel paths** — if two code paths solve the same problem, unify to one.
2. **DRY at every boundary** — mapping tables, registries, shared helpers, not copy-paste.
3. **SRP (single responsibility)** — each module / function owns ONE concern.
4. **Single source of truth** — one place for the canonical fact, all consumers read from there.
5. **No Python-side classifiers** — chat intent = draft 0.8B, nothing else.
6. **Thread-safety on shared state** — locks, TTL eviction, bounded queues, backpressure.
7. **Backward compat** — new fields get defaults; deleted fields are ignored gracefully.
8. **Multi-OS parity** — every change must work on Windows, macOS, Linux (and Android for things that touch the mobile app).
9. **Test both FT and NFT** — happy path + error paths + edge cases + thread safety + degraded-mode + performance bounds.
10. **Never skip hooks, never force-push, never amend a published commit.** Small, focused, well-messaged commits.
