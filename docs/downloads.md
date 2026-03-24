# Downloads

All builds are automated, signed, and verified. Pick your platform.

## Nunba (Companion App)

Runs on your existing OS. Connects to HART OS backend or runs standalone with local AI.

| Platform | Download | Notes |
|----------|----------|-------|
| **Windows** | [Nunba Installer](https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba_Setup.exe) | Windows 10/11, x64. Azure Trusted Signing. |
| **macOS** | [Nunba.dmg](https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba_Setup.dmg) | macOS 13+ (Apple Silicon native). Notarized. |
| **Linux** | [AppImage](https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba-x86_64.AppImage) | Any distro, x86_64. `chmod +x` and run. |
| **Linux (.deb)** | [.deb package](https://github.com/hertz-ai/Nunba/releases/latest) | Debian/Ubuntu. `sudo dpkg -i nunba_*.deb` |

### What's Included

- Chat with local LLMs (llama.cpp auto-installed)
- Voice pipeline (TTS + STT)
- Agent creation and orchestration
- Social features (feed, posts, gamification)
- Visual AI (screen/camera context)
- Auto-updates via built-in updater

## Developer Install (from source)

```bash
git clone https://github.com/hertz-ai/Nunba.git
cd Nunba
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cd landing-page && npm ci --legacy-peer-deps && npm run build && cd ..
python main.py --port 5000
```

Open [http://localhost:5000](http://localhost:5000) in your browser, or run `python app.py` for the desktop app.

## pip install (Backend only)

For headless servers, embedded devices, or integration into existing Python projects:

```bash
pip install hevolveai
python -c "from main import app; app.run(port=5000)"
```

Or with the full Nunba stack:

```bash
pip install -r requirements.txt
python main.py --port 5000
```

## Docker

```bash
docker compose -f deploy/cloud/docker-compose.yml up
```

## Verify Downloads

Every release is Ed25519 signed by the master key.

```bash
# Check SHA-256
sha256sum -c Nunba_Setup.exe.sha256

# Verify release signature
python -c "
from security.master_key import verify_release_manifest
import json
m = json.load(open('release_manifest.json'))
print('VALID' if verify_release_manifest(m) else 'INVALID')
"
```

## All Releases

Browse all versions, changelogs, and platform artifacts:

- [GitHub Releases](https://github.com/hertz-ai/Nunba/releases)
- [Changelog](https://github.com/hertz-ai/Nunba/blob/main/CHANGELOG.md)

!!! info "HART OS Downloads"
    For full operating system ISOs (Server, Desktop, Edge), Android APK, and Docker images, see the [HARTOS Downloads](https://docs.hevolve.ai/hartos/downloads/) page.
