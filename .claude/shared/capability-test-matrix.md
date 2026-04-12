# Capability Test Matrix — every feature the testing agent must exercise against the live Nunba instance

This is the **enumerated test backlog**. The master-orchestrator picks the next unchecked item every iteration and dispatches the testing agent against it. Each item has a status column (`⏸` untested / `▶` in-progress / `✅` passing / `❌` failing / `⚠️ flaky`), the last-tested timestamp, and a reference to the test-failures entry if any.

## Priority 1 — chat + agentic flows

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 1.1 | Plain chat: "hi" → draft classifier fires → response + TTS audio | ⚠️ | 2026-04-12 19:42 | PARTIAL: Response works ("Hello! How can I help you today?") via Tier-2 llama_local. get_tools SKIPPED confirmed. 5.6s 2nd request. TTS not verified. Draft-first envelope not active (source=llama_local not langchain_local). Hot-patched build. |
| 1.2 | Plain chat: substantive question → full LangChain path → response + TTS | ⏸ | — | Tool-using path |
| 1.3 | Plain chat: non-English input → draft classifies language → reply in same language | ⏸ | — | Hindi, Japanese, Arabic |
| 1.4 | Plain chat: greeting variants ("hello", "hey there", "good morning") → each produces a reply + TTS | ⏸ | — | |
| 1.5 | Plain chat: multi-turn conversation (5+ exchanges) → context preserved across turns | ⏸ | — | |
| 1.6 | Plain chat: very long message (>2000 chars) → no truncation, reply coherent | ⏸ | — | |
| 1.7 | Plain chat: markdown / code block input → parsed correctly, reply preserves formatting | ⏸ | — | |
| 1.8 | Plain chat: emoji-heavy message → classifier handles, TTS strips before synth | ⏸ | — | |
| 1.9 | Plain chat: under VRAM pressure → graceful degradation, reply still produced | ⏸ | — | |
| 1.10 | Plain chat: while another request is in flight → queued, both return | ⏸ | — | concurrency |
| 1.11 | Plain chat: with `casual_conv=true` → skips action history fetch | ⏸ | — | |
| 1.12 | Plain chat: while MiniCPM sidecar unhealthy → VLM fallback path chosen | ⏸ | — | |
| 1.13 | Plain chat: with streaming enabled → tokens arrive incrementally via Crossbar | ⏸ | — | |
| 1.14 | Agentic_Router tool fires → Plan Mode → multi-step response | ⏸ | — | |
| 1.15 | Create_Agent tool fires (interactive) → gather_info flow → Creation Mode | ⏸ | — | |
| 1.16 | Create_Agent tool fires (autonomous) → full recipe pipeline → Review Mode | ⏸ | — | |
| 1.17 | Reuse path: prompt_id with existing agent config → chat_agent flow | ⏸ | — | |
| 1.18 | Evaluation mode: after agent creation, conversation enters eval → feedback loop | ⏸ | — | |

## Priority 2 — model management + lifecycle

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 2.1 | Main LLM boots at warmup with 4B-VL + mmproj | ⏸ | — | Eager-boot fix 69effd9 |
| 2.2 | Draft 0.8B boots at warmup with own mmproj | ⏸ | — | Same |
| 2.3 | Draft 0.8B is pinned — never evicted on idle | ⏸ | — | T6 fix 9bad341 |
| 2.4 | Main 4B pressure_evict_only — survives 340s idle | ⏸ | — | Same |
| 2.5 | Whisper evicts on 300s idle (default policy) | ⏸ | — | Regression guard |
| 2.6 | Chatterbox evicts on 600s idle | ⏸ | — | |
| 2.7 | Swap cycle: load model A → pressure → swap A for B → B ready | ⏸ | — | |
| 2.8 | CPU offload: main LLM demoted to CPU under VRAM pressure | ⏸ | — | |
| 2.9 | Model crash recovery: kill llama-server mid-request → auto-restart → serve next request | ⏸ | — | |
| 2.10 | Admin UI model management page: list / load / unload / reconfigure | ⏸ | — | `/admin/models` |
| 2.11 | Model catalog sync: catalog.json drives available models in UI | ⏸ | — | |
| 2.12 | mmproj download on first use: missing mmproj → auto-fetch → cached | ⏸ | — | |
| 2.13 | VRAM budget enforcement: two models requesting > 8GB → second rejected | ⏸ | — | |
| 2.14 | Model idle timeout override via env var (HEVOLVE_WHISPER_IDLE_TIMEOUT) | ⏸ | — | |

## Priority 3 — VLM / computer use / GUI automation

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 3.1 | Computer_Screenshot tool → take screenshot → VLM describes it | ⏸ | — | |
| 3.2 | Computer_Action tool → natural language click on visible button | ⏸ | — | |
| 3.3 | Computer_Action tool → type text into visible input | ⏸ | — | |
| 3.4 | Computer_Action tool → scroll to element | ⏸ | — | |
| 3.5 | Shell_Command tool → `notepad hello.txt` → launches notepad | ⏸ | — | |
| 3.6 | Shell_Command tool → `powershell: Get-Process` → returns process list | ⏸ | — | |
| 3.7 | Shell_Command tool → denylisted pattern `rm -rf /` → refusal | ⏸ | — | Security regression |
| 3.8 | Shell_Command tool → homoglyph bypass `ｒｍ -rf ~` → refusal (NFKC) | ⏸ | — | Same |
| 3.9 | Execute_Coding_Task tool → kilocode invocation → result returned | ⏸ | — | |
| 3.10 | Execute_Windows_Or_Android_Command → cross-OS dispatch | ⏸ | — | |
| 3.11 | Request_Camera_Access consent card → approval → VisionService starts | ⏸ | — | |
| 3.12 | Request_Screen_Access consent card → approval → screen capture starts | ⏸ | — | |
| 3.13 | Visual_Context_Camera tool → parse_visual_context → scene description | ⏸ | — | |
| 3.14 | Visual_Context_Watcher tool → continuous monitoring → fires on trigger | ⏸ | — | |
| 3.15 | Qwen3-VL point_and_act → screenshot → click coordinates → success | ⏸ | — | |
| 3.16 | MiniCPM sidecar → caption frames → publish to agent context | ⏸ | — | T8 parallel path concern |

## Priority 4 — TTS / STT / voice

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 4.1 | TTS ladder: chatterbox_turbo → fails → kokoro → piper → espeak | ⏸ | — | |
| 4.2 | Chatterbox turbo: English → audio plays via /tts/audio/<file> | ⏸ | — | Currently broken (PackageNotFoundError) |
| 4.3 | Kokoro 82M: English → audio plays | ⏸ | — | |
| 4.4 | Piper: English → audio plays | ⏸ | — | |
| 4.5 | Indic Parler: Hindi → audio plays | ⏸ | — | |
| 4.6 | F5-TTS: voice cloning with reference audio | ⏸ | — | |
| 4.7 | CosyVoice: multi-speaker synthesis | ⏸ | — | Currently broken (module missing) |
| 4.8 | TTS speed profile: slow/balanced/fast → pitch preservation | ⏸ | — | commit c649c8c |
| 4.9 | Whisper base: English 30s audio → transcription | ⏸ | — | |
| 4.10 | Sherpa Moonshine: low-latency STT for voice chat | ⏸ | — | |
| 4.11 | Voice-to-voice full loop: user speaks → STT → chat → TTS → plays | ⏸ | — | |
| 4.12 | TTS reuse path: chat_agent from reuse_recipe fires _chat_reply → TTS | ⏸ | — | T4 fix 969de02 |

## Priority 5 — channels (WhatsApp / Telegram / Discord / Slack / etc.)

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 5.1 | Telegram: Connect_Channel tool → token → registered | ⏸ | — | |
| 5.2 | Telegram: external message → reaches /chat → agent reply → back to Telegram | ⏸ | — | |
| 5.3 | Telegram: group chat + mention filter | ⏸ | — | |
| 5.4 | WhatsApp: QR auth flow → paired → receive messages | ⏸ | — | |
| 5.5 | WhatsApp: media message (image) → VLM processes → reply | ⏸ | — | |
| 5.6 | Discord: bot token → registered → channel messages | ⏸ | — | |
| 5.7 | Slack: bot token → workspace → DM + channel | ⏸ | — | |
| 5.8 | Email: IMAP/SMTP → receive + reply | ⏸ | — | |
| 5.9 | SMS: Twilio/Plivo → receive + reply | ⏸ | — | |
| 5.10 | Channel fan-out: one reply to bound user → delivered on every active channel | ⏸ | — | |
| 5.11 | UserChannelBinding: Telegram +1234 mapped to user_id 42 | ⏸ | — | |
| 5.12 | Channel rate limiting: 30 msgs/min → 31st rejected | ⏸ | — | |

## Priority 6 — scheduled jobs / background tasks

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 6.1 | create_scheduled_jobs: cron expression → apscheduler registers | ⏸ | — | |
| 6.2 | Scheduled agent: fires at cron time → executes → logs result | ⏸ | — | |
| 6.3 | List_Pending_Actions tool → returns upcoming jobs + reminders | ⏸ | — | |
| 6.4 | Visual scheduled task: cron + visual frame → VLM trigger | ⏸ | — | |
| 6.5 | Persistent across restart: scheduled job survives Nunba reboot | ⏸ | — | |
| 6.6 | Timezone handling: IST cron fires at correct UTC moment | ⏸ | — | |
| 6.7 | Daemon threads: agent_daemon / coding_daemon / auto_discovery / model_lifecycle all healthy (heartbeats fresh) | ⏸ | — | T5 fix a33c43a |
| 6.8 | Watchdog restart: kill a daemon → watchdog detects → restarts | ⏸ | — | |

## Priority 7 — agent creation / reuse / evolution

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 7.1 | Create_Agent (interactive): 5-question gather_info → recipe JSON | ⏸ | — | |
| 7.2 | Create_Agent (autonomous): LLM-generated answers → full recipe | ⏸ | — | |
| 7.3 | Agent lifecycle: Creation Mode → Review Mode → Reuse Mode → Evaluation Mode | ⏸ | — | |
| 7.4 | Agent reuse: prompt_id with existing recipe → chat_agent path | ⏸ | — | |
| 7.5 | Auto-evolve: democratic selection → constitutional filter → iteration | ⏸ | — | |
| 7.6 | Agent memory: remember tool → recall_memory → context persists | ⏸ | — | |
| 7.7 | Agent memory: backtrace_memory → shows inference chain | ⏸ | — | |
| 7.8 | Consult_expert tool: domain matching → expert prompt injection | ⏸ | — | |
| 7.9 | Delegate_to_specialist: A2A communication + task_ledger tracking | ⏸ | — | |
| 7.10 | Share_context_with_agents + get_shared_context: cross-agent state | ⏸ | — | |
| 7.11 | Agent drift detection: agent behavior changes → auto-flag | ⏸ | — | |

## Priority 8 — UI / UX / frontend

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 8.1 | Nunba SPA loads at localhost:5000/local → chat panel visible | ⏸ | — | |
| 8.2 | Chat input: type "hi" → send → reply bubble appears | ⏸ | — | |
| 8.3 | Chat input: long message → auto-resizing textarea | ⏸ | — | |
| 8.4 | Chat input: markdown preview → renders via DOMPurify | ⏸ | — | |
| 8.5 | TTS audio element: reply arrives → audio plays automatically | ⏸ | — | |
| 8.6 | Social feed at /social: posts render with avatars, upvote, comment | ⏸ | — | |
| 8.7 | Agent overlay: Liquid UI consent card appears on capability request | ⏸ | — | |
| 8.8 | Admin dashboard at /admin: charts, metrics, settings | ⏸ | — | Requires admin auth |
| 8.9 | Admin model management: list → toggle enabled → VRAM updates | ⏸ | — | |
| 8.10 | Admin channels: list → add Telegram token → saved → tested | ⏸ | — | |
| 8.11 | Theme / token system: dark mode → consistent colors | ⏸ | — | |
| 8.12 | Keyboard navigation: tab through chat → shortcuts work | ⏸ | — | a11y |
| 8.13 | Reduced motion: prefers-reduced-motion → animations suppressed | ⏸ | — | a11y |
| 8.14 | Mobile viewport (375px): layout doesn't break, touch targets ≥44px | ⏸ | — | |
| 8.15 | LiquidActionBar: Navigate_App tool → page chips render | ⏸ | — | |

## Priority 9 — games / kids media

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 9.1 | Kids games page: list of templates → clickable cards | ⏸ | — | |
| 9.2 | Math trainer: start → question → answer → feedback | ⏸ | — | |
| 9.3 | Spelling bee: start → audio word → typed answer → score | ⏸ | — | |
| 9.4 | Memory match: card grid → flip pairs → match detection | ⏸ | — | |
| 9.5 | Game asset loading: 3-tier (local → HARTOS → cloud) | ⏸ | — | GameAssetService.js |
| 9.6 | Game realtime: score updates via Crossbar (gameRealtimeService.js) | ⏸ | — | |
| 9.7 | Game TTS: question audio via `/api/social/tts/quick` | ⏸ | — | |
| 9.8 | Parental mode: restricted content → filter → approved | ⏸ | — | |

## Priority 10 — API contracts / HTTP surface

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 10.1 | POST /chat with valid body → 200 JSON response | ⏸ | — | |
| 10.2 | POST /chat with missing user_id → 400 | ⏸ | — | |
| 10.3 | POST /chat with invalid prompt_id → 400 | ⏸ | — | |
| 10.4 | POST /time_agent → scheduled execution triggered | ⏸ | — | |
| 10.5 | POST /visual_agent → VLM pipeline triggered | ⏸ | — | |
| 10.6 | POST /add_history → message saved to memory | ⏸ | — | |
| 10.7 | GET /api/social/feed → returns feed JSON | ⏸ | — | |
| 10.8 | GET /api/admin/agents → requires Bearer auth (B1 regression) | ⏸ | — | |
| 10.9 | GET /status → healthcheck returns 200 | ⏸ | — | |
| 10.10 | POST /channels/status → channel registry state | ⏸ | — | |
| 10.11 | POST /channels/send → send message via named channel | ⏸ | — | |
| 10.12 | GET /tts/voices → list available voices | ⏸ | — | |
| 10.13 | POST /tts/synthesize → audio URL | ⏸ | — | |
| 10.14 | GET /tts/audio/<file> → audio bytes streamed | ⏸ | — | |
| 10.15 | GET /prompts/<id> → prompt definition | ⏸ | — | |
| 10.16 | POST /prompts → create new prompt | ⏸ | — | |

## Priority 11 — real-time push (Crossbar WAMP)

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 11.1 | Crossbar router on :8088 healthy | ⏸ | — | |
| 11.2 | `com.hertzai.hevolve.chat.{uid}` topic receives thinking bubbles | ⏸ | — | |
| 11.3 | `com.hertzai.pupit.{uid}` topic receives TTS audio URLs | ⏸ | — | |
| 11.4 | `com.hertzai.hevolve.game.{session}` → game state pushes | ⏸ | — | |
| 11.5 | `com.hertzai.longrunning.log` → task status events | ⏸ | — | |
| 11.6 | Web Worker crossbarWorker.js → autoconnects + reconnects | ⏸ | — | |
| 11.7 | RN native AutobahnConnectionManager → DeviceEventEmitter forwards | ⏸ | — | |
| 11.8 | SSE fallback disabled when WAMP available → no duplicate delivery | ⏸ | — | |

## Priority 12 — security / auth

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 12.1 | /api/admin/* without Bearer token → 401 on central tier | ⏸ | — | B1 regression |
| 12.2 | /api/admin/* without Bearer token → 401 on regional tier | ⏸ | — | B1 fix |
| 12.3 | /chat with valid JWT → 200 | ⏸ | — | |
| 12.4 | /chat with expired JWT → 401 | ⏸ | — | |
| 12.5 | Shell_Command denylist: every pattern blocked | ⏸ | — | |
| 12.6 | Prompt injection: "ignore previous instructions" → agent refuses | ⏸ | — | |
| 12.7 | Secret redaction: API keys in logs → redacted | ⏸ | — | |
| 12.8 | HMAC secret persists: agent_data/.hmac_secret written on boot | ⏸ | — | Currently failing — Program Files read-only |
| 12.9 | CSP headers on responses | ⏸ | — | |
| 12.10 | CSRF protection on state-changing endpoints | ⏸ | — | |

## Priority 13 — hive / federation

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 13.1 | Peer discovery: UDP broadcast on :6780 → other nodes visible | ⏸ | — | |
| 13.2 | Gossip protocol: peer announcement → propagated | ⏸ | — | |
| 13.3 | Federated aggregator: delta signed + exchanged | ⏸ | — | |
| 13.4 | Compute relay: request via Crossbar → peer handles → response | ⏸ | — | M1 security fix pending |
| 13.5 | Constitutional filter: prompt rejected before expert dispatch | ⏸ | — | |
| 13.6 | HiveCircuitBreaker: is_halted() → all model calls abort | ⏸ | — | |
| 13.7 | Resonance tuner: user feedback → model weights adjust | ⏸ | — | |

## Priority 14 — error surface / recovery

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 14.1 | llama-server crash mid-chat → auto-restart → retry | ⏸ | — | |
| 14.2 | Crossbar disconnect → reconnect with backoff | ⏸ | — | |
| 14.3 | DB lock → timeout with 3s busy_timeout (SQLite flat) | ⏸ | — | |
| 14.4 | Disk full → graceful refusal + alert | ⏸ | — | |
| 14.5 | OOM on model load → swap to smaller tier | ⏸ | — | |
| 14.6 | Network partition (offline) → queued writes, no data loss | ⏸ | — | |
| 14.7 | Process kill (SIGKILL on Unix, TerminateProcess on Windows) → cleanup | ⏸ | — | |

## Priority 15 — misc

| # | Capability | Status | Last tested | Notes |
|---|---|---|---|---|
| 15.1 | Hotkey Win+N registers (Windows only) | ⏸ | — | Currently failing (log shows registration failed) |
| 15.2 | System tray icon + menu | ⏸ | — | |
| 15.3 | Auto-update check: new version available → prompt | ⏸ | — | |
| 15.4 | Crash reporter: exception → report written to frozen_debug.log | ⏸ | — | |
| 15.5 | Installer: fresh install → first-run wizard → chat works | ⏸ | — | |
| 15.6 | Uninstall: clean removal of all state | ⏸ | — | |
| 15.7 | Onboarding: Light Your HART ceremony → element + spirit assigned | ⏸ | — | |
| 15.8 | Kids onboarding: age verification → restricted mode | ⏸ | — | |

---

## Rules for the testing agent

1. **Pick the next ⏸ item** in priority order. The orchestrator may override with a specific directive, but absent that, go top-down.
2. **Execute the live test** per the testing-agent protocol (health check → simulate action → observe pipeline → capture 9 evidence items).
3. **Update this file**: change `⏸` to `▶` while running, then to `✅` / `❌` / `⚠️` based on outcome. Add the timestamp. Add a one-line note if relevant.
4. **Append failures** to `.claude/shared/test-failures.md` with back-reference to this matrix row.
5. **File a task** for every `❌` via TaskCreate.
6. **Come back around**: once every item has a status (even ⚠️), restart from the top with the oldest timestamp and re-verify. The matrix is a continuous rolling sweep, not a one-pass.

---

*This matrix is append-only for new capabilities — never delete rows. When a feature is removed from the product, mark its rows `N/A` with a note but keep the history. Over 24 hours of 5-min iterations, the testing agent should touch every Priority 1-8 item at least once.*
