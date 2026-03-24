"""
ai_key_vault.py - Machine-derived encrypted vault for AI API keys.

Uses machine identity (MAC + Windows MachineGuid) as PBKDF2 entropy source.
No environment variable needed. Keys are locked to the machine.

Vault file: ~/.nunba/ai_keys.enc
Salt file:  ~/.nunba/vault.salt
"""
import base64
import json
import logging
import os
import platform
import sys
import uuid
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger('NunbaVault')

_NUNBA_DIR = Path.home() / '.nunba'
_VAULT_PATH = _NUNBA_DIR / 'ai_keys.enc'
_SALT_PATH = _NUNBA_DIR / 'vault.salt'

# ---------------------------------------------------------------------------
# Cloud provider definitions
# ---------------------------------------------------------------------------
CLOUD_PROVIDERS = {
    'openai': {
        'name': 'OpenAI',
        'env_key': 'OPENAI_API_KEY',
        'env_base_url': None,
        'env_model': 'OPENAI_MODEL',
        'models': ['gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-3.5-turbo'],
        'default_model': 'gpt-4o-mini',
        'needs_endpoint': False,
        'needs_api_version': False,
        'test_url': 'https://api.openai.com/v1/models',
        'test_auth': 'bearer',
    },
    'anthropic': {
        'name': 'Anthropic Claude',
        'env_key': 'ANTHROPIC_API_KEY',
        'env_base_url': None,
        'env_model': 'ANTHROPIC_MODEL',
        'models': ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'],
        'default_model': 'claude-sonnet-4-20250514',
        'needs_endpoint': False,
        'needs_api_version': False,
        'test_url': 'https://api.anthropic.com/v1/models',
        'test_auth': 'x-api-key',
    },
    'azure_openai': {
        'name': 'Azure OpenAI',
        'env_key': 'AZURE_OPENAI_API_KEY',
        'env_base_url': 'AZURE_OPENAI_ENDPOINT',
        'env_model': 'AZURE_OPENAI_DEPLOYMENT',
        'models': [],
        'default_model': '',
        'needs_endpoint': True,
        'needs_api_version': True,
        'default_api_version': '2024-02-15-preview',
        'test_auth': 'api-key',
    },
    'google_gemini': {
        'name': 'Google Gemini',
        'env_key': 'GOOGLE_API_KEY',
        'env_base_url': None,
        'env_model': 'GOOGLE_MODEL',
        'models': ['gemini-2.0-flash', 'gemini-2.5-pro'],
        'default_model': 'gemini-2.0-flash',
        'needs_endpoint': False,
        'needs_api_version': False,
        'test_url': 'https://generativelanguage.googleapis.com/v1beta/models',
        'test_auth': 'query_key',
    },
    'groq': {
        'name': 'Groq',
        'env_key': 'GROQ_API_KEY',
        'env_base_url': None,
        'env_model': 'GROQ_MODEL',
        'models': ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
        'default_model': 'llama-3.3-70b-versatile',
        'needs_endpoint': False,
        'needs_api_version': False,
        'test_url': 'https://api.groq.com/openai/v1/models',
        'test_auth': 'bearer',
    },
    'custom_openai': {
        'name': 'Custom OpenAI-compatible',
        'env_key': 'CUSTOM_LLM_API_KEY',
        'env_base_url': 'CUSTOM_LLM_BASE_URL',
        'env_model': 'CUSTOM_LLM_MODEL',
        'models': [],
        'default_model': '',
        'needs_endpoint': True,
        'needs_api_version': False,
        'test_auth': 'bearer',
    },
}

# Keys in config.json that are sensitive and should be migrated
_MIGRATABLE_KEYS = [
    'OPENAI_API_KEY', 'GOOGLE_CSE_ID', 'GOOGLE_API_KEY',
    'NEWS_API_KEY', 'SERPAPI_API_KEY', 'ZEP_API_KEY',
    'GOOGLE_OAUTH2_CLIENT_ID', 'GOOGLE_OAUTH2_CLIENT_SECRET',
]


def _get_machine_identity() -> str:
    """Derive a machine-unique string from hardware identifiers."""
    parts = [str(uuid.getnode())]  # MAC address

    if sys.platform == 'win32':
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r'SOFTWARE\Microsoft\Cryptography'
            ) as key:
                guid, _ = winreg.QueryValueEx(key, 'MachineGuid')
                parts.append(guid)
        except Exception:
            pass

    parts.append(platform.node())
    return '|'.join(parts)


def _derive_fernet_key(salt: bytes) -> Any:
    """Derive a Fernet key from machine identity + salt."""
    from cryptography.fernet import Fernet
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    machine_id = _get_machine_identity()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=480_000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(machine_id.encode()))
    return Fernet(key)


class AIKeyVault:
    """Machine-locked encrypted vault for AI API keys."""

    _instance: Optional['AIKeyVault'] = None

    def __init__(self):
        _NUNBA_DIR.mkdir(parents=True, exist_ok=True)
        self._fernet = self._init_fernet()
        self._cache: dict[str, Any] = {}
        self._load()

    @classmethod
    def get_instance(cls) -> 'AIKeyVault':
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset(cls):
        """Reset singleton (for testing or re-initialization)."""
        cls._instance = None

    # ------------------------------------------------------------------
    # Crypto layer
    # ------------------------------------------------------------------
    def _init_fernet(self):
        if _SALT_PATH.exists():
            salt = _SALT_PATH.read_bytes()
        else:
            salt = os.urandom(16)
            _SALT_PATH.write_bytes(salt)
        return _derive_fernet_key(salt)

    def _load(self):
        if not _VAULT_PATH.exists():
            self._cache = {}
            return
        try:
            encrypted = _VAULT_PATH.read_bytes()
            decrypted = self._fernet.decrypt(encrypted)
            self._cache = json.loads(decrypted.decode())
        except Exception as e:
            logger.error(f"Vault decryption failed (machine identity may have changed): {e}")
            self._cache = {}

    def _save(self):
        plaintext = json.dumps(self._cache, indent=2).encode()
        encrypted = self._fernet.encrypt(plaintext)
        _VAULT_PATH.write_bytes(encrypted)

    # ------------------------------------------------------------------
    # Provider config CRUD
    # ------------------------------------------------------------------
    def set_provider_config(self, provider_id: str, config: dict[str, str]):
        """Store provider config (api_key, model, base_url, api_version)."""
        self._cache[provider_id] = config
        self._save()

    def get_provider_config(self, provider_id: str) -> dict[str, str] | None:
        return self._cache.get(provider_id)

    def get_active_provider(self) -> str | None:
        return self._cache.get('_active_provider')

    def set_active_provider(self, provider_id: str):
        self._cache['_active_provider'] = provider_id
        self._save()

    def get_all_configured_providers(self) -> list[str]:
        """Return provider IDs that have an api_key set."""
        return [
            k for k in self._cache
            if not k.startswith('_')
            and isinstance(self._cache[k], dict)
            and self._cache[k].get('api_key')
        ]

    def clear_provider(self, provider_id: str):
        self._cache.pop(provider_id, None)
        if self._cache.get('_active_provider') == provider_id:
            self._cache.pop('_active_provider', None)
        self._save()

    # ------------------------------------------------------------------
    # Tool keys (Google search, SerpAPI, etc.)
    # ------------------------------------------------------------------
    def set_tool_key(self, key_name: str, value: str):
        """Store a non-provider tool key (e.g. GOOGLE_CSE_ID)."""
        tool_keys = self._cache.setdefault('_tool_keys', {})
        tool_keys[key_name] = value
        self._save()

    def get_tool_key(self, key_name: str) -> str | None:
        return self._cache.get('_tool_keys', {}).get(key_name)

    # ------------------------------------------------------------------
    # Channel secrets (Discord tokens, Slack webhooks, etc.)
    # ------------------------------------------------------------------
    def set_channel_secret(self, channel_type: str, key_name: str, value: str):
        """Store a channel-specific secret (e.g. discord/bot_token)."""
        channel_keys = self._cache.setdefault('_channel_secrets', {})
        channel_keys[f'{channel_type}/{key_name}'] = value
        self._save()

    def get_channel_secret(self, channel_type: str, key_name: str) -> str | None:
        """Retrieve a channel secret at runtime. Returns None if not set."""
        return self._cache.get('_channel_secrets', {}).get(f'{channel_type}/{key_name}')

    def delete_channel_secret(self, channel_type: str, key_name: str):
        """Remove a channel secret from the vault."""
        channel_keys = self._cache.get('_channel_secrets', {})
        channel_keys.pop(f'{channel_type}/{key_name}', None)
        self._save()

    # ------------------------------------------------------------------
    # Vault metadata queries (never returns raw secrets)
    # ------------------------------------------------------------------
    def has_key(self, key_name: str) -> bool:
        """Check if a tool key exists without revealing its value."""
        return key_name in self._cache.get('_tool_keys', {})

    def has_channel_secret(self, channel_type: str, key_name: str) -> bool:
        """Check if a channel secret exists."""
        return f'{channel_type}/{key_name}' in self._cache.get('_channel_secrets', {})

    def list_vault_keys(self) -> dict:
        """Return metadata about stored keys (names only, never values)."""
        return {
            'providers': self.get_all_configured_providers(),
            'active_provider': self.get_active_provider(),
            'tool_keys': list(self._cache.get('_tool_keys', {}).keys()),
            'channel_secrets': list(self._cache.get('_channel_secrets', {}).keys()),
        }

    # ------------------------------------------------------------------
    # Environment export — the critical bridge
    # ------------------------------------------------------------------
    def export_to_env(self):
        """Populate os.environ from the active provider config.

        This is the critical bridge: vault keys -> env vars -> LangChain/Autogen/HevolveAI.
        Called once at startup (before Flask) and on hot-reload.
        """
        active = self.get_active_provider()
        if active and active in CLOUD_PROVIDERS:
            provider_def = CLOUD_PROVIDERS[active]
            config = self.get_provider_config(active)
            if config:
                api_key = config.get('api_key', '')
                model = config.get('model', '')
                base_url = config.get('base_url', '')

                # Provider-specific env var
                if api_key:
                    os.environ[provider_def['env_key']] = api_key

                # Model env var
                if model and provider_def.get('env_model'):
                    os.environ[provider_def['env_model']] = model

                # Base URL if applicable
                if base_url and provider_def.get('env_base_url'):
                    os.environ[provider_def['env_base_url']] = base_url

                # Azure-specific
                if config.get('api_version'):
                    os.environ['AZURE_OPENAI_API_VERSION'] = config['api_version']

                # Unified env vars (consumed by LangChain/Autogen/HevolveAI)
                if api_key:
                    os.environ['HEVOLVE_LLM_API_KEY'] = api_key
                if base_url:
                    os.environ['HEVOLVE_LLM_ENDPOINT_URL'] = base_url
                if model:
                    os.environ['HEVOLVE_LLM_MODEL_NAME'] = model

                # Signal which provider is active
                os.environ['HEVOLVE_ACTIVE_CLOUD_PROVIDER'] = active

                logger.info(f"AI vault: exported {active} config to env vars")

        # Export tool keys (Google search, SerpAPI, etc.)
        for key_name, value in self._cache.get('_tool_keys', {}).items():
            if value:
                os.environ.setdefault(key_name, value)

    # ------------------------------------------------------------------
    # config.json migration (one-time)
    # ------------------------------------------------------------------
    def migrate_from_config_json(self, config_json_path: str) -> bool:
        """Migrate plaintext API keys from config.json into the encrypted vault.

        Returns True if migration happened, False if already migrated or no file.
        """
        if self._cache.get('_migrated_config'):
            return False

        if not os.path.isfile(config_json_path):
            return False

        try:
            with open(config_json_path) as f:
                cfg = json.load(f)
        except Exception as e:
            logger.error(f"Failed to read config.json for migration: {e}")
            return False

        migrated_count = 0
        cleared_keys = {}

        for key_name in _MIGRATABLE_KEYS:
            value = cfg.get(key_name, '')
            if not value or value.startswith('<') or value == 'YOUR_KEY_HERE':
                continue

            # Store in vault
            if key_name == 'OPENAI_API_KEY':
                # If no OpenAI provider configured yet, set it up
                existing = self.get_provider_config('openai')
                if not existing or not existing.get('api_key'):
                    self.set_provider_config('openai', {
                        'api_key': value,
                        'model': 'gpt-4o-mini',
                    })
                    migrated_count += 1
            else:
                self.set_tool_key(key_name, value)
                migrated_count += 1

            # Clear from config.json
            cleared_keys[key_name] = ''

        if migrated_count > 0:
            # Write back config.json with cleared keys
            try:
                for key_name, empty_val in cleared_keys.items():
                    cfg[key_name] = empty_val
                with open(config_json_path, 'w') as f:
                    json.dump(cfg, f, indent=2)
                logger.info(f"Migrated {migrated_count} keys from config.json to encrypted vault")
            except Exception as e:
                logger.warning(f"Could not clear config.json after migration: {e}")

        self._cache['_migrated_config'] = True
        self._save()
        return migrated_count > 0

    # ------------------------------------------------------------------
    # Connection testing
    # ------------------------------------------------------------------
    @staticmethod
    def test_provider_connection(provider_id: str, api_key: str,
                                 base_url: str = '', api_version: str = '') -> dict:
        """Test connection to a cloud provider. Returns {success, message, model_count}."""
        import requests

        pdef = CLOUD_PROVIDERS.get(provider_id)
        if not pdef:
            return {'success': False, 'message': f'Unknown provider: {provider_id}'}

        try:
            headers = {}
            params = {}

            if provider_id == 'azure_openai':
                if not base_url:
                    return {'success': False, 'message': 'Azure endpoint URL required'}
                url = f"{base_url.rstrip('/')}/openai/models"
                params['api-version'] = api_version or pdef.get('default_api_version', '')
                headers['api-key'] = api_key
            elif provider_id == 'custom_openai':
                if not base_url:
                    return {'success': False, 'message': 'Endpoint URL required'}
                url = f"{base_url.rstrip('/')}/v1/models"
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
            elif provider_id == 'google_gemini':
                url = pdef['test_url']
                params['key'] = api_key
            elif pdef.get('test_auth') == 'x-api-key':
                url = pdef['test_url']
                headers['x-api-key'] = api_key
                headers['anthropic-version'] = '2023-06-01'
            else:
                url = pdef['test_url']
                headers['Authorization'] = f'Bearer {api_key}'

            resp = requests.get(url, headers=headers, params=params, timeout=10)

            if resp.status_code == 200:
                try:
                    data = resp.json()
                    count = len(data.get('data', data.get('models', [])))
                    return {'success': True, 'message': f'Connected ({count} models available)', 'model_count': count}
                except Exception:
                    return {'success': True, 'message': 'Connected'}
            elif resp.status_code == 401:
                return {'success': False, 'message': 'Invalid API key (401 Unauthorized)'}
            elif resp.status_code == 403:
                return {'success': False, 'message': 'Access denied (403 Forbidden)'}
            else:
                return {'success': False, 'message': f'HTTP {resp.status_code}: {resp.text[:200]}'}

        except requests.exceptions.ConnectionError:
            return {'success': False, 'message': 'Connection failed — check endpoint URL'}
        except requests.exceptions.Timeout:
            return {'success': False, 'message': 'Connection timed out (10s)'}
        except Exception as e:
            return {'success': False, 'message': str(e)[:200]}
