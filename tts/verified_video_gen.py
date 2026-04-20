"""Verified-signal probe for video-generation models (ltx2, wan2gp).
Readiness requires a short frame-run producing non-empty video
bytes. "Model loaded" ≠ "model infers".
"""

from __future__ import annotations

from dataclasses import dataclass

MIN_VIDEO_BYTES = 20_000  # half-second video is typically > 50KB; 20KB guards the 0-byte lie


@dataclass
class Result:
    ok: bool
    n_bytes: int
    err: str
    elapsed_s: float

    def __bool__(self) -> bool:
        return self.ok


def verify_video_gen(engine, prompt: str = "a simple test scene",
                    n_frames: int = 8,
                    min_bytes: int = MIN_VIDEO_BYTES,
                    timeout_s: int = 300) -> Result:
    """Drive engine.generate(prompt, n_frames) and measure output bytes.
    Short (n_frames=8) keeps the probe under 5 min on a modest GPU."""
    import os
    import tempfile
    import threading
    import time

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".mp4", prefix="verify_video_gen_")
    os.close(tmp_fd)
    box = {"ok": False, "n_bytes": 0, "err": ""}

    def _run():
        try:
            if hasattr(engine, "generate"):
                out = engine.generate(prompt, n_frames=n_frames, output_path=tmp_path)
            else:
                raise AttributeError("video-gen engine has no generate() method")
            p = out if isinstance(out, str) and os.path.exists(out) else tmp_path
            if os.path.exists(p):
                box["n_bytes"] = os.path.getsize(p)
                box["ok"] = box["n_bytes"] >= min_bytes
                if not box["ok"]:
                    box["err"] = f"video too small ({box['n_bytes']}B < {min_bytes}B)"
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
