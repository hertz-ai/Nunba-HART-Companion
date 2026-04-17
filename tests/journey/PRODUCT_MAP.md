# PRODUCT_MAP.md — Nunba + HARTOS + Hevolve_Database + Hive-node

Single authoritative map of every user-reachable functional surface of the
Nunba desktop stack and its distributed HARTOS companion. Derived by walking
the actual code trees on 2026-04-17. Every row is cited as `file:line`.

Scope: desktop Nunba Flask on :5000, HARTOS pip-installed subsystems,
embedded Crossbar on :8088, llama-server pair on :8080 + :8081, MiniCPM
sidecar, React SPA (Nunba landing-page/ + Hevolve cloud src/), React Native
parity app, and the Hevolve_Database canonical ORM.

Legend
  [Local]   — loopback-only, no auth required
  [Bearer]  — requires `Authorization: Bearer <mcp.token>` OR loopback
  [Admin]   — requires admin session / admin_bp `url_prefix='/api/admin'`
  [Public]  — fan-out to all authenticated WAMP subscribers (rate-limited)
  [GAP]     — described/planned but not present in code; phase-2 must skip

────────────────────────────────────────────────────────────────────────────
## 1  Flask HTTP routes

### 1.1 Core Nunba app (main.py, Flask :5000)
| Method | Path | Purpose | Auth | File:line |
|---|---|---|---|---|
| GET  | `/` | Serves landing-page SPA shell | [Local] | main.py:2324 |
| GET  | `/local` | Serves social SPA shell | [Local] | main.py:2349 |
| GET  | `/probe` | Liveness probe (returns PID, uptime) | [Local] | main.py:811 |
| POST | `/execute` | Execute queued action (automation) | [Local] | main.py:838 |
| GET  | `/screenshot` | Return a desktop screenshot (pyautogui) | [Local] | main.py:939 |
| GET  | `/status` | Server + PID + tray status | [Local] | main.py:2126 |
| GET  | `/debug/routes` | Dump the full URL map | [Local] | main.py:2299 |
| GET  | `/test-api` | Sanity ping | [Local] | main.py:2312 |
| GET  | `/api/connectivity` | Backend reachability matrix | [Local] | main.py:2368 |
| POST | `/publish` | In-process WAMP publish bridge | [Local] | main.py:2491 |
| GET  | `/api/wamp/status` | Embedded Crossbar status | [Local] | main.py:2524 |
| GET  | `/api/wamp/ticket` | Mint per-user WAMP subscribe ticket | [Local] | main.py:2535 |
| POST | `/api/jslog` | Renderer console → server.log bridge | [Local] | main.py:2551 |
| GET  | `/api/social/events/stream` | SSE fan-out for notifications | [Local] | main.py:2561 |
| GET  | `/s/<token>` | Share-link landing for posts | [Public] | main.py:2633 |
| GET  | `/static/<path>` | React build static | [Local] | main.py:2684 |
| GET  | `/fonts/<path>` | Fonts | [Local] | main.py:2691 |
| GET  | `/backend/watchdog` | Watchdog health | [Local] | main.py:2138 |
| GET  | `/backend/health` | Deep backend probe | [Local] | main.py:2157 |
| GET  | `/api/v1/system/tiers` | Tier registry (flat/regional/central) | [Local] | main.py:2216 |
| GET  | `/api/image-proxy` | CORS-bypass image fetch | [Local] | main.py:2244 |

### 1.2 LLM / AI control (main.py)
| Method | Path | Purpose | Auth | File:line |
|---|---|---|---|---|
| GET  | `/indicator/stop` | Stop the desktop indicator | [Local] | main.py:978 |
| GET  | `/llm_control_status` | LLM control status | [Local] | main.py:1018 |
| GET  | `/api/llm/status` | LLM server health + model | [Local] | main.py:1033 |
| POST | `/api/llm/auto-setup` | Auto install + start best LLM | [Local] | main.py:1094 |
| POST | `/api/llm/configure` | Configure llama-server | [Local] | main.py:1125 |
| POST | `/api/llm/switch` | Hot-swap model | [Local] | main.py:1148 |
| GET  | `/api/harthash` | Guardrail hash | [Local] | main.py:1192 |

### 1.3 Admin — model management (main.py)
| Method | Path | Purpose | Auth | File:line |
|---|---|---|---|---|
| GET/POST | `/api/admin/models` | List / add models | [Admin] | main.py:1226, 1239 |
| GET/PUT/DELETE | `/api/admin/models/<model_id>` | Per-model CRUD | [Admin] | main.py:1257, 1276, 1299 |
| POST | `/api/admin/models/<model_id>/set-purpose` | Pin model role | [Admin] | main.py:1329 |
| POST | `/api/admin/models/<model_id>/load` | Hot-load | [Admin] | main.py:1365 |
| POST | `/api/admin/models/<model_id>/unload` | Evict | [Admin] | main.py:1384 |
| POST | `/api/admin/models/<model_id>/download` | Start GGUF download | [Admin] | main.py:1401 |
| GET  | `/api/admin/models/<model_id>/download/status` | Download progress | [Admin] | main.py:1437 |
| POST | `/api/admin/models/auto-select` | Pick best for hw | [Admin] | main.py:1446 |
| GET  | `/api/admin/models/health` | Orchestrator health | [Admin] | main.py:1472 |
| POST | `/api/admin/models/swap` | Atomic swap | [Admin] | main.py:1522 |
| GET  | `/api/admin/models/hub/search` | HF hub search | [Admin] | main.py:1648 |
| POST | `/api/admin/models/hub/install` | HF hub download+register | [Admin] | main.py:1730 |

### 1.4 Admin — provider gateway (main.py)
| Method | Path | Purpose | Auth | File:line |
|---|---|---|---|---|
| GET  | `/api/admin/providers` | List providers | [Admin] | main.py:1907 |
| GET  | `/api/admin/providers/<provider_id>` | Show provider | [Admin] | main.py:1944 |
| POST/DELETE | `/api/admin/providers/<provider_id>/api-key` | Set/clear key | [Admin] | main.py:1960, 1978 |
| POST | `/api/admin/providers/<provider_id>/test` | Live ping | [Admin] | main.py:1995 |
| POST | `/api/admin/providers/<provider_id>/enable` | Toggle | [Admin] | main.py:2021 |
| GET  | `/api/admin/providers/gateway/stats` | Gateway stats | [Admin] | main.py:2039 |
| GET  | `/api/admin/providers/efficiency/leaderboard` | Efficiency matrix | [Admin] | main.py:2049 |
| GET  | `/api/admin/providers/capabilities` | Capability matrix | [Admin] | main.py:2067 |
| GET  | `/api/admin/resources/stats` | ResourceGovernor | [Admin] | main.py:2084 |

### 1.5 Admin — diagnostics, logs, hub allowlist, MCP token (main.py)
| Method | Path | Purpose | Auth | File:line |
|---|---|---|---|---|
| GET  | `/logs` | List logs | [Admin] | main.py:2939 |
| GET  | `/logs/view` | Tail | [Admin] | main.py:2978 |
| POST | `/api/admin/diag/thread-dump` | Thread dump | [Admin] | main.py:3032 |
| GET  | `/api/admin/diag/degradations` | Degradation registry | [Admin] | main.py:3087 |
| GET/POST | `/api/admin/hub/allowlist` | HF-org allowlist R/W | [Admin] | main.py:3133, 3148 |
| DELETE | `/api/admin/hub/allowlist/<path:org>` | Remove org | [Admin] | main.py:3171 |
| GET  | `/api/admin/mcp/token` | Return current MCP token | [Admin] | main.py:3231 |
| POST | `/api/admin/mcp/token/rotate` | Rotate | [Admin] | main.py:3259 |
| GET  | `/logs/download` | Zip+serve | [Admin] | main.py:3294 |
| POST | `/logs/clear` | Truncate | [Admin] | main.py:3322 |
| GET  | `/logs/open-folder` | Reveal in OS | [Admin] | main.py:3358 |

### 1.6 Chatbot + Speech (routes/chatbot_routes.py, register_routes)
| Method | Path | Purpose | Auth | File:line |
|---|---|---|---|---|
| POST | `/chat` | LLM chat turn (draft-first → main) | [Local] | chatbot_routes.py:3409 |
| POST | `/custom_gpt` | Legacy custom GPT | [Local] | chatbot_routes.py:3406 |
| GET  | `/prompts` | List prompts | [Local] | chatbot_routes.py:3410 |
| GET  | `/backend/health` | HART-backend health | [Local] | chatbot_routes.py:3411 |
| GET  | `/network/status` | Net health | [Local] | chatbot_routes.py:3412 |
| GET  | `/agents/sync` | Pull remote agent defs | [Local] | chatbot_routes.py:3415 |
| POST | `/agents/sync` | Push local agent defs | [Local] | chatbot_routes.py:3416 |
| POST | `/agents/migrate` | Migrate id schema | [Local] | chatbot_routes.py:3417 |
| POST | `/agents/<prompt_id>/post` | Post-as-agent | [Local] | chatbot_routes.py:3418 |
| GET  | `/tts/audio/<filename>` | Serve audio | [Local] | chatbot_routes.py:3453 |
| POST | `/tts/synthesize` | TTS | [Local] | chatbot_routes.py:3456 |
| GET  | `/tts/voices` | Voice list | [Local] | chatbot_routes.py:3457 |
| POST | `/tts/install` | Install voice | [Local] | chatbot_routes.py:3458 |
| GET  | `/tts/status` | Engine status | [Local] | chatbot_routes.py:3459 |
| POST | `/tts/setup-engine` | Swap engine | [Local] | chatbot_routes.py:3462 |
| GET  | `/tts/engines` | List engines | [Local] | chatbot_routes.py:3463 |
| POST | `/api/social/tts/quick` | Kids quick-path TTS | [Local] | chatbot_routes.py:3466 |
| POST | `/api/social/tts/submit` | Long-form TTS job | [Local] | chatbot_routes.py:3467 |
| GET  | `/api/social/tts/status/<job_id>` | Poll | [Local] | chatbot_routes.py:3468 |
| POST | `/voice/transcribe` | Whisper STT | [Local] | chatbot_routes.py:3471 |
| POST | `/voice/diarize` | Diarization | [Local] | chatbot_routes.py:3472 |
| GET  | `/voice/stt/stream-port` | WebSocket port | [Local] | chatbot_routes.py:3473 |
| GET/POST | `/api/llm/config` | LLM config R/W | [Bearer] | chatbot_routes.py:3476, 3477 |
| POST | `/api/llm/test` | Smoke | [Bearer] | chatbot_routes.py:3478 |
| POST | `/api/vault/store` | Secrets store | [Bearer] | chatbot_routes.py:3481 |
| GET  | `/api/vault/keys` | Enumerate | [Bearer] | chatbot_routes.py:3482 |
| GET  | `/api/vault/has` | Existence | [Bearer] | chatbot_routes.py:3483 |
| POST | `/agents/contact` | Agent introduction request | [Local] | chatbot_routes.py:3486 |
| POST | `/agents/contact/respond` | Accept/decline | [Local] | chatbot_routes.py:3487 |
| POST | `/api/hart/advance` | HART onboarding step | [Local] | chatbot_routes.py:3490 |
| POST | `/api/hart/generate` | HART generate | [Local] | chatbot_routes.py:3491 |
| POST | `/api/hart/seal` | Seal profile | [Local] | chatbot_routes.py:3492 |
| GET  | `/api/hart/profile` | Read profile | [Local] | chatbot_routes.py:3493 |
| GET  | `/api/hart/check` | Readiness check | [Local] | chatbot_routes.py:3494 |
| POST | `/api/ai/bootstrap` | Start first-run AI install | [Local] | chatbot_routes.py:3497 |
| GET  | `/api/ai/bootstrap/status` | Install progress | [Local] | chatbot_routes.py:3498 |
| GET  | `/api/memory/recent` | Recent memory rows | [Local] | chatbot_routes.py:3501 |
| GET  | `/api/memory/search` | FTS5 search | [Local] | chatbot_routes.py:3502 |
| DELETE | `/api/memory/<memory_id>` | Erase | [Local] | chatbot_routes.py:3503 |

### 1.7 DB / uploads / kids / hartos-proxy (routes/*)
See db_routes.py, upload_routes.py, kids_game_recommendation.py,
kids_media_routes.py, hartos_backend_adapter.py for full route list with
file:line citations in the full map.

### 1.8 HARTOS social blueprints (registered via `init_social`)
All under `/api/social/*` unless noted. Source: `integrations/social/*.py`.
| Blueprint | url_prefix | File:line |
|---|---|---|
| `social_bp` | `/api/social` | social/api.py:32 |
| `channel_user_bp` | `/api/social/channels` | social/api_channels.py:26 |
| `sync_bp` | `/api/social/sync` | social/sync_api.py:14 |
| `sharing_bp` | `/api/social` | social/api_sharing.py:21 |
| `tracker_bp` | `/api/social/tracker` | social/api_tracker.py:24 |
| `provision_bp` | `/api/provision` | social/api_provision.py:22 |
| `thought_experiments_bp` | (none) | social/api_thought_experiments.py:30 |
| `theme_bp` | (none) | social/api_theme.py:17 |
| `regional_host_bp` | multi | social/api_regional_host.py:21 |
| `audit_bp` | `/api/social/audit` | social/api_audit.py:17 |
| `mcp_bp` | `/api/social` | social/api_mcp.py:14 |
| `gamification_bp` | `/api/social` | social/api_gamification.py:25 |
| `games_bp` | `/api/social` | social/api_games.py:15 |
| `fleet_update_bp` | (none) | social/api_fleet_update.py:9 |
| `dashboard_bp` | (none) | social/api_dashboard.py:19 |
| `discovery_bp` | (none) | social/discovery.py:15 |

### 1.9 HARTOS admin (admin_bp url_prefix `/api/admin`)
~120 endpoints across channels CRUD, queue/commands/automation, identity,
plugins, sessions, metrics, config. Admin/api.py:225–2260.

### 1.10 HARTOS distributed-agent API
`POST /api/distributed/tasks/announce` (api.py:90), `/available` (:156),
`/hosts` (:181), `/hosts/register` (:190), `/claim` (:207),
`/<task_id>/submit` (:232), `/verify` (:253), `/goals` (:272),
`/<goal_id>/progress` (:303), `/baselines` (:317), `/status` (:334).

### 1.11 Hive signal bridge + flask_integration
`GET /api/hive/signals/stats`, `/feed`, `POST /classify`
(hive_signal_bridge.py:711,713,718,724); `GET /channels/status`,
`POST /channels/send` (flask_integration.py:423,427).

### 1.12 Agent engine + content-gen + learning + commercial + marketplace
`/api/marketing/products*`, `/api/goals*`, `/api/agent-engine/*`, and ~80
more content/learning/marketplace/commercial routes (agent_engine/api.py,
api_content_gen.py, api_learning.py, commercial_api.py,
build_distribution.py, app_marketplace.py, rl_ef_endpoints.py).

### 1.13 Standalone HARTOS (hart_intelligence_entry.py)
Key surfaces: `/api/instructions/*` (755-847); `/api/credentials/*`
(875,899); OpenAI-compatible `/v1/chat/completions` (916);
`/api/gateway/*` (957,979); `/chat` (5370); `/time_agent` (6490);
`/visual_agent` (6512); `/response_ack` (6578); `/api/agent/approval`
(6589); `/add_history` (6708); `/prompts` GET/POST (6778,6929);
`/status` (6996); `/health` (7022); `/ready` (7031);
`/.well-known/hart-challenge` (7144,7204); `/api/tools/*`
(7406-7490); `/api/revenue/dashboard` (7499); `/coding/*`
(7520-7587); `/api/voice/*` (7601-7742); `/video-gen/*` (7772,7811);
`/api/skills/*` (7829-7911); `/api/settings/compute*` (7927-8077);
`/api/remote-desktop/*` (8137-8303).

### 1.14 MCP local bridge (`/api/mcp/local`)
`GET /health`, `/tools/list`, `POST /tools/execute` — [Loopback OR Bearer]
— mcp_http_bridge.py:868,879,893.

### 1.15 Onboarding (onboarding_routes.py)
`POST /api/onboarding/start` (:21), `/advance` (:51),
`GET /status` (:70), `/profile` (:89).

### 1.16 Robotics + hardware + coding_agent + hive_session + marketplace
See hardware_bridge.py, intelligence_api.py, coding_agent/api.py,
claude_hive_session.py, hive_benchmark_prover.py, compute_optimizer.py,
app_marketplace.py, model_onboarding.py for full file:line citations.

────────────────────────────────────────────────────────────────────────────
## 2  MCP tools (`/api/mcp/local/tools/*`)

Registered in mcp_http_bridge.py via `_register_tool` at 302, 725–861.

| Name | Description | Side-effect | Line |
|---|---|---|---|
| list_agents | List expert agents | Read-only | 725 |
| list_goals | List agent goals | Read-only | 726 |
| agent_status | Agent daemon health | Read-only | 727 |
| list_recipes | Trained recipes | Read-only | 728 |
| system_health | Full health | Read-only | 729 |
| social_query | Read-only SQL on social DB | Read-only | 730 |
| remember | Store memory node | Writes memory_graph row + FTS5 index | 733 |
| recall | Search memory graph | Read-only | 734 |
| call_endpoint | Call ANY Flask route | Full auth inherited — any side effect | 737 |
| list_routes | Enumerate routes | Read-only | 738 |
| list_channels | Channel adapters | Read-only | 739 |
| watchdog_status | Thread liveness | Read-only | 742 |
| exception_report | Recent exceptions | Read-only | 743 |
| runtime_integrity | Code tamper check | Read-only | 744 |
| onboard_model | HF → GGUF → llama.cpp | Downloads model, starts server, writes catalog | 851 |
| switch_model | Hot-swap active LLM | Stops old, starts new | 852 |
| model_status | Active/VRAM | Read-only | 853 |
| hive_connect | Register Claude Code session as worker | Writes hive_sessions row | 854 |
| hive_disconnect | Remove worker | Mutates | 855 |
| hive_session_status | Session stats | Read-only | 856 |
| create_hive_task | Enqueue coding task | Writes hive_tasks row | 857 |
| dispatch_hive_tasks | Dispatch pending | Emits hive.task.dispatched | 858 |
| hive_signal_stats | Channel signals | Read-only | 859 |
| hive_signal_feed | Recent signals | Read-only | 860 |
| seed_goals | Seed bootstrap agents | Writes up to 47 goal rows | 861 |

Input schemas at `GET /tools/list`; dispatch at `POST /tools/execute`
with body `{"tool": <name>, "arguments": {...}}`.

────────────────────────────────────────────────────────────────────────────
## 3  React SPA routes

### 3.1 Nunba desktop landing-page (landing-page/src/MainRoute.js)
Public: `/` (HomePage:177), `/local` (:195), `/AboutHevolve` (:211),
`/personalisedlearning` (:230), `/aboutus` (:252), `/Plan` (:271),
`/speechtherapy` (:290), `/trialplan` (:312), `/Payment*` (:333-363),
`/contact` (:377), `/institution` (:396,415), `/agents*` (:437,456),
`/signup` (:465), `/s/:token` (:483), `/docs` (:485), `/pupit` (:486).

Social subtree at `/social` (:488) renders `SocialHome` shell — 47 child
routes for feed, profiles, posts, agents, recipes, communities, kids,
campaigns, encounters, regions, marketplace, etc. (:490-546).

Admin subtree (:551-567): `/admin`, `/admin/users`, `/moderation`,
`/agents`, `/channels`, `/workflows`, `/settings`, `/identity`,
`/agent-dashboard`, `/revenue`, `/content-tasks`, `/network-nodes`,
`/models`, `/providers`, `/task-ledger`, `/integrations/claude-code`.

`path="*"` → NotFoundPage (:569).

### 3.2 Hevolve cloud (Hevolve/src/MainRoute.js)
Near-identical route set. Omits `/local`, adds `/about`, `/pricing`,
`/recipes/:recipeId`.

### 3.3 React Native
React Navigation (not BrowserRouter). Feature stores: channelStore,
kidsIntelligenceStore, kidsLearningStore, kidsMediaStore,
gamificationStore.

────────────────────────────────────────────────────────────────────────────
## 4  Channel adapters (31 total)

Core (`integrations/channels/*_adapter.py`): Discord, WhatsApp, Slack,
Telegram, Signal, iMessage, Google Chat, Web.
Extensions (`extensions/*`): BlueBubbles, Discord-user, Email, Instagram,
LINE, Matrix, Mattermost, Messenger, Nextcloud, Nostr, OpenProse,
RocketChat, Teams, Telegram-user, Tlon, Twitch, Twitter, Viber, Voice,
WeChat, Zalo, Zalo-user.

Each implements `ChannelAdapter` (base.py): `connect`, `disconnect`,
`_convert_message`, `send_message`, `edit_message`, `delete_message`,
`name`. Inbound: platform webhook/WS → `_convert_message` →
`ChannelDispatcher` → agent call → response via `send_message`.

Tokens: per-channel in admin config or env vars (TELEGRAM_BOT_TOKEN,
DISCORD_BOT_TOKEN, WHATSAPP_ACCESS_TOKEN, SLACK_BOT_TOKEN,
SIGNAL_SERVICE_URL) — main.py:2834-2846.

WAMP-IoT bridge: `integrations/channels/bridge/wamp_bridge.py`.

HARTOS activates in `_deferred_social_init` (main.py:2808);
`flask_integration.init_channels` exposes `POST /channels/send`,
`GET /channels/status`.

────────────────────────────────────────────────────────────────────────────
## 5  WAMP topics (Crossbar on :8088)

Publisher: `integrations/social/realtime.py` → `publish_event(topic, data,
user_id)` (:85). Authorization whitelist at :40 (`_PUBLIC_TOPIC_PREFIXES`).
Defense-in-depth refuses cross-user publishes at :95.

Scope: P=per-user, G=global/public, C=community/post scoped.

| Topic | Publisher | Subscriber | Data shape | Scope |
|---|---|---|---|---|
| `community.feed` | `on_new_post` (:120) | RN global feed | post_dict | G |
| `community.message` | `on_new_post` with community | Web per-community | post_dict + community_id | C |
| `social.post.<post_id>.new_comment` | `on_new_comment` (:130) | server-side | comment_dict | C |
| `social.<target_type>.<target_id>.vote` | `on_vote_update` (:135) | server-side | {score} | C |
| `chat.social` | `on_notification` (:140) | RN + web for user | notification dict | P |
| `dm.<conversation_id>` | DM sender (message_bus) | DM participants | {content, sender_id} | P |
| `presence.<user_id>` | presence service | friends | {online, last_seen} | P |
| `game.<session_id>` | game engine | game participants | {event, payload} | C |
| `setup_progress`, `setup.*` | boot splash | pre-auth renderer | {step, pct, msg} | G |
| `system.*` | catalog/orchestrator | admin dashboard | {event, data} | G |
| `catalog.*` | ModelCatalog | admin | {model_id, status} | G |
| `model.<model_id>.*` | ModelOrchestrator | admin | lifecycle event | G |
| `tts.<user_id>` | TTS pipeline | per-user renderer | {audio_url, duration} | P |
| `admin.*` | admin broadcasts | admins | varies | G |
| `hive.signal.received` | hive_signal_bridge.py:340 | EventBus | signal dict | G |
| `hive.signal.spark` | :361 | rewards engine | {user_id, amount} | G |
| `hive.benchmark.completed` | hive_benchmark_prover.py:1062 | hive | result | G |
| `hive.benchmark.published` | :1099 | hive | result + proof | G |
| `hive.benchmark.challenge` | :1324 | hive | challenge doc | G |
| `hive.task.dispatched`, `.completed` | claude_hive_session.py:67-68 | hive | task event | G |
| `hive.session.connected`, `.disconnected` | :69-70 | hive | session event | G |
| `auto_evolve.*` | auto_evolve.py:148-195 | admin | session dict | G |

PeerLink channels 0x00–0x09 (core/peer_link/channels.py:28):
0x00 control (SYSTEM), 0x01 compute (PRIVATE), 0x02 dispatch (PRIVATE),
0x03 gossip (OPEN), 0x04 federation (OPEN), 0x05 hivemind (PRIVATE),
0x06 events (OPEN), 0x07 ralt (OPEN), 0x08 sensor (PRIVATE),
0x09 messages (PRIVATE).

────────────────────────────────────────────────────────────────────────────
## 6  Model orchestrator + catalog

Source: `integrations/service_tools/model_catalog.py`. Classes: ModelCatalog
(:188), ModelType enum (:50) — LLM/TTS/STT/VLM/VIDEO_GEN/AUDIO_GEN/embedding.
Auto-prefixes (:488): `tts-`, `stt-`, `vlm-`, `video_gen-`, `audio_gen-`.
Persisted at `data/model_catalog.json` (:205).

Video-gen built-ins (:611): `video_gen-wan2gp` (8/12 GB),
`video_gen-ltx2` (4/8 GB). Audio-gen (:654): `audio_gen-acestep` (6 GB),
`audio_gen-diffrhythm` (4 GB).

LLM built-ins: Qwen-3.5 draft 0.8B (port 8081) + Qwen-3.5 main 4B (port
8080), boot via `LlamaConfig.start_caption_server`/`start_server`
(main.py:466-531). Draft auto-boot: ≥8GB → dual; 4-6GB → main only;
≤2GB → single 0.8B (main.py:453-461).

Orchestrator: `model_orchestrator.py`. `auto_load(model_type)` picks
best entry by hardware; pluggable `ModelLoader` (:44). Fallback chain:
local llama.cpp → provider gateway (providers/gateway.py:568-649).

Lifecycle: `model_lifecycle.py` evicts idle on VRAM pressure signals
from `ResourceGovernor` (core/resource_governor.py:466).

TTS tools catalog: chatterbox, cosyvoice, f5_tts, indic_parler, kokoro,
luxtts, pocket_tts, tts_audio_suite (service_tools/*_tool.py). STT:
whisper_tool.py. Video: wan2gp_tool, servers/wan2gp_server.py.
Audio-gen: acestep_tool, diffrhythm_tool.

────────────────────────────────────────────────────────────────────────────
## 7  Agent creation pipeline (Tier-1/2/3)

Tier-1 (built-in): `seed_bootstrap_goals` during first-boot
(mcp_http_bridge.py:835-848; 47 agents).

Tier-2 (user-created):
  1. `POST /api/social/agents` (social_bp, api.py:32)
  2. `agent_evolution_service.create_evolution_tree` (:99-124)
  3. Status = `draft` → visible at `/social/agents`.

Tier-3 (auto-evolve):
  1. `start_auto_evolve` tool OR `POST /api/social/agents/evolve`
  2. `AutoEvolveOrchestrator` (auto_evolve.py:63): GATHER → FILTER →
     VOTE → DISPATCH → ITERATE
  3. Events: `auto_evolve.started/dispatching/none_approved/no_candidates`

State transitions (Agent.status): `draft → review → approved →
completed → evaluating → reused`. APIs:
- create → `POST /api/social/agents`
- review   → `POST /api/social/agents/<id>/review`
- complete → `AgentDaemon.complete_goal` (agent_daemon.py:350)
- evaluate → `POST /api/social/agents/<id>/evaluate`
- reuse    → `POST /api/social/agents/<id>/reuse`
[GAP — some transitions are event-driven only; no dedicated REST path]

────────────────────────────────────────────────────────────────────────────
## 8  Distributed Agent / HiveMind / PeerLink

### 8.1 PeerLink channels
Table in §5. DataClass enum (channels.py:22-24). is_private_channel(:115).
ChannelDispatcher.register (:135).

### 8.2 Same-user vs cross-user crypto
Same user (LAN/WAN/regional): channels unencrypted — auth'd user_id match
(channels.py:9). Cross user: PRIVATE channels E2E encrypted
(security/channel_encryption.py). Topic-publish guard realtime.py:72-82.

### 8.3 Distributed worker loop
`DistributedWorkerLoop` (worker_loop.py:24): `_detect_capabilities` (:35),
`start` (:51), `_tick` (:121), `_execute_task` (:150). Coordinator backends:
local sqlite, Redis. Verification: verification_protocol.py. Host registry:
host_registry.py. Task coordinator: task_coordinator.py.

### 8.4 Federated aggregator
`FederatedAggregator` (federated_aggregator.py:174). Singleton
`get_federated_aggregator` (:1121). Ticked by AgentDaemon (:350).

### 8.5 Benchmark prover (3-level hive depth)
`HiveBenchmarkProver` (hive_benchmark_prover.py:541): `challenge(model,
benchmark)` (:1255) publishes `hive.benchmark.challenge` (:1324);
Blueprint at :2510 with `POST /api/hive/benchmarks/challenge` (:2603).
[GAP — 3-level depth traversal: no `HIVE_DEPTH` constant found; closest
is memory_graph.backtrace(depth=10, :380) and backtrace_semantic(depth=5,
top_k=3, :412). Mark as GAP for phase-2 journeys claiming depth-3 fusion.]

### 8.6 HiveMind query fusion
Channel 0x05 hivemind (PRIVATE, priority 1, reliable). Handlers not mapped
to a single fuse routine. [Partial-GAP]

────────────────────────────────────────────────────────────────────────────
## 9  Kids learning pipeline

Game templates: `routes/kids_game_recommendation.py`:
`detect_engagement_level` (:278), `build_fleet_command` (:301),
`POST /api/kids/recommendations` (:323), `/concept-tracking` (:422),
`/engagement` (:460), `GET /speech-therapy-focus` (:495),
`POST /fleet-command` (:506).

Media: `routes/kids_media_routes.py`: `GET /api/media/asset` (:193,
:459), `/api/media/asset/status/<job_id>` (:419,:460).

Kids TTS: `/api/social/tts/quick` (chatbot_routes.py:1430-1471),
`/submit` (:1475), `/status/<job_id>` (:1544).

SPA: `/social/kids`, `/kids/game/:gameId`, `/kids/progress`,
`/kids/create`, `/kids/custom` (MainRoute.js:517-521).

RN stores: kidsIntelligenceStore.js, kidsLearningStore.js,
kidsMediaStore.js.

Catalog: integrations/social/game_catalog.py, game_types.py,
game_types_extended.py, game_service.py, game_ai.py.

────────────────────────────────────────────────────────────────────────────
## 10  Auto-Evolve

File: `integrations/agent_engine/auto_evolve.py`.
Orchestrator: `AutoEvolveOrchestrator` (:63). Entry: `start_auto_evolve`
(:376); `get_auto_evolve_status` (:410). Tool metadata (:456-484) —
tags auto_evolve + thought_experiment.

Stages (:6-17):
  1. GATHER candidates (democratic selection)
  2. FILTER — ConstitutionalFilter (`_constitutional_filter` :219)
  3. VOTE — weighted tally (human + agent)
  4. DISPATCH — `parallel_dispatch.dispatch_parallel_tasks` (:39)
  5. ITERATE — agent-native (no orchestrator loop)

Events: `auto_evolve.{no_candidates,none_approved,dispatching,started}`
(:148-195).

────────────────────────────────────────────────────────────────────────────
## 11  Agent Memory (MemoryGraph, FTS5)

File: `integrations/channels/memory/memory_graph.py`. Class `MemoryGraph`
(:88). Methods: `register` (:144), `register_conversation` (:202),
`register_lifecycle` (:234), `recall` (:273), `context_recall` (:327),
`get_session_memories` (:352), `backtrace` (:380),
`backtrace_semantic` (:412, depth=5, top_k=3), `get_memory_chain` (:433),
`close` (:542).

Agent tools (`agent_memory_tools.py`): `remember` (:81),
`recall_memory` (:107), `backtrace_memory` (:148) — uses
backtrace(depth=10) + backtrace_semantic(depth=5, top_k=3).

HTTP: `GET /api/memory/recent`, `/search`, `DELETE /<memory_id>`
(chatbot_routes.py:3501-3503).
MCP: `remember`, `recall` tools (mcp_http_bridge.py:733-734).

────────────────────────────────────────────────────────────────────────────
## 12  Provider gateway — 15 providers

File: `integrations/providers/registry.py`. `_builtin_providers()` (:160).

Primary 15: together (:168), fireworks (:213), groq (:242),
deepinfra (:278), cerebras (:307), sambanova (:328), openrouter (:355),
replicate (:367), fal (:399), huggingface (:433), runwayml (:446),
elevenlabs (:458), midjourney (:470), pika (:479), kling (:488).
Extras: luma (:497), seedance (:506), sora (:515), local (:526).

Routing: `ProviderGateway.generate(prompt, provider_id, model_id)`
(gateway.py:147) — selects by capability + efficiency matrix. Agent-tool
binding: `providers/agent_tools.py`.

Admin HTTP: §1.4. Efficiency leaderboard:
`/api/admin/providers/efficiency/leaderboard`.

────────────────────────────────────────────────────────────────────────────
## 13  Startup / Shutdown invariants

### 13.1 Single-instance lock
`_check_single_instance` (app.py:220), `_acquire_instance_lock` atomic
file lock (app.py:242). Lock held → pings `/api/focus` (:249), exits 0
(:253). Skipped under pytest/coverage/NUNBA_SKIP_SINGLE_INSTANCE
(:262-265).

### 13.2 Boot order
1. pycparser pre-loaded (app.py:67-115)
2. PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True (:14)
3. WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS autoplay (:18)
4. HF_HUB_OFFLINE if cache exists (main.py:27-31)
5. Single-instance lock (:265)
6. HEVOLVE_DB_PATH / AGENT_DATA_DIR env (main.py:104-107)
7. Node config restoration (:111-120)
8. Flask app created (:370)
9. `_deferred_platform_init` thread: CBURL ws://localhost:8088/ws
   (:380), WAMP_URL http://:5000/publish (:387), bootstrap_platform (:391),
   local_subscribers (:397), caption server event subs (:407-423),
   draft llama-server :8081 (:466-481), main llama-server :8080
   (:483-530)
10. LlamaConfig health endpoints (:547-561)
11. Social blueprints registered (:2744-2790)
12. `_deferred_social_init` thread: DB, migrations, channels, agent
    engine (:2793-2869)
13. HARTOS MCP blueprint (:2892-2902)
14. Fleet restart watcher (:2904-2928)
15. pywebview.start() + system tray setup (app.py:5420+)

Ports: crossbar :8088, llama-server main :8080, draft llama :8081,
MiniCPM sidecar (port_registry), Flask :5000, STT WebSocket,
webview (port 5000 reused).

### 13.3 ResourceGovernor + watchdog set
`core/resource_governor.py`: ResourceGovernor (:466). Monitor thread
(:552), proactive thread (:559). State log (:689). Hive-signals check
(:1122), provider benchmarks (:1219).

Named watchdog daemons: draft-server-boot, main-llm-boot, platform-init,
social-init, fleet-restart-watcher (main.py:481, :530, :533, :2874).

### 13.4 Clean shutdown
- `/indicator/stop` (:978) inactivates indicator
- pystray Quit → `on_quit_clicked` (app.py:5485) → `stop_server`
- Exits pywebview, releases file lock, SIGTERMs llama-server

────────────────────────────────────────────────────────────────────────────
## 14  Install / upgrade flows

### 14.1 First-run AI installer
CLI `--install-ai` (app.py:1127). HTTP: `POST /api/ai/bootstrap`
(chatbot_routes.py:3497), status via `/api/ai/bootstrap/status` (:3498).

### 14.2 Model hub downloads
`/api/admin/models/hub/search` (main.py:1648), `/hub/install` (:1730).
Allowlist: `/api/admin/hub/allowlist` (:3133+). `core/hub_allowlist.py`.

### 14.3 D: drive fallback (CUDA torch)
`~/.nunba/site-packages/` inserted at sys.path[0] (app.py:448).
Honors NUNBA_DATA_DIR.

### 14.4 dist-info preservation
`core.optional_import` records missing dist-info → degradation registry
at `/api/admin/diag/degradations`.

### 14.5 cx_Freeze bundle
app.py:118 `_isolate_frozen_imports` removes user site-packages,
sets PYTHONNOUSERSITE=1, patches site.ENABLE_USER_SITE=False (:144).
Frozen logs → `~/Documents/Nunba/logs/gui_app.log`.

────────────────────────────────────────────────────────────────────────────
## USER JOURNEYS — J01..J99

Each row: **J-ID · short name** ; pre-conditions ; steps ; verifiable
outcomes ; repos/services ; CI achievable?

### English chat round-trip
- **J01 · English chat text-only** · pre: llama :8080 ready, `/chat`
  POST. Steps: UI posts `{message:"hello", preferred_lang:"en"}` →
  chatbot_routes.chat_route draft-first (:3409) → main Qwen-3.5-4B on
  :8080 returns assistant text → memory_graph.register_conversation.
  Outcomes: HTTP 200 with `{response: str}`; memory row with session_id;
  draft response < 400ms when draft_first=1. Service: Nunba + llama
  :8080. CI: yes with mocked llama.
- **J02 · English chat with TTS audio** · pre: J01 + TTS engine. Steps:
  J01 then `POST /tts/synthesize` (:3456) → audio URL on
  `tts.<user_id>` WAMP → Audio.play() in webview. Outcomes:
  `GET /tts/audio/<filename>` returns bytes ≥ 2048. CI: partial.

### Non-Latin scripts + draft-skip (J03..J14 language matrix)
Tamil, Hindi, Bengali, Telugu, Kannada, Malayalam, Marathi, Gujarati,
Punjabi, Urdu, Arabic, Chinese, Japanese, Korean, Thai, Russian, Greek.
pre: TTS engine with indic_parler/cosyvoice/voxcomm. Steps:
`POST /chat` with `preferred_lang=<ISO>`; verify non-Latin forces
main-4B only; check `core.user_lang.get_preferred_lang` precedence
(user_lang.py:110); validate response codepoints in target Unicode block;
run TTS job. Outcomes: response ≥1 codepoint in target block;
`/api/social/tts/submit` returns job_id; status eventually 'done';
audio bytes ≥ 2048. CI: partial.

### Voice / Vision
- **J15 · Mic → Whisper → LLM → TTS loop** · pre: whisper installed.
  Steps: mic stream → `/voice/transcribe` → `/chat` → TTS. Outcomes:
  transcript non-empty; reply non-empty; audio ≥ 2048 bytes. CI: partial.
- **J16 · Camera consent → VisionService → MiniCPM caption → memory** ·
  pre: MiniCPM installed. Steps: UI posts consent → VisionService.start
  (vision/vision_service.py:101) → WS frame receiver → FrameStore →
  caption via VLM/MiniCPM → memory_graph.register
  session_id+lifecycle='perception'. Outcomes: Frame in frame_store;
  memory row content="caption:..."; `/api/memory/recent` returns it.
  CI: no (real camera); mock-level yes.

### Admin
- **J17 · Model hub search → install** · pre: admin auth. Steps:
  `GET /api/admin/models/hub/search?q=qwen` (main.py:1648) →
  `POST /api/admin/models/hub/install {model, quant}` (:1730) → poll
  `/download/status`. Outcomes: queued → downloading → ready; catalog
  entry exists; `catalog.*` WAMP. CI: yes with mock HF.
- **J18 · Tier-1 builtin seed** · MCP tool `seed_goals`
  (mcp_http_bridge.py:835). Outcomes: `{seeded:47,status:"ok"}`; 47 rows
  in social DB. CI: yes.
- **J19 · Tier-2 agent via SPA** · pre: logged in. Steps: SPA
  `/social/agents` → `POST /api/social/agents`. Outcomes: Agent row
  `draft`; visible in audit list; `system.agent.created` event. CI: yes.
- **J20 · Tier-3 auto-evolve** · pre: ≥5 experiments + votes. Steps: MCP
  `start_auto_evolve` or `POST /api/social/agents/evolve`. Outcomes:
  `auto_evolve.started` + `.dispatching`; new Agent status='completed'.
  CI: partial.
- **J21..J51 · Channel enable for 31 adapters** · 31 journeys, one per
  adapter. pre: token env. Steps: `POST /api/admin/channels` →
  `/enable` → `/test`. Outcomes: state='active'; `/channels/send` OK;
  `hive.signal.received` emitted. CI: partial (only `web` adapter runs
  without external creds).
- **J52 · Per-channel agent assignment** · `POST /api/social/channels
  /bindings` (api_channels.py:61). Outcomes: row in channel_bindings;
  inbound routed to agent. CI: yes.

### Social
- **J53 · Post → WAMP fan-out** · `POST /api/social/posts` →
  `on_new_post` publishes `community.feed`. Outcomes: 200 with post_id;
  WAMP subscriber receives payload within 2s. CI: yes.
- **J54 · Vote on post** · `POST /api/social/posts/<id>/vote`.
  Outcomes: `social.post.<id>.vote` emitted; vote_count++. CI: yes.
- **J55 · Comment** · `POST /api/social/posts/<id>/comments`. Outcomes:
  comment row; `social.post.<id>.new_comment`. CI: yes.
- **J56 · Feed paginated** · `GET /api/social/feed?cursor=...`.
  Outcomes: JSON page ≥1 item. CI: yes.
- **J57 · Cross-user WAMP notification** · A follows B; B posts.
  Outcomes: `chat.social` received on A's user-scoped topic only.
  CI: yes.
- **J58 · DMs foundation** · [GAP — BATCH 2; channel 0x09 defined but
  HTTP/WS surface not yet wired].

### Kids
- **J59 · Kids pick template + play + submit + score** ·
  `POST /api/kids/recommendations` → SPA `/social/kids/game/<id>` →
  `game.<session_id>` events → `POST /api/kids/concept-tracking`.
  Outcomes: game_session row with score; engagement computed.
  CI: partial.
- **J60 · Kids TTS quick-path** · `POST /api/social/tts/quick
  {text:"apple",lang:"en"}`. Outcomes: 200 with audio_url within
  800ms. CI: yes with mock engine.

### Onboarding
- **J61 · Native onboarding full flow** · `POST /api/onboarding/start`
  (:21) → `/advance` (:51) (language + voice test) → channel link →
  `/status` to complete. Outcomes: agent created; `preferred_lang`
  persisted; `hart_language.json` written (user_lang.py:54);
  `/profile` returns it. CI: yes.

### Distributed
- **J62 · Peer discover + offload** · Node A announces capability →
  B calls `POST /api/distributed/tasks/announce` (api.py:90) →
  A's worker_loop._tick claims (worker_loop.py:121) → A executes →
  submit → verify. Outcomes: task status `done`; result returned;
  crypto verification True. CI: partial (two-process).
- **J63 · E2E encrypted cross-user channel** · cross-user PRIVATE
  channel (compute 0x01) → encrypted. Outcomes: payload not plaintext;
  peer key exchange recorded. CI: yes with stubbed transport.

### HiveMind
- **J64 · HiveMind query fusion 3-level** · [Partial-GAP — hivemind
  channel 0x05 exists; explicit 3-level fusion routine not found].
- **J65 · Hive benchmark prover verify** · `POST /api/hive/benchmarks/
  challenge {model, benchmark}` (hive_benchmark_prover.py:2603).
  Outcomes: `hive.benchmark.challenge` event with proof; score
  deltas; benchmark row. CI: yes.

### Install / upgrade
- **J66 · First-run AI installer** · `--install-ai`. Outcomes: binary
  at `~/.nunba/bin/llama-server`; default GGUF; exit 0. CI: partial
  (mock HF).
- **J67 · Add TTS backend post-install** · `POST /tts/setup-engine
  {engine:"cosyvoice"}`. Outcomes: engine in `/tts/engines`; synth
  works. CI: yes.
- **J68 · CUDA torch D:/ fallback** · NUNBA_DATA_DIR=D:\Nunba. Outcomes:
  torch.__file__ under D:\; cuda available when GPU present. CI: partial.
- **J69 · Offline mode** · remove network, boot. Outcomes: HF_HUB_OFFLINE=1
  (main.py:31); chat works with local models;
  `/api/admin/diag/degradations` lists missing optionals. CI: yes.

### Shutdown
- **J70 · Clean kill no zombie** · quit via tray. Outcomes: `lsof`/
  `netstat` show :5000 :8080 :8081 :8088 free; lockfile absent. CI:
  partial (live box).

### Memory
- **J71 · MCP remember → recall** · `POST /api/mcp/local/tools/execute
  {tool:"remember",arguments:{content:"x"}}` → `{tool:"recall",
  arguments:{q:"x"}}`. Outcomes: recall contains memory with same id;
  FTS5 rank > 0. CI: yes.
- **J72 · Backtrace chain** · register 3 linked memories; call
  `agent_memory_tools.backtrace_memory(id, depth=10)`. Outcomes: chain
  length 3; ordered parent→child. CI: yes.
- **J73 · DELETE memory** · `/api/memory/<id>`. Outcomes: 200;
  `/api/memory/recent` no longer lists id. CI: yes.

### Provider gateway
- **J74 · Provider test ping** · `POST /api/admin/providers/groq/test`.
  Outcomes: 200 with latency_ms > 0; leaderboard updated. CI: partial.
- **J75 · Gateway fallback on provider error** · main 500 → gateway
  retries next-ranked. Outcomes: `result.provider_id == fallback`;
  error metric++. CI: yes with stub.

### VLM / Vision
- **J76 · VLM caption via draft :8081** · Outcomes: caption non-empty.
  CI: partial.
- **J77 · VLM caption via MiniCPM sidecar** · Outcomes: caption
  non-empty. CI: partial.

### Gamification
- **J78 · Spark via hive signal** · high-value bound-channel message
  (hive_signal_bridge.py:353). Outcomes: `hive.signal.spark` event;
  user spark++. CI: yes.

### Admin diagnostics
- **J79 · Thread dump** · `POST /api/admin/diag/thread-dump`. Outcomes:
  file under logs/; all daemons present. CI: yes.
- **J80 · Degradation registry** · force missing optional_import at boot.
  Outcomes: `/api/admin/diag/degradations` lists it. CI: yes.

### Federation
- **J81 · Fleet restart on tier promote** · HEVOLVE_RESTART_REQUESTED.
  Outcomes: watcher (main.py:2911) re-execs; new tier in
  `/api/v1/system/tiers`. CI: partial.
- **J82 · Fleet command to peer** · POST via fleet_command.py:525.
  Outcomes: target peer receives `events` channel (0x06) message; tier
  updated. CI: yes with stub PeerLink.

### Search / share
- **J83 · Share link** · share post → `/s/<token>` → ShareLandingPage.
  Outcomes: 200 HTML with post; view_counter++. CI: yes.
- **J84 · Search posts** · `/social/search` → `GET /api/social/search
  ?q=...`. Outcomes: ≥1 hit. CI: yes.

### Kids fleet
- **J85 · Teacher fleet-command all kids** · `POST /api/kids/fleet-
  command {message}` (kids_game_recommendation.py:506). Outcomes:
  dispatched over `events`; kids devices receive. CI: yes.

### Remote desktop
- **J86 · Start remote desktop host** · `POST /api/remote-desktop/host`
  (hart_intelligence_entry.py:8161). Outcomes: session row; port
  opened. CI: no.
- **J87 · Connect viewer** · `POST /api/remote-desktop/connect`.
  Outcomes: session mapped; frame stream. CI: no.

### Coding agent
- **J88 · Coding agent execute task** · `POST /coding/execute {task}`.
  Outcomes: result; tool_router chain recorded. CI: yes.
- **J89 · Hive task dispatch** · MCP `create_hive_task` →
  `dispatch_hive_tasks`. Outcomes: dispatched count ≥ 1;
  `hive.task.dispatched`. CI: yes.

### Video / audio gen
- **J90 · Video-gen job** · `POST /video-gen/` (hart_intelligence_entry
  .py:7772). Outcomes: job_id; `/status/<id>` → done; file present.
  CI: partial.
- **J91 · Audio-gen music** · acestep_tool with prompt. Outcomes:
  audio ≥ 2048 bytes. CI: partial.

### Skills
- **J92 · Ingest skill** · `POST /api/skills/ingest`
  (hart_intelligence_entry.py:7843). Outcomes: skill appears in
  `/list`. CI: yes.
- **J93 · Discover local** · `POST /api/skills/discover/local`.
  Outcomes: list non-empty if skills/ has manifests. CI: yes.

### Vault
- **J94 · Store + has + keys** · Bearer. `/api/vault/store` →
  `/has` → `/keys`. Outcomes: has=true; keys lists name. CI: yes.

### Misc
- **J95 · WAMP ticket mint + subscribe** · `GET /api/wamp/ticket` →
  open ws://:8088/ws with ticket → subscribe `chat.social.<user_id>`.
  Outcomes: subscribe success within 500ms. CI: partial.
- **J96 · Publish bridge** · `POST /publish {topic,data}`
  (main.py:2491). Outcomes: 200; subscriber receives within 500ms.
  CI: yes.
- **J97 · jslog bridge** · `POST /api/jslog`. Outcomes: entry in
  `~/Documents/Nunba/logs/server.log`. CI: yes.
- **J98 · Image proxy** · `GET /api/image-proxy?url=...`. Outcomes:
  200 image/* body ≥ 512 bytes. CI: partial.
- **J99 · Social SSE stream** · `GET /api/social/events/stream`
  (main.py:2561). Outcomes: EventSource receives ≥1 `notification`
  event when DM/mention occurs. CI: yes.

────────────────────────────────────────────────────────────────────────────
## GAPS FLAGGED (phase-2 skip list)

1. **J58 — DMs** — channel 0x09 `messages` defined (channels.py:92)
   but HTTP/WebSocket surface not yet mounted. Planned BATCH-2.
2. **J64 — HiveMind 3-level fusion** — `hivemind` channel exists
   (0x05, channels.py:64), PeerLink supports it, but explicit
   3-level fuse routine (`fuse_responses` / `hive_mind_query`) is
   not present. `backtrace_semantic(depth=5)` is closest surface.
3. **Some agent-state transitions** — `draft → review → approved` are
   event-driven; dedicated REST endpoints may be missing. Confirm
   via `agent_evolution_service.py` or mark sub-journeys GAP.
4. **"31 adapters" claim** — repo has 30 adapter files (8 core +
   22 extensions); the 31st counts only if `wamp_bridge.py` is
   tested as a channel.
5. `hive_benchmark_prover` has `challenge` flow; a `prove/verify`
   separate cryptographic routine is referenced in docs but
   implementation is intertwined with `challenge_model()`.

────────────────────────────────────────────────────────────────────────────
End of PRODUCT_MAP.md
