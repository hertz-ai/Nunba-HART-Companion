"""
TTS speed profile — one config point for how fast synth should run.

Before this module every call site hardcoded `speed=1.0`, so there
was no way to make the whole agent feel faster without editing the
engine source. Reading the profile from one place (env var + optional
user config file) lets the user flip the tradeoff globally:

    TTS_SPEED_PROFILE=fast      → multiplier 1.25  (noticeably snappier)
    TTS_SPEED_PROFILE=balanced  → multiplier 1.10  (slightly faster, still natural)
    TTS_SPEED_PROFILE=natural   → multiplier 1.00  (original tempo)
    TTS_SPEED_PROFILE=slow      → multiplier 0.90  (accessibility / clarity)

Default is ``balanced`` — the user's guideline is "speed > naturalness
default", and 1.1 is the sweet spot where every engine we ship
(F5-TTS, Chatterbox, Kokoro, Piper, Indic Parler) stays intelligible
while the agent feels ~10% more responsive.

The profile is consulted once per synthesis call inside TTSEngine;
callers that pass an explicit ``speed`` kwarg override it, same as
before. This is additive — it only fires when the caller did NOT
specify a speed, which keeps every existing unit test working.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

logger = logging.getLogger('NunbaTTSEngine')

# Public profile names → speed multiplier. Keep the keys lowercase so
# env var comparisons stay case-insensitive.
SPEED_PROFILES: dict[str, float] = {
    'fast':     1.25,
    'balanced': 1.10,
    'natural':  1.00,
    'slow':     0.90,
}

# Per the user's guideline — "speed > naturalness default".
DEFAULT_PROFILE = 'balanced'

_cached_profile: str | None = None


def _read_profile_from_disk() -> str | None:
    """Check ~/.nunba/tts_config.json for a user-pinned profile.

    Written by the admin UI / settings wizard when the user picks a
    tempo in the voice preferences. Absent in fresh installs, in
    which case we fall back to env var or the default.
    """
    try:
        cfg_path = Path.home() / '.nunba' / 'tts_config.json'
        if not cfg_path.is_file():
            return None
        with cfg_path.open(encoding='utf-8') as fp:
            data = json.load(fp)
        val = data.get('speed_profile')
        if isinstance(val, str) and val.lower() in SPEED_PROFILES:
            return val.lower()
    except Exception as e:
        logger.debug(f"tts_config.json read skipped: {e}")
    return None


def get_current_profile() -> str:
    """Return the active profile name — cached on first call.

    Resolution order (first match wins):
        1. TTS_SPEED_PROFILE env var
        2. ~/.nunba/tts_config.json  speed_profile field
        3. DEFAULT_PROFILE

    Invalid values fall through to the default rather than raising
    so a typo in settings can never break synthesis.
    """
    global _cached_profile
    if _cached_profile is not None:
        return _cached_profile
    env_val = os.environ.get('TTS_SPEED_PROFILE', '').strip().lower()
    if env_val in SPEED_PROFILES:
        _cached_profile = env_val
        return _cached_profile
    disk_val = _read_profile_from_disk()
    if disk_val:
        _cached_profile = disk_val
        return _cached_profile
    _cached_profile = DEFAULT_PROFILE
    return _cached_profile


def get_default_speed() -> float:
    """Return the speed multiplier for the active profile.

    Every TTS engine honours the same multiplier (F5 via
    ``file_wave=`` + speed kwarg, Kokoro via KPipeline(..., speed=),
    Piper via its own speed param, Chatterbox via the adapter's
    extra_request['speed']). Passing a single float keeps the
    contract identical across engines — no engine-specific branching
    at the call site.
    """
    return SPEED_PROFILES[get_current_profile()]


def set_profile(name: str) -> bool:
    """Override the profile at runtime (admin UI click). Writes to
    the config file AND invalidates the cache so the next
    ``get_default_speed()`` call picks up the new value. Returns
    True on success, False on invalid name."""
    global _cached_profile
    name_l = (name or '').strip().lower()
    if name_l not in SPEED_PROFILES:
        return False
    try:
        cfg_dir = Path.home() / '.nunba'
        cfg_dir.mkdir(parents=True, exist_ok=True)
        cfg_path = cfg_dir / 'tts_config.json'
        data = {}
        if cfg_path.is_file():
            try:
                with cfg_path.open(encoding='utf-8') as fp:
                    data = json.load(fp) or {}
            except Exception:
                data = {}
        data['speed_profile'] = name_l
        tmp = cfg_path.with_suffix('.json.tmp')
        with tmp.open('w', encoding='utf-8') as fp:
            json.dump(data, fp, indent=2)
        os.replace(tmp, cfg_path)
        _cached_profile = name_l
        logger.info(f"TTS speed profile set to '{name_l}' (×{SPEED_PROFILES[name_l]})")
        return True
    except Exception as e:
        logger.warning(f"Failed to persist TTS speed profile: {e}")
        return False


def invalidate_cache() -> None:
    """Clear the cached profile — forces the next call to re-resolve
    from env/disk. Useful in unit tests that mutate the env."""
    global _cached_profile
    _cached_profile = None
