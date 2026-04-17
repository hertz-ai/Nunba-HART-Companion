"""Verified-signal probe for STT (speech-to-text).

Sibling of tts/verified_synth.py for the STT model type.  A "Ready"
claim for a Whisper variant only fires if a short canned audio clip
transcribes to non-empty text through the same code path a user's
voice input hits.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Result:
    ok: bool
    transcript: str
    err: str
    elapsed_s: float

    def __bool__(self) -> bool:
        return self.ok


def verify_stt(engine, audio_bytes: bytes | None = None,
               expected_phrase: str | None = None,
               timeout_s: int = 30) -> Result:
    """Run a real transcription against the STT engine.

    VERIFIED SIGNAL: ok=True iff the transcript is non-empty. If an
    expected_phrase is supplied, the phrase (case-insensitive, stripped
    of punctuation) must appear in the transcript — this is the
    strongest form of verification for this model type.

    DO NOT accept "engine returned without raising" as success — that
    is the exact shallow-signal bug class this module exists to kill.
    Whisper on a sine tone returns an empty string; that must FAIL so
    the caller is forced to supply real speech audio (or pre-record a
    canned 1-second 'hello' clip as a test fixture).

    Args:
        engine:          Loaded STT engine with .transcribe(bytes).
        audio_bytes:     Canned audio.  REQUIRED for a truthful probe;
                         if None we fall back to a sine tone which
                         SHOULD fail verification.
        expected_phrase: Optional. If supplied, stricter check — the
                         phrase must appear in the transcript.
        timeout_s:       Max wall time.
    """
    import io
    import math
    import re
    import struct
    import threading
    import time
    import wave

    _synthetic_input = False
    if audio_bytes is None:
        # Fallback: sine tone. Whisper will return ''. The verifier will
        # correctly FAIL with 'empty transcript'. This is intentional:
        # a caller that hits this path sees a truthful error and is
        # pushed to ship a real canned clip as a fixture.
        _synthetic_input = True
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            frames = [
                struct.pack("<h", int(32767 * 0.3 * math.sin(2 * math.pi * 440 * t / 16000)))
                for t in range(8000)
            ]
            w.writeframes(b"".join(frames))
        audio_bytes = buf.getvalue()

    box = {"ok": False, "transcript": "", "err": ""}

    def _run():
        try:
            tr = engine.transcribe(audio_bytes)
            transcript = (tr or "").strip()
            box["transcript"] = transcript
            if not transcript:
                box["err"] = (
                    "empty transcript — STT engine ran without error but "
                    "returned no text" +
                    (" (sine-tone fallback input; supply real speech audio)"
                     if _synthetic_input else "")
                )
                return
            if expected_phrase:
                _norm = re.sub(r"[^\w\s]", "", transcript).lower()
                _exp = re.sub(r"[^\w\s]", "", expected_phrase).lower().strip()
                if _exp not in _norm:
                    box["err"] = (
                        f"transcript {transcript[:60]!r} does not contain "
                        f"expected phrase {expected_phrase!r}"
                    )
                    return
            box["ok"] = True
        except Exception as e:
            box["err"] = f"{type(e).__name__}: {e}"[:200]

    t0 = time.monotonic()
    th = threading.Thread(target=_run, daemon=True)
    th.start()
    th.join(timeout=timeout_s)
    elapsed = time.monotonic() - t0
    if th.is_alive():
        return Result(ok=False, transcript="",
                      err=f"timed out after {timeout_s}s", elapsed_s=elapsed)
    return Result(ok=box["ok"], transcript=box["transcript"],
                  err=box["err"], elapsed_s=elapsed)
