"""Filter TrueFlow dead-code analysis output to application code only.

TrueFlow's analyze_dead_code returns all defined functions. Without runtime
traces it treats everything as 'dead'. We exclude venv / site-packages /
tests / __pycache__ to get a list of APP functions that are defined but
have low static reference counts — those are the real dead-code candidates.
"""

import json
import sys
from collections import Counter

TF_OUT = sys.argv[1]
REPO_NAME = sys.argv[2]  # 'HARTOS' or 'Nunba-HART-Companion'

with open(TF_OUT, encoding='utf-8') as f:
    data = json.load(f)

EXCLUDED = ('venv', 'site-packages', 'miniconda', '__pycache__', '.idea',
            'node_modules', '.pycharm_plugin', 'traces', 'build',
            'python-embed')

for item in data:
    payload = json.loads(item['text'])
    print(f"=== {REPO_NAME} ===")
    print(f"source_dir: {payload.get('source_dir')}")
    stat = payload.get('static_analysis', {})
    print(f"total funcs: {stat.get('total_functions')}")
    print(f"total classes: {stat.get('total_classes')}")
    dead = payload.get('dead_functions', [])
    print(f"raw dead count: {len(dead)}")

    def is_app(d):
        f = d['file'].replace('\\', '/').lower()
        if any(x in f for x in EXCLUDED):
            return False
        if '/tests/' in f or f.endswith('_test.py') or f.startswith('test_'):
            return False
        return True

    app_dead = [d for d in dead if is_app(d)]
    print(f"app-code dead: {len(app_dead)}")

    freq = Counter()
    for d in app_dead:
        rel = d['file'].split(REPO_NAME + '\\', 1)[-1].replace('\\', '/')
        freq[rel] += 1
    print("\n--- top 30 files by dead-function count ---")
    for f, n in freq.most_common(30):
        print(f"  {n:4d}  {f}")

    print("\n--- writing full list to /tmp/dead_app.txt ---")
    with open(f'/tmp/dead_{REPO_NAME}.txt', 'w', encoding='utf-8') as out:
        for d in sorted(app_dead, key=lambda x: (x['file'], x['line'])):
            rel = d['file'].split(REPO_NAME + '\\', 1)[-1].replace('\\', '/')
            out.write(f"{rel}:{d['line']} {d['function'].split('.')[-1]}\n")
    print(f"wrote {len(app_dead)} entries")
