"""Verified-signal probe for audio-generation models (ace-step,
diff-rhythm).  A "Ready" claim only fires when a 1-second test
prompt produces non-empty audio bytes through the real generate path.
"""

from __future__ import annotations

from dataclasses import dataclass

MIN_AUDIO_BYTES = 5_000  # ~250ms at 22kHz mono is ~11KB; 5KB guards against 0-byte lies


@dataclass
class Result:
    ok: bool
    n_bytes: int
    err: str
    elapsed_s: float

    def __bool__(self) -> bool:
        return self.ok


def verify_audio_gen(engine, prompt: str = "a short gentle tone",
                     duration_s: float = 1.0,
                     min_bytes: int = MIN_AUDIO_BYTES,
                     timeout_s: int = 120) -> Result:
    """Drive engine.generate(prompt, duration_s=1) and measure bytes.
    Only audio of >= min_bytes counts as ready."""
    import os
    import tempfile
    import threading
    import time

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="verify_audio_gen_")
    os.close(tmp_fd)
    box = {"ok": False, "n_bytes": 0, "err": ""}

    def _run():
        try:
            if hasattr(engine, "generate"):
                out = engine.generate(prompt, duration_s=duration_s, output_path=tmp_path)
            elif hasattr(engine, "synthesize"):
                out = engine.synthesize(prompt, output_path=tmp_path)
            else:
                raise AttributeError("audio-gen engine exposes neither generate() nor synthesize()")
            p = out if isinstance(out, str) and os.path.exists(out) else tmp_path
            if os.path.exists(p):
                box["n_bytes"] = os.path.getsize(p)
                box["ok"] = box["n_bytes"] >= min_bytes
                if not box["ok"]:
                    box["err"] = f"audio too small ({box['n_bytes']}B < {min_bytes}B)"
            else:
                box["err"] = "generate returned no file"
        except Exception as e:
            box["err"] = f"{type(e).__name__}: {e}"[:200]

    t0 = time.monotonic()
    th = threading.Thread(target=_run, daemon=True)
    th.start()
    th.join(timeout=timeout_s)
    elapsed = time.monotonic() - t0

    try:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
    except OSError:
        pass

    if th.is_alive():
        return Result(ok=False, n_bytes=0,
                      err=f"timed out after {timeout_s}s", elapsed_s=elapsed)
    return Result(ok=box["ok"], n_bytes=box["n_bytes"],
                  err=box["err"], elapsed_s=elapsed)
