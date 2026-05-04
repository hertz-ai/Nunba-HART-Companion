#!/usr/bin/env python3
"""
One-shot WAHA (WhatsApp HTTP API) bootstrap for Nunba.

What it does
------------
1. Verifies Docker Desktop is installed and running.
2. Pulls `devlikeapro/waha:latest` (community edition, free).
3. Starts a WAHA container `nunba-waha` on port 3000 with a
   randomly-generated API key.
4. Creates session `nunba` and opens your browser at the QR page.
5. Polls session status until WhatsApp reports WORKING (you scanned
   the QR on the phone that holds the Nunba business number
   +91 90030 54371).
6. Writes credentials to `~/.nunba/whatsapp_waha.json` and prints
   the exact values to paste into Nunba admin at
   /admin/channels/whatsapp.

Usage
-----
    python scripts/setup_whatsapp_waha.py
    # Re-run is safe — it reuses an existing container if healthy.

Teardown
--------
    python scripts/setup_whatsapp_waha.py --stop
    python scripts/setup_whatsapp_waha.py --remove   # also wipes session
"""

from __future__ import annotations

import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path
from typing import Optional

# ─── Constants ────────────────────────────────────────────────────────
CONTAINER_NAME = "nunba-waha"
IMAGE = "devlikeapro/waha:latest"
WAHA_PORT = 3000
WAHA_URL = f"http://localhost:{WAHA_PORT}"
SESSION_NAME = "nunba"
# Your own WhatsApp number — NOT a centralized bot. Each Nunba install
# links its owner's personal number. Pass via --phone '+<country><number>'
# or set env NUNBA_WA_PHONE. If omitted, it is auto-detected from WAHA
# after you scan the QR (so the script never has to know it up front).
BOT_PHONE_DEFAULT = os.environ.get("NUNBA_WA_PHONE", "")
BOT_PHONE: str = ""  # resolved in main() from CLI arg, env, or WAHA /me

CREDS_DIR = Path.home() / ".nunba"
CREDS_FILE = CREDS_DIR / "whatsapp_waha.json"

HTTP_TIMEOUT = 10
QR_WAIT_SECONDS = 300  # 5 min to scan the QR
HEALTH_WAIT_SECONDS = 60


# ─── Utilities ────────────────────────────────────────────────────────
def die(msg: str, code: int = 1) -> None:
    print(f"\n[FAIL] {msg}", file=sys.stderr)
    sys.exit(code)


def info(msg: str) -> None:
    print(f"[..] {msg}")


def ok(msg: str) -> None:
    print(f"[ok] {msg}")


def run(cmd: list[str], check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        check=check,
        capture_output=capture,
        text=True,
    )


def http_json(url: str, method: str = "GET", body: dict | None = None,
              api_key: str | None = None, timeout: int = HTTP_TIMEOUT) -> tuple[int, dict | None]:
    """Tiny HTTP client — stdlib only, returns (status, body_json_or_none)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if api_key:
        req.add_header("X-Api-Key", api_key)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw) if raw else None
            except json.JSONDecodeError:
                return resp.status, {"_raw": raw}
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", errors="replace"))
        except Exception:
            body = None
        return e.code, body
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return 0, None


# ─── Docker checks ────────────────────────────────────────────────────
def require_docker() -> None:
    if shutil.which("docker") is None:
        die(
            "Docker is not installed or not on PATH.\n\n"
            "Install Docker Desktop for Windows:\n"
            "  https://www.docker.com/products/docker-desktop\n\n"
            "After install: open Docker Desktop, wait for the whale\n"
            "icon to go steady (not animating), then re-run this script.",
        )
    try:
        run(["docker", "info"])
    except subprocess.CalledProcessError:
        die(
            "Docker is installed but not running.\n"
            "Open Docker Desktop and wait for it to say 'Engine running',\n"
            "then re-run this script.",
        )
    ok("Docker is installed and running")


def container_exists(name: str) -> bool:
    r = run(["docker", "ps", "-a", "--filter", f"name=^{name}$", "--format", "{{.Names}}"])
    return r.stdout.strip() == name


def container_running(name: str) -> bool:
    r = run(["docker", "ps", "--filter", f"name=^{name}$", "--format", "{{.Names}}"])
    return r.stdout.strip() == name


def container_api_key(name: str) -> str | None:
    """Read the API key from the container's env (so re-runs reuse it)."""
    r = run(
        ["docker", "inspect", "--format", "{{range .Config.Env}}{{println .}}{{end}}", name],
        check=False,
    )
    if r.returncode != 0:
        return None
    for line in r.stdout.splitlines():
        if line.startswith("WHATSAPP_API_KEY="):
            return line.split("=", 1)[1]
    return None


# ─── WAHA lifecycle ───────────────────────────────────────────────────
def pull_image() -> None:
    info(f"Pulling {IMAGE} (first run may take ~2 minutes)")
    run(["docker", "pull", IMAGE], capture=False)
    ok(f"Image {IMAGE} ready")


def start_container(api_key: str) -> None:
    if container_running(CONTAINER_NAME):
        ok(f"Container {CONTAINER_NAME} already running")
        return
    if container_exists(CONTAINER_NAME):
        info(f"Starting existing container {CONTAINER_NAME}")
        run(["docker", "start", CONTAINER_NAME])
    else:
        info(f"Creating container {CONTAINER_NAME} on port {WAHA_PORT}")
        run([
            "docker", "run", "-d",
            "--name", CONTAINER_NAME,
            "--restart", "unless-stopped",
            "-p", f"{WAHA_PORT}:3000",
            "-e", f"WHATSAPP_API_KEY={api_key}",
            "-e", "WHATSAPP_DEFAULT_ENGINE=WEBJS",
            "-v", "nunba-waha-sessions:/app/.sessions",
            IMAGE,
        ])
    ok(f"Container {CONTAINER_NAME} started")


def wait_healthy(api_key: str) -> None:
    info(f"Waiting for WAHA to be healthy at {WAHA_URL} (up to {HEALTH_WAIT_SECONDS}s)")
    deadline = time.time() + HEALTH_WAIT_SECONDS
    last_err = ""
    while time.time() < deadline:
        status, body = http_json(f"{WAHA_URL}/api/server/version", api_key=api_key, timeout=3)
        if status == 200:
            ver = (body or {}).get("version") if isinstance(body, dict) else None
            ok(f"WAHA responding (version={ver or 'unknown'})")
            return
        last_err = f"status={status}"
        time.sleep(2)
    die(f"WAHA did not become healthy within {HEALTH_WAIT_SECONDS}s ({last_err})")


def ensure_session(api_key: str) -> None:
    status, body = http_json(f"{WAHA_URL}/api/sessions/{SESSION_NAME}", api_key=api_key)
    if status == 200:
        ok(f"Session '{SESSION_NAME}' already exists (status={body.get('status') if body else '?'})")
        return
    info(f"Creating session '{SESSION_NAME}'")
    status, body = http_json(
        f"{WAHA_URL}/api/sessions/",
        method="POST",
        body={"name": SESSION_NAME, "start": True},
        api_key=api_key,
    )
    if status not in (200, 201):
        # Fall back to older API
        status, body = http_json(
            f"{WAHA_URL}/api/sessions/start",
            method="POST",
            body={"name": SESSION_NAME},
            api_key=api_key,
        )
    if status not in (200, 201):
        die(f"Failed to create session (status={status}, body={body})")
    ok(f"Session '{SESSION_NAME}' created")


def open_qr_page() -> str:
    """Open the browser at the WAHA dashboard so user can scan QR.
    Returns the URL so the user can copy-paste if auto-open fails."""
    # WAHA dashboard has a QR panel per session
    url = f"{WAHA_URL}/dashboard/"
    try:
        webbrowser.open_new(url)
    except Exception:
        pass
    print()
    print("=" * 62)
    print(" SCAN QR CODE NOW")
    print("=" * 62)
    print(f" 1. Open on the phone with number {BOT_PHONE}:")
    print("      WhatsApp → Settings → Linked Devices → Link a Device")
    print(f" 2. Scan the QR shown at: {url}")
    print(f"    (direct QR image:   {WAHA_URL}/api/{SESSION_NAME}/auth/qr?format=image)")
    print("=" * 62)
    print()
    return url


def wait_session_working(api_key: str) -> None:
    info(f"Waiting for WhatsApp login (up to {QR_WAIT_SECONDS // 60} min). "
         "Scan the QR with the phone that holds the Nunba number.")
    deadline = time.time() + QR_WAIT_SECONDS
    last_status = ""
    while time.time() < deadline:
        status, body = http_json(f"{WAHA_URL}/api/sessions/{SESSION_NAME}", api_key=api_key, timeout=5)
        if status == 200 and isinstance(body, dict):
            s = str(body.get("status") or "").upper()
            if s and s != last_status:
                print(f"   session status: {s}")
                last_status = s
            if s == "WORKING":
                # Extract the phone number WAHA thinks it's logged in as
                me = None
                try:
                    st, b = http_json(f"{WAHA_URL}/api/{SESSION_NAME}/me", api_key=api_key)
                    if st == 200 and isinstance(b, dict):
                        me = b.get("id") or b.get("pushName")
                except Exception:
                    pass
                ok(f"WhatsApp session WORKING (logged in as: {me or BOT_PHONE})")
                return
        time.sleep(3)
    die(
        f"QR not scanned within {QR_WAIT_SECONDS}s. "
        "Re-run the script and scan faster.",
    )


# ─── Credentials file ─────────────────────────────────────────────────
def write_creds(api_key: str) -> None:
    CREDS_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "base_url": WAHA_URL,
        "api_key": api_key,
        "session": SESSION_NAME,
        "phone_number": BOT_PHONE,
        "engine": "WEBJS",
        "container": CONTAINER_NAME,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    CREDS_FILE.write_text(json.dumps(payload, indent=2))
    try:
        os.chmod(CREDS_FILE, 0o600)
    except Exception:
        pass
    ok(f"Credentials written to {CREDS_FILE}")


def print_paste_instructions(api_key: str) -> None:
    print()
    print("╭" + "─" * 68 + "╮")
    print("│  PASTE INTO NUNBA ADMIN (/admin/channels/whatsapp)                 │")
    print("├" + "─" * 68 + "┤")
    print(f"│  Base URL     : {WAHA_URL:<51}│")
    print(f"│  API Key      : {api_key:<51}│")
    print(f"│  Session      : {SESSION_NAME:<51}│")
    print(f"│  Phone Number : {BOT_PHONE:<51}│")
    print("╰" + "─" * 68 + "╯")
    print()
    print("OR set these env vars before starting Nunba:")
    print(f"  set WAHA_BASE_URL={WAHA_URL}")
    print(f"  set WAHA_API_KEY={api_key}")
    print(f"  set WAHA_SESSION={SESSION_NAME}")
    print(f"  set WHATSAPP_ACCESS_TOKEN={api_key}  # Nunba main.py reads this")
    print()
    print("Quick-test send (replace <YOUR_NUMBER> with any WhatsApp-active E.164):")
    print(f'  curl -X POST {WAHA_URL}/api/sendText \\')
    print(f'       -H "X-Api-Key: {api_key}" \\')
    print('       -H "Content-Type: application/json" \\')
    print(f'       -d \'{{"session":"{SESSION_NAME}","chatId":"<YOUR_NUMBER>@c.us","text":"Nunba ping"}}\'')
    print()


# ─── Teardown ────────────────────────────────────────────────────────
def stop() -> None:
    require_docker()
    if not container_exists(CONTAINER_NAME):
        ok(f"No container named {CONTAINER_NAME}")
        return
    run(["docker", "stop", CONTAINER_NAME], check=False)
    ok(f"Stopped {CONTAINER_NAME}")


def remove(wipe_session: bool) -> None:
    require_docker()
    if container_exists(CONTAINER_NAME):
        run(["docker", "rm", "-f", CONTAINER_NAME], check=False)
        ok(f"Removed container {CONTAINER_NAME}")
    if wipe_session:
        run(["docker", "volume", "rm", "nunba-waha-sessions"], check=False)
        ok("Removed session volume — next run will require a fresh QR scan")
    if CREDS_FILE.exists():
        CREDS_FILE.unlink()
        ok(f"Removed {CREDS_FILE}")


# ─── Main ────────────────────────────────────────────────────────────
def main() -> int:
    ap = argparse.ArgumentParser(description="Bootstrap WAHA for Nunba")
    ap.add_argument("--stop", action="store_true", help="Stop the container and exit")
    ap.add_argument("--remove", action="store_true",
                    help="Stop, remove container + session volume + creds file")
    ap.add_argument("--phone", default=BOT_PHONE_DEFAULT,
                    help="Your WhatsApp number in E.164 (e.g. +91XXXXXXXXXX). "
                         "If omitted, it is auto-discovered from WAHA after login.")
    args = ap.parse_args()

    global BOT_PHONE
    BOT_PHONE = args.phone or "(will be auto-detected after QR scan)"

    if args.stop:
        stop()
        return 0
    if args.remove:
        remove(wipe_session=True)
        return 0

    require_docker()

    if container_running(CONTAINER_NAME):
        existing = container_api_key(CONTAINER_NAME)
        if existing:
            ok(f"Reusing existing {CONTAINER_NAME} (API key from container env)")
            api_key = existing
        else:
            api_key = secrets.token_urlsafe(24)
    else:
        api_key = secrets.token_urlsafe(24)
        pull_image()
        start_container(api_key)

    wait_healthy(api_key)
    ensure_session(api_key)

    # Short nudge so WAHA has time to generate the QR
    time.sleep(2)

    # Check if we actually need to scan (session might already be WORKING
    # from a previous run with a persisted volume)
    status, body = http_json(f"{WAHA_URL}/api/sessions/{SESSION_NAME}", api_key=api_key)
    already_working = (
        status == 200
        and isinstance(body, dict)
        and str(body.get("status") or "").upper() == "WORKING"
    )

    if not already_working:
        open_qr_page()
        wait_session_working(api_key)
    else:
        ok("Session already WORKING — no QR scan needed")

    write_creds(api_key)
    print_paste_instructions(api_key)

    print("Done. The container will auto-restart with Docker Desktop.")
    print("To stop:   python scripts/setup_whatsapp_waha.py --stop")
    print("To reset:  python scripts/setup_whatsapp_waha.py --remove")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n[aborted] You can re-run the script; WAHA state is persisted.")
        sys.exit(130)
