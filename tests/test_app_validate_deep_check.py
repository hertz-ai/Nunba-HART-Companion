""""Regression guard for app.py --validate deep-health check.

Background: validator's deep check verifies Tier-1 LangChain pipeline
loaded by reading `routes.hartos_backend_adapter._hartos_backend_available`
and `_active_tier`.  At runtime these flip to True / 'Tier-1...' from a
background thread spawned by `main.py._deferred_social_init`, but in
--validate mode main.py never runs; the trigger has to fire synchronously
or the check sees the module-import defaults (False / 'unknown') and
falsely reports "Tier-1 failed to load".

History (the bug we're guarding against returning):
  Apr 25 — torch warning fired → SKIP path activated → false PASS
  Apr 26 commit e4bae07b — Tier-1 lazy init introduced; deep check
                            never triggered it; SKIP still hid the bug
  Apr 27 commit 5e4f3fe0 + Apr 28 packages_distributions monkey-patch
                          — both warning sources eliminated; SKIP no
                            longer fires; broken deep check fully
                            exposed (validate FAILED on every build)
  Fix — synchronous `_attempt_hartos_init()` call inside the deep
        check loop, BEFORE the attribute reads.

Test mode: AST + text scan on app.py.  We cannot exec --validate without
a frozen bundle; static guards are the right shape here.
"""
import ast
import os

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
APP_PY = os.path.join(PROJECT_ROOT, 'app.py')


@pytest.fixture(scope='module')
def app_source():
    with open(APP_PY, encoding='utf-8') as f:
        return f.read()


@pytest.fixture(scope='module')
def app_ast(app_source):
    return ast.parse(app_source)


class TestDeepCheckTriggersTier1Init:
    """`--validate` deep check must call _attempt_hartos_init synchronously."""

    def test_deep_checks_dict_present(self, app_source):
        # Sanity: the deep-checks block exists at all.
        assert "_deep_checks = {" in app_source, \
            "deep-checks dict missing from app.py — has the validator been refactored?"
        assert "'routes.hartos_backend_adapter'" in app_source, \
            "routes.hartos_backend_adapter check missing from _deep_checks"

    def test_attempt_hartos_init_called_in_deep_check(self, app_source):
        # The trigger must appear AFTER the _deep_checks dict and BEFORE
        # the Phase 3 (config file checks) section — i.e., inside the
        # deep-check loop body.
        deep_check_start = app_source.find("_deep_checks = {")
        config_check_start = app_source.find("Phase 3: Config file checks")
        assert deep_check_start > 0
        assert config_check_start > deep_check_start, \
            "Phase 3 marker missing — has the validator structure changed?"

        deep_check_block = app_source[deep_check_start:config_check_start]
        assert "_attempt_hartos_init" in deep_check_block, (
            "Deep check no longer calls _attempt_hartos_init synchronously. "
            "Without it, _hartos_backend_available stays at its module-import "
            "default (False) in --validate mode and the check falsely fails. "
            "See app.py around the `for _mod_name, _checks in _deep_checks` "
            "loop."
        )

    def test_attempt_hartos_init_called_via_getattr(self, app_source):
        # We use `getattr(_mod_obj, '_attempt_hartos_init', None)` so the
        # check is robust if the adapter ever renames the function.  The
        # test also enforces this defensive pattern (vs hard-coded import)
        # so a refactor that drops the getattr will be caught.
        deep_check_start = app_source.find("_deep_checks = {")
        config_check_start = app_source.find("Phase 3: Config file checks")
        deep_check_block = app_source[deep_check_start:config_check_start]
        assert "getattr(_mod_obj, '_attempt_hartos_init'" in deep_check_block, (
            "Deep check should look up _attempt_hartos_init via getattr "
            "(defensive against future adapter rename)."
        )

    def test_trigger_call_precedes_attribute_check(self, app_ast):
        """The trigger call must execute BEFORE the attribute-check loop.

        Otherwise the attribute reads happen against the unmodified
        (False / 'unknown') module state and the check still fails.
        """
        # Find the validate-mode Module node — it's at module-level inside
        # an `if getattr(args, 'validate', ...)` guard.  Walk the AST to
        # find the for-loop body that iterates `_deep_checks`.
        target_for = None
        for node in ast.walk(app_ast):
            if isinstance(node, ast.For):
                # Look for `for _mod_name, _checks in _deep_checks.items():`
                if (isinstance(node.target, ast.Tuple) and
                        all(isinstance(t, ast.Name) for t in node.target.elts) and
                        [t.id for t in node.target.elts] == ['_mod_name', '_checks'] and
                        isinstance(node.iter, ast.Call) and
                        isinstance(node.iter.func, ast.Attribute) and
                        node.iter.func.attr == 'items' and
                        isinstance(node.iter.func.value, ast.Name) and
                        node.iter.func.value.id == '_deep_checks'):
                    target_for = node
                    break
        assert target_for is not None, \
            "Could not locate `for _mod_name, _checks in _deep_checks.items()` loop"

        # Within the for body, find the inner for-loop that iterates _checks
        # (that's the attribute-check loop).  The trigger must come BEFORE it.
        trigger_lineno = None
        attr_loop_lineno = None
        for child in ast.walk(target_for):
            if (isinstance(child, ast.Call) and
                    isinstance(child.func, ast.Name) and
                    child.func.id == '_trigger'):
                if trigger_lineno is None or child.lineno < trigger_lineno:
                    trigger_lineno = child.lineno
            if (isinstance(child, ast.For) and
                    isinstance(child.target, ast.Tuple) and
                    all(isinstance(t, ast.Name) for t in child.target.elts) and
                    [t.id for t in child.target.elts] == ['_attr', '_expected', '_msg']):
                attr_loop_lineno = child.lineno

        assert trigger_lineno is not None, \
            "_trigger() call missing from deep-check loop body"
        assert attr_loop_lineno is not None, \
            "Attribute-check inner loop missing"
        assert trigger_lineno < attr_loop_lineno, (
            f"_trigger() at line {trigger_lineno} must execute BEFORE the "
            f"attribute-check loop at line {attr_loop_lineno}; otherwise "
            "_hartos_backend_available is read before the lazy init runs."
        )
