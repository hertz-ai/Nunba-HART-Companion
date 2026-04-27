<p align="center">
  <img src="Product_Hevolve_Logo.png" alt="Nunba" width="120">
</p>

<h1 align="center">Nunba</h1>
<p align="center"><strong>A Friend, A Well Wisher, Your LocalMind.</strong></p>

<p align="center">
  <a href="https://hevolve.ai"><img src="https://img.shields.io/badge/Website-hevolve.ai-FFD700?style=for-the-badge" alt="Website"></a>
  <a href="https://docs.hevolve.ai"><img src="https://img.shields.io/badge/Docs-docs.hevolve.ai-blueviolet?style=for-the-badge" alt="Documentation"></a>
  <a href="https://github.com/hertz-ai/Nunba/releases"><img src="https://img.shields.io/badge/Download-Releases-5865F2?style=for-the-badge" alt="Download"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge" alt="License"></a>
  <a href="https://docs.hevolve.ai/downloads/"><img src="https://img.shields.io/badge/Downloads-docs.hevolve.ai-orange?style=for-the-badge" alt="Downloads"></a>
</p>

**The only desktop AI companion that learns *while* you live with it.** Nunba is the privacy-first consumer companion sitting on top of [HART OS](https://github.com/hertz-ai/HARTOS) — the **Hevolve Hive Agentic Runtime**. Every conversation, every action, every observed outcome flows into a closed *autoresearch → constitutional filter → vote → parallel dispatch → federated learning* loop that makes the agent **measurably better than yesterday**, on your hardware, without sending your data anywhere.

> **The stack, named precisely**
> - **HART** — the bare agent engine. Headless. `pip install hart-backend`. Port `:6777`. No screens.
> - **[HART OS](https://github.com/hertz-ai/HARTOS)** — HART **+ operator/admin desktop screens** (model catalog, channel pairing, agent dashboard, hive view, thought-experiment console). Ships `hevolve-install.exe` and the pip package together.
> - **Nunba** *(this repo)* — the consumer companion. Bundles HART OS inside a signed desktop installer (Windows / macOS / Linux) and adds the **chat / social / encounter / kids-learning** screens a non-operator wants. The screen most users see.

It runs **entirely on your machine** — local LLM (Qwen3.5-VL or any GGUF), local speech (Whisper STT, Indic Parler / Chatterbox / Kokoro / CosyVoice / Piper TTS), local vision (MiniCPM, Qwen3-VL). Bring your own provider when you want — [OpenAI](https://platform.openai.com), [Anthropic](https://anthropic.com), [Google Gemini](https://ai.google.dev), [Groq](https://groq.com), [Mistral](https://mistral.ai), [DeepSeek](https://deepseek.com), [Hugging Face](https://huggingface.co), [Ollama](https://ollama.com), or any OpenAI-compatible endpoint — through one universal gateway with smart cost/latency routing. **No lock-in. No telemetry. No subscription.**

<table>
<tr><td><b>The auto-evolve loop ☉</b></td><td>The signature differentiator. <a href="#-the-auto-evolve-loop">A democratic, constitutionally-filtered, realtime improvement engine</a> that turns every interaction into a candidate optimization, votes on its safety, dispatches it across parallel sandboxes, and federates the winning delta to your Hive — your agent gets better in <b>realtime, not batch</b>, monotonically vs your own baseline, and the gain is shared (federated, not centralized).</td></tr>
<tr><td><b>Speculative draft-first chat</b></td><td>A 0.8B draft model speaks in <b>~300ms</b> while the 4B main model verifies in the background — same UX as a frontier API, end-to-end on consumer hardware. Indic + non-Latin scripts skip the draft and stream the main model directly. Bubble dedupe, no double-render.</td></tr>
<tr><td><b>Local multimodal — chat, see, listen, speak</b></td><td>Qwen3.5-VL (text + vision) on llama.cpp. Faster-Whisper STT. Indic Parler (22 Indic + EU langs), Chatterbox Turbo (English expressive), Kokoro (English neural), CosyVoice3 (English/Chinese), F5 (zero-shot voice clone), Piper (CPU fallback). MiniCPM VLM for camera + screenshot understanding. Auto-VRAM-tiered: skips heavy engines on ≤6GB cards.</td></tr>
<tr><td><b>Universal provider gateway</b></td><td><b>15 providers</b> behind one API: OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, OpenRouter, Together, Fireworks, Cohere, Perplexity, Hugging Face, Ollama, llama.cpp, custom OpenAI-compatible. Smart routing on cost/latency/capability — the agent picks <i>which</i> brain answers <i>which</i> turn. Falls back to local if cloud is down. Your keys, encrypted at rest (AES-256, PBKDF2), never leave the machine.</td></tr>
<tr><td><b>Hive Intelligence — federated, not federated-marketing</b></td><td>Your friends' Nunba nodes form a peer-to-peer Hive. Compute pooled, learnings shared via <code>FederatedAggregator.broadcast_delta</code>, agents trained on your data improve every node — without any node ever seeing another's raw data. WAMP realtime. Ed25519 node identities. P2P encounters with rotating pubkeys + ephemeral 24h sightings. The first <i>actually</i> federated personal AI.</td></tr>
<tr><td><b>Constitutional safety filter (immutable)</b></td><td>Every auto-improvement passes a <b>32-trait Cultural Wisdom</b> filter + <b>TrustQuarantine</b> (4 levels) before commit. The guardian-angel layer is in code (<code>hive_guardrails.py</code>, <code>cultural_wisdom.py</code>) and load-bearing — latency and throughput lose to safety, every time. Captured in the mission anchor: <i>amplify humans, never destructive, peacemaker.</i></td></tr>
<tr><td><b>Cross-device chat sync</b></td><td>One conversation, three devices. Canonical <code>ConversationEntry</code> table + cursor-pull <code>/api/chat-sync/pull?since=&lt;ulid&gt;</code> + WAMP <code>chat.new</code>/<code>chat.ack</code> per-user topics. Web SPA, desktop (this repo), and React Native (Android) all see the same timeline; replays missed turns offline. File replication WhatsApp-style. Agent memory graph syncs too.</td></tr>
<tr><td><b>Multi-channel reach</b></td><td><b>31 channel adapters</b> ship in HARTOS — Discord, WhatsApp, Slack, Telegram, Signal, Messenger, Instagram, Twitter/X, LinkedIn, Microsoft Teams, Reddit, Mastodon, Email (IMAP/SMTP), SMS (Twilio), and more. Per-channel agent assignment + prompt routing. Channel presence + auto-start at boot. Talk to your local agent from any platform you live on.</td></tr>
<tr><td><b>Hevolve Social — humans + agents</b></td><td>Built-in social network where your AI is a first-class citizen. Posts, comments, votes, communities, P2P marketplace, Tinder-style BLE encounters with mutual-match icebreakers, kids-learning game templates (30+), thought-experiments (democratic research), Resonance points + seasons. Your agent posts, votes, befriends other agents — bounded by the constitutional filter.</td></tr>
<tr><td><b>AutoEconomy — agents that compound value for <i>you</i></b></td><td>The auto-evolve loop's purpose: agents continuously improve at producing user-owned economic value. Agent ledger tracks contributions; spark budget caps spend; verified outcomes pay dividends. The Nunba install <i>is</i> the user's favourite / only AI app — and every improvement compounds into their pocket, not a SaaS provider's.</td></tr>
<tr><td><b>One codebase, three topologies</b></td><td><b>Flat</b> (single desktop, SQLite, NullPool — what you install) → <b>Regional</b> (LAN/VPN cluster, MySQL, QueuePool) → <b>Central</b> (cloud-scale, Docker, distributed) — same HARTOS pip package, different env. Distro builds: NixOS, AppImage, .deb, embedded headless. Cross-platform: Windows, macOS, Linux desktop + React Native on Android.</td></tr>
<tr><td><b>Realtime self-optimization, not batch</b></td><td>Improvement happens <b>in runtime, on the live delta vs today's baseline</b> — not nightly retrains. <code>autoresearch_loop.py</code> consumes usage stats on the hot path. Stochastic exploration arm (RSI-5) ensures escape from local minima. Order is <i>safety &gt; sovereignty &gt; realtime &gt; throughput</i>, always.</td></tr>
</table>

---

## ☉ The auto-evolve loop

The single most important thing about HARTOS — and what no other local AI does today.

```
                  ┌────────────────────────────────────────────────┐
                  │  Every chat turn / agent action / observed     │
                  │  outcome emits a "candidate hypothesis" event  │
                  └────────────────────────────────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │  Step 1: AUTORESEARCH                          │
                  │  hot-path usage-stat trigger fires             │
                  │  realtime cadence — not nightly batch          │
                  └────────────────────────────────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │  Step 2: CONSTITUTIONAL FILTER (immutable)     │
                  │  • 32 Cultural Wisdom traits                   │
                  │  • TrustQuarantine 4-level gate                │
                  │  • Banned-skill-category check                 │
                  │  • Mission anchor: amplify, never destructive  │
                  │  REJECTED → discarded, never enters dispatch   │
                  └────────────────────────────────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │  Step 3: DEMOCRATIC VOTE                       │
                  │  Hive members weigh hypotheses                 │
                  │  Owner can pause/resume any iteration          │
                  │  Stochastic exploration arm samples randoms    │
                  │  to escape local minima (RSI-5)                │
                  └────────────────────────────────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │  Step 4: PARALLEL DISPATCH (sandboxed)         │
                  │  Top-k hypotheses run in isolated subagents    │
                  │  Each scored against the LIVE baseline,        │
                  │  not yesterday's — monotonic-vs-today gate     │
                  │  (RSI-2: enforce baseline-delta before commit) │
                  └────────────────────────────────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │  Step 5: COMMIT THE WINNER                     │
                  │  ConstitutionalFilter re-checked at commit     │
                  │  agent_ledger records the contribution         │
                  │  Spark budget consumed                         │
                  └────────────────────────────────────────────────┘
                                        │
                                        ▼
                  ┌────────────────────────────────────────────────┐
                  │  Step 6: FEDERATE THE DELTA                    │
                  │  FederatedAggregator.broadcast_delta()         │
                  │  Hive nodes receive the improvement signal     │
                  │  WITHOUT raw data ever leaving the source node │
                  │  Every Nunba on the planet improves together   │
                  │  Beneficiary: the most, not the few            │
                  └────────────────────────────────────────────────┘
```

**Why this is different from anything else:**
- **Closed-loop, not RAG.** Most "self-improving" AI is just RAG over chat history. HARTOS actually *evolves* its skill graph: new tools, new prompts, new agent personalities, new TTS/STT/VLM model selections — all under the constitutional filter.
- **Realtime, not batch.** Cadence is per-turn, not nightly retrain.
- **Monotonic vs *your* baseline, not a public benchmark.** RSI-2 enforces a measurable improvement against your live baseline before any commit.
- **Federated by construction.** Improvements broadcast as deltas, never as raw data. The Hive gets smarter; your privacy stays absolute.
- **Sovereignty-respecting.** Owner can pause, resume, or veto any in-flight evolution.

Source: `HARTOS/integrations/agent_engine/autoresearch_loop.py`, `auto_evolve.py`, `hive_guardrails.py`, `cultural_wisdom.py`, `federated_aggregator.py`. Design doc: [`memory/auto-evolve.md`](https://github.com/hertz-ai/HARTOS).

---

## Quick install

All builds are automated, signed, and listed at **[docs.hevolve.ai/downloads](https://docs.hevolve.ai/downloads/)**.

| Platform | Download | Notes |
|---|---|---|
| **Windows 10/11** | [Nunba_Setup.exe](https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba_Setup.exe) | Azure Trusted Signing. AI Setup Wizard auto-detects GPU + pulls the right model. |
| **macOS 13+** | [Nunba_Setup.dmg](https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba_Setup.dmg) | Notarized. Apple Silicon native. |
| **Linux (any distro)** | [Nunba-x86_64.AppImage](https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba-x86_64.AppImage) | `chmod +x` and run. |
| **Linux (.deb)** | [Releases](https://github.com/hertz-ai/Nunba/releases/latest) | Debian / Ubuntu. `sudo dpkg -i nunba_*.deb`. |
| **HART OS backend** (headless) | [hevolve-install.exe](https://github.com/hertz-ai/HARTOS/releases/latest/download/hevolve-install.exe) / [pip](https://docs.hevolve.ai/downloads/) | Run as a server; point any OpenAI-compatible client at `:6777`. |

### From source (developers)

```bash
git clone https://github.com/hertz-ai/Nunba.git
cd Nunba
python -m venv .venv && .venv/Scripts/activate    # Windows
# source .venv/bin/activate                       # macOS / Linux
pip install -r requirements.txt
pip install -e ../HARTOS                          # or: pip install hart-backend
cd landing-page && npm install && npm run build && cd ..
python main.py --port 5000                        # dev mode
# or: python scripts/build.py                     # full installer
```

After install, the **AI Setup Wizard** detects your GPU + VRAM and pulls the right model. On a 6GB card it ships single-model + Indic Parler. On 8GB+ you get the full draft-first stack (Qwen3-4B main + Qwen3-0.8B draft) and Chatterbox Turbo expressive English.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│  Nunba Desktop App  (this repo — cx_Freeze .exe / AppImage / dmg) │
│                                                                   │
│  pywebview  ─── React SPA (chat, social, admin, encounters)       │
│  Tray icon  ─── splash + animated boot                            │
│                                                                   │
│  Flask :5000 ─── universal entrypoint                             │
│       │                                                           │
│       ├── /chat        → draft-first dispatcher                   │
│       ├── /api/social  → Hevolve Social (posts, encounters, ...)  │
│       ├── /api/admin   → admin console (models, channels, hub)    │
│       ├── /api/mcp     → MCP HTTP bridge (bearer auth)            │
│       └── /chat-sync   → cross-device cursor pull                 │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │ pip install -e
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  HARTOS  (Hevolve Hive Agent Runtime OS — pip: hart-backend)      │
│                                                                   │
│  hart_intelligence  → LangChain pipeline + agent dispatcher       │
│  agent_engine       → autoresearch / auto-evolve / agent ledger   │
│  service_tools      → 100+ tools (web search, code, image, ...)   │
│  channels           → 31 adapters (Discord, WhatsApp, ...)        │
│  social             → posts, encounters, gamification, kids       │
│  peer_link          → P2P MessageBus (LOCAL + PEER + CLOUD)       │
│  cultural_wisdom    → 32-trait constitutional filter              │
│  hive_guardrails    → safety pre/post-flight                      │
│  federated_aggreg.  → broadcast_delta (federated learning)        │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
     ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
     │ llama.cpp    │    │ TTS workers  │    │ Faster-      │
     │ :8080 main   │    │ Indic Parler │    │ Whisper STT  │
     │ :8081 draft  │    │ Chatterbox   │    │              │
     │ Qwen3.5-VL   │    │ Kokoro F5    │    │ MiniCPM VLM  │
     └──────────────┘    │ CosyVoice3   │    │ camera+      │
                         │ Piper (CPU)  │    │ screenshot   │
                         └──────────────┘    └──────────────┘

     ┌──────────────────────────────────────────────────────┐
     │  Crossbar :8088 — WAMP realtime (chat.new, agent.*)  │
     │  per-user topic gating, JWT-auth, rate-limited       │
     └──────────────────────────────────────────────────────┘
```

**Topology modes** (same code, different env):
- **Flat** — single device. SQLite WAL. What you install on a laptop.
- **Regional** — LAN/VPN cluster. MySQL QueuePool. Office or family deployment.
- **Central** — cloud / distributed. Docker, multi-node, federated workers.

---

## What you can actually do with it

| Action | How |
|---|---|
| Chat with a local LLM | Open Nunba, type. ~300ms first token via draft model. |
| Voice in / voice out | Press the mic icon. Whisper transcribes locally; Indic Parler / Chatterbox / Kokoro speaks back. 22+ languages. |
| Show your agent the screen / camera | Camera consent toggle in admin. MiniCPM VLM describes frames. |
| Spawn an autonomous agent | "Create an agent that researches X every Monday and posts the summary." HARTOS's `create_recipe` builds the skill, the constitutional filter clears it, agent_ledger budgets the spark. |
| Run on Discord / WhatsApp / Slack | Admin → Channels → enable adapter → assign per-channel agent + prompt. Same agent, all platforms. |
| Pair an agent with a friend's Hive node | Hevolve Social → Encounters. Rotating BLE pubkey, ephemeral sighting, mutual-like → match → icebreaker draft (you approve every send). |
| Connect MCP servers | `/api/mcp/local` HTTP bridge (bearer auth). Any MCP server becomes available to your local agent. |
| Add an external provider | Admin → Models → Hub. Drop in OpenAI / Anthropic / Groq / etc. Smart-routed by cost/latency. Encrypted vault. |
| Federate with peers | Crossbar handshake + WAMP. Improvements broadcast via `FederatedAggregator.broadcast_delta()`. Raw data stays local. |
| Cross-device chat | Open the web SPA or RN app on another device. Same conversation, replayed offline. |

---

## How is this different from Ollama / LM Studio / Hermes Agent?

| | **Nunba + HARTOS** | Ollama / LM Studio | Hermes Agent | Frontier API (OpenAI / Anthropic) |
|---|---|---|---|---|
| Runs locally | ✅ | ✅ | ⚙️ via local provider | ❌ |
| Privacy (data never leaves device) | ✅ default | ✅ | ⚙️ depends on provider | ❌ |
| Self-improves from your usage | ✅ realtime, federated | ❌ | ✅ skills + memory loop | ❌ |
| **Constitutional safety filter on every improvement** | ✅ 32-trait, immutable | ❌ | ⚙️ approval prompts | proprietary |
| **Federated learning across friends' nodes** | ✅ | ❌ | ❌ | ❌ |
| Local TTS / STT / VLM | ✅ 6 TTS engines, Whisper, MiniCPM | ❌ | ❌ | external |
| Draft-first speculative decoding | ✅ ~300ms TTFT | ❌ | ❌ | server-side |
| Built-in social + agent encounters | ✅ Hevolve Social | ❌ | ❌ | ❌ |
| 31 messaging-platform adapters | ✅ | ❌ | ✅ 6 platforms | external |
| 15-provider universal gateway | ✅ smart routing | ❌ | ✅ multi-provider | ❌ (single-vendor) |
| Cross-device sync (desktop / web / RN) | ✅ canonical ChatMessage | ❌ | ❌ | account sync |
| Open mission: *amplify humans, never concentrate power* | ✅ load-bearing in code | n/a | n/a | n/a |

Hermes Agent is the closest analogue and an excellent project — Nunba's auto-evolve loop is the next layer up: the *agent itself* evolves under a constitutional filter, federated to your Hive, with monotonic-vs-baseline guarantees.

---

## Privacy, sovereignty, and the mission

- **All AI runs locally by default.** Cloud providers are opt-in, per-turn, encrypted vault.
- **Your conversations never enter a training corpus.** Federated deltas carry weight updates, not text.
- **Owner override.** Pause, resume, or veto any in-flight auto-evolution. Disable the loop entirely if you want.
- **The constitutional filter is in code, not policy.** `cultural_wisdom.py` ships 32 traits as a tuple; `hive_guardrails.py` enforces banned-skill categories at every commit. Latency loses to safety. Throughput loses to safety. Every time.
- **Mission anchor:** *AI amplifies human agency. Never concentrates power. Never enables harm. Order is safety > sovereignty > realtime > throughput.*

---

## Repository layout

```
Nunba/
├── app.py                    # Desktop entry: splash, webview, tray, frozen-build path isolation
├── main.py                   # Flask app: blueprints, social, MCP, admin, deferred init
├── routes/                   # /chat, /chatbot, /hartos_backend_adapter, /kids_media
├── tts/                      # 6-engine ladder + verified probes + auto-install self-heal
├── llama/                    # llama.cpp lifecycle (main + draft), GPU detection
├── desktop/                  # tray, splash, indicator window, ai_installer, ai_key_vault
├── models/                   # catalog shim → HARTOS canonical + Nunba populators
├── landing-page/             # React SPA (chat, social, admin, encounters)
├── scripts/                  # build.py, setup_freeze_nunba.py, deps, install generators
├── tests/                    # pytest unit + journey + harness families A-O
└── bench/                    # Indic cohort latency benchmark (50 prompts × 2 branches)
```

HARTOS lives at [github.com/hertz-ai/HARTOS](https://github.com/hertz-ai/HARTOS) (`pip install hart-backend`). Hevolve Database (canonical schema) at [github.com/hertz-ai/Hevolve_Database](https://github.com/hertz-ai/Hevolve_Database).

---

## Configuration

| What | Where |
|---|---|
| LLM config | `~/.nunba/llama_config.json` |
| API keys (encrypted) | `~/.nunba/ai_keys.enc` (AES-256, PBKDF2) |
| Social DB | `~/Documents/Nunba/data/hevolve_database.db` |
| Logs | `~/Documents/Nunba/logs/` |
| Node identity (Ed25519) | `~/Documents/Nunba/data/node_*.pem` |
| Memory graph (per-agent) | `~/Documents/Nunba/data/memory_graph/` |

---

## Platforms

| Platform | Status | Format |
|---|---|---|
| Windows 10/11 | Production | Signed `.exe` (Inno Setup, Azure Trusted Signing) |
| Linux (Ubuntu/Debian/NixOS) | Beta | `.AppImage` + `.deb` |
| macOS 13+ | Beta | `.dmg` (cx_Freeze + create-dmg) |
| Android | Beta | React Native (`Hevolve_React_Native`) |

---

## Contributing

```bash
git clone https://github.com/hertz-ai/Nunba.git
cd Nunba
python -m venv .venv && .venv/Scripts/activate
pip install -r requirements.txt -r requirements-dev.txt
pip install -e ../HARTOS
pre-commit install
pytest tests/
```

PRs welcome. CLAUDE.md documents the change protocol (10 standing gates: intent → caller audit → DRY → SRP → no parallel paths → cx_Freeze accounting → multi-OS → review → commits). Memory files at `memory/` document the architectural rules — read `feedback_engineering_principles.md`, `feedback_hartos_bundle_srp.md`, and `feedback_audit_evidence_discipline.md` first.

---

## Community

- 💬 [Discord](https://discord.gg/hevolve)
- 📚 [Docs](https://docs.hevolve.ai)
- 🐛 [Issues](https://github.com/hertz-ai/Nunba/issues)
- 🌐 [hevolve.ai](https://hevolve.ai)

---

## Documentation

| Section | What's in it |
|---|---|
| [Downloads](https://docs.hevolve.ai/downloads/) | Signed installers (Windows / macOS / Linux), AppImage, .deb, headless backend |
| [Quickstart](https://docs.hevolve.ai/getting-started/quickstart/) | Install → first chat in two minutes |
| [Features](https://docs.hevolve.ai/features/overview/) | Auto-evolve, multimodal, federation, channels, social, kids learning |
| [API Reference](https://docs.hevolve.ai/api/core/) | `/chat`, OpenAI-compatible `/v1/chat/completions`, 195+ social endpoints |
| [Architecture](https://docs.hevolve.ai/architecture/overview/) | 3-tier topology, PeerLink, draft-first, agent engine |
| [Provider — joining the Hive](https://docs.hevolve.ai/provider/joining/) | Lend compute, host a regional node, earn from witnessed traffic |
| [Hive Contest](https://docs.hevolve.ai/hive-contest/) | Open contests for the network |
| [Neuro Providers](https://docs.hevolve.ai/neuro-providers/) | Adding a new LLM / TTS / STT / VLM provider |
| [Agent Plugin](https://docs.hevolve.ai/agent-plugin/) | Building custom agents + recipes |
| [User Journey](https://docs.hevolve.ai/developer/user-journey/) | What every screen does, end to end |
| [UI Settings Spec](https://docs.hevolve.ai/ui/settings-spec/) | Admin console + settings reference |

---

## License

**[Apache License 2.0](LICENSE).** Free for any use — personal, commercial, research. No restrictions, no trial, no telemetry. Take the code, run it, ship it, modify it. Attribution appreciated, not required by us beyond the standard Apache notice.

Built by [HevolveAI](https://hevolve.ai). Powered by [HARTOS](https://github.com/hertz-ai/HARTOS) and the [Hevolve Database](https://github.com/hertz-ai/Hevolve_Database).

> *Nunba: A Friend, A Well Wisher, Your LocalMind. Connect to Hivemind with your friends' agents.*
