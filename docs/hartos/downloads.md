# HARTOS Downloads

HARTOS is the runtime backend that powers Nunba. It ships in three
shapes depending on the target deployment topology:

- **Full OS images** (ISO) — install HARTOS as the OS on a dedicated
  machine (workstation, mini-PC, edge box, server).
- **Docker images** — run HARTOS in a container on any Linux host.
- **Android APK** — run the consumer shell on a phone or tablet.

All artifacts below are published by the `build.yml` + `build-iso.yml`
release workflows and signed with the Ed25519 master key. Every ISO
includes a `.sha256` file and a `.sig` Ed25519 signature; verify both
before booting.

## Full OS ISOs

| Edition | Target | Download | Size |
|---|---|---|---|
| **HARTOS Server** | Rack server / workstation with NVIDIA or AMD GPU | [hartos-server-{{latest}}.iso](https://github.com/hertz-ai/HARTOS/releases/latest/download/hartos-server.iso) | ~3.2 GB |
| **HARTOS Desktop** | Laptop / desktop with GUI (Nunba pre-installed) | [hartos-desktop-{{latest}}.iso](https://github.com/hertz-ai/HARTOS/releases/latest/download/hartos-desktop.iso) | ~4.1 GB |
| **HARTOS Edge** | Mini-PC / Raspberry Pi / Jetson (headless, systemd) | [hartos-edge-{{latest}}.iso](https://github.com/hertz-ai/HARTOS/releases/latest/download/hartos-edge.iso) | ~1.4 GB |
| **HARTOS Server (ARM64)** | Ampere / Graviton / Mac Studio M-series (via UTM) | [hartos-server-arm64-{{latest}}.iso](https://github.com/hertz-ai/HARTOS/releases/latest/download/hartos-server-arm64.iso) | ~3.0 GB |

### What's on the ISO

Every ISO ships the HARTOS base runtime plus its tier-appropriate
model bundle:

- `hart-backend` pip package (Flask + tool registry + agent daemon)
- `llama-server` binary + Qwen3-4B + Qwen3-0.8B draft GGUF files
- Piper TTS voices (en + ta + hi + ...)
- Whisper STT (base + small)
- Crossbar WAMP router
- Preset `NUNBA_DATA_DIR=/var/lib/hartos` systemd service
- First-boot wizard that registers the node to the hive (optional)

Desktop edition additionally includes:
- Nunba cx_Freeze bundle
- Chatterbox Turbo (English expressive TTS)
- MiniCPM VLM (visual context)
- F5-TTS (voice cloning)

### Verifying an ISO

Every release ships matching `.sha256` and `.sig` files next to the
ISO. To verify:

```bash
# Download ISO + sidecars
URL="https://github.com/hertz-ai/HARTOS/releases/latest/download"
curl -LO "$URL/hartos-server.iso"
curl -LO "$URL/hartos-server.iso.sha256"
curl -LO "$URL/hartos-server.iso.sig"

# 1. Check integrity
sha256sum -c hartos-server.iso.sha256

# 2. Verify signature (requires HARTOS master public key)
python -m hart_sdk.verify_iso hartos-server.iso hartos-server.iso.sig
```

The master public key is committed at
`HARTOS/security/master_public_key.pem` and is NEVER rotated without
a migration plan announced 30 days in advance.

## Docker Images

For deployments where an ISO is overkill (Kubernetes, existing Linux
host, CI runner, sidecar to another stack):

| Image | Registry | Pull command |
|---|---|---|
| `hartos/backend` | GHCR | `docker pull ghcr.io/hertz-ai/hartos-backend:latest` |
| `hartos/backend-gpu` | GHCR | `docker pull ghcr.io/hertz-ai/hartos-backend-gpu:latest` (CUDA 12.4) |
| `hartos/backend-rocm` | GHCR | `docker pull ghcr.io/hertz-ai/hartos-backend-rocm:latest` (ROCm 6.2) |
| `hartos/edge-arm64` | GHCR | `docker pull ghcr.io/hertz-ai/hartos-edge-arm64:latest` |

Full compose file for Docker:

```bash
curl -LO https://raw.githubusercontent.com/hertz-ai/Nunba/main/deploy/cloud/docker-compose.yml
docker compose up
```

See [deploy/cloud/docker-compose.yml](https://github.com/hertz-ai/Nunba/blob/main/deploy/cloud/docker-compose.yml)
for the canonical topology (Nunba + llama-server + Crossbar + HARTOS).

## Android APK

The companion Android build lives in the `Hevolve_React_Native` repo.
APK is the primary distribution because Play Store's on-device-model
review cycle adds weeks of delay; users can always upgrade to a Play
Store build once it clears review.

| Variant | Target | Download |
|---|---|---|
| **Release APK** | General Android 11+ | [Hevolve-release.apk](https://github.com/hertz-ai/Hevolve_React_Native/releases/latest/download/Hevolve-release.apk) |
| **Release AAB** | Play Store submission | [Hevolve-release.aab](https://github.com/hertz-ai/Hevolve_React_Native/releases/latest/download/Hevolve-release.aab) |
| **Edge / Low-RAM** | Android 9+, <= 3GB RAM | [Hevolve-edge-release.apk](https://github.com/hertz-ai/Hevolve_React_Native/releases/latest/download/Hevolve-edge-release.apk) |

## Checksum Index

A complete, always-fresh list of every published artifact with its
SHA-256 and Ed25519 signature lives at
[hertz-ai/HARTOS/releases/latest](https://github.com/hertz-ai/HARTOS/releases/latest).
The `release_manifest.json` file at the top of that page is the
authoritative index; everything else is derivable from it.

## First-Boot Registration

When you boot a fresh HARTOS ISO, the install wizard asks one
question:

> Register this node to an existing hive?

- **Yes** → paste an invite code; the node gossips to the hive's
  crossbar router and joins the federated model-benchmarking pool.
- **No** → the node runs standalone in flat topology. You can
  register later via the admin UI (`/admin/hive/register`).

The decision is reversible at any time and does NOT affect local
data; it only controls whether usage deltas + model benchmarks are
reported upstream.

## Older Releases

GitHub Releases retains every HARTOS tag indefinitely. The latest 3
minor versions are actively supported with security patches; earlier
versions are archive-only.

- [HARTOS Releases](https://github.com/hertz-ai/HARTOS/releases)
- [HARTOS Changelog](https://github.com/hertz-ai/HARTOS/blob/main/CHANGELOG.md)
- [HARTOS Release Signing Policy](https://github.com/hertz-ai/HARTOS/blob/main/security/RELEASE_SIGNING.md)

## Known Mirrors

For users in networks where GitHub is slow or blocked:

| Mirror | Path | Sync lag |
|---|---|---|
| Cloudflare R2 | `https://mirror.hevolve.ai/hartos/` | < 30 min |
| Hugging Face Hub | `https://huggingface.co/hertz-ai/hartos-iso` | < 2 h |

Mirror URLs are listed in `release_manifest.json` alongside the
canonical GitHub URLs, signed by the master key — verify the signature
before trusting a mirror.
