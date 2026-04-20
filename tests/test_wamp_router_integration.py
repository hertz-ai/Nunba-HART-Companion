"""Integration smoke tests for wamp_router.py — batch #24.

wamp_router.py (815 LOC) is the embedded WAMP/autobahn router
that backs Nunba's real-time push infrastructure (chat events,
kids game broadcasts, notifications, typing indicators).

Critical contract: one WRITER per persisted value, crossbar is
the single source of truth for real-time events — this module
implements the embedded fallback when no external crossbar is
reachable.
"""
from __future__ import annotations

import os
import sys

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

pytestmark = pytest.mark.timeout(10)


# ════════════════════════════════════════════════════════════════════════
# wamp_router.py — exported symbols
# ════════════════════════════════════════════════════════════════════════

class TestWampRouterExports:
    @pytest.mark.parametrize('name', [
        '_require_auth',
        'get_wamp_ticket',
        '_enable_auth_for_lan',
        '_gen_id',
        'WampRealm',
        'WampSession',
        '_get_realm',
        '_send_welcome',
        '_handle_hello',
        '_handle_authenticate',
        '_handle_goodbye',
        '_handle_subscribe',
        '_handle_unsubscribe',
        '_handle_publish',
        '_deliver_event',
    ])
    def test_symbol_exported(self, name):
        import wamp_router as wr
        assert hasattr(wr, name), f'{name} missing from wamp_router'


class TestWampRouterHelpers:
    def test_gen_id_returns_int(self):
        from wamp_router import _gen_id
        a = _gen_id()
        b = _gen_id()
        assert isinstance(a, int)
        assert isinstance(b, int)
        # IDs should be unique across consecutive calls.
        assert a != b

    def test_gen_id_is_positive(self):
        from wamp_router import _gen_id
        assert _gen_id() > 0

    def test_require_auth_returns_bool(self):
        from wamp_router import _require_auth
        result = _require_auth()
        assert isinstance(result, bool)

    def test_get_wamp_ticket_returns_string(self):
        from wamp_router import get_wamp_ticket
        result = get_wamp_ticket()
        assert isinstance(result, str)

    def test_get_realm_returns_realm_instance(self):
        from wamp_router import WampRealm, _get_realm
        realm = _get_realm()
        assert isinstance(realm, WampRealm)

    def test_get_realm_default_realm1(self):
        from wamp_router import _get_realm
        realm = _get_realm('realm1')
        assert realm is not None

    def test_get_realm_same_instance_for_same_name(self):
        """Realm registry should be a singleton per name."""
        from wamp_router import _get_realm
        a = _get_realm('realm1')
        b = _get_realm('realm1')
        assert a is b


class TestWampSession:
    def test_wamp_session_is_class(self):
        import inspect
        from wamp_router import WampSession
        assert inspect.isclass(WampSession)


class TestWampRealm:
    def test_wamp_realm_is_class(self):
        import inspect
        from wamp_router import WampRealm
        assert inspect.isclass(WampRealm)


# ════════════════════════════════════════════════════════════════════════
# tts/verified_* family — backend verification helpers
# ════════════════════════════════════════════════════════════════════════

class TestVerifiedSynth:
    @pytest.mark.parametrize('name', [
        'Result',
        '_pick_test_phrase',
        '_hf_offline_reason',
        'verify_backend_synth',
    ])
    def test_symbol_exported(self, name):
        import tts.verified_synth as vs
        assert hasattr(vs, name), f'{name} missing from tts.verified_synth'

    def test_pick_test_phrase_returns_string(self):
        from tts.verified_synth import _pick_test_phrase
        result = _pick_test_phrase('piper', 'en')
        assert isinstance(result, str)
        assert len(result) > 0

    def test_pick_test_phrase_for_tamil(self):
        from tts.verified_synth import _pick_test_phrase
        result = _pick_test_phrase('piper', 'ta')
        assert isinstance(result, str)

    def test_pick_test_phrase_none_lang(self):
        from tts.verified_synth import _pick_test_phrase
        result = _pick_test_phrase('piper', None)
        assert isinstance(result, str)

    def test_hf_offline_reason_returns_string_or_none(self):
        from tts.verified_synth import _hf_offline_reason
        result = _hf_offline_reason()
        assert result is None or isinstance(result, str)


class TestVerifiedFamilyModuleLoads:
    """All verified_* modules must be importable — they're bundled
    into cx_Freeze per setup_freeze_nunba.py packages[]."""

    @pytest.mark.parametrize('module_name', [
        'tts.verified_audio_gen',
        'tts.verified_llm',
        'tts.verified_stt',
        'tts.verified_synth',
        'tts.verified_video_gen',
        'tts.verified_vlm',
    ])
    def test_module_loads(self, module_name):
        import importlib
        try:
            mod = importlib.import_module(module_name)
            assert mod is not None
        except ImportError as e:
            pytest.skip(f'{module_name}: dep missing in this env: {e}')


# ════════════════════════════════════════════════════════════════════════
# tts/_torch_probe.py + tts/_subprocess.py — internal helpers
# ════════════════════════════════════════════════════════════════════════

class TestTTSInternalHelpers:
    def test_torch_probe_module_loads(self):
        try:
            import tts._torch_probe as tp
            assert tp is not None
        except ImportError:
            pytest.skip('torch not installed in this env')

    def test_subprocess_module_loads(self):
        import tts._subprocess as ts
        assert ts is not None
