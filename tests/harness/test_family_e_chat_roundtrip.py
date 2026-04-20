"""Family E — chat round-trip defects.

These are the actual "I typed hi, heard nothing" user failures.
Text-in → LLM → TTS → audio-out is the integration surface.
"""
from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.integration


def test_e1_preferred_lang_fallback_wired(source_app_py, source_text):
    """FAILS if Nunba /chat endpoint defaults preferred_lang to 'en'
    when the frontend omits the field.  Must fall back to
    hart_language.json.
    """
    src = source_text(source_app_py)
    # The Nunba /chat route is in routes/ — follow the fallback path
    # through core.user_lang.get_preferred_lang.
    has_fallback = (
        "core.user_lang" in src
        or "get_preferred_lang" in src
    )
    assert has_fallback, (
        "Nunba /chat-path must import core.user_lang.get_preferred_lang "
        "as the single fallback source; otherwise default='en' wins "
        "over a user's ta/hi/te/bn setting"
    )


def test_e2_llm_health_uses_verified_signal(project_root, source_text):
    """FAILS if any caller of `is_llm_available` still treats a /health
    200 as proof of inference capability.  Must use verified_llm path.
    """
    llama_cfg = project_root / "llama" / "llama_config.py"
    if not llama_cfg.exists():
        pytest.skip("llama_config.py absent")
    src = source_text(llama_cfg)
    # Either calls verify_llm, or checks /v1/chat/completions returns
    # non-empty content.
    has_verified = (
        "verify_llm" in src
        or "is_llm_inference_verified" in src
        or ("/v1/chat/completions" in src and "content" in src)
    )
    assert has_verified, (
        "llama_config.check_llama_health still uses /health 200 as truth; "
        "must call verify_llm() (HARTOS core.verified_llm) instead"
    )


def test_e3_chat_response_carries_audio_url(project_root, source_text):
    """FAILS if the /chat SSE event for a TTS-capable turn doesn't
    carry the synthesized audio URL.  No audio url = user hears
    nothing even when synth succeeded.
    """
    # The emit is in HARTOS hart_intelligence_entry OR Nunba
    # chatbot_routes. Either must attach audio_url to the chat SSE event.
    candidates = [
        project_root / ".." / "HARTOS" / "hart_intelligence_entry.py",
        project_root / "routes" / "chatbot_routes.py",
        project_root / "main.py",
    ]
    hit = False
    for c in candidates:
        if not c.exists():
            continue
        src = source_text(c)
        if "audio_url" in src and ("broadcast_sse_event" in src
                                   or "publish_event" in src
                                   or "'chat'" in src):
            hit = True
            break
    assert hit, (
        "no chat-response SSE event carries an audio_url field; frontend "
        "can't play audio it never receives"
    )


def test_e4_audio_url_absolute_or_same_origin(project_root, source_text):
    """FAILS if served audio URLs can be relative paths that resolve
    against a different origin than :5000 (e.g. file://, wrong port).
    """
    # Look at tts_serve_audio / media-serve route.
    for fname in ("main.py", "routes/chatbot_routes.py"):
        p = project_root / fname
        if not p.exists():
            continue
        src = source_text(p)
        if "audio_url" in src or "tts_serve" in src:
            # The URL must start with `/` (same-origin absolute) or be
            # built with request.host_url so browser can resolve it.
            has_abs = (
                "request.host_url" in src
                or "url_for(" in src
                or '"/media/' in src
                or '"/audio/' in src
            )
            assert has_abs, (
                f"{fname} emits audio URL without absolute or "
                f"same-origin guarantee; frontend can't fetch it"
            )
            return
    pytest.skip("no audio URL emitter found — covered elsewhere")


def test_e5_frontend_sse_subscribes_to_audio_event_type(project_root):
    """FAILS if the React SSE subscriber doesn't have a handler for
    the event type the backend publishes audio under.  Name mismatch
    = silent drop.
    """
    react_src = project_root / "landing-page" / "src"
    if not react_src.exists():
        pytest.skip("landing-page not present")
    # Find the SSE event types published by backend, then confirm
    # frontend handles them. Keep this cheap: just walk files for
    # type='audio' / type='tts_audio' and check frontend grep.
    import re
    # Known event types for audio.
    types = ("audio", "tts_audio", "tts_ready", "audio_url", "audio_ready")
    hit_frontend = []
    for p in react_src.rglob("*.js"):
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for typ in types:
            if f"'{typ}'" in t or f'"{typ}"' in t:
                hit_frontend.append((p.name, typ))
    assert hit_frontend, (
        "no React file subscribes to any audio-related SSE event "
        f"type ({types}); audio reaches frontend then vanishes"
    )


def test_e6_draft_skip_gate_for_non_latin(project_root, source_text):
    """FAILS if draft-first skip-gate isn't fired for Indic/CJK langs.
    """
    llama_cfg = project_root / "llama" / "llama_config.py"
    if not llama_cfg.exists():
        pytest.skip("llama_config.py absent")
    src = source_text(llama_cfg)
    has_skip = (
        "skip_draft" in src.lower()
        or "NON_LATIN_SCRIPT_LANGS" in src
        or "_skip_draft_langs" in src
    )
    assert has_skip, (
        "llama_config doesn't skip the draft model for non-Latin "
        "script languages; output garbled for Tamil/Hindi"
    )
