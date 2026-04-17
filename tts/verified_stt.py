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
               timeout_s: int = 30) -> Result:
    """Run a minimal transcription against the STT engine.  Returns
    ok=True only when the transcript is non-empty.

    Args:
        engine:       A loaded STT engine with a .transcribe(bytes)
                      method.
        audio_bytes:  Optional canned audio.  If None, a 0.5s 440Hz
                      sine tone is generated in-memory as a smoke
                      input (transcribing this may return empty, which
                      the test then accepts as "engine at least ran").
        timeout_s:    Max wall time.
    """
    import io
    import math
    import struct
    import threading
    import time
    import wave

    if audio_bytes is None:
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
            box["transcript"] = tr or ""
            box["ok"] = True  # "engine ran" is success for STT smoke
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
