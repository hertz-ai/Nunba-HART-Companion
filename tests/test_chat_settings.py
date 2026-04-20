"""Unit tests for desktop.chat_settings (J207).

Covers:
  * default values
  * enum allowlists for restore_policy and restore_scope
  * full round-trip via update + get
  * malformed JSON file fallback (defensive read)
  * unknown keys are dropped (forward compat)
  * invalid enum values 400 on writes (no silent coerce)
  * cache invalidation on write
"""

from __future__ import annotations

import json
import os

import pytest

# Ensure the test points the data-dir at a tmp dir BEFORE we import
# the module under test — otherwise the module's _data_dir() may
# resolve to the user's real ~/Documents/Nunba and trample real state.


@pytest.fixture
def isolated_data_dir(monkeypatch, tmp_path):
    """Patch desktop.chat_settings._data_dir to point at tmp_path."""
    from desktop import chat_settings

    monkeypatch.setattr(chat_settings, "_data_dir", lambda: str(tmp_path))
    chat_settings.reset_cache_for_tests()
    yield tmp_path
    chat_settings.reset_cache_for_tests()


# ============================ defaults ====================================

class TestDefaults:
    def test_default_policy_is_always(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings
        s = get_chat_settings()
        assert s.restore_policy == "always"

    def test_default_scope_is_all_agents(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings
        s = get_chat_settings()
        assert s.restore_scope == "all_agents"

    def test_default_cloud_sync_off(self, isolated_data_dir):
        """Privacy-first default per HARTOS design philosophy."""
        from desktop.chat_settings import get_chat_settings
        s = get_chat_settings()
        assert s.cloud_sync_enabled is False

    def test_to_dict_round_trip(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings
        d = get_chat_settings().to_dict()
        assert d == {
            "restore_policy": "always",
            "restore_scope": "all_agents",
            "cloud_sync_enabled": False,
        }


# ============================ enum allowlist =============================

class TestPolicyAllowlist:
    @pytest.mark.parametrize("policy", ["always", "prompt", "never", "session"])
    def test_each_policy_value_round_trips(self, isolated_data_dir, policy):
        from desktop.chat_settings import get_chat_settings, reset_cache_for_tests, update_chat_settings
        update_chat_settings({"restore_policy": policy})
        # Force re-read from disk to verify persistence (not just cache)
        reset_cache_for_tests()
        assert get_chat_settings().restore_policy == policy

    def test_invalid_policy_raises(self, isolated_data_dir):
        from desktop.chat_settings import update_chat_settings
        with pytest.raises(ValueError, match="restore_policy"):
            update_chat_settings({"restore_policy": "yes_please"})

    def test_invalid_policy_does_not_persist_partial_state(
        self, isolated_data_dir
    ):
        """When the write fails, on-disk state must not change."""
        from desktop.chat_settings import get_chat_settings, update_chat_settings
        # First write a valid value so the file exists
        update_chat_settings({"restore_policy": "never"})
        with pytest.raises(ValueError):
            update_chat_settings({"restore_policy": "garbage"})
        assert get_chat_settings().restore_policy == "never"


class TestScopeAllowlist:
    @pytest.mark.parametrize("scope", ["all_agents", "active_only", "manual"])
    def test_each_scope_value_round_trips(self, isolated_data_dir, scope):
        from desktop.chat_settings import get_chat_settings, reset_cache_for_tests, update_chat_settings
        update_chat_settings({"restore_scope": scope})
        reset_cache_for_tests()
        assert get_chat_settings().restore_scope == scope

    def test_invalid_scope_raises(self, isolated_data_dir):
        from desktop.chat_settings import update_chat_settings
        with pytest.raises(ValueError, match="restore_scope"):
            update_chat_settings({"restore_scope": "everything"})


class TestCloudSyncFlag:
    @pytest.mark.parametrize("v", [True, False])
    def test_bool_round_trips(self, isolated_data_dir, v):
        from desktop.chat_settings import get_chat_settings, reset_cache_for_tests, update_chat_settings
        update_chat_settings({"cloud_sync_enabled": v})
        reset_cache_for_tests()
        assert get_chat_settings().cloud_sync_enabled is v

    def test_string_truthy_rejected(self, isolated_data_dir):
        from desktop.chat_settings import update_chat_settings
        with pytest.raises(ValueError, match="cloud_sync_enabled"):
            update_chat_settings({"cloud_sync_enabled": "yes"})


# ============================ partial updates ============================

class TestPartialUpdate:
    def test_partial_update_preserves_other_fields(self, isolated_data_dir):
        from desktop.chat_settings import update_chat_settings
        # Start with a non-default state
        update_chat_settings({
            "restore_policy": "prompt",
            "restore_scope": "active_only",
            "cloud_sync_enabled": True,
        })
        # Update ONLY the policy
        new = update_chat_settings({"restore_policy": "never"})
        # Other fields must persist
        assert new.restore_policy == "never"
        assert new.restore_scope == "active_only"
        assert new.cloud_sync_enabled is True

    def test_unknown_keys_dropped(self, isolated_data_dir):
        from desktop.chat_settings import update_chat_settings
        new = update_chat_settings({
            "restore_policy": "always",
            "restore_scope": "all_agents",
            "future_field": "ignored",
            "another_one": 42,
        })
        d = new.to_dict()
        assert "future_field" not in d
        assert "another_one" not in d


# ============================ defensive reads =============================

class TestDefensiveRead:
    def test_missing_file_returns_defaults(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings
        path = os.path.join(str(isolated_data_dir), "chat_settings.json")
        assert not os.path.exists(path)
        s = get_chat_settings()
        assert s.restore_policy == "always"

    def test_malformed_json_falls_back_to_defaults(self, isolated_data_dir):
        from desktop import chat_settings as cs
        path = os.path.join(str(isolated_data_dir), "chat_settings.json")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("{invalid json")
        cs.reset_cache_for_tests()
        s = cs.get_chat_settings()
        assert s.restore_policy == "always"  # graceful fallback

    def test_invalid_enum_in_file_falls_back_to_default(self, isolated_data_dir):
        """Forward-compat: a downgrade can leave bogus enum values
        on disk. READ-time _coerce silently falls back so the user
        still gets working defaults."""
        from desktop import chat_settings as cs
        path = os.path.join(str(isolated_data_dir), "chat_settings.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"restore_policy": "BOGUS_FROM_FUTURE", "restore_scope": "all_agents"}, fh)
        cs.reset_cache_for_tests()
        s = cs.get_chat_settings()
        assert s.restore_policy == "always"


# ============================ payload validation =========================

class TestPayloadValidation:
    def test_non_dict_payload_raises(self, isolated_data_dir):
        from desktop.chat_settings import update_chat_settings
        with pytest.raises(ValueError, match="JSON object"):
            update_chat_settings("not a dict")  # type: ignore[arg-type]

    def test_empty_dict_is_noop(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings, update_chat_settings
        before = get_chat_settings().to_dict()
        after = update_chat_settings({}).to_dict()
        assert before == after


# ============================ cache invariants ===========================

class TestCacheInvariants:
    def test_get_returns_same_instance_within_process(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings
        a = get_chat_settings()
        b = get_chat_settings()
        assert a is b

    def test_update_invalidates_cache(self, isolated_data_dir):
        from desktop.chat_settings import get_chat_settings, update_chat_settings
        before = get_chat_settings()
        new = update_chat_settings({"restore_policy": "never"})
        after = get_chat_settings()
        assert after is new
        assert after is not before
        assert after.restore_policy == "never"
