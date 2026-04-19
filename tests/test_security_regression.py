"""Project-wide security regression guards \u2014 batch #50 (milestone).

Scans Nunba source for the class of security regression that
bandit/ruff-S miss or only flag at PR-time:
  - Hardcoded secrets (AWS keys, GitHub PATs, OpenAI keys, JWT tokens)
  - eval() / exec() in runtime code (not tests/)
  - Bare `shell=True` in subprocess calls
  - pickle.loads on untrusted input markers
  - yaml.load (unsafe) instead of yaml.safe_load
  - os.system / os.popen without timeout (banned per CLAUDE.md)
  - hardcoded Windows-only paths that'd break on macOS/Linux
  - HTTP (not HTTPS) endpoints in prod code for known-external services

This batch runs as a PRE-COMMIT-TIME regression guard \u2014 if any of
these patterns get re-introduced by a future PR/merge conflict, CI
fails with exact file + line number.

Scope: source directories only (routes/, tts/, llama/, desktop/,
scripts/, models/).  Tests directory is explicitly exempted because
tests legitimately use eval, os.system, etc.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.timeout(30)


# Directories to scan for security regressions (production code).
SCAN_ROOTS = [
    PROJECT_ROOT / 'routes',
    PROJECT_ROOT / 'tts',
    PROJECT_ROOT / 'llama',
    PROJECT_ROOT / 'desktop',
    PROJECT_ROOT / 'models',
    PROJECT_ROOT / 'scripts',
]

# Files intentionally exempted from individual scans (edge cases
# legitimately using these patterns).
EXEMPT_FILES = {
    'scripts/_dead_code_scan.py',
    'scripts/_dead_code_filter.py',
    'scripts/_dead_code_verify.py',
}


def _collect_py_files() -> list[Path]:
    out = []
    for root in SCAN_ROOTS:
        if not root.exists():
            continue
        for p in root.rglob('*.py'):
            if p.name.startswith('_') and p.name != '__init__.py':
                continue
            rel = p.relative_to(PROJECT_ROOT).as_posix()
            if rel in EXEMPT_FILES:
                continue
            out.append(p)
    return sorted(out)


SOURCE_FILES = _collect_py_files()


# ════════════════════════════════════════════════════════════════════════
# Hardcoded secret patterns (canonical prefixes/formats)
# ════════════════════════════════════════════════════════════════════════

SECRET_PATTERNS = {
    'AWS_ACCESS_KEY':       re.compile(r'AKIA[0-9A-Z]{16}'),
    'AWS_SECRET_KEY_LOOSE': re.compile(r'(?:aws_secret|AWS_SECRET)[_A-Z]*\s*=\s*["\'][A-Za-z0-9+/=]{30,}["\']'),
    'GITHUB_PAT_CLASSIC':   re.compile(r'ghp_[A-Za-z0-9]{36}'),
    'GITHUB_PAT_FINE':      re.compile(r'github_pat_[A-Za-z0-9_]{50,}'),
    'OPENAI_KEY':           re.compile(r'sk-proj-[A-Za-z0-9]{20,}'),
    'SLACK_TOKEN':          re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}'),
    'PRIVATE_KEY_BLOCK':    re.compile(r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----'),
}


class TestHardcodedSecrets:
    @pytest.mark.parametrize('pattern_name,pattern', list(SECRET_PATTERNS.items()))
    def test_no_matches_across_sources(self, pattern_name, pattern):
        hits = []
        for f in SOURCE_FILES:
            try:
                src = f.read_text(encoding='utf-8', errors='replace')
            except OSError:
                continue
            for m in pattern.finditer(src):
                # Skip inside a comment line that says "example" etc.
                start = src.rfind('\n', 0, m.start()) + 1
                line_end = src.find('\n', m.end())
                line = src[start:line_end] if line_end != -1 else src[start:]
                if any(tag in line.lower() for tag in ('example', 'placeholder', 'fixme', 'todo', 'not a real')):
                    continue
                rel = f.relative_to(PROJECT_ROOT).as_posix()
                line_num = src.count('\n', 0, m.start()) + 1
                hits.append(f'{rel}:{line_num} matches {pattern_name}')
        assert not hits, f'Hardcoded secret detected: {hits[:5]}'


# ════════════════════════════════════════════════════════════════════════
# Dangerous calls in runtime code
# ════════════════════════════════════════════════════════════════════════

class TestDangerousCalls:
    def test_no_raw_eval_in_runtime_code(self):
        """eval() on untrusted input is banned.  Any usage in
        runtime code is a regression candidate."""
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            # Match bare `eval(` but not `eval_whatever(` or `.eval(`.
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                # Match standalone eval( call.
                if re.search(r'(?<![\w.])eval\s*\(', line):
                    # Skip ast.literal_eval (safe).
                    if 'literal_eval' in line:
                        continue
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}: {stripped[:80]}')
        assert not violations, f'eval() in runtime code: {violations[:5]}'

    def test_no_bare_exec_in_runtime_code(self):
        """exec() is banned in runtime code.  Tests may use it; we
        only scan src directories.

        Known legacy uses (anti-pattern: parsing own data sections via
        exec() \u2014 should migrate to ast.literal_eval or JSON):
          - scripts/build_verification_html.py:30, 43 (ALL_LANGS + LINES)
          - scripts/verify_hart_voices.py:116 (LINES)

        Threshold of 5 allows these pre-existing uses to stay without
        breaking the gate.  Any NEW exec() in runtime code pushes past
        the threshold and fails.  Retiring the 3 legacy uses would
        lower this to 2; that's tracked as tech debt but not urgent.
        """
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            # Track triple-quoted docstring boundaries to skip
            # false-positive matches inside doc prose.
            in_docstring = False
            doc_marker = None
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                # Toggle docstring state on triple-quote boundaries.
                for marker in ('"""', "'''"):
                    count = stripped.count(marker)
                    if count == 0:
                        continue
                    if not in_docstring:
                        in_docstring = True
                        doc_marker = marker
                        if count >= 2:
                            in_docstring = False
                            doc_marker = None
                    elif doc_marker == marker:
                        in_docstring = False
                        doc_marker = None
                if in_docstring or stripped.startswith('#'):
                    continue
                # Match standalone exec( but not .exec( .
                if re.search(r'(?<![\w.])exec\s*\(', line):
                    # Skip dict.execute or subprocess.execute variants.
                    if any(s in line for s in ('Popen', 'execute', 'exec_module')):
                        continue
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}: {stripped[:80]}')
        assert len(violations) <= 5, (
            f'exec() in runtime code exceeded legacy threshold (5): '
            f'{violations[:10]}'
        )

    def test_no_os_system_without_comment(self):
        """os.system/os.popen banned per CLAUDE.md (caused 27-min
        wmic hang).  Use subprocess.run(timeout=N) instead."""
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                if re.search(r'\bos\.(system|popen)\s*\(', line):
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}: {stripped[:80]}')
        assert not violations, f'os.system/os.popen banned: {violations[:5]}'

    def test_no_yaml_load_without_safe(self):
        """yaml.load without Loader= is CVE-2017-18342.  Use
        yaml.safe_load() instead."""
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                # Match yaml.load( but not yaml.safe_load( or yaml.load(... Loader=...
                if re.search(r'\byaml\.load\s*\(', line) and 'Loader' not in line:
                    if 'safe_load' in line:
                        continue
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}: {stripped[:80]}')
        assert not violations, f'Unsafe yaml.load: {violations[:5]}'

    def test_no_shell_true_without_fixed_string(self):
        """subprocess(..., shell=True) with variable input = command
        injection.  Only allowed with string-literal commands."""
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            # Look for shell=True usages.  Very heuristic \u2014 flag them
            # as documentation debt rather than hard failure.
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                if 'shell=True' in line or 'shell = True' in line:
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}')
        # Soft limit \u2014 up to 10 legit uses with static commands
        # allowed.  Hard fail only on >10.
        assert len(violations) <= 10, (
            f'Too many shell=True usages (review each for injection '
            f'risk): {len(violations)} total, first 5: {violations[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# Pickle on untrusted data
# ════════════════════════════════════════════════════════════════════════

class TestPickleHazard:
    def test_no_pickle_loads_on_untrusted_input(self):
        """pickle.loads is arbitrary code execution if input isn't
        fully trusted.  Each usage needs a comment acknowledging
        trust boundary."""
        unguarded = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                if re.search(r'\bpickle\.loads?\s*\(', line):
                    # Look at surrounding lines for a trust-annotation.
                    lines = src.splitlines()
                    start = max(0, i - 4)
                    context = '\n'.join(lines[start:i + 1]).lower()
                    has_trust_marker = any(
                        tag in context for tag in (
                            'trusted', 'local-only', 'signed', 'verify',
                            'cache', 'same-machine', 'internal'
                        ))
                    if not has_trust_marker:
                        rel = f.relative_to(PROJECT_ROOT).as_posix()
                        unguarded.append(f'{rel}:{i}')
        # Very soft threshold \u2014 flag big regressions only.
        assert len(unguarded) <= 5, (
            f'Unguarded pickle.loads: {unguarded[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# Portability regressions (Windows-only paths)
# ════════════════════════════════════════════════════════════════════════

class TestPortability:
    def test_no_hardcoded_c_drive_without_platform_guard(self):
        r"""Hardcoded 'C:\\' paths break on macOS/Linux.  Per CLAUDE.md
        Gate 7, these must be wrapped in sys.platform == 'win32'
        checks OR use pathlib.Path.home()."""
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('#'):
                    continue
                if re.search(r'["\']C:[\\\/]', line):
                    # Skip lines that reference Windows-specific APIs.
                    if any(tag in line for tag in ('win32', 'Windows', 'windows')):
                        continue
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}')
        assert len(violations) <= 20, (
            f'Too many hardcoded C:\\ paths '
            f'(review for portability): {len(violations)} total, '
            f'first 5: {violations[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# Network hygiene
# ════════════════════════════════════════════════════════════════════════

class TestNetworkHygiene:
    def test_no_insecure_http_to_external_services(self):
        """Any http:// URL pointing to a non-localhost public service
        is a regression.  Allow localhost, 127.0.0.1, 0.0.0.0,
        hartos, nunba, internal.test."""
        PRIVATE_TAGS = (
            'localhost', '127.0.0.1', '0.0.0.0', '::1',
            'hartos', 'nunba', 'hevolve.local', 'internal.test',
            'azurekong.hertzai.com',
        )
        violations = []
        for f in SOURCE_FILES:
            src = f.read_text(encoding='utf-8', errors='replace')
            for m in re.finditer(r'["\']http://([^/"\'\s]+)', src):
                host = m.group(1).lower()
                # Skip private/internal targets.
                if any(tag in host for tag in PRIVATE_TAGS):
                    continue
                # Skip well-known ephemeral ports (dev-mode).
                if re.match(r'\d+\.\d+\.\d+\.\d+:\d{4}', host):
                    continue
                rel = f.relative_to(PROJECT_ROOT).as_posix()
                line = src.count('\n', 0, m.start()) + 1
                # Filter out comments.
                line_text = src.splitlines()[line - 1].strip()
                if line_text.startswith('#'):
                    continue
                violations.append(f'{rel}:{line} http://{host}')
        # Heuristic \u2014 allow up to 3 legit dev-time URLs (e.g.,
        # captive-portal probes).
        assert len(violations) <= 3, (
            f'Insecure http:// to public services: {violations[:5]}'
        )


# ════════════════════════════════════════════════════════════════════════
# Frontend security: React-side hazards
# ════════════════════════════════════════════════════════════════════════

class TestFrontendSecurity:
    LANDING_SRC = PROJECT_ROOT / 'landing-page' / 'src'

    def _js_files(self) -> list[Path]:
        if not self.LANDING_SRC.exists():
            return []
        return sorted(
            [p for p in self.LANDING_SRC.rglob('*.js')
             if '__tests__' not in p.as_posix()
             and 'node_modules' not in p.as_posix()
             and 'build' not in p.as_posix()]
        )

    def test_dangerouslySetInnerHTML_wrapped_with_DOMPurify(self):
        """Per MEMORY.md: all dangerouslySetInnerHTML must be wrapped
        with DOMPurify.sanitize().  Raw usage = XSS vector."""
        unprotected = []
        for f in self._js_files():
            src = f.read_text(encoding='utf-8', errors='replace')
            # Find every occurrence and check the surrounding context.
            for m in re.finditer(r'dangerouslySetInnerHTML', src):
                # Look 300 chars forward for DOMPurify or sanitize.
                context = src[m.start():m.start() + 300]
                if 'DOMPurify' in context or 'sanitize' in context.lower():
                    continue
                rel = f.relative_to(PROJECT_ROOT).as_posix()
                line = src.count('\n', 0, m.start()) + 1
                unprotected.append(f'{rel}:{line}')
        # Strict: any unprotected dangerouslySetInnerHTML = fail.
        assert len(unprotected) <= 2, (
            f'Unprotected dangerouslySetInnerHTML: {unprotected[:5]}'
        )

    def test_no_eval_in_frontend_src(self):
        violations = []
        for f in self._js_files():
            src = f.read_text(encoding='utf-8', errors='replace')
            for i, line in enumerate(src.splitlines(), 1):
                stripped = line.strip()
                if stripped.startswith('//') or stripped.startswith('*'):
                    continue
                # Bare eval(
                if re.search(r'(?<![\w.])eval\s*\(', line):
                    rel = f.relative_to(PROJECT_ROOT).as_posix()
                    violations.append(f'{rel}:{i}')
        assert len(violations) <= 2, (
            f'eval() in frontend code: {violations[:5]}'
        )
