# Channel-Based Device Install Handoff

Captured 2026-04-28.  Phase 1 shipped; Phase 2/3 backlog below.

## Why this exists

When a user says *"send Nunba to my phone"* / *"I want this on my work
laptop"* / *"text me the Android link"*, the agent should resolve the
right install URL for the target device and dispatch it through whichever
channel the user has paired (Telegram / Discord / WhatsApp / Slack /
Signal / web / email).  No SMS scraping, no QR-stickers, no copy/paste —
the chat IS the handoff.

This makes Nunba *agentic about its own distribution*: the LLM owns the
"how do I get this on my other device?" interaction end-to-end via the
existing channel infrastructure.

## Phase 1 (SHIPPED 2026-04-28)

### Files touched

- `HARTOS/core/install_links.py` (NEW) — canonical
  `(target_device, locale) → URL` table.  Single source of truth.
  Replaces the legacy `HevolveAI_Agent_Companion_Setup.exe` ad-hoc string
  and scattered `play.google.com` references.
- `HARTOS/integrations/channels/agent_tools.py` — added
  `send_install_link(channel_type, target_device, chat_id?,
  install_link?, locale?)` agent tool inside the existing closure
  factory.  Reuses `ChannelRegistry.send_to_channel`,
  `UserChannelBinding`, and the same `register_for_llm` /
  `register_for_execution` plumbing as the other 4 tools.
- `HARTOS/tests/unit/test_install_handoff.py` (NEW) — 29 tests
  covering FT mapping + tool registration + dispatch path, NFT/security
  for cross-user spam guard, URL allowlist guard, unsupported channel /
  device, unauthenticated caller.

### Three guarantees enforced in code

1. **No cross-user spam.**  Tool ALWAYS verifies
   `(channel_type, chat_id) ∈ UserChannelBinding(user_id=caller, is_active=True)`
   before dispatch.  Alice cannot resolve or target Bob's bindings.
   Verified by `test_send_install_link_rejects_chat_id_not_owned_by_caller`.
2. **No phishing-URL injection.**  If the agent supplies an
   `install_link` override, the host MUST be on
   `core.install_links.ALLOWED_HOSTS` (github.com /
   objects.githubusercontent.com / play.google.com / apps.apple.com /
   hevolve.ai / docs.hevolve.ai / testflight.apple.com).
   Subdomain matches are allowed; typosquats (`github.com.evil.example`)
   are rejected.  Verified by `test_is_allowed_install_link_rejects_*`.
3. **Explicit consent.**  The tool *description* read by the LLM tells it
   to confirm channel + target device with the user before calling.  The
   system prompt does not auto-trigger; the LLM must decide based on
   user intent.  This is policy, not crypto — Phase 3 may harden this
   into a confirmation token.

### Canonical install URLs (sourced from `HARTOS/docs/downloads.md`)

| device  | URL                                                                                  |
|---------|--------------------------------------------------------------------------------------|
| windows | `https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba_Setup.exe`          |
| macos   | `https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba_Setup.dmg`          |
| linux   | `https://github.com/hertz-ai/Nunba/releases/latest/download/Nunba-x86_64.AppImage`    |
| android | `https://play.google.com/store/apps/details?id=com.hertzai.hevolve`                  |
| ios     | `https://hevolve.ai/ios-coming-soon` (TestFlight pending)                            |

### Sample LLM-side invocation

```
User:   "I'd love to use Nunba on my Pixel.  Can you text me the link?"
Agent:  (sees Telegram in user's bindings) "Sure — should I send it via
        your Telegram (preferred) or another channel you have paired?"
User:   "Telegram is fine."
Agent:  → calls send_install_link('telegram', 'android')
        → Tool resolves user 42's preferred Telegram binding (chat_id
          tg_chat_42), composes a message with the Play Store URL, and
          dispatches via ChannelRegistry.send_to_channel.
        → Returns "Install link for android sent via telegram."
```

## Phase 2 (BACKLOG)

- **Pairing tokens.**  Issue a short-lived token at install time so the
  new device, when first launched, can claim the link to the user's
  Hevolve account without re-entering credentials.  Belongs in
  `integrations/social/api_channels.py` next to the existing pairing-code
  flow at line 188-195.
- **Install attestation.**  After the user installs Nunba on the new
  device, push a confirmation back to the originating channel
  ("Nunba is now running on your Pixel — say hi!").  Wire via the
  WAMP `com.hertzai.hevolve.install.{user_id}` topic.
- **Localized install pages.**  Populate per-locale entries in
  `CANONICAL_INSTALL_LINKS` for India / China / EU (e.g. mainland China
  Play Store mirror, AppGallery for Huawei).

## Phase 3 (POLICY HARDENING)

- **Rate-limit per-user.**  Cap install-link dispatches at e.g. 5/hour
  per user to prevent agent loops or compromised accounts from being
  used as a spam vector against the user's own channels.
- **Per-channel agent prompt opt-in.**  Some channels (e.g. work Slack
  workspaces) may not want install-link dispatch from the agent.  Wire
  to the per-channel agent prompt_id (Tasks #267-#272) so admins can
  disable.
- **Audit trail.**  Append every dispatch to
  `security.immutable_audit_log` so the user can review every install
  link ever sent on their behalf.

## Cross-references

- Existing channel infrastructure: `integrations/channels/registry.py`,
  `integrations/channels/agent_tools.py`,
  `integrations/channels/admin/api.py`
- Canonical download URLs: `HARTOS/docs/downloads.md`
- DRY enforcement: `core/install_links.py` is the ONLY place URLs live;
  `tests/unit/test_install_handoff.py::test_canonical_install_links_cover_all_devices`
  fails if a device loses its mapping.
