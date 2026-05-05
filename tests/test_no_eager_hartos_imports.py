"""AST regression guard: app.py must not import the heavy HARTOS chain at module load.

Importing `transformers` / `langchain*` / `autogen` / `hart_intelligence*` /
`helper` / `create_recipe` / `reuse_recipe` from `app.py`'s module-level body
races with the deferred `hartos-init` thread (spawned by
`main.py::_deferred_social_init` -> `start_hartos_init_background`) on
the `transformers` per-module import lock.  Inside that lock, the
`_LazyModule.__getattr__` ~1500-frame recursion holds for ~3 minutes
on cold disk.  See `routes/hartos_backend_adapter.py:41-49` for the
truth-grounded comment from the 2026-04-19 incident.

This regression has been re-introduced four times so far (2026-04-19
244s stall, 2026-04-26 dist-info KeyError dance, 2026-04-28 prewarm v1
synchronous-blocked-splash, 2026-04-28 prewarm v2 threaded-but-
recursing).  Each time it took out the Admin Agent Dashboard, the
model catalog UI, and chat Tier-1.  This test fails CI the moment any
such import is added back.

Module-level = top-level statements PLUS anything inside `if`/`try`/`with`/
`match` blocks (they all execute at import).  Bodies of `def`/`class` are
deferred and therefore allowed.
"""
import ast
import pathlib

LAZY_BANNED_PREFIXES = (
    'transformers',
    'langchain',
    'langchain_core',
    'langchain_classic',
    'langchain_community',
    'autogen',
    'hart_intelligence',
    'hart_intelligence_entry',
    'helper',
    'create_recipe',
    'reuse_recipe',
    'llmlingua',
    'nltk',
)


def _walk_module_level(node):
    """Yield ast.Import / ast.ImportFrom that execute at module load.

    Recurses into module-level control flow (if / try / with / match) but
    stops at function / class definitions (those bodies are deferred).
    """
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        yield node
        return
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return
    for child in ast.iter_child_nodes(node):
        yield from _walk_module_level(child)


def _is_banned(name: str) -> bool:
    if not name:
        return False
    return any(
        name == prefix or name.startswith(prefix + '.')
        for prefix in LAZY_BANNED_PREFIXES
    )


_OPT_OUT_MARKER = "# allow:eager-hartos-import"


def test_no_eager_hartos_imports_in_app_py():
    """app.py module-level body must not import the heavy HARTOS chain.

    Per-line opt-out: append ``# allow:eager-hartos-import`` to the
    import line (with a justifying comment on the next line, REQUIRED
    when an opt-out is added) to acknowledge a deliberate eager import.
    The marker forces the engineer to think about why their import is
    safe — e.g. it pre-installs a stub before the hartos-init thread
    starts, or it lives behind a CLI-only flag that normal boot never
    hits.  No marker, no exception.
    """
    repo_root = pathlib.Path(__file__).resolve().parent.parent
    app_py = repo_root / 'app.py'
    assert app_py.exists(), f"app.py not found at {app_py}"

    source_lines = app_py.read_text(encoding='utf-8').splitlines()
    tree = ast.parse('\n'.join(source_lines))

    violations = []
    for node in tree.body:
        for imp in _walk_module_level(node):
            if isinstance(imp, ast.Import):
                offending = [a.name for a in imp.names if _is_banned(a.name)]
            else:  # ImportFrom
                offending = [imp.module] if _is_banned(imp.module or '') else []
            if not offending:
                continue
            line_text = source_lines[imp.lineno - 1] if 0 < imp.lineno <= len(source_lines) else ''
            if _OPT_OUT_MARKER in line_text:
                continue  # explicit opt-out
            for name in offending:
                violations.append(f"app.py:{imp.lineno}: import {name}")

    assert not violations, (
        "app.py module-level imports the heavy HARTOS chain — these MUST be "
        "deferred to the hartos-init thread (see "
        "routes/hartos_backend_adapter.py:41-49 and main.py::"
        "_deferred_social_init).  Module-load imports race on transformers' "
        "import lock and cause the `_LazyModule.__getattr__` ~1500-frame "
        "recursion that empties the Admin Agent Dashboard.\n  "
        "If the import is deliberately eager (stub install, CLI-only "
        "branch), append `" + _OPT_OUT_MARKER + "` to the import line "
        "with a justifying comment.\n  "
        + "\n  ".join(violations)
    )
