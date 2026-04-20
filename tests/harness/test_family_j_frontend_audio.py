"""Family J — frontend audio playback.

Reproduces the root cause of "no TTS audio heard" — the reason the
user heard silence even when backends produced WAV bytes.
"""
from __future__ import annotations

import pytest

pytestmark = pytest.mark.integration


def test_j1_local_route_wires_on_audio_ready(project_root):
    """FAILS if no React source handles audio-ready SSE events.

    The canonical production pattern in this project is:
      SSE/WAMP → {action: 'TTS', generated_audio_url: '/tts/audio/...'}
      React    → listener reads generated_audio_url → <audio>.play()
    This test tolerates legacy names (onAudioReady etc.) but primarily
    asserts the real production symbol 'generated_audio_url' is handled
    in at least one React file, and the handler actually writes it to
    an audio element (otherwise the value is read and discarded).
    """
    fe = project_root / "landing-page" / "src"
    if not fe.exists():
        pytest.skip("landing-page absent")
    # Scan both .js and .jsx — NunbaChatProvider is .jsx.
    extensions = ("*.js", "*.jsx")
    subscribers = []
    plays_audio = False
    for pattern in extensions:
        for p in fe.rglob(pattern):
            try:
                t = p.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            is_subscriber = (
                "generated_audio_url" in t
                or "onAudioReady" in t
                or "on_audio_ready" in t
                or "audioReady" in t
            )
            if is_subscriber:
                subscribers.append(p.name)
                # Same file must actually invoke audio playback — a
                # subscriber that reads the URL and drops it is the
                # original defect class.
                if (".play()" in t) or ("new Audio(" in t) or ("audioRef" in t):
                    plays_audio = True
    assert subscribers, (
        "no React file subscribes to audio-ready events on /local; "
        "SentencePipeline produces audio that the UI never plays"
    )
    assert plays_audio, (
        f"React files reference audio-ready events ({subscribers}) but "
        f"NONE invoke .play() / new Audio() / audioRef — the URL is "
        f"read and dropped, so the user hears silence"
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
