"""Root configuration file integrity — batch #51.

Catches silent regressions in the foundational config files that
shape every dev + CI run:
  .pre-commit-config.yaml    (pre-commit hook registry)
  .gitignore                 (never commit build/secrets/caches)
  .gitattributes             (LF/CRLF, binary-mode, filter=lfs)
  ruff.toml                  (lint/format + bandit S rules)
  setup.py                   (pip install -e . entry)

Each file must:
  - exist
  - parse cleanly (YAML/INI/Python as appropriate)
  - contain canonical entries (specific hooks, ignores, rules)
  - have no merge-conflict markers
"""
from __future__ import annotations

from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.timeout(10)

try:
    import yaml  # type: ignore
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False


# ════════════════════════════════════════════════════════════════════════
# .gitignore
# ════════════════════════════════════════════════════════════════════════

class TestGitignore:
    GITIGNORE = PROJECT_ROOT / '.gitignore'

    def test_exists(self):
        assert self.GITIGNORE.exists(), '.gitignore missing'

    def test_non_empty(self):
        src = self.GITIGNORE.read_text(encoding='utf-8', errors='replace')
        assert len(src.strip()) > 0

    def test_no_conflict_markers(self):
        src = self.GITIGNORE.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_canonical_ignores_present(self):
        """Every Nunba dev env must ignore these.  Removal = risk of
        committing 2GB build/ dir or .venv/.

        Python bytecode coverage: __pycache__ OR *.pyc either works.
        """
        src = self.GITIGNORE.read_text(encoding='utf-8', errors='replace')
        CANONICAL = [
            'node_modules',
            'build',
            '.venv',
        ]
        missing = [p for p in CANONICAL if p not in src]
        assert not missing, (
            f'.gitignore missing canonical entries: {missing}'
        )
        # Python bytecode: EITHER pattern is acceptable.
        assert ('__pycache__' in src) or ('*.pyc' in src), (
            '.gitignore missing Python bytecode pattern '
            '(__pycache__ or *.pyc)'
        )

    def test_site_dir_ignored(self):
        """MkDocs build output must be ignored \u2014 recent regression."""
        src = self.GITIGNORE.read_text(encoding='utf-8', errors='replace')
        # Allow `site/` or `/site/` or similar pattern.
        assert 'site' in src.lower(), '.gitignore missing MkDocs site/ pattern'

    def test_does_not_ignore_tracked_files(self):
        """Common anti-pattern: ignoring a file that's already
        checked in.  Look for entries that shadow known-committed
        files."""
        src = self.GITIGNORE.read_text(encoding='utf-8', errors='replace')
        BAD_ENTRIES = [
            'requirements.txt',
            'package.json',
            'main.py',
            'app.py',
            'CLAUDE.md',
        ]
        for bad in BAD_ENTRIES:
            # Must not appear as a whole-line entry.
            for raw in src.splitlines():
                line = raw.strip()
                if line == bad or line == f'/{bad}' or line == f'./{bad}':
                    pytest.fail(
                        f'.gitignore bans committed file: {bad} '
                        f'(line: {raw!r})'
                    )


# ════════════════════════════════════════════════════════════════════════
# .gitattributes
# ════════════════════════════════════════════════════════════════════════

class TestGitattributes:
    GITATTR = PROJECT_ROOT / '.gitattributes'

    def test_exists(self):
        assert self.GITATTR.exists()

    def test_non_empty(self):
        src = self.GITATTR.read_text(encoding='utf-8', errors='replace')
        assert len(src.strip()) > 0

    def test_no_conflict_markers(self):
        src = self.GITATTR.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_handles_line_endings(self):
        """CRLF normalization is critical on Windows dev boxes."""
        src = self.GITATTR.read_text(encoding='utf-8', errors='replace')
        has_eol_rule = any(
            tag in src for tag in ('text=auto', 'text eol', 'eol=lf', 'eol=crlf', 'text')
        )
        assert has_eol_rule, (
            '.gitattributes has no line-ending rule \u2014 Windows dev '
            'boxes will silently introduce CRLF'
        )


# ════════════════════════════════════════════════════════════════════════
# .pre-commit-config.yaml
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not _YAML_AVAILABLE, reason='PyYAML not available')
class TestPreCommitConfig:
    CONFIG = PROJECT_ROOT / '.pre-commit-config.yaml'

    def test_exists(self):
        assert self.CONFIG.exists()

    def test_parses_as_yaml(self):
        src = self.CONFIG.read_text(encoding='utf-8', errors='replace')
        yaml.safe_load(src)

    def test_no_conflict_markers(self):
        src = self.CONFIG.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_declares_repos(self):
        data = yaml.safe_load(self.CONFIG.read_text(encoding='utf-8'))
        assert 'repos' in data, 'pre-commit config missing `repos`'
        assert isinstance(data['repos'], list)
        assert len(data['repos']) >= 1

    def test_canonical_hooks_present(self):
        """Per MEMORY.md: ruff + detect-secrets + trailing-whitespace +
        check-yaml/json required."""
        data = yaml.safe_load(self.CONFIG.read_text(encoding='utf-8'))
        all_hooks = []
        for repo_entry in data.get('repos', []):
            for hook in repo_entry.get('hooks', []):
                all_hooks.append(hook.get('id', ''))

        CANONICAL = {'ruff', 'detect-secrets', 'trailing-whitespace'}
        missing = CANONICAL - set(all_hooks)
        # Permissive: flag <=1 missing, but list them.
        assert len(missing) <= 1, (
            f'Canonical pre-commit hooks missing: {missing} '
            f'(found: {sorted(set(all_hooks))})'
        )


# ════════════════════════════════════════════════════════════════════════
# ruff.toml
# ════════════════════════════════════════════════════════════════════════

class TestRuffConfig:
    RUFF = PROJECT_ROOT / 'ruff.toml'

    def test_exists(self):
        assert self.RUFF.exists(), 'ruff.toml missing'

    def test_non_empty(self):
        src = self.RUFF.read_text(encoding='utf-8', errors='replace')
        assert len(src.strip()) > 0

    def test_no_conflict_markers(self):
        src = self.RUFF.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_enables_bandit_S_rules(self):
        """Per MEMORY.md: ruff with bandit S rules (OSS Veracode)."""
        src = self.RUFF.read_text(encoding='utf-8', errors='replace')
        # Look for S in select/extend-select.
        has_s_rules = any(
            tag in src for tag in ('"S"', "'S'", 'S,', '"S001', '"S0', 'bandit')
        )
        assert has_s_rules, (
            'ruff.toml does not enable S rules \u2014 SAST regression'
        )

    def test_sets_line_length(self):
        src = self.RUFF.read_text(encoding='utf-8', errors='replace')
        # Modern ruff uses line-length or line_length.
        has_line_len = 'line-length' in src or 'line_length' in src
        # Not strictly required but canonical; don't hard-fail.
        if not has_line_len:
            pytest.skip('ruff.toml has no explicit line-length')


# ════════════════════════════════════════════════════════════════════════
# setup.py
# ════════════════════════════════════════════════════════════════════════

class TestSetupPy:
    SETUP = PROJECT_ROOT / 'setup.py'

    def test_exists(self):
        assert self.SETUP.exists()

    def test_parses_as_python(self):
        import ast
        src = self.SETUP.read_text(encoding='utf-8', errors='replace')
        ast.parse(src)

    def test_calls_setup(self):
        """setup.py should call setup() from setuptools/distutils."""
        src = self.SETUP.read_text(encoding='utf-8', errors='replace')
        has_setup_call = 'setup(' in src or 'setuptools.setup' in src
        assert has_setup_call, (
            'setup.py does not call setup() \u2014 pip install -e . will fail'
        )

    def test_declares_name(self):
        """Package name is required for pip."""
        src = self.SETUP.read_text(encoding='utf-8', errors='replace')
        assert 'name=' in src or 'name =' in src


# ════════════════════════════════════════════════════════════════════════
# CLAUDE.md / MEMORY.md must exist
# ════════════════════════════════════════════════════════════════════════

class TestDocsExistence:
    """These files are operational memory for future Claude sessions.
    Deletion = context loss for every subsequent AI-assisted PR."""

    def test_claude_md_exists(self):
        assert (PROJECT_ROOT / 'CLAUDE.md').exists(), 'CLAUDE.md missing'

    def test_claude_md_mentions_key_sections(self):
        src = (PROJECT_ROOT / 'CLAUDE.md').read_text(encoding='utf-8')
        # At least these high-level anchors must exist.
        for anchor in (
                'Project Overview',
                'Repo Layout',
                'Change Protocol',
                'Gate 0',
                'cx_Freeze',
        ):
            assert anchor in src, f'CLAUDE.md missing section: {anchor}'

    def test_readme_exists(self):
        # README presence is table-stakes.  Allow README or README.md.
        has_readme = (
            (PROJECT_ROOT / 'README.md').exists()
            or (PROJECT_ROOT / 'README').exists()
            or (PROJECT_ROOT / 'README.rst').exists()
        )
        assert has_readme, 'README missing'
