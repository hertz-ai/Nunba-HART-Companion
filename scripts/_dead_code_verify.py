"""Cross-repo verification for dead-code candidates.

Pure-Python grep over both repos. For each candidate function, count
word-boundary matches of the name across every .py/.js/.jsx/.ts file
in both repos EXCEPT the definition file itself. A candidate is
confirmed dead only if the count is zero — string-literal hits count
as references so we don't miss dynamic-dispatch cases.

Pure Python because ripgrep is not on the shell PATH in this session.
"""

import json
import os
import re
import sys
from collections import defaultdict

REPOS = [
    ('HARTOS', r'C:\Users\sathi\PycharmProjects\HARTOS'),
    ('NUNBA', r'C:\Users\sathi\PycharmProjects\Nunba-HART-Companion'),
]

EXCLUDED = ('venv', 'site-packages', '__pycache__', 'node_modules',
            '.pycharm_plugin', 'traces', 'python-embed', '.git', 'build/',
            '.pytest_cache', '.mypy_cache', '.ruff_cache', 'dist/')


# ---------------------------------------------------------------------------
# File cache — load once, regex-match many times. Massive speedup: 99
# candidates × ~5000 files = 500K string ops instead of spawning rg 99 times.
# ---------------------------------------------------------------------------

_FILE_CACHE = {}  # abs_path -> content string


def _is_excluded(path):
    p = path.replace('\\', '/').lower()
    return any(e in p for e in EXCLUDED)


def _load_all_files():
    """Walk both repos and load every .py/.js/.jsx/.ts file into memory."""
    exts = ('.py', '.js', '.jsx', '.ts', '.tsx')
    for _, repo in REPOS:
        for base, dirs, files in os.walk(repo):
            dirs[:] = [d for d in dirs
                       if not _is_excluded(os.path.join(base, d))]
            for f in files:
                if not f.endswith(exts):
                    continue
                path = os.path.join(base, f)
                if _is_excluded(path):
                    continue
                try:
                    with open(path, 'rb') as fp:
                        _FILE_CACHE[path] = fp.read().decode(
                            'utf-8', errors='replace')
                except OSError:
                    continue
    print(f"  cached {len(_FILE_CACHE)} source files")


def count_refs(name, def_file_abs):
    """Count word-boundary references to `name` across both repos,
    excluding the def_file itself."""
    pattern = re.compile(r'\b' + re.escape(name) + r'\b')
    total = 0
    hits = []
    def_file_norm = os.path.normcase(os.path.abspath(def_file_abs))
    for path, content in _FILE_CACHE.items():
        if os.path.normcase(path) == def_file_norm:
            continue
        matches = pattern.findall(content)
        if matches:
            total += len(matches)
            hits.append(path)
    return total, hits


def main():
    if len(sys.argv) < 2:
        print("usage: _dead_code_verify.py <dead_scan.json> [max_candidates]")
        sys.exit(1)
    infile = sys.argv[1]
    max_n = int(sys.argv[2]) if len(sys.argv) > 2 else 50

    with open(infile, encoding='utf-8') as f:
        data = json.load(f)

    root = data['root']
    # Build a flat list of top-level function candidates ordered by file count
    candidates = []
    for fpath, items in data['dead_by_file'].items():
        for item in items:
            if item['is_method']:
                continue
            abs_path = os.path.join(root, fpath.replace('/', os.sep))
            candidates.append({
                'name': item['name'],
                'rel_file': fpath,
                'abs_file': abs_path,
                'line': item['line'],
            })

    print(f"Verifying top {min(max_n, len(candidates))} of "
          f"{len(candidates)} top-level function candidates from {infile}")
    print("Loading file cache...")
    _load_all_files()

    truly_dead = []
    for i, c in enumerate(candidates[:max_n]):
        refs, hits = count_refs(c['name'], c['abs_file'])
        if refs == -1:
            print(f"  [{i+1:3d}] {c['name']:40s}  ripgrep unavailable")
            break
        if refs == 0:
            truly_dead.append(c)
            print(f"  [{i+1:3d}] DEAD  {c['name']:40s}  @ {c['rel_file']}:{c['line']}")
        else:
            sample = hits[0] if hits else ''
            if len(sample) > 50:
                sample = '...' + sample[-50:]
            print(f"  [{i+1:3d}] live  {c['name']:40s}  {refs} refs (e.g. {sample})")

    print(f"\n=== TRULY DEAD: {len(truly_dead)} / {min(max_n, len(candidates))} ===")
    for c in truly_dead:
        print(f"  {c['rel_file']}:{c['line']}  {c['name']}")


if __name__ == '__main__':
    main()
