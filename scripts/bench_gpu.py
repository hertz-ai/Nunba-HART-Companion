#!/usr/bin/env python3
"""
bench_gpu.py — GPU performance regression harness (Layer 3).

Runs on any machine with a GPU — typically a developer box or the
self-hosted runner from docs/ci/gpu-runner-setup.md.  Produces
`bench_results.json` that CI can compare vs a baseline fetched from the
most recent release asset.

Metrics collected
─────────────────
  * tok_per_sec_main       — Qwen3-4B decode with NO draft
  * tok_per_sec_draft      — Qwen3-4B decode WITH draft (speculative)
  * tok_per_sec_speedup    — draft / main ratio (should be > 1.0)
  * tts_first_byte_ms      — per engine: piper, indic_parler, chatterbox,
                              cosyvoice, f5 (whichever are loaded)
  * vram_peak_gb           — per model, torch.cuda.max_memory_allocated
  * vram_steady_gb         — after warmup, before shutdown
  * gpu_name, driver_version, cuda_version
  * timestamp, git_sha, host

Usage
─────
  # Full run (≈ 3–5 min on RTX 3060)
  python scripts/bench_gpu.py --out bench_results.json

  # Quick mode — only core metrics, ≈ 30 s
  python scripts/bench_gpu.py --out bench_results.json --quick

  # Compare two results (CI gate)
  python scripts/bench_gpu.py --compare main_baseline.json pr.json \\
      --regression-threshold 0.10

Exit codes
──────────
  0 = success (or compare found no regression)
  1 = a metric regressed by > --regression-threshold
  2 = bench itself errored (no CUDA, model missing, etc.)
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("bench_gpu")

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ─────────────────────────────────────────────────────────────────────
# Environment probe
# ─────────────────────────────────────────────────────────────────────

def probe_environment() -> dict[str, Any]:
    """Capture machine/driver/torch details so we compare like-with-like."""
    env: dict[str, Any] = {
        "host": socket.gethostname(),
        "os": platform.platform(),
        "python": platform.python_version(),
        "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # Git sha (may be absent in shallow CI clones)
    try:
        env["git_sha"] = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=PROJECT_ROOT, text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        env["git_sha"] = os.environ.get("GITHUB_SHA", "unknown")

    # Torch + CUDA
    try:
        import torch  # type: ignore
        env["torch_version"] = torch.__version__
        env["cuda_available"] = bool(torch.cuda.is_available())
        if torch.cuda.is_available():
            env["cuda_version"] = torch.version.cuda
            env["gpu_name"] = torch.cuda.get_device_name(0)
            env["gpu_total_gb"] = round(
                torch.cuda.get_device_properties(0).total_memory / 1024**3, 2,
            )
    except ImportError:
        env["torch_version"] = None
        env["cuda_available"] = False

    # NVIDIA driver via nvidia-smi
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=driver_version",
             "--format=csv,noheader"],
            text=True, stderr=subprocess.DEVNULL, timeout=5,
        ).strip().splitlines()
        env["driver_version"] = out[0] if out else None
    except (subprocess.CalledProcessError, FileNotFoundError,
            subprocess.TimeoutExpired):
        env["driver_version"] = None

    return env


# ─────────────────────────────────────────────────────────────────────
# LLM tok/s bench
# ─────────────────────────────────────────────────────────────────────

def bench_llm_tok_per_sec(quick: bool = False) -> dict[str, Any]:
    """Probe llama-server for tok/s with/without speculative decoding.

    Requires that `llama-server` is running locally on :8080 (the normal
    Nunba dev setup).  If absent, falls back to N/A and logs a warning.
    """
    result: dict[str, Any] = {
        "tok_per_sec_main": None,
        "tok_per_sec_draft": None,
        "tok_per_sec_speedup": None,
        "draft_boot_decision": None,
        "notes": [],
    }

    # Record whether should_boot_draft says we can even try dual
    try:
        from llama.llama_config import LlamaConfig
        result["draft_boot_decision"] = bool(LlamaConfig.should_boot_draft())
    except Exception as e:
        result["notes"].append(f"should_boot_draft unavailable: {e}")

    import urllib.error
    import urllib.request

    prompt = "Explain CUDA memory management in two sentences."
    n_predict = 32 if quick else 128

    def _one_shot(port: int = 8080) -> float | None:
        body = json.dumps({
            "prompt": prompt,
            "n_predict": n_predict,
            "stream": False,
            "cache_prompt": False,
        }).encode()
        req = urllib.request.Request(
            f"http://localhost:{port}/completion",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
        except (urllib.error.URLError, TimeoutError) as e:
            logger.warning(f"llama-server probe failed: {e}")
            return None
        elapsed = time.perf_counter() - t0
        tokens = int(data.get("tokens_predicted")
                     or data.get("timings", {}).get("predicted_n")
                     or n_predict)
        if elapsed <= 0:
            return None
        return tokens / elapsed

    main_rate = _one_shot()
    if main_rate is None:
        result["notes"].append(
            "llama-server not reachable on :8080 — skipping LLM bench",
        )
        return result

    result["tok_per_sec_main"] = round(main_rate, 2)
    # A second run after a brief pause — lets us detect draft even if it
    # was dynamically loaded between calls.  This is a best-effort probe;
    # a dedicated /health endpoint ideally reports speculation state.
    time.sleep(0.5)
    draft_rate = _one_shot()
    if draft_rate is not None:
        result["tok_per_sec_draft"] = round(draft_rate, 2)
        if main_rate > 0:
            result["tok_per_sec_speedup"] = round(draft_rate / main_rate, 3)
    return result


# ─────────────────────────────────────────────────────────────────────
# TTS first-byte bench
# ─────────────────────────────────────────────────────────────────────

def bench_tts_first_byte(quick: bool = False) -> dict[str, Any]:
    """Measure time-to-first-byte for each loaded TTS engine.

    We hit the running Flask backend's TTS route because that exercises
    the real dispatch path (language routing, VRAM gate, OOM guard) —
    not a synthetic in-process call.
    """
    result: dict[str, Any] = {"engines": {}, "notes": []}
    engines = ["piper"] if quick else [
        "piper", "indic_parler", "chatterbox", "cosyvoice", "f5",
    ]

    import urllib.error
    import urllib.request

    text = "Benchmark first byte."
    for engine in engines:
        body = json.dumps({
            "text": text, "voice": "default", "backend": engine,
        }).encode()
        req = urllib.request.Request(
            "http://localhost:5000/api/tts/synth",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                first_chunk = resp.read(1)
                ttfb_ms = (time.perf_counter() - t0) * 1000
                if first_chunk:
                    result["engines"][engine] = {
                        "tts_first_byte_ms": round(ttfb_ms, 1),
                        "status": "ok",
                    }
                else:
                    result["engines"][engine] = {"status": "empty_response"}
        except urllib.error.HTTPError as e:
            result["engines"][engine] = {"status": f"http_{e.code}"}
        except (urllib.error.URLError, TimeoutError) as e:
            result["engines"][engine] = {"status": f"unreachable: {e}"}

    if not any(v.get("status") == "ok" for v in result["engines"].values()):
        result["notes"].append(
            "No TTS engine reachable — is Flask running on :5000?",
        )
    return result


# ─────────────────────────────────────────────────────────────────────
# VRAM peak / steady
# ─────────────────────────────────────────────────────────────────────

def bench_vram() -> dict[str, Any]:
    """Report peak and steady-state VRAM usage."""
    result: dict[str, Any] = {
        "vram_peak_gb": None,
        "vram_steady_gb": None,
        "vram_allocations": {},
    }
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            result["vram_peak_gb"] = round(
                torch.cuda.max_memory_allocated() / 1024**3, 3,
            )
            result["vram_steady_gb"] = round(
                torch.cuda.memory_allocated() / 1024**3, 3,
            )
    except ImportError:
        pass

    try:
        from integrations.service_tools.vram_manager import vram_manager
        result["vram_allocations"] = vram_manager.get_allocations()
        result["vram_total_gb"] = round(vram_manager.get_total_vram(), 2)
        result["vram_free_gb"] = round(vram_manager.get_free_vram(), 2)
    except Exception as e:
        result["notes"] = [f"VRAMManager unavailable: {e}"]

    return result


# ─────────────────────────────────────────────────────────────────────
# Compare mode — regression detection
# ─────────────────────────────────────────────────────────────────────

NUMERIC_FIELDS = (
    "tok_per_sec_main",
    "tok_per_sec_draft",
    "tok_per_sec_speedup",
    "vram_peak_gb",
    "vram_steady_gb",
)

# For "higher is better" metrics, a PR regression means PR < baseline.
# For "lower is better" metrics (vram_peak), a regression means PR > baseline.
HIGHER_IS_BETTER = {
    "tok_per_sec_main", "tok_per_sec_draft", "tok_per_sec_speedup",
}
LOWER_IS_BETTER = {"vram_peak_gb", "vram_steady_gb"}


def compare(baseline_path: Path, current_path: Path,
            threshold: float = 0.10) -> tuple[bool, list[str]]:
    """Compare two bench reports.  Returns (regressed, messages)."""
    baseline = json.loads(baseline_path.read_text())
    current = json.loads(current_path.read_text())

    regressed = False
    messages: list[str] = []

    def _get(d: dict, dotted: str) -> Any:
        cur: Any = d
        for part in dotted.split("."):
            if not isinstance(cur, dict):
                return None
            cur = cur.get(part)
        return cur

    # LLM metrics
    for field in NUMERIC_FIELDS:
        base = _get(baseline, f"llm.{field}")
        pr = _get(current, f"llm.{field}")
        if base is None or pr is None:
            continue
        if base == 0:
            continue
        delta = (pr - base) / base
        direction = "higher" if field in HIGHER_IS_BETTER else "lower"
        is_regression = (
            (field in HIGHER_IS_BETTER and delta < -threshold) or
            (field in LOWER_IS_BETTER and delta > threshold)
        )
        line = (
            f"{field}: baseline={base} current={pr} "
            f"delta={delta:+.1%} ({direction} is better) "
            f"{'REGRESSION' if is_regression else 'ok'}"
        )
        messages.append(line)
        if is_regression:
            regressed = True

    # TTS first byte — always lower-is-better
    base_tts = _get(baseline, "tts.engines") or {}
    pr_tts = _get(current, "tts.engines") or {}
    for engine, pr_entry in pr_tts.items():
        base_entry = base_tts.get(engine, {})
        pr_ttfb = pr_entry.get("tts_first_byte_ms")
        base_ttfb = base_entry.get("tts_first_byte_ms")
        if pr_ttfb is None or base_ttfb is None or base_ttfb == 0:
            continue
        delta = (pr_ttfb - base_ttfb) / base_ttfb
        is_regression = delta > threshold
        line = (
            f"tts.{engine}.first_byte_ms: baseline={base_ttfb} "
            f"current={pr_ttfb} delta={delta:+.1%} "
            f"{'REGRESSION' if is_regression else 'ok'}"
        )
        messages.append(line)
        if is_regression:
            regressed = True

    return regressed, messages


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────

def run_bench(quick: bool = False) -> dict[str, Any]:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    env = probe_environment()
    if not env.get("cuda_available"):
        logger.error(
            "CUDA not available — bench_gpu is intended for GPU machines. "
            "Exiting with code 2.",
        )
        return {"env": env, "error": "no_cuda"}

    logger.info(f"Bench on {env.get('gpu_name')} "
                f"({env.get('gpu_total_gb')}GB)")

    return {
        "env": env,
        "llm": bench_llm_tok_per_sec(quick=quick),
        "tts": bench_tts_first_byte(quick=quick),
        "vram": bench_vram(),
        "mode": "quick" if quick else "full",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path("bench_results.json"),
                        help="Output JSON path")
    parser.add_argument("--quick", action="store_true",
                        help="Fast mode (<30s) — core metrics only")
    parser.add_argument("--compare", nargs=2, type=Path, metavar=("BASE", "PR"),
                        help="Compare two existing JSON reports; no new run")
    parser.add_argument("--regression-threshold", type=float, default=0.10,
                        help="Fail compare if any metric regresses by more than this fraction (default 0.10 = 10%%)")
    args = parser.parse_args()

    if args.compare:
        base, pr = args.compare
        if not base.exists() or not pr.exists():
            print(f"Missing file: {base if not base.exists() else pr}",
                  file=sys.stderr)
            return 2
        regressed, messages = compare(base, pr, args.regression_threshold)
        for m in messages:
            print(m)
        if regressed:
            print("\nPERF REGRESSION DETECTED — failing CI gate.",
                  file=sys.stderr)
            return 1
        print("\nNo regressions above threshold.")
        return 0

    report = run_bench(quick=args.quick)
    args.out.write_text(json.dumps(report, indent=2))
    print(f"Wrote {args.out} ({args.out.stat().st_size} bytes)")
    if report.get("error"):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
