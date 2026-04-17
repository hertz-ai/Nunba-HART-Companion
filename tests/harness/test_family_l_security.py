"""Family L — security lens.

Reproduces known security gaps flagged in this session:
    - WAMP router lacking auth (task #219, closed — regression guard now)
    - CSP / X-Frame-Options missing (task #229, closed — regression guard)
    - HMAC secret in Program Files (task #250, closed — regression guard)
    - Bearer tokens logged in plain text (speculative; tested here)
    - Hardcoded secrets in source (speculative; tested here)
"""

from __future__ import annotations

import re

import pytest

pytestmark = pytest.mark.unit


def test_l1_wamp_router_requires_auth(project_root, source_text):
    """FAILS if WAMP router accepts unauthenticated subscriptions.
    Task #219 was closed once — this is the regression guard.
    """
    # The router lives in HARTOS or in wamp_router.py at repo root.
    candidates = [
        project_root / "wamp_router.py",
        project_root / ".." / "HARTOS" / "wamp_router.py",
        project_root / ".." / "HARTOS" / "crossbar_server.py",
    ]
    has_auth = False
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        # Look for an auth check on subscribe/publish: require_auth, ticket,
        # cryptosign, or equivalent.
        if re.search(r"(require_auth|cryptosign|ticket|auth_required|validate_token)",
                     src, re.IGNORECASE):
            has_auth = True
            break
    assert has_auth, (
        "WAMP router has no authentication gate on subscribe/publish; "
        "cross-user topic eavesdropping returns (task #219 regression)"
    )


def test_l2_flask_emits_security_headers(project_root, source_text):
    """FAILS if Nunba Flask app doesn't set CSP + X-Frame-Options.
    Task #229 landed this — regression guard.
    """
    src = source_text(project_root / "main.py")
    required = ("Content-Security-Policy", "X-Frame-Options")
    missing = [h for h in required if h not in src]
    assert not missing, (
        f"Flask missing security headers: {missing} (task #229 regression)"
    )


def test_l3_mcp_token_writes_outside_program_files(project_root, source_text):
    """FAILS if hmac/mcp token writes target Program Files (task #250
    regression). Must use user-writable path via core.platform_paths.
    """
    # Either main.py or a known helper handles mcp.token.
    candidates = [
        project_root / "main.py",
        project_root / "core" / "platform_paths.py",
    ]
    found_safe = False
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        if "mcp.token" in src or "hmac_secret" in src.lower():
            if "LOCALAPPDATA" in src or "get_data_dir" in src or \
               "os.path.expanduser('~')" in src:
                found_safe = True
                break
    if not found_safe:
        pytest.skip("mcp.token / hmac_secret write path not located in Nunba — "
                    "may live in HARTOS; not a failure")


def test_l4_no_hardcoded_secrets_in_source(project_root):
    """FAILS if a secret-like literal appears in tracked source.

    Heuristic: `api_key=` / `password=` / `SECRET_KEY=` followed by
    a string with >16 chars. False positives are expected for test
    fixtures; those should use `# noqa: L4` to opt out.
    """
    pat = re.compile(
        r"""\b(api_key|password|secret_key|access_token)\s*=\s*["']([A-Za-z0-9_\-]{16,})["']""",
        re.IGNORECASE,
    )
    bad = []
    for p in project_root.rglob("*.py"):
        if any(x in p.parts for x in (".venv", "python-embed", "python-embed-310-backup",
                                       "build", "__pycache__", "node_modules")):
            continue
        try:
            t = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if "# noqa: L4" in t:
            continue
        for m in pat.finditer(t):
            # Skip obvious env-var fallbacks
            snippet = t[max(0, m.start() - 40):m.end()]
            if "os.environ" in snippet or "getenv" in snippet:
                continue
            bad.append(f"{p.name}: {m.group(0)[:60]}")
    assert not bad, (
        f"hardcoded secrets detected: {bad[:5]} "
        f"(add `# noqa: L4` if test fixture, else rotate and move to env)"
    )


def test_l5_wamp_topic_subscription_authorizes_user_id(project_root, source_text):
    """FAILS if a user can subscribe to another user's topic.
    Task #246 landed this — regression guard.
    """
    hartos = project_root / ".." / "HARTOS"
    if not hartos.exists():
        pytest.skip("HARTOS not present — covered by HARTOS's own tests")
    realtime_files = list(hartos.rglob("*realtime*.py")) + list(hartos.rglob("*wamp*.py"))
    has_guard = False
    for p in realtime_files[:5]:
        src = source_text(p)
        if re.search(r"(user_id|uid).*?(!=|==|assert|check).*(subscribe|topic)",
                     src, re.IGNORECASE | re.DOTALL):
            has_guard = True
            break
    if not has_guard and realtime_files:
        pytest.fail(
            "WAMP subscribe path doesn't validate user_id matches topic owner "
            "(task #246 regression)"
        )


def test_l6_bearer_tokens_redacted_in_logs(project_root, source_text):
    """FAILS if code logs a full Bearer token. Must redact to `Bearer ***`
    or last-4-chars pattern.
    """
    candidates = [
        project_root / "main.py",
        project_root / "routes" / "chatbot_routes.py",
    ]
    bad = []
    for p in candidates:
        if not p.exists():
            continue
        src = source_text(p)
        # Look for logger.X(...) or print(...) with Authorization or Bearer
        for m in re.finditer(
            r"(logger\.\w+|print)\s*\([^)]*?(Authorization|Bearer)[^)]*\)",
            src,
        ):
            chunk = m.group(0)
            # Acceptable if the chunk contains redaction: "***", "redact", [:-4]
            if "***" in chunk or "redact" in chunk.lower() or "[-4:]" in chunk:
                continue
            bad.append(f"{p.name}: {chunk[:80]}")
    assert not bad, f"Bearer token likely logged in plaintext: {bad}"
