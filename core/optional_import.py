"""
core.optional_import — logged graceful degradation for optional dependencies.

WHY THIS EXISTS
───────────────
Nunba had at least 6 `try: import X; except ImportError: pass` blocks
sprinkled across main.py and adjacent modules.  Each one silently swallowed
the failure with no log line, no metric, no operator-visible signal.  When
a feature mysteriously stopped working in a frozen build (because a wheel
got pruned, a sys.path entry shifted, or a transitive dep flipped backend),
there was NO way to find out from the running process — operators had to
add print statements and rebuild.

This module replaces that pattern with a single helper that:
  1. Attempts the import.
  2. On failure, logs ONE INFO-level line with the human-readable reason
     (so it lands in the standard log, surfaces in /api/admin/logs).
  3. Records the degradation in a process-global registry queryable via
     `/api/admin/diag/degradations` (operator self-service diagnosis).
  4. Returns a sentinel/fallback so the call site can keep using the name
     without `if X is None:` peppering.
  5. Is idempotent — the second call for the same module is silent.

DESIGN NOTES
────────────
- We log at INFO, not WARNING.  These are EXPECTED degradations (e.g.,
  optional GPU libs missing on a CPU-only laptop).  WARNING would cry-wolf
  and train operators to ignore the channel.
- The registry is a plain dict — no thread safety needed because all
  imports happen at module-load time on the main thread.
- We do NOT cache the imported module here; let Python's normal import
  machinery do that.  This module ONLY tracks failures.
- The Flask blueprint exposes the registry as JSON; gated by
  `require_local_or_token` upstream because degradation lists can leak
  the absence of paid-tier integrations (an information-disclosure vector
  on multi-tenant deploys, irrelevant on flat).
"""
from __future__ import annotations

import importlib
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# Registry of failed imports — process-global, single-source-of-truth for
# the /api/admin/diag/degradations endpoint.
#   key:   module name (e.g., "integrations.service_tools.vram_manager")
#   value: {reason, error, ts, attempts}
_DEGRADED: Dict[str, Dict[str, Any]] = {}

# Modules we already successfully imported — used to short-circuit repeat
# calls so the cost of `optional_import('foo', ...)` in a hot path is one
# dict lookup, not a fresh importlib walk.
_LOADED: Dict[str, Any] = {}


def optional_import(
    module_name: str,
    reason: str,
    fallback: Any = None,
) -> Any:
    """Import a module by name; on failure log + register and return fallback.

    Args:
        module_name: Dotted import path, e.g. ``'integrations.service_tools.vram_manager'``.
        reason: Human-readable why-this-is-optional, used in the log line
            AND surfaced in `/api/admin/diag/degradations`.  Examples:
            ``'GPU VRAM telemetry'``, ``'HF Hub model search'``,
            ``'WAMP ticket auth'``.  Be specific — "feature unavailable"
            is unhelpful.
        fallback: Value returned when the import fails.  Defaults to None.
            Pass a stub class or no-op module if call sites need attribute
            access.

    Returns:
        The imported module on success, or `fallback` on ImportError /
        any other exception during import.

    Idempotency:
        Successful imports are cached in `_LOADED` and returned directly
        on subsequent calls (no re-import).  Failed imports increment an
        attempt counter in `_DEGRADED` but do NOT re-log — first failure
        is the signal, subsequent retries are noise.
    """
    if module_name in _LOADED:
        return _LOADED[module_name]

    if module_name in _DEGRADED:
        _DEGRADED[module_name]['attempts'] += 1
        return fallback

    try:
        mod = importlib.import_module(module_name)
        _LOADED[module_name] = mod
        return mod
    except Exception as e:
        # Catch broad — `ImportError` misses things like circular-import
        # `AttributeError` and missing-DLL `OSError` on Windows.
        _DEGRADED[module_name] = {
            'reason': reason,
            'error': f"{type(e).__name__}: {e}",
            'ts': time.time(),
            'attempts': 1,
        }
        # ONE log line per module — INFO level (expected degradation, not
        # a panic).  WARNING would cry-wolf for legitimate optional deps.
        logger.info(
            "optional_import: %s unavailable (%s) — %s: %s",
            module_name, reason, type(e).__name__, e,
        )
        return fallback


def list_degradations() -> List[Dict[str, Any]]:
    """Return a snapshot of all registered degradations for the admin endpoint.

    Output is a list of dicts with stable keys so the frontend can render
    a table without per-field probing.  Sorted by first-failure timestamp
    so the UI naturally shows boot-time degradations first."""
    out = []
    for name, info in _DEGRADED.items():
        out.append({
            'module': name,
            'reason': info['reason'],
            'error': info['error'],
            'first_failed_at': info['ts'],
            'attempts': info['attempts'],
        })
    out.sort(key=lambda d: d['first_failed_at'])
    return out


def is_available(module_name: str) -> bool:
    """Cheap predicate for call sites that need a boolean check before
    invoking a feature — avoids the fallback-sentinel dance."""
    return module_name in _LOADED


def reset_for_tests() -> None:
    """Clear both registries.  Test-only helper — do NOT call from app code."""
    _DEGRADED.clear()
    _LOADED.clear()


__all__ = [
    'optional_import',
    'list_degradations',
    'is_available',
    'reset_for_tests',
]
