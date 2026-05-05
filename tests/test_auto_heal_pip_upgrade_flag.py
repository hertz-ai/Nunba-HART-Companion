"""AST regression guard: auto-heal pip args must always include '-U'.

The auto-heal flow inside ``tts/package_installer.py`` runs pip
``--target ~/.nunba/site-packages`` to fix missing or version-
mismatched modules at runtime.  pip's ``--target`` mode REFUSES to
overwrite an existing target dir without ``--upgrade``:

    WARNING: Target directory ~/.nunba/site-packages/omegaconf
    already exists. Specify --upgrade to force replacement.

Without the flag, a stale or partial install on disk survives the
auto-heal call.  The pip log says ``Successfully installed ...``
(some packages did write because their dirs were missing) but the
broken package's dir was skipped, the deep probe runs again, and
the outer auto-heal loop terminates with ``ModuleNotFoundError``
on the same missing module.

This was the chatterbox_turbo install loop on Windows: pip log
showed ``Successfully installed PyYAML-6.0.3 antlr4-python3-
runtime-4.9.3 omegaconf-2.3.0`` plus 8 ``Target directory
... already exists`` warnings, and the very next chatterbox
import still failed with ``No module named 'omegaconf'``.

The version-mismatch branch was already correct (it passed
``-U`` because its purpose is to upgrade past a floor).  The
missing-module branch lacked the same flag.  Both branches now
produce ``['install', '-U', <pkg>]``.

This test fails CI if either branch regresses to plain
``['install', <pkg>]`` again.
"""
import ast
import pathlib

_PACKAGE_INSTALLER = (
    pathlib.Path(__file__).parent.parent
    / 'tts' / 'package_installer.py'
)


def _find_pip_args_assignments():
    """Walk package_installer.py AST and return every list-literal
    assigned to ``pip_args`` whose first element is the string
    'install'.  Returns a list of ``[<args literal>, ...]``."""
    src = _PACKAGE_INSTALLER.read_text(encoding='utf-8')
    tree = ast.parse(src)
    found: list[list[str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not (len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and node.targets[0].id == 'pip_args'):
            continue
        if not isinstance(node.value, ast.List):
            continue
        # Only literal-string args + Name references count for this
        # check.  Treat Name nodes as "<name>" so we keep position info.
        elems: list[str] = []
        for el in node.value.elts:
            if isinstance(el, ast.Constant) and isinstance(el.value, str):
                elems.append(el.value)
            elif isinstance(el, ast.Name):
                elems.append(f'<{el.id}>')
            else:
                elems.append('<non-literal>')
        if elems and elems[0] == 'install':
            found.append(elems)
    return found


def test_every_pip_args_install_includes_upgrade_flag():
    """Every auto-heal pip_args list literal must include '-U' or '--upgrade'."""
    args_lists = _find_pip_args_assignments()
    assert args_lists, (
        "Could not locate any pip_args = ['install', ...] assignment "
        "in package_installer.py — file refactored?  Update this test "
        "or restore the auto-heal pattern.")

    failures = []
    for elems in args_lists:
        has_upgrade = any(a in ('-U', '--upgrade') for a in elems)
        if not has_upgrade:
            failures.append(elems)

    assert not failures, (
        "Auto-heal pip_args missing '-U' / '--upgrade':\n"
        + "\n".join(f"  {e!r}" for e in failures)
        + "\n\nWithout the flag, pip --target SKIPS overwriting "
          "existing dirs with the warning 'Target directory already "
          "exists. Specify --upgrade to force replacement.' — leaves "
          "the broken/stale install on disk.  Was the chatterbox "
          "auto-heal loop root cause."
    )


def test_pip_args_branches_match_count():
    """Sanity: the auto-heal sequence in package_installer.py has two
    branches (missing-module + version-mismatch), each defining
    pip_args.  If a third branch is added, this test reminds the
    author to mirror the -U treatment in it too."""
    args_lists = _find_pip_args_assignments()
    # 2 branches in the auto-heal block.  Some additional sites
    # (tts._venv_pip / install plans) may also build pip_args; we
    # only assert the auto-heal pair is present.  The test above
    # guards every single one of them.
    assert len(args_lists) >= 2, (
        f"Expected at least 2 'pip_args = [\"install\", ...]' "
        f"assignments (missing-module branch + version-mismatch "
        f"branch).  Found {len(args_lists)}: {args_lists!r}.  "
        f"If the auto-heal flow was refactored to a single shared "
        f"call, update this assertion."
    )
