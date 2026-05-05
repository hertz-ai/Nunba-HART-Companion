"""AST regression guard: Nunba consumes HARTOS via the facade, never internals.

The HARTOS framework exposes ONE public bootstrap entry point —
``hartos_bootstrap.bootstrap(app, config)``.  Consumers (Nunba desktop,
HART OS, cloud Hevolve, embedded) MUST NOT reach past the facade and
import HARTOS sub-init functions or internal blueprints directly.

Why: every time HARTOS adds a new init step, the consumer would have to
be edited to match.  Four boot-deadlock incidents (2026-04-19, 04-26,
two on 04-28) all traced back to that leaky abstraction — Nunba was
hand-coding the HARTOS init order, the Flask setup-lock dance, and the
agent_engine call site, and got out of sync with HARTOS each time.

This test walks ``main.py`` (and other Nunba boot files) and FAILS CI
if any module-level code imports a HARTOS internal symbol that should
only be reached via the facade.

What's banned (HARTOS framework internals):
  - ``init_social``, ``init_agent_engine``, ``init_channels``
  - ``register_all_blueprints``, ``run_migrations``
  - ``social_bp``, ``distributed_agent_bp``

What's allowed:
  - ``hartos_bootstrap.bootstrap``                            (the facade)
  - Anything imported INSIDE a function/class body (deferred — fine)
  - ``integrations.social`` / ``integrations.social.models``
    imported as availability probes only (no symbol bind from them)

Per-line opt-out: append ``# allow:hartos-internal-import`` to a line
with a justifying comment on the next line, IF the import is
genuinely needed and demonstrably safe.  No marker, no exception.
"""
from __future__ import annotations

import ast
import pathlib

# Symbols whose import indicates a layering violation
BANNED_SYMBOLS = frozenset({
    'init_social',
    'init_agent_engine',
    'init_channels',
    'register_all_blueprints',
    'run_migrations',
    'social_bp',
    'distributed_agent_bp',
})

# Modules whose top-level import is banned for binding the symbols above
# (importing the package itself for an availability probe is allowed —
# only direct bindings of the banned symbols matter)
BANNED_MODULE_PATHS = frozenset({
    'integrations.blueprint_registry',
    'integrations.channels.flask_integration',
    'integrations.social.api',
    'integrations.social.migrations',
    'integrations.distributed_agent',
    'integrations.agent_engine',
})

OPT_OUT_MARKER = '# allow:hartos-internal-import'

# Files that the consumer (Nunba) executes at boot — these MUST go
# through the facade.  Add new boot-time entry points here.
GUARDED_FILES = (
    'main.py',
    'app.py',
)


def _walk_module_level(node):
    """Yield Import / ImportFrom that execute at module load.

    Recurses into module-level control flow (if / try / with / match)
    but stops at function / class definitions (those bodies are
    deferred until the function is called).
    """
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        yield node
        return
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return
    for child in ast.iter_child_nodes(node):
        yield from _walk_module_level(child)


def _violations_in_file(path: pathlib.Path) -> list[str]:
    if not path.exists():
        return []

    source_lines = path.read_text(encoding='utf-8').splitlines()
    tree = ast.parse('\n'.join(source_lines))

    violations: list[str] = []
    for node in tree.body:
        for imp in _walk_module_level(node):
            line_text = (
                source_lines[imp.lineno - 1]
                if 0 < imp.lineno <= len(source_lines)
                else ''
            )
            if OPT_OUT_MARKER in line_text:
                continue

            if isinstance(imp, ast.Import):
                # `import integrations.blueprint_registry as X`
                for alias in imp.names:
                    if alias.name in BANNED_MODULE_PATHS:
                        violations.append(
                            f"{path.name}:{imp.lineno}: import {alias.name}"
                        )
            else:  # ImportFrom
                module_name = imp.module or ''
                if module_name in BANNED_MODULE_PATHS:
                    # `from integrations.blueprint_registry import X` —
                    # banned regardless of X
                    violations.append(
                        f"{path.name}:{imp.lineno}: from {module_name} "
                        f"import {', '.join(a.name for a in imp.names)}"
                    )
                    continue
                # `from integrations.social import init_social, social_bp`
                # — flag only the banned NAMES that get bound here
                for alias in imp.names:
                    if alias.name in BANNED_SYMBOLS:
                        violations.append(
                            f"{path.name}:{imp.lineno}: from "
                            f"{module_name or '?'} import {alias.name}"
                        )
    return violations


def test_main_py_uses_hartos_facade_only():
    """Nunba boot files must consume HARTOS via ``hartos_bootstrap.bootstrap``,
    never by importing init_social / init_agent_engine / init_channels /
    register_all_blueprints / run_migrations / social_bp /
    distributed_agent_bp directly at module load."""
    repo_root = pathlib.Path(__file__).resolve().parent.parent
    all_violations: list[str] = []
    for fname in GUARDED_FILES:
        all_violations.extend(_violations_in_file(repo_root / fname))

    assert not all_violations, (
        "Nunba boot path is reaching past the HARTOS facade.  Use "
        "`hartos_bootstrap.bootstrap(app, config)` and let HARTOS own "
        "its own init order.  See `HARTOS/hartos_bootstrap.py` "
        "docstring + `main.py::_start_hartos_bootstrap` for the call "
        "site contract.\n"
        "If a direct import is genuinely required, append `"
        + OPT_OUT_MARKER
        + "` with a justifying comment.\n  "
        + "\n  ".join(all_violations)
    )
