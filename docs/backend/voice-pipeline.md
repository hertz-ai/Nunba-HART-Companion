# Voice Pipeline

Nunba has a full voice pipeline: speech-to-text (STT), text-to-speech (TTS), and speaker diarization.

## Overview

```
Microphone → Whisper STT (server, GPU) → Chat
                                           ↓
Speaker ← TTS Engine (quality-ordered ladder) ← Chat Response ← LLM
           → WAMP/SSE push → frontend auto-play
```

## Text-to-Speech (TTS) — 11-Engine Quality Ladder

The TTS engine walks a quality-ordered preference list per language. First runnable engine wins. If an engine fails, it automatically falls to the next.

### English Ladder
1. **Chatterbox Turbo** (0.95 quality, GPU, voice clone) — needs 3.8GB VRAM
2. **F5-TTS** (0.91, GPU, EN/ZH voice clone) — auto-installed via `~/.nunba/site-packages/`
3. **LuxTTS** (0.93, CPU, English voice clone) — in-process via HARTOS tool
4. **Indic Parler** (0.90, GPU, 22 Indic + English) — auto-installed
5. **Kokoro** (0.88, GPU preferred, English) — auto-installed with espeak-ng
6. **Pocket-TTS** (0.85, CPU, English voice clone) — in-process
7. **Piper** (0.70, CPU, multilingual) — bundled, always available
8. **espeak** (0.40, CPU, 100+ languages) — ultimate fallback

### Indic Languages (Hindi, Tamil, Telugu, Bengali, etc.)
indic_parler → chatterbox_ml → espeak

### CJK (Chinese, Japanese, Korean)
cosyvoice3 → f5_tts → chatterbox_ml → espeak

### Auto-Install
When a higher-quality engine is selected but not installed, the auto-installer (`tts/package_installer.py`) runs in the background:
- Installs pip packages to `~/.nunba/site-packages/`
- Downloads model weights from HuggingFace
- Current request falls to next available engine
- Next request uses the newly installed engine

Configure in `.env`:
```bash
TTS_ENGINE=piper
TTS_VOICE=en_US-lessac-medium
```

TTS API endpoints:
- `POST /api/social/tts/quick` — immediate audio for short text
- `POST /api/social/tts/submit` — async job for longer text
- `GET /api/social/tts/status/:taskId` — poll job status

## Speech-to-Text (STT)

### Client-Side (Web Speech API)

For real-time streaming transcription, the frontend uses the browser's Web Speech API. This requires no server-side setup.

### Server-Side (Whisper)

For higher accuracy, Nunba can use OpenAI Whisper on the backend:

```bash
pip install openai-whisper
```

The backend auto-selects the Whisper model based on available VRAM:

| VRAM | Model | Speed |
|------|-------|-------|
| < 2 GB | `tiny` | Fastest |
| 2-4 GB | `base` | Fast |
| 4-8 GB | `small` | Good accuracy |
| 8+ GB | `medium` | Best accuracy |

STT endpoint: `POST /voice/transcribe`

## Speaker Diarization

Identifies who is speaking in multi-speaker audio.

### Setup

Requires a HuggingFace token (for pyannote model access):

```bash
pip install whisperx pyannote.audio
```

1. Get a token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
2. Accept the pyannote model license at [huggingface.co/pyannote/speaker-diarization](https://huggingface.co/pyannote/speaker-diarization-3.1)
3. Set the token: `export HF_TOKEN=hf_...`

### Running

The diarization service runs as a WebSocket sidecar on port 8004, started automatically by `main.py` as a daemon thread.

Endpoint: `POST /voice/diarize`

## Architecture

| Component | Port | Transport | Purpose |
|-----------|------|-----------|---------|
| Browser PocketTTS | — | In-browser | English TTS, zero latency |
| Piper/VibeVoice | 5000 | HTTP | Server-side TTS |
| Whisper STT | 5000 | HTTP | Speech-to-text |
| Diarization | 8004 | WebSocket | Speaker identification |
| Web Speech API | — | In-browser | Streaming STT |
