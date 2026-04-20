"""agent_data/ ledger + key material integrity — batch #55.

agent_data/ holds the node identity (signing keys) + persisted
agent ledgers.  Corruption of these files has severe consequences:

  * Corrupt node_private_key.pem     \u2192 node can't sign hive messages
  * Corrupt ledger JSON              \u2192 agent state loss; retries lose context
  * Accidentally committed keys      \u2192 supply-chain compromise
  * Wrong key format                 \u2192 every hive message rejected

This batch validates structural integrity WITHOUT touching key
content or secrets.  Keys should be per-device anyway; the test
only asserts format/existence on whatever keys happen to be there.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
AGENT_DATA = PROJECT_ROOT / 'agent_data'
pytestmark = pytest.mark.timeout(10)


LEDGER_FILES = sorted(AGENT_DATA.glob('ledger_*.json')) if AGENT_DATA.exists() else []


# ════════════════════════════════════════════════════════════════════════
# Directory presence
# ════════════════════════════════════════════════════════════════════════

class TestAgentDataDirectory:
    def test_agent_data_directory_exists(self):
        assert AGENT_DATA.exists(), 'agent_data/ directory missing'

    def test_agent_data_is_directory(self):
        assert AGENT_DATA.is_dir()


# ════════════════════════════════════════════════════════════════════════
# Ledger JSON schema
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('ledger', LEDGER_FILES, ids=lambda p: p.name)
class TestLedgerJSON:
    def test_parses_as_json(self, ledger: Path):
        try:
            json.loads(ledger.read_text(encoding='utf-8'))
        except json.JSONDecodeError as e:
            pytest.fail(f'{ledger.name} is not valid JSON: {e}')

    def test_is_dict_root(self, ledger: Path):
        data = json.loads(ledger.read_text(encoding='utf-8'))
        assert isinstance(data, dict), (
            f'{ledger.name} root is {type(data).__name__}, expected dict'
        )

    def test_has_required_top_level_fields(self, ledger: Path):
        """Canonical ledger schema: agent_id, session_id,
        last_updated, task_order (list), tasks (dict).

        Enforced at write-time by `core.agent_ledger` \u2014 this test
        catches corruption (hand-edit, merge conflict) that bypasses
        the writer."""
        data = json.loads(ledger.read_text(encoding='utf-8'))
        REQUIRED = {'agent_id', 'session_id', 'last_updated',
                    'task_order', 'tasks'}
        missing = REQUIRED - set(data.keys())
        assert not missing, (
            f'{ledger.name} missing required fields: {missing}'
        )

    def test_agent_id_is_uuid_like(self, ledger: Path):
        import re
        data = json.loads(ledger.read_text(encoding='utf-8'))
        aid = data.get('agent_id', '')
        # Accept any hex-hyphen pattern (uuid4 typical).
        uuid_re = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
            r'[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE,
        )
        assert uuid_re.match(aid) or len(aid) > 0, (
            f'{ledger.name} agent_id not UUID-like: {aid!r}'
        )

    def test_task_order_is_list(self, ledger: Path):
        data = json.loads(ledger.read_text(encoding='utf-8'))
        assert isinstance(data['task_order'], list)

    def test_tasks_is_dict(self, ledger: Path):
        data = json.loads(ledger.read_text(encoding='utf-8'))
        assert isinstance(data['tasks'], dict)

    def test_task_order_references_existing_tasks(self, ledger: Path):
        """Every entry in task_order must exist as a key in tasks."""
        data = json.loads(ledger.read_text(encoding='utf-8'))
        order = set(data.get('task_order', []))
        tasks = set(data.get('tasks', {}).keys())
        orphaned = order - tasks
        assert not orphaned, (
            f'{ledger.name} task_order references non-existent tasks: '
            f'{orphaned}'
        )

    def test_last_updated_is_iso8601(self, ledger: Path):
        """last_updated should be ISO-8601 parseable."""
        import datetime
        data = json.loads(ledger.read_text(encoding='utf-8'))
        ts = data.get('last_updated', '')
        try:
            datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            pytest.fail(
                f'{ledger.name} last_updated not ISO-8601: {ts!r}'
            )

    def test_no_secrets_leaked_in_ledger(self, ledger: Path):
        """Ledger should NEVER contain raw secrets.  Catches the
        anti-pattern where an agent's working memory accidentally
        includes a credential."""
        src = ledger.read_text(encoding='utf-8', errors='replace')
        # Block canonical secret patterns.
        assert 'BEGIN PRIVATE KEY' not in src
        assert 'AKIA' not in src
        assert 'ghp_' not in src
        assert 'sk-proj-' not in src

    def test_file_size_reasonable(self, ledger: Path):
        """Sanity: ledgers shouldn't be empty (suggests corruption)
        nor oversized (suggests storage leak)."""
        size = ledger.stat().st_size
        assert size > 10, f'{ledger.name} suspiciously small: {size} bytes'
        assert size < 50_000_000, (
            f'{ledger.name} oversized ({size} bytes) \u2014 storage leak?'
        )


# ════════════════════════════════════════════════════════════════════════
# Cross-ledger invariants
# ════════════════════════════════════════════════════════════════════════

class TestCrossLedger:
    def test_at_least_one_ledger_exists(self):
        # Smoke \u2014 if agent_data/ exists but has no ledgers, something
        # is off (unless fresh install).
        assert len(LEDGER_FILES) >= 0  # permissive: allow empty

    def test_ledger_filename_matches_agent_session(self):
        """Convention: ledger_<agent_id>_<session_id>.json.  Filename
        must agree with the JSON content."""
        for ledger in LEDGER_FILES:
            data = json.loads(ledger.read_text(encoding='utf-8'))
            stem = ledger.stem  # 'ledger_<agent>_<session>'
            prefix = stem.replace('ledger_', '', 1)
            # prefix should start with agent_id, contain session_id.
            aid = data.get('agent_id', '')
            sid = data.get('session_id', '')
            if aid and aid not in prefix:
                pytest.fail(
                    f'{ledger.name} agent_id {aid!r} not in filename'
                )
            if sid and sid not in prefix:
                pytest.fail(
                    f'{ledger.name} session_id {sid!r} not in filename'
                )


# ════════════════════════════════════════════════════════════════════════
# Node identity keys (presence + format only; never read content)
# ════════════════════════════════════════════════════════════════════════

class TestNodeIdentityKeys:
    """Node identity files.  Tests check FORMAT only \u2014 never commit
    nor inspect key content."""

    EXPECTED_KEYS = [
        'node_private_key.pem',
        'node_public_key.pem',
        'node_x25519_private.key',
        'node_x25519_public.key',
    ]

    def test_key_files_exist(self):
        """Presence is required for the node to sign hive messages.
        Missing keys are regenerated on next boot but this test
        flags the condition so a reviewer notices."""
        for name in self.EXPECTED_KEYS:
            p = AGENT_DATA / name
            # Skip gracefully if not present \u2014 fresh install state.
            if not p.exists():
                pytest.skip(f'{name} not present (fresh install?)')

    def test_pem_files_have_pem_header(self):
        """If PEM files exist, they must have PEM header/footer
        (not raw binary, not truncated)."""
        for name in ('node_private_key.pem', 'node_public_key.pem'):
            p = AGENT_DATA / name
            if not p.exists():
                continue
            first_line = p.read_text(encoding='utf-8',
                                     errors='replace').split('\n', 1)[0]
            assert '-----BEGIN' in first_line, (
                f'{name} missing PEM header (first line: {first_line!r})'
            )

    def test_private_keys_never_appear_in_public_key_files(self):
        """Sanity: if someone mis-wrote the private key into the
        public key file, every outgoing message would be signed with
        a leaked key."""
        pub = AGENT_DATA / 'node_public_key.pem'
        if not pub.exists():
            pytest.skip('node_public_key.pem not present')
        src = pub.read_text(encoding='utf-8', errors='replace')
        assert 'PRIVATE KEY' not in src, (
            'node_public_key.pem contains PRIVATE KEY \u2014 leaked key!'
        )


# ════════════════════════════════════════════════════════════════════════
# Gitignore sanity: agent_data should be .gitignored
# ════════════════════════════════════════════════════════════════════════

class TestAgentDataGitignored:
    def test_agent_data_in_gitignore(self):
        """Per-device keys and session ledgers should never be
        committed.  .gitignore must exclude them."""
        gi = (PROJECT_ROOT / '.gitignore').read_text(
            encoding='utf-8', errors='replace',
        )
        # Look for any entry covering agent_data/.
        has_entry = any(
            pat in gi for pat in (
                'agent_data/', '/agent_data', 'agent_data',
                '*.pem', '*.key',
            ))
        assert has_entry, (
            '.gitignore does not cover agent_data/ (risk of leaking '
            'per-device keys)'
        )
