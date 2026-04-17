"""Verified-signal probe for VLM (vision-language).

A VLM "Ready" claim only fires when a round-trip caption / query
against a sample image returns non-empty text.  Shallow "process is
up" signals are not acceptable.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Result:
    ok: bool
    response: str
    err: str
    elapsed_s: float

    def __bool__(self) -> bool:
        return self.ok


def verify_vlm(engine, image_bytes: bytes | None = None,
               prompt: str = "Describe this image briefly.",
               timeout_s: int = 60) -> Result:
    """Run a minimal caption / query round-trip against the VLM.

    Args:
        engine:      Loaded VLM with .query(image_bytes, prompt)  OR
                     .caption(image_bytes) method.
        image_bytes: Optional JPEG/PNG.  If None, a 8×8 solid-grey
                     smoke image is generated in-memory.
        prompt:      Text prompt if .query is used.
        timeout_s:   Max wall time.
    """
    import io
    import struct
    import threading
    import time

    if image_bytes is None:
        # Minimal 8×8 grey PNG — no external deps.
        header = b"\x89PNG\r\n\x1a\n"
        ihdr = struct.pack(">IIBBBBB", 8, 8, 8, 0, 0, 0, 0)
        import zlib
        raw = b"".join(b"\x00" + b"\x80" * 8 for _ in range(8))
        idat = zlib.compress(raw)
        def _chunk(t, d):
            import zlib as _z
            return (struct.pack(">I", len(d)) + t + d
                    + struct.pack(">I", _z.crc32(t + d) & 0xFFFFFFFF))
        image_bytes = (header + _chunk(b"IHDR", ihdr)
                       + _chunk(b"IDAT", idat) + _chunk(b"IEND", b""))

    box = {"ok": False, "response": "", "err": ""}

    def _run():
        try:
            if hasattr(engine, "query"):
                r = engine.query(image_bytes, prompt)
            elif hasattr(engine, "caption"):
                r = engine.caption(image_bytes)
            else:
                raise AttributeError("VLM engine exposes neither query() nor caption()")
            box["response"] = (r or "").strip()
            box["ok"] = bool(box["response"])
            if not box["ok"]:
                box["err"] = "empty response"
        except Exception as e:
            box["err"] = f"{type(e).__name__}: {e}"[:200]

    t0 = time.monotonic()
    th = threading.Thread(target=_run, daemon=True)
    th.start()
    th.join(timeout=timeout_s)
    elapsed = time.monotonic() - t0
    if th.is_alive():
        return Result(ok=False, response="",
                      err=f"timed out after {timeout_s}s", elapsed_s=elapsed)
    return Result(ok=box["ok"], response=box["response"],
                  err=box["err"], elapsed_s=elapsed)
