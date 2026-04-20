"""
tests/test_draft_cohort_gate.py
───────────────────────────────
CI assertion battery for the cohort-aware `should_boot_draft()` gate
introduced during the commit-2acf21a ship-gate rework.

We stub:
  1. `integrations.service_tools.vram_manager.vram_manager` with a
     parameterised FakeVRAMManager so total/free/cuda are controllable.
  2. `LlamaConfig._read_preferred_lang` to return the cohort's language
     without touching the user's ~/Documents/Nunba/data/ dir.
  3. `LlamaConfig._read_active_tts` to return the cohort's TTS engine.
  4. `LlamaConfig._log_draft_decision` with a recorder — CI must not
     write to $HOME/Documents/Nunba/logs/draft_decision.jsonl.

The four canonical matrix rows the data-scientist pinned are all
asserted as separate tests so a regression surfaces the offending cell.
"""
from __future__ import annotations

import sys
import types

import pytest


# ── Fake VRAM plumbing (installed once per test via fixtures) ────────────
#
# IMPORTANT:  every method the real VRAMManager exposes must ALSO exist
# on this fake — even if it's a stub — because the fake gets written
# into ``sys.modules['integrations.service_tools.vram_manager']`` and
# any test that runs after this one (alphabetically: test_kids_media,
# test_model_resilience, etc.) can observe the fake via the module
# cache.  A missing method shows up as an AttributeError at the
# downstream test's point of use, not here — which is a nightmare to
# debug.  Keep this surface wider than strictly needed by the cohort
# gate itself so the bleed is harmless.
class _FakeVRAM:
    def __init__(self, total_gb: float, free_gb: float, cuda: bool = True):
        self._total = total_gb
        self._free = free_gb
        self._cuda = cuda
        self._allocations: dict = {}

    def get_total_vram(self) -> float:
        return self._total

    def get_free_vram(self) -> float:
        return self._free

    def detect_gpu(self) -> dict:
        return {'cuda_available': self._cuda, 'metal_available': False,
                'name': 'FakeGPU', 'total_gb': self._total}

    def get_allocations(self) -> dict:
        return dict(self._allocations)

    def get_allocations_display(self) -> list:
        # Real VRAMManager returns a list of dicts for the /diag UI.
        # Empty list is a legitimate "no current allocations" response.
        return []

    def allocate(self, name: str, vram_gb: float, device: str = 'cuda:0') -> bool:
        # Always-succeed stub — the cohort gate never calls allocate,
        # but downstream tests that inherit this fake via sys.modules
        # should see a no-op that leaves the fake in a consistent state.
        self._allocations[name] = {'vram_gb': vram_gb, 'device': device}
        return True

    def free(self, name: str) -> bool:
        return self._allocations.pop(name, None) is not None

    def refresh_gpu_info(self) -> None:
        return None


def _install_fake_vram(total_gb: float, free_gb: float,
                       cuda: bool = True) -> None:
    integrations = sys.modules.get('integrations') or types.ModuleType('integrations')
    sys.modules['integrations'] = integrations
    service_tools = sys.modules.get('integrations.service_tools') \
        or types.ModuleType('integrations.service_tools')
    sys.modules['integrations.service_tools'] = service_tools
    integrations.service_tools = service_tools
    mod = types.ModuleType('integrations.service_tools.vram_manager')
    mod.vram_manager = _FakeVRAM(total_gb=total_gb, free_gb=free_gb, cuda=cuda)
    sys.modules['integrations.service_tools.vram_manager'] = mod
    service_tools.vram_manager = mod


@pytest.fixture(autouse=True)
def _restore_vram_module_after_each_test():
    """Clean up sys.modules so the fake VRAM doesn't bleed into other test
    files.  Before this fixture existed, alphabetically-later files
    (test_kids_media_routes, test_model_resilience, test_tts_*) were
    inheriting this fake and crashing on missing methods or stale state.
    """
    saved_mods = {
        k: sys.modules.get(k) for k in (
            'integrations',
            'integrations.service_tools',
            'integrations.service_tools.vram_manager',
        )
    }
    yield
    for k, v in saved_mods.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v


@pytest.fixture
def gate(monkeypatch):
    """Return a callable that configures cohort + VRAM then invokes the gate.

    Signature: gate(total_gb, free_gb, lang, tts, cuda=True) -> bool
    Also returns (decision, log_calls) when called with return_log=True so
    we can assert the drift-monitor payload.
    """
    from llama.llama_config import LlamaConfig

    recorded: list[dict] = []

    def _fake_log(decision, lang, vram_total, vram_free, active_tts, reason):
        recorded.append({
            'decision': decision, 'lang': lang,
            'vram_total_gb': vram_total, 'vram_free_gb': vram_free,
            'active_tts': active_tts, 'reason': reason,
        })

    monkeypatch.setattr(LlamaConfig, '_log_draft_decision',
                        staticmethod(_fake_log))

    def _run(total_gb, free_gb, lang, tts, cuda=True, return_log=False):
        _install_fake_vram(total_gb=total_gb, free_gb=free_gb, cuda=cuda)
        monkeypatch.setattr(LlamaConfig, '_read_preferred_lang',
                            staticmethod(lambda: lang))
        monkeypatch.setattr(LlamaConfig, '_read_active_tts',
                            staticmethod(lambda: tts))
        recorded.clear()
        decision = LlamaConfig.should_boot_draft()
        return (decision, list(recorded)) if return_log else decision

    return _run


# ── The four canonical matrix rows ───────────────────────────────────────
def test_8gb_english_kokoro_keeps_draft(gate):
    """8 GB + lang=en + Kokoro → draft_enabled (new cohort-aware path)."""
    decision, log = gate(total_gb=8.0, free_gb=6.0, lang='en', tts='kokoro',
                         return_log=True)
    assert decision is True
    assert len(log) == 1
    assert log[0]['decision'] == 'draft_enabled'
    assert log[0]['reason'] == 'cohort_en_small_tts_8to10gb'
    assert log[0]['lang'] == 'en'
    assert log[0]['active_tts'] == 'kokoro'


def test_8gb_english_piper_keeps_draft(gate):
    """Piper is also in the small-TTS allow-list."""
    decision = gate(total_gb=8.0, free_gb=6.0, lang='en', tts='piper')
    assert decision is True


def test_8gb_tamil_main_only(gate):
    """8 GB + lang=ta → main_only (Indic Parler doesn't fit alongside draft)."""
    decision, log = gate(total_gb=8.0, free_gb=6.0, lang='ta',
                         tts='indic_parler', return_log=True)
    assert decision is False
    assert log[0]['decision'] == 'main_only'
    assert log[0]['reason'] == 'cohort_indic_or_large_tts'


def test_10gb_any_lang_enables_draft(gate):
    """10 GB + any lang → draft_enabled (primary gate, no cohort gymnastics)."""
    for lang, tts in [('en', 'kokoro'), ('ta', 'indic_parler'),
                      ('hi', 'indic_parler'), ('bn', 'piper')]:
        assert gate(total_gb=10.0, free_gb=2.0, lang=lang, tts=tts) is True, \
            f"10 GB should always dual, failed for {lang}/{tts}"


def test_6gb_any_lang_main_only(gate):
    """6 GB + any lang → main_only (below-threshold primary gate)."""
    for lang, tts in [('en', 'kokoro'), ('ta', 'indic_parler'),
                      ('en', 'piper')]:
        decision, log = gate(total_gb=6.0, free_gb=4.0, lang=lang, tts=tts,
                             return_log=True)
        assert decision is False, f"6 GB should be main-only, failed for {lang}/{tts}"
        assert log[0]['decision'] == 'main_only'
        assert log[0]['reason'] == 'vram_below_8gb'


# ── Guardrail tests (defense in depth) ───────────────────────────────────
def test_no_cuda_forces_main_only(gate):
    """Even with 32 GB of VRAM, no CUDA means no draft (metal/cpu path)."""
    decision, log = gate(total_gb=32.0, free_gb=30.0, lang='en',
                         tts='kokoro', cuda=False, return_log=True)
    assert decision is False
    assert log[0]['reason'] == 'no_cuda'


def test_8gb_english_unknown_tts_falls_back(gate):
    """When TTS probe returns None we must *not* assume small — main-only."""
    decision = gate(total_gb=8.0, free_gb=6.0, lang='en', tts=None)
    assert decision is False


def test_8gb_english_large_tts_main_only(gate):
    """Cosyvoice/chatterbox are too big for the 8–10 GB fast-path."""
    for tts in ('cosyvoice', 'chatterbox', 'indic_parler', 'f5'):
        assert gate(total_gb=8.0, free_gb=6.0, lang='en', tts=tts) is False


def test_log_emits_exactly_one_line_per_call(gate):
    """Drift monitor relies on one line == one boot decision."""
    _, log = gate(total_gb=8.0, free_gb=6.0, lang='en', tts='kokoro',
                  return_log=True)
    assert len(log) == 1
    _, log2 = gate(total_gb=10.0, free_gb=4.0, lang='ta', tts='indic_parler',
                   return_log=True)
    assert len(log2) == 1
