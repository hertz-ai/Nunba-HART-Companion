#!/usr/bin/env python3
"""Live TTS probe — exercises every engine in the ladder and records
pass/fail with concrete byte-count + duration evidence.

Why this exists
---------------
The frozen Nunba on the user's disk has been silently failing TTS for
4+ days because of the pocket_tts self-mapping trap (see commit
``ff12b4d4`` and ``memory/test_plan_tts_bridge_fix_2026-05-04.md``).
Once the structural fix is built into the install, "audio works" must
be VERIFIED, not assumed.  This script is the one-shot verifier:

* For each backend in the canonical ladder, run
  ``tts.tts_handshake.run_handshake`` (the same probe install-validation
  uses) and capture ``ok / err / n_bytes / duration_s``.

* For each CPU fallback alias, assert it resolves to ``BACKEND_PIPER``
  via ``_CATALOG_TO_BACKEND`` (the structural-fix invariant).

* Print a markdown table to stdout AND append a timestamped row to
  ``~/Documents/Nunba/logs/tts_probe.log`` so historical runs are
  tracked.

Usage
-----
    python scripts/probe_all_tts_live.py                # all backends, en
    python scripts/probe_all_tts_live.py --lang hi      # Indic ladder
    python scripts/probe_all_tts_live.py --backend kokoro --backend piper
    python scripts/probe_all_tts_live.py --skip-heavy   # CPU/<2GB only

Exit code is 0 iff every probed backend passed AND every alias resolves
to BACKEND_PIPER.  Anything else exits non-zero so a CI gate can
fail-fast.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path

# Make sure we import the source-tree tts/* (the one with the fix),
# not whatever python-embed shipped with a frozen build.
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
logger = logging.getLogger('tts_probe')


# ── Engine inventory ───────────────────────────────────────────────
# Source: tts/tts_engine.py LANG_ENGINE_PREFERENCE['en']
# (which is _FALLBACK_LANG_ENGINE_PREFERENCE — the documented full
# ladder for English, ordered quality-first → CPU-fallback last).
_EN_LADDER = (
    'chatterbox_turbo',  # 5.6 GB GPU, paralinguistic
    'f5',                # 2.5 GB GPU, voice clone
    'melotts',           # 1.5 GB CPU/GPU
    'xtts_v2',           # 2.5 GB voice clone
    'indic_parler',      # 2.0 GB GPU (also covers en)
    'kokoro',            # 0.2 GB CPU-friendly
    'mms_tts',           # 1.0 GB universal
    'piper',             # CPU bundled (absolute floor)
)

# Indic ladder for 'hi' — Indic Parler is canonical here.
_HI_LADDER = ('indic_parler', 'xtts_v2', 'mms_tts')

# CPU fallback aliases — these MUST resolve to BACKEND_PIPER through
# _CATALOG_TO_BACKEND.  This is the structural-fix invariant.
_CPU_ALIASES = ('pocket-tts', 'pocket_tts', 'espeak', 'luxtts')

# Backends classified by VRAM budget so --skip-heavy can prune.
_HEAVY_VRAM_GB = {
    'chatterbox_turbo': 5.6,
    'f5':               2.5,
    'xtts_v2':          2.5,
    'indic_parler':     2.0,
    'melotts':          1.5,
    'mms_tts':          1.0,
    'kokoro':           0.2,
    'piper':            0.0,
}


def _resolve_alias_invariants() -> tuple[bool, list[str]]:
    """Verify every CPU alias resolves to BACKEND_PIPER (post-fix).

    Returns (all_pass, error_messages).
    """
    try:
        from tts.tts_engine import _CATALOG_TO_BACKEND, BACKEND_PIPER
    except Exception as e:
        return False, [f'tts.tts_engine import failed: {e}']

    errors = []
    for alias in _CPU_ALIASES:
        actual = _CATALOG_TO_BACKEND.get(alias)
        if actual != BACKEND_PIPER:
            errors.append(
                f'alias {alias!r} maps to {actual!r}, expected {BACKEND_PIPER!r}'
            )
    return (not errors), errors


def _probe_backend(engine, backend: str, lang: str,
                   timeout_s: int = 90) -> dict:
    """Run a single backend through the canonical handshake.

    Detects fallback-masquerade: if engine._active_backend ends up
    different from the requested backend, the engine silently fell
    back to another backend (typically piper).  We mark that as FAIL
    with a clear "fellback_to=X" message — verify_backend_synth alone
    does not catch this and would otherwise report a misleading PASS.

    Also clears engine._presynth between probes so a previous
    backend's cached audio doesn't satisfy this probe with stale
    bytes from a different engine.

    Returns a dict with at least: backend, lang, ok, err, n_bytes,
    duration_s, elapsed_wall_s, fellback_to.
    """
    from tts.tts_handshake import invalidate, run_handshake

    # Drop any cached verdict so the probe reflects the FRESH state.
    try:
        invalidate(backend)
    except Exception:
        pass
    # Drop the engine's PreSynthCache too — without this, a prior
    # backend's synthesised audio satisfies the cache lookup and the
    # current backend's worker never gets exercised.
    try:
        if hasattr(engine, '_presynth'):
            cache = engine._presynth
            for attr in ('clear', 'invalidate_all', 'reset'):
                fn = getattr(cache, attr, None)
                if callable(fn):
                    fn()
                    break
    except Exception:
        pass

    start = time.monotonic()
    try:
        result = run_handshake(
            engine, backend, lang=lang,
            broadcast=False, play_audio=False,
            timeout_s=timeout_s,
        )
        elapsed = time.monotonic() - start
        ok = bool(result.ok)
        err = result.err

        # Fallback-masquerade detection: if the engine reports a
        # different active_backend than what we asked for, the synth
        # path silently fell back (typically to piper).  Demote the
        # PASS to FAIL with a clear marker so the probe doesn't lie.
        active_after = getattr(engine, '_active_backend', None)
        fellback_to = None
        if ok and active_after and active_after != backend:
            fellback_to = active_after
            ok = False
            err = (f'fallback masquerade: engine asked for {backend!r} '
                   f'but ended on {active_after!r} — backend not '
                   f'actually exercised')

        return {
            'backend': backend, 'lang': lang,
            'ok': ok,
            'err': err,
            'n_bytes': getattr(result, 'n_bytes', None),
            'duration_s': getattr(result, 'duration_s', None),
            'elapsed_wall_s': round(elapsed, 2),
            'fellback_to': fellback_to,
        }
    except Exception as e:
        elapsed = time.monotonic() - start
        return {
            'backend': backend, 'lang': lang,
            'ok': False,
            'err': f'run_handshake raised: {e!r}',
            'n_bytes': None, 'duration_s': None,
            'elapsed_wall_s': round(elapsed, 2),
            'fellback_to': None,
        }


def _maybe_install(engine, backend: str) -> tuple[bool, str]:
    """If a backend isn't runnable, attempt the auto-install path.

    Returns (now_runnable, message).  Auto-install is the same code
    path the admin UI's "Download" button drives.
    """
    try:
        if engine._can_run_backend(backend):
            return True, 'already runnable'
    except Exception as e:
        return False, f'_can_run_backend raised: {e!r}'

    try:
        # _try_auto_install_backend kicks off a background install via
        # tts.package_installer; it does NOT block.  We poll for up to
        # 120s for the package to appear.
        engine._try_auto_install_backend(backend)
    except Exception as e:
        return False, f'auto-install dispatch raised: {e!r}'

    deadline = time.monotonic() + 120.0
    while time.monotonic() < deadline:
        time.sleep(2.0)
        try:
            if engine._can_run_backend(backend):
                return True, 'auto-installed'
        except Exception:
            pass
    return False, 'auto-install timeout (120s)'


def _format_table(rows: list[dict]) -> str:
    """Format probe results as a markdown table."""
    lines = [
        '| Backend | Lang | Status | Bytes | Dur(s) | Wall(s) | Notes |',
        '|---|---|---|---|---|---|---|',
    ]
    for r in rows:
        status = 'PASS' if r.get('ok') else 'FAIL'
        bytes_v = r.get('n_bytes') if r.get('n_bytes') is not None else '-'
        dur = (f"{r.get('duration_s'):.2f}"
               if isinstance(r.get('duration_s'), (int, float)) else '-')
        wall = r.get('elapsed_wall_s', '-')
        notes = (r.get('err') or '').replace('|', '\\|').replace('\n', ' ')[:80]
        if not notes and r.get('ok'):
            notes = 'ok'
        lines.append(
            f"| {r['backend']} | {r['lang']} | {status} | "
            f"{bytes_v} | {dur} | {wall} | {notes} |"
        )
    return '\n'.join(lines)


def _append_history(rows: list[dict], aliases_ok: bool, alias_errs: list[str]):
    """Append a single JSONL line to ~/Documents/Nunba/logs/tts_probe.log."""
    try:
        from core.platform_paths import get_log_dir
        log_dir = Path(get_log_dir())
    except Exception:
        log_dir = Path.home() / 'Documents' / 'Nunba' / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    path = log_dir / 'tts_probe.log'
    payload = {
        'ts': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'rows': rows,
        'aliases_ok': aliases_ok,
        'alias_errs': alias_errs,
    }
    with path.open('a', encoding='utf-8') as f:
        f.write(json.dumps(payload, ensure_ascii=False) + '\n')


def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Probe all TTS engines live')
    p.add_argument('--lang', default='en',
                   help="Language to greet in (default: en)")
    p.add_argument('--backend', action='append', default=[],
                   help='Limit to specific backend(s); repeatable')
    p.add_argument('--skip-heavy', action='store_true',
                   help='Skip backends declaring >2GB VRAM')
    p.add_argument('--auto-install', action='store_true',
                   help='Attempt to install backends that are not runnable')
    p.add_argument('--timeout', type=int, default=90,
                   help='Per-backend timeout in seconds (default: 90)')
    p.add_argument('--prefer-gpu', action='store_true', default=True,
                   help='Prefer GPU when available (default: True)')
    p.add_argument('--cpu-only', action='store_true',
                   help='Force CPU; overrides --prefer-gpu')
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv or sys.argv[1:])

    # Resolve which backends to probe.
    if args.backend:
        targets = tuple(args.backend)
    elif args.lang.startswith(('hi', 'ta', 'te', 'bn', 'ur', 'kn',
                               'ml', 'mr', 'gu', 'pa')):
        targets = _HI_LADDER
    else:
        targets = _EN_LADDER

    if args.skip_heavy:
        targets = tuple(b for b in targets
                        if _HEAVY_VRAM_GB.get(b, 0) <= 2.0)

    print(f'\nTTS live probe — lang={args.lang!r}, '
          f'backends={list(targets)}\n')

    # Step 1: Alias invariants (fast, no synth).
    aliases_ok, alias_errs = _resolve_alias_invariants()
    print('## Alias invariants (post-fix)')
    if aliases_ok:
        print('  All CPU aliases route to BACKEND_PIPER  [OK]\n')
    else:
        for e in alias_errs:
            print(f'  FAIL  {e}')
        print()

    # Step 2: Real synth probes.
    print('## Live synthesis probes')
    print('  (each row spawns a ToolWorker + runs the canonical')
    print('   tts.tts_handshake.run_handshake — same code path as')
    print('   first-run "Voice engine ready" banner)\n')

    try:
        from tts.tts_engine import get_tts_engine
    except Exception as e:
        print(f'  FATAL  cannot import tts.tts_engine: {e!r}')
        return 2

    prefer_gpu = (not args.cpu_only) and args.prefer_gpu
    engine = get_tts_engine()

    rows: list[dict] = []
    for backend in targets:
        print(f'  [{backend:<18}] probing…', end='', flush=True)

        # Optionally try to install if not runnable.
        if args.auto_install:
            try:
                runnable = engine._can_run_backend(backend)
            except Exception:
                runnable = False
            if not runnable:
                installed, msg = _maybe_install(engine, backend)
                if not installed:
                    print(f' SKIP (not runnable: {msg})')
                    rows.append({
                        'backend': backend, 'lang': args.lang,
                        'ok': False,
                        'err': f'not runnable: {msg}',
                        'n_bytes': None, 'duration_s': None,
                        'elapsed_wall_s': 0.0,
                    })
                    continue

        result = _probe_backend(engine, backend, args.lang,
                                timeout_s=args.timeout)
        status = 'PASS' if result['ok'] else 'FAIL'
        nb = result.get('n_bytes')
        ds = result.get('duration_s')
        if result['ok']:
            print(f' {status}  {nb}B  {ds:.2f}s')
        else:
            err = (result.get('err') or '')[:60]
            print(f' {status}  ({err})')
        rows.append(result)

    # Step 3: Markdown summary + history append.
    print('\n## Summary table\n')
    print(_format_table(rows))
    _append_history(rows, aliases_ok, alias_errs)

    n_pass = sum(1 for r in rows if r.get('ok'))
    n_fail = len(rows) - n_pass
    print(f'\nTotals: {n_pass}/{len(rows)} pass, {n_fail} fail, '
          f'aliases={"OK" if aliases_ok else "FAIL"}\n')

    return 0 if (n_fail == 0 and aliases_ok) else 1


if __name__ == '__main__':
    sys.exit(main())
