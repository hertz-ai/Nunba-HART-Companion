# House rules — operator-specific instructions every agent must honour

**This file is read by every specialist agent alongside `_ecosystem-context.md`. Any agent that produces a recommendation violating these rules is wrong by construction.**

These rules come from repeated operator directives across multiple sessions. Treat them as axioms, not preferences.

## 1. Engineering principles (non-negotiable)

### DRY — no parallel paths
- Before writing new code, grep the codebase for code that already does the same thing. Reuse or extend it.
- Two functions doing the same job in two different modules is the anti-pattern. One canonical implementation, thin shims at call sites.
- If you find three copies of a function that drifted, consolidate to ONE canonical + three-line delegate shims. See `core/user_context.py` as the reference example (3 copies of `get_action_user_details` → one delegate).
- No per-OS functions (`execute_windows_command`, `execute_linux_command`). One cross-OS entry point with an `os_to_control` parameter.
- No parallel chat classifiers. The draft 0.8B is the ONLY chat intent classifier. Python regex/keyword heuristics for chat content are forbidden.

### SRP — single responsibility
- Every module / class / function owns ONE concern.
- If a function does "fetch + format + cache", split into three.
- A bug fix doesn't become a refactor. A refactor doesn't become a feature addition. Separate commits.

### Clear separation of concerns
- Layering is sacred: `core/` must not import from `integrations/`; `routes/` must not touch the DB directly; `integrations/social/` must not reach into `integrations/agent_engine/`.
- Classification layer, caching layer, HTTP layer, formatting layer are separate sub-modules inside a canonical resolver.
- The policy (what to do) lives in data / config. The mechanism (how to do it) lives in generic code.

### Single source of truth
- Every literal (port, default user_id, default prompt_id) lives in `core/constants.py` or a named constant at module level.
- Every mapping (model → VRAM budget, language → TTS engine) lives in ONE registry that all consumers iterate.
- Every configuration fact lives in ONE config file that all consumers read.

### Existing learning reuse
- Before inventing a solution, read `~/.claude/projects/<project>/memory/*.md` for prior decisions, architectural notes, and incident post-mortems.
- Check git log for similar past fixes — reuse the pattern.
- Read related test files to understand the existing contract before adding new tests.

### Feature parity when refactoring
- When refactoring, the EXACT observable behavior must be preserved. Not "mostly". Not "with a minor improvement". EXACTLY.
- If behavior can't be preserved, raise it explicitly with the operator before committing.
- Verify by grepping all callers + running the existing tests.

## 2. Tools and commands

### Git rules
- **No Claude co-author line in commit messages.** Never include `Co-Authored-By: Claude <...>` or any variant. The operator has said so explicitly.
- **Never force-push to main.** Never amend a published commit. Never skip hooks (`--no-verify`, `--no-gpg-sign`).
- **Small focused commits** — one logical change per commit, well-messaged.
- **Commit message style** — follow existing project conventions (imperative mood, subject line under 72 chars, detailed body with WHY not WHAT).
- **Always pull + rebase** before pushing to a shared branch.
- **Never delete branches** without operator approval.

### Branch rules
- **Main branch** is `main` on all 5 repos.
- **Never commit to main directly** unless the operator said "commit and push" — otherwise use feature branches.
- **PR template** — use the existing template, not a minimal stub.

### File operation rules
- **Prefer editing over creating files.** Never create a new file unless it's genuinely new functionality. New test files for new features are fine.
- **Never create documentation files (*.md) unless explicitly requested.** The operator will ask for docs when needed.
- **Never proactively write README files.** Same rule.
- **Never emit emojis in code or files** unless the operator explicitly requested them.

## 3. Testing rules

### Always FT + NFT
- Every bug fix gets a regression guard test that fails without the fix and passes with it.
- Happy path + error paths + edge cases (empty, None, boundary) covered.
- Thread safety, degraded mode, backward compat, performance bounds tested for anything non-trivial.

### Import-level verification
- `ast.parse` is syntax-only. It does NOT catch missing imports or undefined names.
- After any non-trivial edit, actually IMPORT the module to confirm it loads.
- Run the targeted tests (`pytest -p no:randomly tests/unit/test_x.py`) before committing.

### No fixture pollution
- Tests must be order-independent (`-p no:randomly` should still pass).
- Shared singletons must be reset in `setUp` / `tearDown`.
- `with patch(...)` not `@patch` decorators when test classes share state.

## 4. Security rules

- **Identity binding must come from authenticated source** — `jwt.sub`, `details.caller_authid`, verified session. NOT from request body. This is the M1 pending fix class.
- **Secrets never in env vars in code**, never in logs, never in git history. Use `security.secrets_manager` / `NunbaVault`.
- **Admin paths gated on EVERY tier** — see `security/middleware.py::ADMIN_PATHS`. Regional LAN trust is NOT sufficient for admin ops.
- **Input validation at system boundaries** — user HTTP input, channel adapter payloads, WAMP subscriptions, file uploads. Trust internal code, validate at boundaries.
- **Shell commands go through `_handle_shell_command_tool`** — NFKC normalize + denylist + timeout + truncation. Never spawn `subprocess.run` with user input directly.

## 5. Multi-OS parity

- Every change must work on **Windows, macOS, Linux**, and (if it touches the mobile layer) **Android**.
- Path separators: use `pathlib.Path` or `os.path.join`, never hardcoded `/` or `\`.
- Subprocess flags: `startupinfo` on Windows, `start_new_session` on Unix, differ per platform.
- GPU detection: nvidia-smi / ROCm / Metal / CPU-only — all must be handled.
- Hotkey registration: Win+N fails silently on Linux — platform-check before registering.
- Unicode handling: Windows `cp1252` console vs Unix UTF-8. Use `python -X utf8` for tests.

## 6. Frontend rules

- **Nunba ≠ Hevolve web.** Two separate React codebases. Frontend changes must go to BOTH when relevant.
- **MUI sx borderRadius**: use string values (`'16px'`) not numbers (`16`) — numbers are treated as theme spacing multipliers (×8px).
- **BrowserRouter** (not HashRouter) on Nunba desktop.
- **Feed at `/social`** (index), NOT `/social/feed`.
- **DOMPurify** wraps every `dangerouslySetInnerHTML`. No exceptions.
- **All real-time push uses Crossbar WAMP.** Never SSE, never raw WebSocket.
- **One primary action per screen.** UX tokens from the design system, never hardcoded.

## 7. Commit cadence rules

- **Commit only when explicitly asked.** The operator will say "commit" when ready. Don't auto-commit between sub-tasks.
- **Push only when explicitly asked.** Same rule.
- **Validate CI after push.** Use `gh` (the real GitHub CLI, not the conda impostor) to check workflow status.

## 8. Communication rules

- **Terse by default.** No headers and subheaders for a simple answer. Match response length to question complexity.
- **No narration of internal deliberation.** State decisions and results directly.
- **Match the operator's vocabulary.** If they say "parallel path", don't translate to "code duplication". Use their terms.
- **Flag tradeoffs explicitly.** If a fix has a downside, say so — don't bury it.
- **Ask before destructive actions.** Delete, force-push, schema migration, drop table — always confirm first.

## 9. Respecting original intent

- Before changing code, understand WHY it was written that way. Read git blame, read the commit message, read surrounding comments.
- If the original intent is no longer valid, call it out explicitly — don't silently change it.
- Don't fix bugs that aren't bugs. Don't refactor code that's already correct.

## 10. Failure honesty

- If you can't reproduce a test failure locally, say so — don't mark it "probably fixed".
- If a fix has uncertainty, say "confidence: moderate" not "confidence: high".
- If a deferred item is deferred, explicitly record WHY and under what condition it would become urgent.
- Never claim success without verifying.

---

**Every specialist agent in this directory reads both `_ecosystem-context.md` AND this `_house_rules.md` before producing a review. A finding that violates these rules is wrong, regardless of how well-written the agent's other output is.**
