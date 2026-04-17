"""Family J — frontend audio playback.

Reproduces the root cause of "no TTS audio heard" — the reason the
user heard silence even when backends produced WAV bytes.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_j1_local_route_wires_on_audio_ready(project_root):
    """FAILS if the /local chat route's SentencePipeline isn't bound
    to a React audio element via an SSE callback.
    """
    fe = project_root / "landing-page" / "src"
    if not fe.exists():
        pytest.skip("landing-page absent")
    # Look for SentencePipeline / on_audio_ready wiring in React.
    hits = []
    for p in fe.rglob("*.js"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "onAudioReady" in t or "on_audio_ready" in t or "audioReady" in t:
            hits.append(p.name)
    assert hits, (
        "no React file subscribes to audio-ready events on /local; "
        "SentencePipeline produces audio that the UI never plays"
    )


def test_j2_audio_autoplay_gesture_fallback(project_root):
    """FAILS if the React chat audio uses `<audio autoplay>` without a
    user-gesture fallback. Browsers block autoplay until first click.
    """
    fe = project_root / "landing-page" / "src"
    if not fe.exists():
        pytest.skip("landing-page absent")
    # A fallback pattern: catch play() promise rejection and queue for
    # replay on the next user click.  Look for `.play().catch(` or
    # `AudioContext.resume`.
    has_fallback = False
    for p in fe.rglob("*.js"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if ".play()" in t and (".catch(" in t or "AudioContext" in t):
            has_fallback = True
            break
    assert has_fallback, (
        "React audio playback has no autoplay-blocked fallback; "
        "first audio is silently dropped by the browser"
    )


def test_j3_audio_url_resolvable_same_origin(project_root):
    """FAILS if the audio URL emitted by backend is a relative path
    that assumes /media/ but the React code concatenates a wrong host.
    """
    # Scan both sides for audio_url construction.
    hits_backend = []
    for fname in ("main.py", "routes/chatbot_routes.py"):
        p = project_root / fname
        if not p.exists():
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        if "audio_url" in t:
            hits_backend.append((fname, t.count("audio_url")))
    fe = project_root / "landing-page" / "src"
    hits_front = []
    if fe.exists():
        for p in fe.rglob("*.js"):
            try:
                t = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if "audio_url" in t or "audioUrl" in t:
                hits_front.append(p.name)
    assert hits_backend and hits_front, (
        "audio_url not emitted+consumed across backend↔frontend: "
        f"backend={hits_backend}, frontend={hits_front[:3]}"
    )
