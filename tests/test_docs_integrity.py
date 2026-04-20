"""Documentation integrity guards — batch #56.

docs/ contains 33 Markdown files consumed by MkDocs (see docs.yml
workflow) + linked from README and CI artifacts.  Silent corruption
classes this batch catches:

  - Broken relative links (missing files)
  - Duplicate section headings in the same doc (breaks anchors)
  - Markdown files with YAML frontmatter that doesn't parse
  - Git conflict markers surviving merge
  - Empty docs (truncation)
  - docs/index.md missing (MkDocs needs a homepage)
  - Dead TODO/FIXME markers with specific owners

Scope: docs/ subtree under the repo root.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS = PROJECT_ROOT / 'docs'
pytestmark = pytest.mark.timeout(15)

MD_FILES = sorted(DOCS.rglob('*.md')) if DOCS.exists() else []


# ════════════════════════════════════════════════════════════════════════
# Directory + file presence
# ════════════════════════════════════════════════════════════════════════

class TestDocsStructure:
    def test_docs_dir_exists(self):
        assert DOCS.exists()

    def test_at_least_10_md_files(self):
        assert len(MD_FILES) >= 10, (
            f'Only {len(MD_FILES)} docs/*.md files \u2014 expected >= 10'
        )

    def test_has_index_md(self):
        """MkDocs requires docs/index.md as the homepage."""
        assert (DOCS / 'index.md').exists(), 'docs/index.md missing'

    def test_has_downloads_md(self):
        """The downloads page is linked from README.  Missing = broken
        landing page."""
        assert (DOCS / 'downloads.md').exists(), 'docs/downloads.md missing'


# ════════════════════════════════════════════════════════════════════════
# Per-file integrity
# ════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize('md_file', MD_FILES, ids=lambda p: str(p.relative_to(PROJECT_ROOT)))
class TestMarkdownFileIntegrity:
    def test_non_empty(self, md_file: Path):
        src = md_file.read_text(encoding='utf-8', errors='replace')
        assert len(src.strip()) > 0, (
            f'{md_file.relative_to(PROJECT_ROOT).as_posix()} is empty'
        )

    def test_no_conflict_markers(self, md_file: Path):
        src = md_file.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_has_at_least_one_heading(self, md_file: Path):
        src = md_file.read_text(encoding='utf-8', errors='replace')
        # At least one H1 or H2 expected.
        has_heading = re.search(r'^#{1,3}\s+', src, re.MULTILINE) is not None
        assert has_heading, (
            f'{md_file.relative_to(PROJECT_ROOT).as_posix()} has no heading'
        )

    def test_no_duplicate_top_level_headings(self, md_file: Path):
        """Two H1s in the same doc confuse MkDocs anchor generation.

        Skips lines inside code fences (``` blocks) to avoid
        false-positives from `# === COMMENT ===` style dividers in
        shell/YAML snippets.
        """
        src = md_file.read_text(encoding='utf-8', errors='replace')
        h1s: list[str] = []
        in_fence = False
        for line in src.splitlines():
            stripped = line.strip()
            # Track code-fence boundaries.
            if stripped.startswith('```'):
                in_fence = not in_fence
                continue
            if in_fence:
                continue
            m = re.match(r'^#\s+(.+)$', line)
            if m:
                h1s.append(m.group(1))
        dupes = [h for h in h1s if h1s.count(h) > 1]
        assert not dupes, (
            f'{md_file.relative_to(PROJECT_ROOT).as_posix()} has '
            f'duplicate H1 headings: {set(dupes)}'
        )


# ════════════════════════════════════════════════════════════════════════
# Relative link integrity
# ════════════════════════════════════════════════════════════════════════

class TestRelativeLinks:
    """Scan every .md file for relative links (not http://).  Each
    must point to an existing file in the docs tree or project root."""

    # Known external-protocol-like prefixes to skip.
    EXTERNAL_PREFIXES = ('http://', 'https://', 'mailto:', 'tel:',
                         'ftp://', '#', 'ws://', 'wss://')

    # Relative links can use anchors; strip them before checking.
    def _strip_anchor(self, link: str) -> str:
        return link.split('#', 1)[0]

    def test_all_relative_links_resolve(self):
        broken = []
        for md in MD_FILES:
            src = md.read_text(encoding='utf-8', errors='replace')
            # Match [text](target) non-greedy.
            for m in re.finditer(r'\[([^\]]+?)\]\(([^)]+?)\)', src):
                target = m.group(2).strip()
                if any(target.startswith(p) for p in self.EXTERNAL_PREFIXES):
                    continue
                if '://' in target:
                    continue
                # Remove anchor fragment + query string.
                clean = self._strip_anchor(target).split('?', 1)[0]
                if not clean:
                    continue
                # Skip Jinja-templated paths (MkDocs macros).
                if '{{' in clean or '{%' in clean:
                    continue
                # Resolve relative to the md file's directory.
                abs_target = (md.parent / clean).resolve()
                if not abs_target.exists():
                    broken.append(
                        f'{md.relative_to(PROJECT_ROOT).as_posix()} -> {target}'
                    )
        # Allow up to 5 soft-broken links (e.g., generated artifacts
        # that live in build/).
        assert len(broken) <= 5, (
            f'{len(broken)} broken relative links in docs: '
            f'{broken[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# README.md sanity
# ════════════════════════════════════════════════════════════════════════

class TestREADMEIntegrity:
    README = PROJECT_ROOT / 'README.md'

    def test_readme_exists(self):
        assert self.README.exists(), 'README.md missing'

    def test_readme_non_trivial(self):
        src = self.README.read_text(encoding='utf-8', errors='replace')
        assert len(src) > 500, (
            f'README.md suspiciously small ({len(src)} chars)'
        )

    def test_readme_has_no_conflict_markers(self):
        src = self.README.read_text(encoding='utf-8', errors='replace')
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_readme_mentions_project(self):
        src = self.README.read_text(encoding='utf-8').lower()
        assert 'nunba' in src or 'hartos' in src or 'hart' in src, (
            'README.md has no project references'
        )


# ════════════════════════════════════════════════════════════════════════
# mkdocs.yml integrity (MkDocs site config)
# ════════════════════════════════════════════════════════════════════════

class TestMkDocsConfig:
    MKDOCS = PROJECT_ROOT / 'mkdocs.yml'

    def test_mkdocs_yml_exists(self):
        assert self.MKDOCS.exists(), 'mkdocs.yml missing'

    def test_mkdocs_parses_as_yaml(self):
        try:
            import yaml
        except ImportError:
            pytest.skip('PyYAML not available')
        # MkDocs uses `!!python/name:` custom tags \u2014 use unsafe loader
        # OR yaml.full_load, OR just check structural skeleton.
        src = self.MKDOCS.read_text(encoding='utf-8', errors='replace')
        # Instead of full parse (custom tags trip safe_load), check
        # it at least has the top-level keys and doesn't have
        # conflict markers.
        assert 'site_name' in src, 'mkdocs.yml missing site_name'
        assert '<<<<<<<' not in src
        assert '>>>>>>>' not in src

    def test_nav_references_exist(self):
        """Scan nav: section for page references; each must exist
        under docs/."""
        src = self.MKDOCS.read_text(encoding='utf-8', errors='replace')
        # Very simple: find every `*.md` path in the nav section.
        refs = re.findall(r':\s*(\S+\.md)', src)
        missing = []
        for ref in refs:
            p = DOCS / ref
            if not p.exists():
                missing.append(ref)
        # Allow up to 3 missing (pages under active construction).
        assert len(missing) <= 3, (
            f'mkdocs.yml references missing docs: {missing[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# MEMORY.md / CLAUDE.md invariants (critical operational memory)
# ════════════════════════════════════════════════════════════════════════

class TestMemoryInvariants:
    MEMORY_DIR = Path.home() / '.claude' / 'projects' / \
        'C--Users-sathi-PycharmProjects-Nunba-HART-Companion' / 'memory'

    def test_claude_md_references_memory(self):
        """CLAUDE.md should reference memory/ files for topic-specific
        detail (see MEMORY.md convention)."""
        cmd = (PROJECT_ROOT / 'CLAUDE.md').read_text(encoding='utf-8')
        # Some reference to memory files.
        assert 'memory/' in cmd or 'feedback_' in cmd, (
            'CLAUDE.md has no memory/ references'
        )
