"""Regression guard: preferred_lang must fall back to the canonical
core.user_lang reader, never to a bare 'en' default.

The bug class: frontend POSTs /chat without preferred_lang; backend
defaulted to 'en'; Tamil user never got Indic Parler synthesis and
the draft-skip gate never fired.  The canonical reader is
core.user_lang.get_preferred_lang, populated from hart_language.json.

FT: Both entry points resolve preferred_lang from the canonical
    reader when the body lacks the key.
NFT: AST-level scan forbids re-introducing `data.get('preferred_lang',
    'en')` or `payload.get('preferred_lang', 'en')` anywhere in the
    chat entry paths.
"""
import ast
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

HARTOS_ROOT = PROJECT_ROOT.parent / "HARTOS"

CHAT_ENTRY_FILES = [
    PROJECT_ROOT / "routes" / "chatbot_routes.py",
    HARTOS_ROOT / "hart_intelligence_entry.py",
]


class _BadDefaultFinder(ast.NodeVisitor):
    """Flags `X.get('preferred_lang', 'en')` — the exact regression."""

    def __init__(self) -> None:
        self.violations: list[tuple[int, str]] = []

    def visit_Call(self, node: ast.Call) -> None:
        # Match `<any>.get('preferred_lang', 'en')` with literal defaults.
        if (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "get"
            and len(node.args) == 2
            and isinstance(node.args[0], ast.Constant)
            and node.args[0].value == "preferred_lang"
            and isinstance(node.args[1], ast.Constant)
            and isinstance(node.args[1].value, str)
            and node.args[1].value.lower().startswith("en")
        ):
            src = ast.unparse(node) if hasattr(ast, "unparse") else "<get>"
            self.violations.append((node.lineno, src))
        self.generic_visit(node)


class TestPreferredLangFallback:
    """Static + canonical-reader regression guard."""

    def test_no_bare_en_default_in_chat_entries(self):
        """Every chat entry path resolves via the canonical reader,
        never falls back to a hardcoded 'en'."""
        offenders: list[str] = []
        for path in CHAT_ENTRY_FILES:
            if not path.exists():
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            finder = _BadDefaultFinder()
            finder.visit(tree)
            for lineno, src in finder.violations:
                offenders.append(f"{path}:{lineno} :: {src}")
        assert not offenders, (
            "preferred_lang bare 'en' default re-introduced — must use "
            "core.user_lang.get_preferred_lang() fallback.  Violations:\n  "
            + "\n  ".join(offenders)
        )

    def test_canonical_reader_is_imported_in_chat_entries(self):
        """Every chat entry that reads preferred_lang from body
        also references core.user_lang.get_preferred_lang."""
        missing: list[str] = []
        for path in CHAT_ENTRY_FILES:
            if not path.exists():
                continue
            src = path.read_text(encoding="utf-8")
            if "preferred_lang" not in src:
                continue
            if "get_preferred_lang" not in src:
                missing.append(str(path))
        assert not missing, (
            "chat entry touches preferred_lang but never references "
            "core.user_lang.get_preferred_lang — fallback is missing "
            "in:\n  " + "\n  ".join(missing)
        )

    def test_canonical_reader_returns_persisted_value(self, tmp_path, monkeypatch):
        """When hart_language.json has 'ta', the canonical reader
        returns 'ta' — not 'en'.  Drives the real file; the only
        patch point is the module-level path constant."""
        try:
            import core.user_lang as user_lang_mod
        except Exception:
            import pytest
            pytest.skip("core.user_lang not importable in this env")

        # Write a valid hart_language.json with 'ta' selected.
        lang_file = tmp_path / "hart_language.json"
        lang_file.write_text(
            '{"language": "ta", "source": "test"}', encoding="utf-8"
        )
        # Patch the module-level path + clear the mtime cache so the
        # reader hits the tmp file on next call.
        monkeypatch.setattr(user_lang_mod, "_HART_LANG_PATH", str(lang_file))
        monkeypatch.setitem(user_lang_mod._cache, "value", None)
        monkeypatch.setitem(user_lang_mod._cache, "mtime", 0)

        val = user_lang_mod.get_preferred_lang()
        assert val == "ta", (
            f"Canonical reader must return the persisted language "
            f"('ta' from hart_language.json); got {val!r}"
        )
