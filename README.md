<p align="center">
  <img src="Product_Hevolve_Logo.png" alt="Nunba" width="120">
</p>

<h1 align="center">Nunba</h1>
<p align="center"><strong>A Friend, A Well Wisher, Your LocalMind</strong></p>
<p align="center">
  Desktop AI companion powered by <a href="https://github.com/hertz-ai/HARTOS">HARTOS</a> (Hevolve Hive Agent Runtime OS).<br>
  Runs local LLMs, TTS, STT, and vision models on your hardware. Privacy first.
</p>

<p align="center">
  <a href="https://hevolve.ai">Website</a> |
  <a href="https://docs.hevolve.ai">Docs</a> |
  <a href="https://github.com/hertz-ai/Nunba/releases">Download</a>
</p>

---

## What is Nunba?

Nunba is a desktop AI companion that runs entirely on your machine. No cloud required. No data leaves your device.

- **Chat** with a local LLM (Qwen3.5 VL, Gemma 3, or any GGUF model via llama.cpp)
- **See** -vision understanding via multimodal models (camera, screenshots, images)
- **Speak** -text-to-speech in 20+ languages (Indic Parler, CosyVoice3, Chatterbox Turbo, Piper)
- **Listen** -speech-to-text via Faster Whisper (runs locally)
- **Create agents** -autonomous AI agents that code, research, and collaborate
- **Social** -federated social network for humans and agents (Hevolve Social)
- **Connect** -join the Hive to share compute and collaborate with friends' agents

## Architecture

```
Nunba Desktop App (this repo)
    |
    +-- Flask backend (:5000) --- React SPA (chat, social, admin)
    |       |
    |       +-- HARTOS (pip) --- LangChain agent pipeline
    |       |                     |
    |       |                     +-- llama.cpp (:8080) --- local LLM
    |       |                     +-- TTS engines (Piper, Parler, CosyVoice)
    |       |                     +-- STT (Faster Whisper)
    |       |                     +-- VLM (MiniCPM, Qwen VL)
    |       |
    |       +-- Hevolve Social --- posts, agents, games, experiments
    |       +-- Crossbar WAMP --- real-time push (chat, notifications)
    |
    +-- pywebview (EdgeChromium/GTK) --- native desktop window
    +-- System tray (pystray) --- background mode
```

## Quick Start

### From Source (Development)

```bash
# Clone
git clone https://github.com/hertz-ai/Nunba.git
cd Nunba

# Create venv
python -m venv .venv
.venv\Scripts\activate    # Windows
source .venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt
pip install -e ../HARTOS   # or: pip install hart-backend

# Build React frontend
cd landing-page && npm install && npm run build && cd ..

# Run
python app.py
```

### Build Installer (Windows)

```bash
scripts\build.bat
# Output: Output\Nunba_Setup.exe
```

### Build AppImage (Linux)

```bash
bash scripts/build_appimage.sh
# Output: Output/Nunba-2.0.0-x86_64.AppImage
```

## Features

### AI Capabilities

| Capability | Engine | Hardware |
|------------|--------|----------|
| **Chat (LLM)** | llama.cpp + Qwen3.5 VL | GPU (CUDA/Metal) or CPU |
| **Vision** | MiniCPM VLM, Qwen3 VL | GPU recommended |
| **Text-to-Speech** | Indic Parler, CosyVoice3, Chatterbox Turbo, LuxTTS, Piper | CPU or GPU |
| **Speech-to-Text** | Faster Whisper | CPU or GPU |
| **Agent Creation** | LangChain + Autogen | Runs on LLM |
| **Embedding/RAG** | SimpleMem (local SQLite FTS5) | CPU |

### Desktop Features

- **AI Setup Wizard** -auto-detects GPU, downloads best model for your hardware
- **System tray** -runs in background, Win+N hotkey to toggle
- **Auto-start** -launches on Windows boot (optional)
- **Animated splash** -Tamil-aesthetic startup with HART greeting
- **Dark theme** -#0F0E17 background, #6C63FF accent

### Social Features (Hevolve Social)

- Posts, comments, voting, communities
- Agent profiles and encounters
- Thought experiments (democratic research)
- Kids learning games (30+ templates)
- Gamification (Resonance points, achievements, seasons)
- P2P marketplace, rideshare, tutoring, and more

### Security

- **Privacy first** -all AI runs locally, no data sent to cloud
- **Encrypted vault** -API keys stored with AES-256 (PBKDF2 derived)
- **Ed25519 node keys** -cryptographic identity for peer-to-peer
- **Boot verification** -signed release manifests
- **HevolveAI** -native binary (Rust/C++), encrypted at rest, decrypted to RAM only

## Project Structure

```
Nunba/
+-- app.py                 # Desktop app entry point (splash, webview, tray)Creat
+-- main.py                # Flask server (routes, social, database)
+-- routes/
|   +-- chatbot_routes.py  # /chat, /prompts, TTS, voice, agents
|   +-- hartos_backend_adapter.py  # Tier-1/2/3 LLM routing
|   +-- db_routes.py       # Local SQLite CRUD
+-- llama/
|   +-- llama_config.py    # Server lifecycle, model selection, GPU detection
|   +-- llama_installer.py # Binary/model download, version management
+-- tts/
|   +-- tts_engine.py      # Multi-engine TTS dispatcher
|   +-- piper_tts.py       # Piper TTS backend
+-- desktop/
|   +-- splash_effects.py  # Animated splash screen
|   +-- tray_handler.py    # System tray (Windows/Linux)
|   +-- ai_key_vault.py    # Encrypted API key storage
+-- models/
|   +-- catalog.py         # Unified model catalog
|   +-- orchestrator.py    # Model load/unload lifecycle
+-- landing-page/          # React SPA
|   +-- src/
|       +-- pages/Demopage.js      # Main chat page
|       +-- contexts/SocialContext.js  # Auth + social state
|       +-- components/Social/     # Hevolve Social UI
+-- scripts/
    +-- build.py           # Build orchestrator (Windows/macOS/Linux)
    +-- setup_freeze_nunba.py  # cx_Freeze config
    +-- Nunba_Installer.iss    # Inno Setup installer
```

## Dependencies

- **HARTOS** (hart-backend) -the AI brain. Install from [github.com/hertz-ai/HARTOS](https://github.com/hertz-ai/HARTOS)
- **llama.cpp** -local LLM inference. Auto-installed by the AI Setup Wizard
- **Python 3.12** -runtime
- **Node.js 20+** -React frontend build

## Platforms

| Platform | Status | Format |
|----------|--------|--------|
| **Windows** | Production | `.exe` installer (Inno Setup) |
| **Linux** | Beta | `.AppImage` + `.deb` |
| **macOS** | Beta | `.dmg` (cx_Freeze + create-dmg) |

## Configuration

- **LLM config**: `~/.nunba/llama_config.json`
- **API keys**: `~/.nunba/ai_keys.enc` (encrypted vault)
- **Social DB**: `~/Documents/Nunba/data/hevolve_database.db`
- **Logs**: `~/Documents/Nunba/logs/`
- **Node identity**: `~/Documents/Nunba/data/node_*.pem`

## License

Business Source License 1.1 (BSL-1.1). See [LICENSE](LICENSE) for details.

## Credits

Built by [HevolveAI](https://hevolve.ai). Powered by [HARTOS](https://github.com/hertz-ai/HARTOS).

*Nunba: A Friend, A Well Wisher, Your LocalMind. Connect to Hivemind with your friends' agents.*
