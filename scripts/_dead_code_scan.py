"""Static dead-code scanner for Nunba + HARTOS.

Rationale
=========
TrueFlow without runtime traces lists every AST-defined function as "dead".
Most of those aren't dead — they're Flask routes, WAMP handlers, autogen
register_for_llm closures, dynamic imports, decorator-registered callbacks,
etc. that frameworks invoke at runtime.

This scanner does a *reference-based* pass instead:

  1. Walk every .py file under the app code roots (excluding venv, tests,
     site-packages, __pycache__, build, python-embed, node_modules).
  2. For each `def name(...)` / `async def name(...)` record (file, line,
     name, decorators, is_method, is_dunder).
  3. For each expression-level `Name` / `Attribute` reference across ALL
     files collect the set of *used* identifiers.
  4. For string literals, grep for identifier occurrences too — catches
     `getattr(mod, "name")` style dynamic lookups and plugin registries.
  5. Report functions whose name never appears outside its own definition
     site, excluding:
       - Dunder methods (__init__, __repr__, ...)
       - Functions with route/endpoint/event/cli decorators
       - Entries in `__all__`
       - Module-level main / CLI entry points (if __name__ == ...)
       - Test functions (test_*, fixtures)
       - Class methods on classes that appear in `__all__` or are exported
         via from-imports elsewhere
       - Functions whose name starts with `on_` (event handlers)

Output: a compact per-file summary plus a JSON blob with full details so
an agent can post-process.

Usage:
    python scripts/_dead_code_scan.py <repo_root> <output_json>
"""

import ast
import json
import os
import re
import sys
from collections import defaultdict

EXCLUDED_DIR_FRAGMENTS = (
    'venv', 'site-packages', 'miniconda', '__pycache__', '.idea',
    'node_modules', '.pycharm_plugin', 'traces', 'python-embed',
    '.git', 'dist', '.pytest_cache', '.mypy_cache', '.ruff_cache',
    'build-tools', '/build/', 'landing-page/build',
)

# Decorator patterns that mean the function is a framework entry point —
# something external invokes it. If ANY decorator on a function matches,
# we don't count it as dead.
FRAMEWORK_DECORATOR_PATTERNS = re.compile(
    r'(?:'
    r'route|bp\.|app\.'
    r'|endpoint|get|post|put|patch|delete|options|head'
    r'|on_message|on_event|on_connect|on_disconnect|on_join'
    r'|websocket|listens_for|command|subscribe|publish|register'
    r'|before_request|after_request|errorhandler|teardown'
    r'|click\.|cli|group|option|argument'
    r'|property|staticmethod|classmethod|cached_property'
    r'|fixture|mark\.|parametrize|hookimpl|hookspec'
    r'|setter|getter|deleter'
    r'|celery\.task|shared_task|periodic_task'
    r'|receiver|signal'
    r'|log_tool_execution|register_for_llm|register_for_execution'
    r'|Tool|tool_call|agent_tool|with_tool_logging'
    r')',
    re.IGNORECASE,
)

DUNDER_RE = re.compile(r'^__\w+__$')
TEST_RE = re.compile(r'^test_|_test$|^conftest$')
EVENT_HANDLER_RE = re.compile(r'^(on|handle|do|process)_[a-z]')


def iter_py_files(root):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs
                   if not any(e in os.path.join(base, d).replace('\\', '/').lower()
                              for e in EXCLUDED_DIR_FRAGMENTS)]
        for f in files:
            if f.endswith('.py'):
                path = os.path.join(base, f)
                rel = os.path.relpath(path, root).replace('\\', '/')
                if any(e in rel.lower() for e in EXCLUDED_DIR_FRAGMENTS):
                    continue
                yield path, rel


def decorator_looks_framework(dec_node):
    """Return True if this decorator call implies external invocation."""
    try:
        src = ast.unparse(dec_node)
    except Exception:
        return False
    return bool(FRAMEWORK_DECORATOR_PATTERNS.search(src))


def collect_defs_and_refs(files):
    """Return (defs, refs, all_strings) across the given files.

    defs: dict[name] -> list[(file, line, is_method, is_dunder, is_framework)]
    refs: set of used identifiers (Name.id + Attribute.attr)
    all_strings: concatenated text of every string constant — used to catch
        dynamic lookups like getattr(mod, "some_func").
    """
    defs = defaultdict(list)
    refs = set()
    string_blob_parts = []
    parse_failures = []

    for path, rel in files:
        try:
            with open(path, 'rb') as f:
                src = f.read()
            tree = ast.parse(src, filename=path)
        except (SyntaxError, UnicodeDecodeError) as e:
            parse_failures.append((rel, type(e).__name__))
            continue

        all_names_in_init = set()
        if rel.endswith('__init__.py'):
            for node in ast.walk(tree):
                if isinstance(node, ast.Assign):
                    for t in node.targets:
                        if isinstance(t, ast.Name) and t.id == '__all__':
                            if isinstance(node.value, (ast.List, ast.Tuple)):
                                for elt in node.value.elts:
                                    if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                                        all_names_in_init.add(elt.value)

        class_stack = []

        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                class_stack.append(node.name)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                name = node.name
                is_dunder = bool(DUNDER_RE.match(name))
                is_test = bool(TEST_RE.match(name))
                is_event = bool(EVENT_HANDLER_RE.match(name))
                is_framework = any(
                    decorator_looks_framework(d) for d in node.decorator_list
                )
                # detect method vs top-level via column offset + enclosing class
                # (we don't do a proper parent walk; col_offset > 0 inside a class
                # definition is good enough for our filter)
                is_method = node.col_offset > 0

                defs[name].append({
                    'file': rel,
                    'line': node.lineno,
                    'is_method': is_method,
                    'is_dunder': is_dunder,
                    'is_test': is_test,
                    'is_event': is_event,
                    'is_framework': is_framework,
                    'in_all': name in all_names_in_init,
                })

            if isinstance(node, ast.Name):
                refs.add(node.id)
            elif isinstance(node, ast.Attribute):
                refs.add(node.attr)
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                s = node.value
                if len(s) < 300:
                    string_blob_parts.append(s)
            elif isinstance(node, ast.ImportFrom):
                for alias in node.names:
                    refs.add(alias.name)
                    if alias.asname:
                        refs.add(alias.asname)

    string_blob = '\n'.join(string_blob_parts)
    return defs, refs, string_blob, parse_failures


def classify_dead(defs, refs, string_blob):
    """Return list of dead candidates after filtering false positives."""
    dead = []
    # Build a set of identifier tokens appearing in string literals anywhere.
    string_tokens = set(re.findall(r'\b[A-Za-z_][A-Za-z_0-9]*\b', string_blob))

    for name, locs in defs.items():
        if name in refs:
            continue
        if name in string_tokens:
            continue
        for loc in locs:
            if loc['is_dunder'] or loc['is_test'] or loc['is_event']:
                continue
            if loc['is_framework']:
                continue
            if loc['in_all']:
                continue
            dead.append({'name': name, **loc})
    return dead


def main():
    if len(sys.argv) < 3:
        print("usage: _dead_code_scan.py <repo_root> <output.json>")
        sys.exit(1)
    root = sys.argv[1]
    out = sys.argv[2]

    print(f"scanning {root}...")
    files = list(iter_py_files(root))
    print(f"  {len(files)} .py files")
    defs, refs, blob, fails = collect_defs_and_refs(files)
    print(f"  {sum(len(v) for v in defs.values())} function definitions")
    print(f"  {len(refs)} unique referenced names")
    print(f"  {len(fails)} parse failures")

    dead = classify_dead(defs, refs, blob)
    print(f"  {len(dead)} dead candidates after filtering")

    # Group by file for output
    by_file = defaultdict(list)
    for d in dead:
        by_file[d['file']].append(d)

    summary = {
        'root': root,
        'file_count': len(files),
        'defs_count': sum(len(v) for v in defs.values()),
        'refs_count': len(refs),
        'dead_count': len(dead),
        'parse_failures': fails,
        'dead_by_file': {
            f: sorted(items, key=lambda x: x['line'])
            for f, items in sorted(by_file.items(), key=lambda kv: -len(kv[1]))
        },
    }
    with open(out, 'w', encoding='utf-8') as fp:
        json.dump(summary, fp, indent=2)
    print(f"wrote {out}")

    # Compact stdout summary — top 30 files
    print(f"\nTop 30 files by dead-candidate count:")
    for f, items in list(sorted(by_file.items(), key=lambda kv: -len(kv[1])))[:30]:
        print(f"  {len(items):4d}  {f}")


if __name__ == '__main__':
    main()
