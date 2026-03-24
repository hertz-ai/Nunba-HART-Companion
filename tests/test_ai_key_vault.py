"""
Tests for desktop/ai_key_vault.py — 38 FT + 10 NFT tests.

Covers: CLOUD_PROVIDERS, _get_machine_identity, _derive_fernet_key,
AIKeyVault (singleton, CRUD, tool keys, channel secrets, metadata, export_to_env,
migrate_from_config_json, test_provider_connection).
"""
import json
import os
import threading
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# We mock out cryptography so tests run even if it is not installed.
# ---------------------------------------------------------------------------

class FakeFernet:
    """Deterministic Fernet stand-in for tests."""
    def __init__(self, key=None):
        self._key = key or b'testkey'

    def encrypt(self, data: bytes) -> bytes:
        return b'ENC:' + data

    def decrypt(self, token: bytes) -> bytes:
        if token.startswith(b'ENC:'):
            return token[4:]
        raise Exception("Bad token")


@pytest.fixture(autouse=True)
def _vault_sandbox(tmp_path, monkeypatch):
    """Redirect vault files to a temp directory and reset singleton."""
    nunba_dir = tmp_path / '.nunba'
    nunba_dir.mkdir()

    # Patch the module-level paths
    monkeypatch.setattr('desktop.ai_key_vault._NUNBA_DIR', nunba_dir)
    monkeypatch.setattr('desktop.ai_key_vault._VAULT_PATH', nunba_dir / 'ai_keys.enc')
    monkeypatch.setattr('desktop.ai_key_vault._SALT_PATH', nunba_dir / 'vault.salt')

    # Patch _derive_fernet_key to skip real crypto
    monkeypatch.setattr(
        'desktop.ai_key_vault._derive_fernet_key',
        lambda salt: FakeFernet(salt),
    )

    # Reset singleton
    from desktop.ai_key_vault import AIKeyVault
    AIKeyVault.reset()

    yield nunba_dir

    AIKeyVault.reset()


@pytest.fixture
def vault():
    from desktop.ai_key_vault import AIKeyVault
    return AIKeyVault()


# ===========================================================================
# FT — CLOUD_PROVIDERS structure
# ===========================================================================

class TestCloudProviders:
    def test_all_providers_have_required_keys(self):
        from desktop.ai_key_vault import CLOUD_PROVIDERS
        required = {'name', 'env_key', 'env_model', 'models', 'default_model',
                    'needs_endpoint', 'needs_api_version'}
        for pid, pdef in CLOUD_PROVIDERS.items():
            missing = required - set(pdef.keys())
            assert not missing, f"Provider {pid} missing keys: {missing}"

    def test_openai_provider_exists(self):
        from desktop.ai_key_vault import CLOUD_PROVIDERS
        assert 'openai' in CLOUD_PROVIDERS
        assert CLOUD_PROVIDERS['openai']['env_key'] == 'OPENAI_API_KEY'

    def test_anthropic_provider_exists(self):
        from desktop.ai_key_vault import CLOUD_PROVIDERS
        assert 'anthropic' in CLOUD_PROVIDERS

    def test_at_least_five_providers(self):
        from desktop.ai_key_vault import CLOUD_PROVIDERS
        assert len(CLOUD_PROVIDERS) >= 5


# ===========================================================================
# FT — _get_machine_identity
# ===========================================================================

class TestMachineIdentity:
    def test_returns_string(self):
        from desktop.ai_key_vault import _get_machine_identity
        result = _get_machine_identity()
        assert isinstance(result, str)
        assert len(result) > 0

    def test_includes_mac_address(self):
        import uuid

        from desktop.ai_key_vault import _get_machine_identity
        result = _get_machine_identity()
        assert str(uuid.getnode()) in result

    def test_deterministic(self):
        from desktop.ai_key_vault import _get_machine_identity
        a = _get_machine_identity()
        b = _get_machine_identity()
        assert a == b


# ===========================================================================
# FT — AIKeyVault singleton
# ===========================================================================

class TestSingleton:
    def test_get_instance_returns_same_object(self, _vault_sandbox):
        from desktop.ai_key_vault import AIKeyVault
        a = AIKeyVault.get_instance()
        b = AIKeyVault.get_instance()
        assert a is b

    def test_reset_clears_singleton(self, _vault_sandbox):
        from desktop.ai_key_vault import AIKeyVault
        a = AIKeyVault.get_instance()
        AIKeyVault.reset()
        b = AIKeyVault.get_instance()
        assert a is not b


# ===========================================================================
# FT — Provider config CRUD
# ===========================================================================

class TestProviderCRUD:
    def test_set_and_get_provider_config(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk-test', 'model': 'gpt-4o'})
        config = vault.get_provider_config('openai')
        assert config['api_key'] == 'sk-test'
        assert config['model'] == 'gpt-4o'

    def test_get_nonexistent_provider_returns_none(self, vault):
        assert vault.get_provider_config('nonexistent') is None

    def test_set_active_provider(self, vault):
        vault.set_active_provider('anthropic')
        assert vault.get_active_provider() == 'anthropic'

    def test_get_active_provider_default_none(self, vault):
        assert vault.get_active_provider() is None

    def test_get_all_configured_providers(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk-1'})
        vault.set_provider_config('groq', {'api_key': 'gsk-2'})
        vault.set_provider_config('empty', {})  # No api_key
        providers = vault.get_all_configured_providers()
        assert 'openai' in providers
        assert 'groq' in providers
        assert 'empty' not in providers

    def test_clear_provider_removes_config(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk-1'})
        vault.clear_provider('openai')
        assert vault.get_provider_config('openai') is None

    def test_clear_active_provider_when_cleared(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk-1'})
        vault.set_active_provider('openai')
        vault.clear_provider('openai')
        assert vault.get_active_provider() is None

    def test_clear_nonactive_provider_keeps_active(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk-1'})
        vault.set_provider_config('groq', {'api_key': 'gsk-1'})
        vault.set_active_provider('groq')
        vault.clear_provider('openai')
        assert vault.get_active_provider() == 'groq'


# ===========================================================================
# FT — Tool keys
# ===========================================================================

class TestToolKeys:
    def test_set_and_get_tool_key(self, vault):
        vault.set_tool_key('GOOGLE_CSE_ID', 'cse-123')
        assert vault.get_tool_key('GOOGLE_CSE_ID') == 'cse-123'

    def test_get_missing_tool_key_returns_none(self, vault):
        assert vault.get_tool_key('NONEXISTENT') is None

    def test_has_key_true(self, vault):
        vault.set_tool_key('NEWS_API_KEY', 'news-abc')
        assert vault.has_key('NEWS_API_KEY') is True

    def test_has_key_false(self, vault):
        assert vault.has_key('NOPE') is False


# ===========================================================================
# FT — Channel secrets
# ===========================================================================

class TestChannelSecrets:
    def test_set_and_get_channel_secret(self, vault):
        vault.set_channel_secret('discord', 'bot_token', 'disc-tok')
        assert vault.get_channel_secret('discord', 'bot_token') == 'disc-tok'

    def test_get_missing_channel_secret(self, vault):
        assert vault.get_channel_secret('slack', 'webhook') is None

    def test_delete_channel_secret(self, vault):
        vault.set_channel_secret('discord', 'bot_token', 'tok')
        vault.delete_channel_secret('discord', 'bot_token')
        assert vault.get_channel_secret('discord', 'bot_token') is None

    def test_has_channel_secret(self, vault):
        vault.set_channel_secret('slack', 'hook', 'url')
        assert vault.has_channel_secret('slack', 'hook') is True
        assert vault.has_channel_secret('slack', 'nope') is False


# ===========================================================================
# FT — Vault metadata (list_vault_keys)
# ===========================================================================

class TestListVaultKeys:
    def test_list_empty_vault(self, vault):
        keys = vault.list_vault_keys()
        assert keys['providers'] == []
        assert keys['active_provider'] is None
        assert keys['tool_keys'] == []
        assert keys['channel_secrets'] == []

    def test_list_populated_vault(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk'})
        vault.set_active_provider('openai')
        vault.set_tool_key('CSE', 'val')
        vault.set_channel_secret('discord', 'tok', 'secret')
        keys = vault.list_vault_keys()
        assert 'openai' in keys['providers']
        assert keys['active_provider'] == 'openai'
        assert 'CSE' in keys['tool_keys']
        assert 'discord/tok' in keys['channel_secrets']


# ===========================================================================
# FT — export_to_env
# ===========================================================================

class TestExportToEnv:
    def test_exports_openai_keys(self, vault):
        vault.set_provider_config('openai', {
            'api_key': 'sk-test',
            'model': 'gpt-4o',
        })
        vault.set_active_provider('openai')

        # Clean env before test
        for key in ['OPENAI_API_KEY', 'OPENAI_MODEL', 'HEVOLVE_LLM_API_KEY',
                     'HEVOLVE_ACTIVE_CLOUD_PROVIDER']:
            os.environ.pop(key, None)

        vault.export_to_env()

        assert os.environ.get('OPENAI_API_KEY') == 'sk-test'
        assert os.environ.get('OPENAI_MODEL') == 'gpt-4o'
        assert os.environ.get('HEVOLVE_LLM_API_KEY') == 'sk-test'
        assert os.environ.get('HEVOLVE_ACTIVE_CLOUD_PROVIDER') == 'openai'

        # Cleanup
        for key in ['OPENAI_API_KEY', 'OPENAI_MODEL', 'HEVOLVE_LLM_API_KEY',
                     'HEVOLVE_ACTIVE_CLOUD_PROVIDER', 'HEVOLVE_LLM_MODEL_NAME']:
            os.environ.pop(key, None)

    def test_exports_azure_api_version(self, vault):
        vault.set_provider_config('azure_openai', {
            'api_key': 'az-key',
            'base_url': 'https://my.azure.com',
            'api_version': '2024-01-01',
        })
        vault.set_active_provider('azure_openai')
        os.environ.pop('AZURE_OPENAI_API_VERSION', None)

        vault.export_to_env()
        assert os.environ.get('AZURE_OPENAI_API_VERSION') == '2024-01-01'

        # Cleanup
        for key in ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT',
                     'AZURE_OPENAI_API_VERSION', 'HEVOLVE_LLM_API_KEY',
                     'HEVOLVE_LLM_ENDPOINT_URL', 'HEVOLVE_ACTIVE_CLOUD_PROVIDER']:
            os.environ.pop(key, None)

    def test_exports_tool_keys_with_setdefault(self, vault):
        vault.set_tool_key('NEWS_API_KEY', 'news123')
        os.environ.pop('NEWS_API_KEY', None)
        vault.export_to_env()
        assert os.environ.get('NEWS_API_KEY') == 'news123'
        os.environ.pop('NEWS_API_KEY', None)

    def test_no_crash_when_no_active_provider(self, vault):
        vault.export_to_env()  # Should not raise


# ===========================================================================
# FT — migrate_from_config_json
# ===========================================================================

class TestMigration:
    def test_returns_false_for_missing_file(self, vault):
        result = vault.migrate_from_config_json('/nonexistent/config.json')
        assert result is False

    def test_returns_false_if_already_migrated(self, vault):
        vault._cache['_migrated_config'] = True
        result = vault.migrate_from_config_json('/any/path')
        assert result is False

    def test_migrates_openai_key(self, vault, tmp_path):
        config_path = str(tmp_path / 'config.json')
        with open(config_path, 'w') as f:
            json.dump({'OPENAI_API_KEY': 'sk-real'}, f)

        result = vault.migrate_from_config_json(config_path)
        assert result is True
        config = vault.get_provider_config('openai')
        assert config['api_key'] == 'sk-real'

        # Verify config.json was cleared
        with open(config_path) as f:
            cleared = json.load(f)
        assert cleared['OPENAI_API_KEY'] == ''

    def test_migrates_tool_keys(self, vault, tmp_path):
        config_path = str(tmp_path / 'config.json')
        with open(config_path, 'w') as f:
            json.dump({'GOOGLE_CSE_ID': 'cse-abc', 'NEWS_API_KEY': 'news-xyz'}, f)

        vault.migrate_from_config_json(config_path)
        assert vault.get_tool_key('GOOGLE_CSE_ID') == 'cse-abc'
        assert vault.get_tool_key('NEWS_API_KEY') == 'news-xyz'

    def test_skips_placeholder_values(self, vault, tmp_path):
        config_path = str(tmp_path / 'config.json')
        with open(config_path, 'w') as f:
            json.dump({'OPENAI_API_KEY': '<YOUR_KEY>', 'NEWS_API_KEY': 'YOUR_KEY_HERE'}, f)

        result = vault.migrate_from_config_json(config_path)
        assert result is False  # No real keys migrated

    def test_handles_invalid_json(self, vault, tmp_path):
        config_path = str(tmp_path / 'config.json')
        with open(config_path, 'w') as f:
            f.write('not json')

        result = vault.migrate_from_config_json(config_path)
        assert result is False


# ===========================================================================
# FT — test_provider_connection
# ===========================================================================

class TestProviderConnection:
    """Tests for the static test_provider_connection method.

    `requests` is imported *inside* the method body, so we must patch it
    via the `requests` top-level module that Python resolves at import time.
    """

    def _run(self, provider_id, api_key, mock_requests, **kw):
        """Helper: inject mock requests module, then call."""
        from desktop.ai_key_vault import AIKeyVault
        with patch.dict('sys.modules', {'requests': mock_requests}):
            return AIKeyVault.test_provider_connection(provider_id, api_key, **kw)

    def _make_mock_requests(self, status_code=200, json_data=None):
        mock_requests = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = status_code
        mock_resp.json.return_value = json_data or {}
        mock_resp.text = ''
        mock_requests.get.return_value = mock_resp
        # Wire up real-ish exception classes
        mock_requests.exceptions.ConnectionError = type('ConnectionError', (Exception,), {})
        mock_requests.exceptions.Timeout = type('Timeout', (Exception,), {})
        return mock_requests, mock_resp

    def test_unknown_provider(self):
        from desktop.ai_key_vault import AIKeyVault
        result = AIKeyVault.test_provider_connection('fake', 'key')
        assert result['success'] is False
        assert 'Unknown' in result['message']

    def test_openai_success(self):
        mr, _ = self._make_mock_requests(200, {'data': [1, 2, 3]})
        result = self._run('openai', 'sk-test', mr)
        assert result['success'] is True
        assert result['model_count'] == 3

    def test_unauthorized_401(self):
        mr, _ = self._make_mock_requests(401)
        result = self._run('openai', 'bad-key', mr)
        assert result['success'] is False
        assert '401' in result['message']

    def test_azure_requires_base_url(self):
        mr, _ = self._make_mock_requests()
        result = self._run('azure_openai', 'key', mr, base_url='')
        assert result['success'] is False
        assert 'endpoint' in result['message'].lower()

    def test_custom_openai_requires_base_url(self):
        mr, _ = self._make_mock_requests()
        result = self._run('custom_openai', 'key', mr, base_url='')
        assert result['success'] is False

    def test_connection_error(self):
        mr, _ = self._make_mock_requests()
        mr.get.side_effect = mr.exceptions.ConnectionError()
        result = self._run('openai', 'key', mr)
        assert result['success'] is False

    def test_timeout_error(self):
        mr, _ = self._make_mock_requests()
        mr.get.side_effect = mr.exceptions.Timeout()
        result = self._run('openai', 'key', mr)
        assert result['success'] is False
        assert 'timed out' in result['message'].lower()

    def test_google_gemini_uses_query_key(self):
        mr, _ = self._make_mock_requests(200, {'models': [1]})
        result = self._run('google_gemini', 'gkey', mr)
        assert result['success'] is True
        call_kwargs = mr.get.call_args
        assert call_kwargs[1]['params']['key'] == 'gkey'

    def test_anthropic_uses_x_api_key_header(self):
        mr, _ = self._make_mock_requests(200, {'data': []})
        self._run('anthropic', 'ant-key', mr)
        call_kwargs = mr.get.call_args
        assert call_kwargs[1]['headers']['x-api-key'] == 'ant-key'


# ===========================================================================
# FT — Persistence (load / save round-trip)
# ===========================================================================

class TestPersistence:
    def test_data_survives_reload(self, _vault_sandbox):
        from desktop.ai_key_vault import AIKeyVault
        v1 = AIKeyVault()
        v1.set_provider_config('openai', {'api_key': 'persist-test'})

        # Create a new instance that reads from the same files
        v2 = AIKeyVault()
        config = v2.get_provider_config('openai')
        assert config is not None
        assert config['api_key'] == 'persist-test'

    def test_corrupt_vault_file_yields_empty_cache(self, _vault_sandbox):
        from desktop.ai_key_vault import AIKeyVault
        vault_path = _vault_sandbox / 'ai_keys.enc'
        vault_path.write_bytes(b'garbage-data')
        v = AIKeyVault()
        assert v._cache == {}


# ===========================================================================
# NFT — Non-Functional Tests
# ===========================================================================

class TestNFT:
    def test_vault_init_creates_directory(self, tmp_path, monkeypatch):
        new_dir = tmp_path / 'fresh' / '.nunba'
        monkeypatch.setattr('desktop.ai_key_vault._NUNBA_DIR', new_dir)
        monkeypatch.setattr('desktop.ai_key_vault._VAULT_PATH', new_dir / 'ai_keys.enc')
        monkeypatch.setattr('desktop.ai_key_vault._SALT_PATH', new_dir / 'vault.salt')

        from desktop.ai_key_vault import AIKeyVault
        AIKeyVault.reset()
        v = AIKeyVault()
        assert new_dir.exists()

    def test_thread_safety_concurrent_writes(self, _vault_sandbox):
        from desktop.ai_key_vault import AIKeyVault
        vault = AIKeyVault()
        errors = []

        def writer(i):
            try:
                vault.set_tool_key(f'KEY_{i}', f'val_{i}')
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=writer, args=(i,)) for i in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)
        assert len(errors) == 0

    def test_large_number_of_keys(self, vault):
        """Vault should handle 100+ keys without issue."""
        for i in range(100):
            vault.set_tool_key(f'KEY_{i}', f'value_{i}')
        assert vault.get_tool_key('KEY_99') == 'value_99'

    def test_export_to_env_is_idempotent(self, vault):
        vault.set_provider_config('openai', {'api_key': 'sk-idem'})
        vault.set_active_provider('openai')
        vault.export_to_env()
        vault.export_to_env()  # Second call should not crash
        assert os.environ.get('OPENAI_API_KEY') == 'sk-idem'
        os.environ.pop('OPENAI_API_KEY', None)
        os.environ.pop('HEVOLVE_LLM_API_KEY', None)
        os.environ.pop('HEVOLVE_ACTIVE_CLOUD_PROVIDER', None)
        os.environ.pop('HEVOLVE_LLM_MODEL_NAME', None)

    def test_list_vault_keys_never_leaks_values(self, vault):
        """Metadata should never contain actual secret values."""
        vault.set_provider_config('openai', {'api_key': 'super-secret-123'})
        vault.set_tool_key('MY_KEY', 'secret-tool-val')
        vault.set_channel_secret('discord', 'tok', 'disc-secret')

        keys = vault.list_vault_keys()
        keys_str = json.dumps(keys)
        assert 'super-secret-123' not in keys_str
        assert 'secret-tool-val' not in keys_str
        assert 'disc-secret' not in keys_str

    def test_empty_api_key_not_in_configured_providers(self, vault):
        vault.set_provider_config('openai', {'api_key': ''})
        assert 'openai' not in vault.get_all_configured_providers()

    def test_clear_nonexistent_provider_is_noop(self, vault):
        vault.clear_provider('totally-fake')  # No crash

    def test_delete_nonexistent_channel_secret_is_noop(self, vault):
        vault.delete_channel_secret('slack', 'nope')  # No crash

    def test_migration_does_not_overwrite_existing_openai(self, vault, tmp_path):
        """If OpenAI is already configured, migration should NOT overwrite it."""
        vault.set_provider_config('openai', {'api_key': 'existing-key'})
        config_path = str(tmp_path / 'config.json')
        with open(config_path, 'w') as f:
            json.dump({'OPENAI_API_KEY': 'new-key'}, f)

        vault.migrate_from_config_json(config_path)
        config = vault.get_provider_config('openai')
        assert config['api_key'] == 'existing-key'

    def test_403_response(self):
        from desktop.ai_key_vault import AIKeyVault
        mock_requests = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_resp.text = 'Forbidden'
        mock_requests.get.return_value = mock_resp
        mock_requests.exceptions.ConnectionError = type('CE', (Exception,), {})
        mock_requests.exceptions.Timeout = type('TO', (Exception,), {})

        with patch.dict('sys.modules', {'requests': mock_requests}):
            result = AIKeyVault.test_provider_connection('openai', 'key')
        assert result['success'] is False
        assert '403' in result['message']
