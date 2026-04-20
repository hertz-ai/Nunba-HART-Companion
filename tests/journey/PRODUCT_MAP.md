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
## USER JOURNEYS — COMBINATIONS (J100-J199)

Each row follows the same citation discipline as J01-J99: every
combination names at least one `file:line` anchor so phase-6 test
generation can drive the real path. GAP rows note missing surface.

### Multi-turn conversation state (J100-J112)

- **J100 · English→Tamil language switch mid-session** · Pre: user
  sends `en` turn hits `/chat` (chatbot_routes.py), draft dispatch
  returns; turn N+1 body has `language=ta`. Steps: turn1 → assert
  draft used (speculative_dispatcher.py:179); turn2 → assert
  draft-skip fires because `ta` is in NON_LATIN_SCRIPT_LANGS
  (speculative_dispatcher.py:236-238) and 4B main handles it;
  `hart_language.json` rewritten via `set_preferred_lang`
  (user_lang.py:170). Verifiable: response2 contains Tamil Unicode
  codepoints; no 0.8B log for turn2. Owner: HARTOS speculative_
  dispatcher + core.user_lang. CI: yes. Depends on: J01, J03.
- **J101 · Agent A → Agent B switch, no message bleed** · Pre: two
  agents registered in `agent_data/`. Steps: POST /chat
  {active_agent_id:A} turn → POST /chat {active_agent_id:B} turn
  (landing-page uses localStorage `active_agent_id`, main.py chat
  propagates). Verify: Agent B's prompt used for turn2 (no residual
  system-prompt from A); per-agent memory isolation via
  MemoryGraph author filter (memory_graph.py). Owner: chatbot_routes
  + hart_intelligence_entry.py:4741 `get_ans`. CI: yes. Depends on:
  J19, J01.
- **J102 · Agentic multi-step plan with tool calls** · Pre: agent
  with autogen tier3. Steps: user→goal → agent_daemon._tick picks
  up (agent_daemon.py:81) → parallel_dispatch fans 2+ tools
  (agent_daemon.py:119-140) → each emits `goal.tool.result` → final
  `goal.completed`. Verify: ledger shows N tool rows; WAMP
  `goal.progress` received. Owner: agent_engine/agent_daemon +
  parallel_dispatch. CI: partial. Depends on: J19, J20.
- **J103 · Guest→login conversation preserved** · Pre: guest sends
  N messages under user_id='guest' (hart_intelligence_entry.py:2352
  default). Steps: /api/social/auth/login → on success, frontend
  merges `guest` MemoryGraph rows into authenticated user via
  POST /api/memory/migrate. Verify: recent memory list contains
  prior guest turns under new user_id. [GAP — explicit
  `/api/memory/migrate` endpoint absent; today frontend keeps a
  localStorage bridge only, server-side migration unimplemented].
  Depends on: J71.
- **J104 · Tool call chain: remember → recall → inference uses it** ·
  Steps: MCP `remember {content:"My dog is Max"}` → later
  `/chat "what is my dog's name?"` → hart_intelligence_entry includes
  recall hit via `memory_context`. Verify: response contains "Max";
  MemoryGraph rank>0 on recall. Owner: integrations/channels/memory
  + agent_memory_tools. CI: yes. Depends on: J71, J72.
- **J105 · LLM context window overflow → summarize → continue** ·
  Pre: conversation > 32k tokens. Steps: hart_intelligence_entry
  detects length near `LLAMA_CONTEXT` (llama_config.py), invokes
  summarizer; next turn accepts summary prefix. Verify: log shows
  "context compacted"; reply is coherent. [GAP — summariser hook
  referenced by docs but the window-overflow branch reuses
  truncation, no semantic compact; mark partial].
- **J106 · Interrupt mid-stream → reconnect → partial response
  recovered** · Pre: SSE /api/social/events/stream open. Steps:
  client closes during token stream → reconnects with
  `Last-Event-ID`. Verify: resumed stream carries from last id.
  [GAP — SSE stream (main.py:2561) does NOT persist per-event IDs
  across reconnect; only "live from now" semantics]. Owner: main.py
  SSE.
- **J107 · Expert delegation while draft already responded** · Pre:
  draft says `delegate:"local"` (speculative_dispatcher.py:179-260).
  Steps: draft reply arrives SSE event 1; expert reply arrives as
  event 2 via background expert task. Verify: 2 messages in UI, both
  tagged with distinct model_id (world_model_bridge.record_interaction).
  Owner: speculative_dispatcher + world_model_bridge. CI: yes.
  Depends on: J01.
- **J108 · Casual_conv switches to full-tool agentic in same session
  ** · Pre: default-agent chat with `casual_conv=True`
  (hart_intelligence_entry.py:3245-3325). Steps: turn 1 "hi" →
  draft path; turn 2 "create a Python script that..." → draft
  `delegate='local'` → expert goes full-LangChain (casual_conv
  flips to False via goal detection). Verify: turn2 response has
  tool-call trace; turn1 had none. Owner: hart_intelligence_entry.
  CI: partial. Depends on: J101.
- **J109 · Visual context + chat combo** · Steps: open
  `/webcam_ws` (port 5459) → 3-frame deque populated → /chat "what
  do you see?" → parse_visual_context reads Redis frame, POSTs to
  MiniCPM → caption injected into prompt. Verify: reply references
  a visible object; WS has >0 frames seen. Owner: video.py +
  parse_visual_context tool. CI: partial. Depends on: J77.
- **J110 · Multi-turn with draft model evict/reload** · Pre: draft
  evicted by ResourceGovernor OOM policy (resource_governor.py:469).
  Steps: turn 1 draft → OOM → evict → turn 2 should reload draft
  before draft-first dispatch. Verify: log
  `model_lifecycle.reload_draft`; latency spike on turn2 (cold).
  Owner: resource_governor + model_lifecycle. CI: partial.
  Depends on: J01.
- **J111 · Mid-session agent prompt edit** · Steps: edit agent's
  `agent_prompt` via `/custom_gpt` PUT (chatbot_routes.py) → next
  turn. Verify: turn2 system prompt contains new text; prior
  history survives (memory not wiped). Owner: chatbot_routes +
  agent_data JSON. CI: yes. Depends on: J19.
- **J112 · Two tabs, one user, interleaved chats** · Pre: same user
  has Nunba webview + admin tab. Steps: tab1 posts /chat while tab2
  posts /chat within 500ms. Verify: both receive distinct
  `prompt_id`s (speculative_dispatcher.py `prompt_id`); no cross-
  tab SSE leak (SSE filters on user topic). Owner: main.py SSE +
  WAMP realtime.py. CI: partial.

### Cross-language + TTS matrix combos (J113-J122)

- **J113 · Tamil chat then request "translate to English"** · Steps:
  /chat "vanakkam" with lang=ta → /chat "translate to English".
  Verify: turn2 reply Latin only; TTS on reply uses piper-en
  (tts_engine.py:1724). Owner: tts + hart_intelligence_entry. CI:
  yes. Depends on: J03.
- **J114 · Tanglish mixed codepoints in one reply** · Steps: /chat
  with lang=ta-mix body. Verify: response contains both Latin a-z
  AND Tamil \\u0b80-\\u0bff. TTS should route per-segment (indic
  for Tamil, piper for English). Owner: tts_engine + splitter.
  [GAP — per-segment TTS splitter not yet present; whole string
  synthesised by single engine picked by first-char rule].
- **J115 · TTS engine mid-flight swap on failure** · Pre: engine
  ladder = [indic_parler, piper]. Steps: first synth raises in
  indic_parler (mocked) → tts_engine.py:1042 _try_auto_install or
  ladder fallback uses piper. Verify: audio ≥ 2048 bytes; log
  shows engine=piper fallback. Owner: tts_engine. CI: yes with
  mock. Depends on: J02, J67.
- **J116 · Language auto-detect overrides stored preference** · Pre:
  hart_language.json = 'en'. Steps: user types "வணக்கம்" → user_lang
  request_override path (user_lang.py:110 get_preferred_lang
  accepts request_override). Verify: draft-skip fires despite stored
  'en'; reply Tamil. Owner: core.user_lang. CI: yes. Depends on: J03.
- **J117 · Per-agent language override vs global** · Pre: agentA
  metadata `preferred_lang=ta`; global='en'. Steps: /chat
  active_agent_id=A. Verify: 4B main used (draft-skip); reply Tamil.
  Owner: chatbot_routes + speculative_dispatcher. CI: yes. Depends
  on: J101, J116.
- **J118 · TTS while chat streaming** · Steps: streaming reply
  tokens → on each sentence-boundary, TTS submit-async (api in
  api_tts.py) → audio chunks fed to webview. Verify: first audio
  within 1s of first token; no race between synth calls. Owner:
  tts engine + SSE. CI: partial. Depends on: J02, J99.
- **J119 · Non-English STT → English reply + English TTS** · Steps:
  whisper transcribes Hindi audio → /chat with text+lang=hi →
  reply forced lang='en'. Verify: STT text has Devanagari; reply
  Latin; TTS piper-en. Owner: verified_stt.py + tts_engine.py. CI:
  partial.
- **J120 · Engine add then immediate synth** · Steps:
  /tts/setup-engine {engine:"kokoro"} (J67) → /tts/synth with
  engine=kokoro. Verify: audio ≥ 2048 bytes, engine matches.
  Owner: tts_engine. CI: yes. Depends on: J67.
- **J121 · VLM caption + TTS read-out** · Steps: camera frame →
  MiniCPM caption → /tts/quick {caption}. Verify: both stages
  emit events; final audio non-empty. Owner: vlm + tts. CI:
  partial. Depends on: J77, J60.
- **J122 · TTS for a 2KB reply doesn't lock engine for concurrent
  request** · Pre: two users. Steps: user A submits long TTS; user
  B submits short TTS. Verify: TTS queue (tts_engine queues) honors
  both; B completes before A's tail. Owner: tts_engine +
  VRAM-manager (resource_governor gpu_allowed). CI: partial.

### Hive 3-level combinations (J123-J134)

- **J123 · Depth-3 hive query fusion** · Steps: /chat with
  `intelligence_preference=hive_preferred` → speculative_dispatcher
  `dispatch_draft_first` returns delegate='hive' → PeerLink send on
  channel 0x05 (peer_link/channels.py:64) → peer queries peer-of-
  peer. Verify: response has origin chain of 3 hops. [GAP — explicit
  `fuse_responses` / `hive_mind_query` routine still missing; the
  backtrace_semantic(depth=5) (memory_graph.py:412) is closest
  surface but semantic not query-fusion; partial].
- **J124 · FederatedAggregator epoch crosses benchmark publish** ·
  Pre: epoch timer ticks (federated_aggregator.py:215 `tick`) while
  hive_benchmark_prover is emitting a challenge
  (hive_benchmark_prover.py:2604). Verify: aggregator snapshot
  includes the new benchmark row; no dedup race. Owner: federated_
  aggregator + hive_benchmark_prover. CI: partial.
- **J125 · Cross-user E2E encrypted offload with reality-ground
  check** · Pre: two users on private channel 0x01. Steps: UserA
  /api/distributed/tasks/announce → UserB claim (api.py:209) →
  execute → submit with signed result. Verify: payload on wire
  non-plaintext; reality-grounding delta <= threshold; verify_task
  returns True. Owner: distributed_agent + agent-ledger-opensource.
  CI: yes with stub. Depends on: J62, J63.
- **J126 · Peer offline mid-task → reclaimed by another claim** ·
  Steps: A claims task → crashes → coordinator_backends.py:78
  `reclaim_stale_tasks` expires lock → B claims → finishes. Verify:
  task has 2 attempt records; final result from B. Owner:
  coordinator_backends. CI: yes.
- **J127 · Benchmark challenge with model ensemble** · Steps: POST
  /api/hive/benchmarks/challenge with multiple model_ids →
  challenge_model loops (hive_benchmark_prover.py:2604); leaderboard
  updates per model. Verify: N rows in benchmark_result; ranking
  order stable. Owner: hive_benchmark_prover. CI: yes. Depends
  on: J65.
- **J128 · Gossip channel loses a peer → federation recovers** ·
  Steps: PeerLink subscriber drops; host_registry.py:105
  `_purge_stale` evicts after 2 min; next aggregate ignores it.
  Verify: purged logs; subsequent aggregate includes only live
  peers. Owner: host_registry + federated_aggregator. CI: yes.
- **J129 · Hive-signal spark + gamification balance across 2 users**
  · Steps: userA high-value signal (hive_signal_bridge.py:353) →
  userB sees shared gamification event. Verify: both wallets
  reflect spark; leaderboard deltas match. Owner: hive_signal_
  bridge + social gamification. CI: yes. Depends on: J78.
- **J130 · Depth-3 signature verification chain** · Steps: each hop
  signs its reply (agent-ledger signer). Verify at root: all 3
  signatures valid, tamper on middle hop detected (returns verify
  False). Owner: agent-ledger-opensource.backends. CI: partial.
- **J131 · Hive node tier promote mid-inference** · Pre: flat node.
  Steps: HEVOLVE_RESTART_REQUESTED fires during chat stream
  (main.py:2911). Verify: in-flight stream completes on the old
  process; new process assumes new tier. Owner: main.py watchdog.
  CI: partial. Depends on: J81.
- **J132 · Fleet-command sent while target is busy with chat** ·
  Steps: fleet_command.py:525 dispatches; target node has active
  /chat. Verify: message queued; processed after current turn;
  events channel emits both `received` and `executed`. Owner:
  fleet_command. CI: yes. Depends on: J82.
- **J133 · PeerLink NAT-traversal failure → fallback to relay** ·
  Steps: peer_link/nat.py punch fails → link.py:244 send uses
  relay path. Verify: send returns True; relay logged. Owner:
  peer_link/nat + link. CI: partial.
- **J134 · Hive task dispatch with >1 candidate picker** · Steps:
  MCP create_hive_task (J89) with `min_peers=2` → 2 peers claim
  → votes combined. Verify: final result is consensus; each peer
  has claim row. Owner: distributed_agent + MCP. CI: partial.
  Depends on: J89.

### Memory + restore + persistence (J135-J144)

- **J135 · Guest conversation persists across webview close+reopen**
  · Pre: Windows, WebView2 UserData preserved at
  `%LOCALAPPDATA%/Nunba/WebView2`. Steps: guest chats → close
  webview → reopen. Verify: SPA renders prior turns from IndexedDB;
  no server round-trip needed. Owner: landing-page chat context +
  webview. CI: no (desktop). Depends on: J01.
- **J136 · Logged-in user: localStorage + server memory merged** ·
  Steps: SPA loads → fetch /api/memory/recent → merge with
  localStorage → render. Verify: no duplicate memory rendered;
  relevance rank stable. Owner: landing-page chat + memory_graph.
  CI: yes.
- **J137 · Uninstall+reinstall with WebView2 UserData retained →
  auto-scroll to last turn per agent** · Pre: uninstaller leaves
  UserData. Steps: reinstall → open → landing-page reads
  `active_agent_id` and scroll anchor from IndexedDB. Verify:
  last-visible message scrolled into view. Owner: landing-page +
  webview. CI: no.
- **J138 · MemoryGraph FTS5 recall >100 memories, relevance-ranked
  ** · Pre: 100 remember tool calls. Steps: recall with semantic
  query. Verify: result ordered by bm25 rank, not insertion;
  top-5 semantically matches. Owner: memory_graph.py FTS5. CI:
  yes.
- **J139 · Memory TTL / privacy wipe with forward-secrecy check**
  · Steps: /api/memory/<id> DELETE → subsequent inference does NOT
  cite deleted fact. Verify: /chat "recall X" misses X; MemoryGraph
  row gone; embedding evicted from cache. Owner: memory_graph +
  cache_loaders.py. CI: yes. Depends on: J73.
- **J140 · Backtrace chain crosses agent boundary** · Pre: memory
  `m1` owned by agentA, `m2` linked by agentB. Steps: backtrace_
  memory from m2 (memory_graph.py:412). Verify: returns chain
  including m1 only if author ACL allows; else empty. Owner:
  memory_graph ACL. CI: yes. Depends on: J72.
- **J141 · Memory write+read while FedAggregator embeds in the
  background** · Steps: remember tool fires while aggregate_
  embeddings (federated_aggregator.py:685) runs. Verify: no SQLite
  locked; both complete; FTS5 row contains new memory. Owner:
  memory_graph SQLite WAL + aggregator. CI: partial.
- **J142 · Corrupt memory_graph.db recovered gracefully** · Pre:
  truncate .db mid-file. Steps: boot Nunba. Verify: main.py init
  logs `degradation:memory_graph` into registry (J80) but chat
  still boots; recall returns empty. Owner: memory_graph init.
  CI: partial.
- **J143 · Memory backtrace depth bound honored** · Steps: call
  backtrace with depth=100 on 10-chain. Verify: returns 10, not
  infinite loop; elapsed <50ms. Owner: memory_graph.py:412.
  CI: yes.
- **J144 · Cross-topology memory sync flat → regional** · Pre:
  flat node has 50 memories. Steps: promote to regional →
  federated_aggregator aggregate_embeddings pushes. Verify: central
  aggregator has same count from this node. Owner: federated_
  aggregator. CI: partial. Depends on: J131.

### Install / offline / degradation (J145-J154)

- **J145 · AI installer partial success: LLM ok, TTS fail** · Steps:
  run `--install-ai` with TTS install step mocked to fail. Verify:
  exit code non-zero OR UI shows per-component status; LLM server
  bootable; /api/admin/diag/degradations lists `tts_installer`.
  Owner: desktop/ai_installer + degradation registry. CI: partial.
  Depends on: J66, J80.
- **J146 · Offline boot with cached models only** · Pre: remove
  network; HF cache populated. Steps: Nunba boot. Verify:
  HF_HUB_OFFLINE=1 (main.py:31); /chat succeeds; no outbound
  sockets (capture with pcap). Owner: main.py + llama_config. CI:
  yes. Depends on: J69.
- **J147 · Disk full (ENOSPC) mid-install → graceful rollback** ·
  Pre: emulate via quota. Steps: install_gpu_torch (tts/package_
  installer.py:430) hits ENOSPC mid-extract. Verify: fallback path
  fires (app.py:1636); no partial `torch/` dir left; degradation
  registry entry. Owner: package_installer + app.py. CI: partial.
- **J148 · CUDA torch missing → CPU inference + audible TTS** ·
  Pre: uninstall torch. Steps: /chat + /tts/synth. Verify: chat
  works via llama-cpp CPU; piper CPU path synths audio. Owner:
  llama_config + tts_engine. CI: yes.
- **J149 · GPU OOM mid-session → ResourceGovernor evicts + retries
  CPU** · Pre: small VRAM emulation. Steps: /chat with long
  context. Verify: torch CUDA OOM caught; model_lifecycle evicts
  draft; next call succeeds on CPU. Owner: resource_governor.py:
  469 + model_lifecycle. CI: partial.
- **J150 · Provider key rotated mid-call → gateway retries next-
  best** · Pre: 2 providers in gateway (providers/). Steps: start
  /chat via groq; revoke key via /api/admin/providers/groq/api-key
  DELETE (main.py:1978); provider returns 401. Verify: gateway
  retries next-ranked (main.py:2039 stats reflect); final reply
  non-empty. Owner: integrations/gateway. CI: yes. Depends on: J74,
  J75.
- **J151 · HF_HUB_OFFLINE forced → installer ladder reorders to
  local-only** · Steps: set HF_HUB_OFFLINE=1; click auto-setup.
  Verify: only local-GGUF candidates considered; hub_allowlist not
  called; /api/llm/status stays healthy. Owner: llama_config +
  main.py:31. CI: yes.
- **J152 · Plugin missing → optional_import graceful** · Pre:
  remove `autogen_agentchat`. Steps: boot. Verify:
  core/optional_import.py registers degradation; Tier3 flow
  produces clear error not crash. Owner: optional_import +
  degradation registry. CI: yes.
- **J153 · PyInstaller freeze lacks a new module** · Steps:
  simulate missing runtime module from cx_Freeze packages[]. Verify:
  app.py path-isolation fallback (app.py:697-702 partial-torch
  stub pattern) or clear ModuleNotFoundError. Owner: scripts/
  setup_freeze_nunba.py + app.py. CI: no (freeze-only).
- **J154 · Install on D:\ (NUNBA_DATA_DIR)** · Pre: set
  NUNBA_DATA_DIR=D:\Nunba. Steps: boot. Verify: get_data_dir()
  returns D:\Nunba (platform_paths.py:30-43); torch under D:;
  CUDA optional. Owner: core.platform_paths. CI: partial. Depends
  on: J68.

### Concurrency + race (J155-J164)

- **J155 · 2 simultaneous /chat requests same user** · Steps:
  concurrent POST /chat from same user_id. Verify: each has own
  prompt_id; both complete; no SSE cross-talk; memory rows have
  distinct ids. Owner: chatbot_routes + speculative_dispatcher.
  CI: yes.
- **J156 · Admin swaps active model while chat mid-stream** ·
  Steps: start long /chat → /api/admin/models/swap (main.py:1522).
  Verify: in-flight completes on old llama-server; next request
  uses new model. Owner: main.py swap + llama_config. CI: partial.
- **J157 · Camera + chat + TTS all firing** · Steps: webcam WS
  open, /chat streaming, /tts/quick in same second. Verify: no
  audio underrun in TTS; Redis frame counter > 0; GPU share honors
  ResourceGovernor lock. Owner: resource_governor + audio pipeline.
  CI: partial.
- **J158 · Two users same channel adapter concurrent inbound** ·
  Steps: 2 WebSocket inbounds on channel_bindings adapter for same
  channel_id. Verify: both routed to agent; no row lost; per-user
  context isolated. Owner: integrations/channels + api_channels.
  py:61. CI: yes. Depends on: J52.
- **J159 · WAMP flood 100 events in 5s none dropped** · Steps:
  subscriber opens ws://:8088/ws → publisher posts 100 events via
  /publish (main.py:2491). Verify: subscriber receives 100 within
  7s. Owner: crossbar + wamp_router. CI: yes. Depends on: J96.
- **J160 · Simultaneous `remember` writes with FTS5** · Steps: 50
  parallel MCP remember calls. Verify: all 50 rows present; no
  `database is locked`; WAL size sane. Owner: memory_graph SQLite
  WAL. CI: yes.
- **J161 · Parallel agent_daemon tick + manual dispatch** · Steps:
  daemon tick while user POSTs /coding/execute. Verify: no lock
  conflict; both produce distinct ledger rows. Owner: agent_daemon
  + coding_agent. CI: yes. Depends on: J88.
- **J162 · Hot-reload chatbot_routes while /chat active** · Steps:
  reload blueprint (dev-only) while request mid-flight. Verify:
  active request not killed; new route-set live for next. Owner:
  chatbot_routes. CI: no (dev).
- **J163 · Two Provider retries overlap** · Steps: two /chat both
  fail primary; both retry secondary. Verify: gateway semaphore
  honored (stats show sequential); leaderboard not double-
  decremented. Owner: integrations/gateway + providers. CI:
  partial.
- **J164 · Post+comment+vote race on same post** · Steps: within
  200ms POST vote + POST comment + edit post. Verify: all 3
  persisted; WAMP ordering preserved by posted_at. Owner:
  integrations/social. CI: yes. Depends on: J53, J54, J55.

### Security / SSRF / escape (J165-J174)

- **J165 · Image proxy DNS rebind (TOCTOU)** · Pre: attacker
  hostname resolves to public once (for _is_private_ip check) then
  127.x on the real fetch. Steps: /api/image-proxy?url=attacker.
  Verify: MUST return 4xx/5xx not 200. [GAP — main.py:2238 only
  resolves ONCE for validation then again for requests.get; no
  pinned-IP fetch; TOCTOU possible. Owner: main.py image_proxy].
- **J166 · WAMP subscribe with spoofed user_id** · Steps: client
  requests /api/wamp/ticket (main.py:2535), mints for self, then
  subscribes to `chat.social.<someone-else>`. Verify: router
  refuses or returns empty topic; ticket-auth binds topic to
  issuer's user_id. Owner: wamp_router + realtime.py:118.
  CI: yes.
- **J167 · MCP token rotation mid-session** · Steps: call MCP tool
  with tokenA → rotate via /api/admin/mcp/token/rotate (main.py:
  3259) → same client call → gets 401 → client re-fetches
  /api/admin/mcp/token (main.py:3231) → success. Verify: no data
  leak on 401; rotation logged. Owner: mcp bridge. CI: yes.
- **J168 · Admin upload PDF with embedded JS sanitized** · Steps:
  upload PDF containing JS OpenAction. Verify: sanitizer strips
  JS; downstream renderer shows no alert; DOMPurify on any HTML
  extracted. Owner: integrations/admin upload + landing-page
  DOMPurify. [GAP — explicit PDF-JS stripper not present; relies
  on non-execution in viewer. Mark partial.]
- **J169 · Hub install from non-allowlisted org refused** · Steps:
  POST /api/admin/models/hub/install {repo:"eviloss/gguf"}. Verify:
  403 with org name; main.py:1773 `is_trusted` returns False;
  trusted_orgs list attached. Owner: core.hub_allowlist. CI: yes.
- **J170 · File-scheme SSRF** · Steps: /api/image-proxy?url=file://
  /etc/passwd. Verify: 400 "Only http/https URLs" (main.py:2266).
  CI: yes.
- **J171 · data-scheme SSRF** · Steps: url=data:text/html,<script>.
  Verify: 400 same guard. CI: yes.
- **J172 · javascript-scheme SSRF** · Steps: url=javascript:alert.
  Verify: 400. CI: yes.
- **J173 · /publish bridge with untrusted remote origin** · Steps:
  POST /publish from non-loopback. Verify: 403 (main.py:2491 guarded
  by @require_local_or_token). Owner: main.py. CI: yes.
- **J174 · Guardrails hash tamper** · Steps: mutate hive_guardrails.
  py contents; call /api/harthash (main.py:1192). Verify: hash
  differs from expected; admin alarm. Owner: GUARDRAILS + main.py.
  CI: yes.

### User-journey drift / edge (J175-J184)

- **J175 · Kids: teacher broadcasts to 5 students, all audio plays
  ** · Steps: /api/kids/fleet-command (kids_game_recommendation.py:
  506) → events channel (0x06) → 5 listeners → each plays TTS.
  Verify: 5 receipts; each synth ≥ 2048 bytes. Owner: kids +
  fleet_command + tts. CI: partial. Depends on: J85, J60.
- **J176 · Agent persona edit → next turn uses new persona** ·
  Covered by J111 behaviorally; extended here to check WAMP
  `agent.updated` event. Verify: subscribers get update; SPA re-
  renders badge. Owner: agent_engine + crossbar. CI: yes.
- **J177 · Onboarding aborted mid-flow → resumable** · Steps:
  /api/onboarding/start (:21) → /advance partial → kill process →
  reopen. Verify: /status shows partial state; /advance resumes at
  last step. Owner: hart_onboarding. CI: yes. Depends on: J61.
- **J178 · Payment failure → subscription NOT upgraded** · Steps:
  mock provider returns 402 → frontend handler does NOT flip
  access_tier. Verify: `/api/social/auth/me` still prior tier.
  Owner: social/auth. CI: yes.
- **J179 · Single-instance guard: launch twice** · Steps: launch
  Nunba.exe; while running launch again. Verify: second process
  exits 0 after pinging /api/focus (app.py:245-249); first window
  raised via api_focus (app.py:4469-4486). Owner: app.py. CI: no
  (desktop).
- **J180 · Tray quit while chat mid-stream** · Steps: chat streaming
  → tray Quit. Verify: stream aborted cleanly; no zombie on :5000
  :8080 :8081 :8088. Owner: desktop/tray + llama_config. CI: no
  (desktop). Depends on: J70.
- **J181 · Language switched but agent has per-agent override** ·
  Covered by J117 but adds: UI shows agent badge in new language
  glyph set. Owner: landing-page i18n. CI: yes.
- **J182 · Guest hits admin URL** · Steps: /admin/* as guest.
  Verify: RoleGuard in AdminLayout redirects to /login; 403 on
  admin API if attempted. Owner: landing-page RoleGuard + admin_bp
  before_request. CI: yes.
- **J183 · Onboarding language vs profile language conflict** ·
  Steps: onboarding sets lang=ta; user edits profile to en later.
  Verify: set_preferred_lang (user_lang.py:170) is single writer;
  no stale values. Owner: core.user_lang. CI: yes.
- **J184 · Kids mode while mainstream chat active** · Steps: admin
  enables kids mode (filters chat + tools); user continues chat.
  Verify: subsequent /chat filters NSFW; existing stream unaffected.
  Owner: kids_media + hive_guardrails. CI: partial.

### Tier / topology transitions (J185-J194)

- **J185 · flat → regional promote, channel bindings survive** ·
  Steps: tier promotion (main.py:2911 watcher) → re-exec. Verify:
  channel_bindings table intact (api_channels.py:61 store); MCP
  token regenerated OR preserved per rotation policy. Owner:
  main.py + api_channels. CI: partial. Depends on: J81, J52.
- **J186 · regional → central promote, peer ledger replicates** ·
  Steps: node becomes central → host_registry re-bootstraps;
  agent-ledger entries replicated to central DB. Verify: ledger
  row-count matches pre-promote on both sides. Owner: host_
  registry + agent-ledger-opensource. CI: partial.
- **J187 · Node config restore after crash** · Pre: kill -9.
  Steps: restart. Verify: agent_daemon resumes pending goals from
  ledger; no duplicate dispatch; ResourceGovernor resumes MODE_
  ACTIVE. Owner: agent_daemon.py:81 + resource_governor.py:469.
  CI: partial.
- **J188 · Tier downgrade: central → regional** · Steps: manual
  demote. Verify: aggregator stops emitting central-only metrics;
  federated_aggregator.tick gracefully enters regional mode;
  /api/v1/system/tiers reports new tier. Owner: federated_
  aggregator + main.py:2216. CI: partial.
- **J189 · SQLite flat → MySQL regional migration** · Steps: set
  HEVOLVE_DB_URL=mysql://. Verify: hevolve_database engine swaps;
  existing tables recreated in MySQL; no data loss if migrator
  ran. [GAP — live migration tool not present; today operator
  exports+imports; mark no.]
- **J190 · Crossbar restart while WAMP clients connected** ·
  Steps: kill crossbar → it restarts → clients auto-reconnect.
  Verify: subscribers resubscribe within 5s; tickets re-minted via
  main.py:2535. Owner: wamp_router + crossbar. CI: partial.
- **J191 · Peer joins mid-aggregate epoch** · Steps: aggregator
  tick window open; new peer announces. Verify: included in NEXT
  epoch, not this one; no double-count. Owner: federated_
  aggregator.py:215. CI: yes.
- **J192 · Flat node with no hive available** · Steps: hive
  endpoints unreachable. Verify: dispatch_draft_first delegate=
  'hive' degrades to 'local'; degradation registry lists
  `peer_link`. Owner: speculative_dispatcher + degradation. CI:
  yes.
- **J193 · Central admin pushes guardrail update → propagates** ·
  Steps: central updates hive_guardrails → fleet_command push
  (fleet_command.py:525) → flat node /api/harthash differs. Verify:
  hash updated; admin notified. Owner: fleet_command + GUARDRAILS.
  CI: partial. Depends on: J82, J174.
- **J194 · Agentic plan spans tier promote** · Steps: long goal
  dispatched pre-promote; promote happens mid-plan. Verify: agent_
  daemon resumes plan in new tier; goal ledger consistent. Owner:
  agent_daemon + tier watcher. CI: no.

### Auto-evolve + journey-engine combos (J195-J199)

- **J195 · Auto-evolve mid-iteration paused then resumed** · Steps:
  POST /api/social/experiments/auto-evolve → POST pause-evolve →
  iterate once manually → POST resume-evolve. Verify: iteration
  history contiguous; no duplicate scoring. Owner: auto_evolve.py
  + autoresearch_loop. CI: yes. Depends on: J20.
- **J196 · Journey engine: user abandons mid-journey** · Steps:
  journey_engine (integrations/agent_engine/journey_engine.py)
  starts a 5-step path → user closes app at step 3 → reopen.
  Verify: resume at step 3; partial-completion logged. Owner:
  journey_engine. CI: partial.
- **J197 · AutoEvolve → democratic vote → constitutional filter
  drops a hypothesis** · Pre: hypothesis violates GUARDRAILS.
  Steps: vote tally → filter. Verify: rejected hypothesis NOT
  dispatched; stored with reason. Owner: auto_evolve.py. CI: yes.
- **J198 · Coding agent loop: execute → fail → fix → re-execute**
  · Steps: /coding/execute with broken tool call → tool_router
  returns error → agent retries with fix → success. Verify: 2
  attempt rows in ledger; final result non-empty. Owner: coding_
  daemon + tool_router. CI: yes. Depends on: J88.
- **J199 · Kids game + auto-evolve combo** · Steps: kids game
  produces learning signal → auto_evolve iterates difficulty.
  Verify: next session recommends harder template; benchmark row
  captured. Owner: kids + auto_evolve. CI: partial. Depends on:
  J59, J20.

────────────────────────────────────────────────────────────────────────────
End of PRODUCT_MAP.md
