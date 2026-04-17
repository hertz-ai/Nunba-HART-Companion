"""Shared fixtures for the user-defect reproduction suite.

Design rule: collection must not import torch, transformers, tts_engine,
or anything heavy. SSoT enumeration happens via source-text scanning
so CI without heavy deps can still parametrise correctly.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import List

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT_ROOT))


# ───────────────────────────────────────────────────────────────
# SSoT enumeration — by grepping source, not importing modules.
# This is the ONLY design that keeps collection fast on CI without
# torch/transformers installed.
# ───────────────────────────────────────────────────────────────

def _extract_tts_backends() -> tuple[list[str], list[str]]:
    """Return (all_tts_backends, tts_auto_install) by walking BACKEND_*
    module-level assignments in tts/tts_engine.py.

    Parses patterns like `BACKEND_INDIC_PARLER = "indic_parler"` —
    stable, readable, version-independent of internal dict format.
    """
    p = PROJECT_ROOT / "tts" / "tts_engine.py"
    if not p.exists():
        return [], []
    src = p.read_text(encoding="utf-8", errors="ignore")
    # Match `BACKEND_<NAME> = "<value>"` lines (up to the first \n\n).
    pat = re.compile(
        r"^BACKEND_[A-Z0-9_]+\s*=\s*[\"']([a-z_0-9]+)[\"']",
        re.MULTILINE,
    )
    keys = sorted(set(pat.findall(src)))
    # Drop the sentinel "none" plus piper (bundled, no install path).
    keys = [k for k in keys if k not in ("none",)]
    auto = [b for b in keys if b != "piper"]
    return keys, auto


def _extract_model_catalog_ids() -> list[str]:
    """Enumerate auto-installable model ids across types (TTS / LLM /
    STT / VLM / audio / video) as a deterministic curated set.

    Source of truth for tests that must parametrise over "every model
    type". Not derived from free-text grep (which produces noise) —
    curated to match ModelCatalog canonical ids. When a new model lands
    it must be added here so the generic-auto-install tests cover it.
    """
    # TTS backends — re-use _extract_tts_backends.
    _tts_all, _tts_auto = _extract_tts_backends()
    ids = set(_tts_auto)
    # Non-TTS model types — matches model_catalog.py canonical ids.
    ids.update({
        "llm-qwen3-4b",
        "llm-qwen3-0.8b-draft",
        "llm-qwen3.5-4b-vl",
        "stt-whisper-base",
        "stt-whisper-small",
        "stt-whisper-medium",
        "vlm-minicpm-v2",
        "vlm-qwen3.5-4b-vl",
        "audio_gen-acestep",
        "audio_gen-diffrhythm",
        "video_gen-ltx2",
    })
    return sorted(ids)


TTS_ALL, TTS_AUTO_INSTALL = _extract_tts_backends()
ALL_AUTO_INSTALL = _extract_model_catalog_ids()


# ───────────────────────────────────────────────────────────────
# Fixtures — real source files, no imports
# ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def project_root() -> Path:
    return PROJECT_ROOT


@pytest.fixture(scope="session")
def source_app_py(project_root: Path) -> Path:
    p = project_root / "app.py"
    if not p.exists():
        pytest.fail(f"source app.py missing at {p}")
    return p


@pytest.fixture(scope="session")
def source_main_py(project_root: Path) -> Path:
    p = project_root / "main.py"
    if not p.exists():
        pytest.fail(f"source main.py missing at {p}")
    return p


@pytest.fixture(scope="session")
def source_build_py(project_root: Path) -> Path:
    p = project_root / "scripts" / "build.py"
    if not p.exists():
        pytest.fail(f"source scripts/build.py missing at {p}")
    return p


@pytest.fixture(scope="session")
def frozen_bundle_dir(project_root: Path) -> Path:
    p = project_root / "build" / "Nunba"
    if not p.exists():
        pytest.skip(f"frozen bundle not built at {p} — live tier only")
    return p


@pytest.fixture
def hart_language_override(tmp_path, monkeypatch):
    f = tmp_path / "hart_language.json"
    monkeypatch.setenv("NUNBA_HART_LANG_FILE", str(f))

    def set_lang(code: str) -> None:
        f.write_text(json.dumps({"language": code}))

    return f, set_lang


@pytest.fixture
def tts_engine_reset():
    """ONLY imported if the test actually uses it (avoid collection-time import)."""
    import importlib
    _te = importlib.import_module("tts.tts_engine")
    orig_singleton = getattr(_te, "_engine_instance", None)
    orig_pending = set(_te.TTSEngine._auto_install_pending)
    orig_failed = set(_te.TTSEngine._auto_install_failed)
    orig_cache = dict(_te.TTSEngine._import_check_cache)
    yield
    _te._engine_instance = orig_singleton
    _te.TTSEngine._auto_install_pending.clear()
    _te.TTSEngine._auto_install_pending.update(orig_pending)
    _te.TTSEngine._auto_install_failed.clear()
    _te.TTSEngine._auto_install_failed.update(orig_failed)
    _te.TTSEngine._import_check_cache.clear()
    _te.TTSEngine._import_check_cache.update(orig_cache)


@pytest.fixture
def source_text():
    _cache: dict[Path, str] = {}

    def _read(path: Path) -> str:
        if path not in _cache:
            _cache[path] = Path(path).read_text(encoding="utf-8", errors="ignore")
        return _cache[path]

    return _read


# ───────────────────────────────────────────────────────────────
# pytest header — show what we're parametrising over so CI logs
# make it obvious when a backend drops off the list.
# ───────────────────────────────────────────────────────────────

def pytest_report_header(config):
    return [
        f"TTS_ALL ({len(TTS_ALL)}): {', '.join(TTS_ALL) or '<none>'}",
        f"TTS_AUTO_INSTALL ({len(TTS_AUTO_INSTALL)}): {', '.join(TTS_AUTO_INSTALL) or '<none>'}",
        f"ALL_AUTO_INSTALL ({len(ALL_AUTO_INSTALL)} models)",
    ]
