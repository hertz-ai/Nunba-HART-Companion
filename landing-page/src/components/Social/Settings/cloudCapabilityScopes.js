/**
 * cloudCapabilityScopes.js — single source of truth for the
 * scope → human-readable label/description lookup used by the
 * Cloud Capability consent UI (PrivacySettingsPage).
 *
 * Server is authoritative on which scopes mean what.  This module is
 * a presentation layer that never gates server behavior — it only
 * formats text for the user.
 *
 * Adding a new scope: append an entry here AND update the matching
 * encounter_api / consent enforcement on the server.  An unknown scope
 * coming back from the server falls through to the GENERIC_SCOPE
 * formatter so the UI always renders something sensible.
 *
 * IMPORTANT — sensitive scopes:
 *   `requires_age_18: true` adds a defense-in-depth 18+ checkbox in
 *   the Grant dialog.  The server is still the authority on the
 *   age-claim invariant (encounter_api.py:_age_gate); this is the UI
 *   mirror that mission anchor 3 demands.
 *
 * `consent_type` for every cloud-capability row is the literal string
 * `'cloud_capability'`.  Scope distinguishes which capability inside
 * that bucket.
 */

export const CLOUD_CAPABILITY_TYPE = 'cloud_capability';

export const CLOUD_CAPABILITY_SCOPES = {
  '*': {
    label: 'All cloud capabilities',
    description:
      'Allow all current and future cloud capabilities. Drafts and assists run locally without it; granting opts you into cloud-side processing for richer results.',
    requires_age_18: false,
  },
  encounter_icebreaker: {
    label: 'Icebreaker drafting via cloud LLM',
    description:
      'Generate icebreaker openers using a cloud LLM at central topology nodes. Drafts run locally without it.',
    requires_age_18: true,
  },
  // ── G6 (UNIF) — agent participation in external rooms ────────────
  // Per HIVE AI MISSION: agent ALWAYS announces its presence in any
  // external room before participating; never observes silently.  These
  // scopes gate agent_voice_bridge / room_presence_service joining
  // Discord audio rooms, Teams meetings, WhatsApp groups, Matrix rooms,
  // Telegram supergroups, Slack channels, etc., so the user can
  // participate / get notes / co-pilot — without surveillance risk.
  agent_joins_external_room: {
    label: 'AI agent joins external rooms (text)',
    description:
      'Allow your AI agent to join Discord channels, Teams chats, WhatsApp / Slack / Telegram groups, etc. on your behalf to take notes or answer when you ask. The agent always announces its presence and leaves on your or any participant\'s "no AI" request.',
    requires_age_18: false,
  },
  agent_listens_external_audio: {
    label: 'AI agent transcribes external voice rooms',
    description:
      'Allow your AI agent to attend Discord / Teams / Zoom audio rooms and transcribe what is said into your local knowledge graph so you can recall and search across meetings. Same announce-and-leave-on-objection rules.',
    requires_age_18: false,
  },
  agent_writes_external_room: {
    label: 'AI agent posts to external rooms on your behalf',
    description:
      'Allow your AI agent to send messages into external rooms when you explicitly ask (e.g. "post the summary to my Discord", "reply for me in this Slack channel"). Never sends without your turn-by-turn instruction.',
    requires_age_18: false,
  },
};

// Used when a scope shows up in the audit history that we don't have a
// label for (e.g. server added a new capability before the UI updated).
const GENERIC_SCOPE_LABEL_PREFIX = 'Cloud capability';

export function formatScopeLabel(scope) {
  if (!scope) return GENERIC_SCOPE_LABEL_PREFIX;
  const entry = CLOUD_CAPABILITY_SCOPES[scope];
  if (entry) return entry.label;
  return `${GENERIC_SCOPE_LABEL_PREFIX} · ${scope}`;
}

export function formatScopeDescription(scope) {
  const entry = CLOUD_CAPABILITY_SCOPES[scope];
  if (entry) return entry.description;
  return 'A cloud capability scoped to this feature. Contact support if you need details on what this enables.';
}

export function scopeRequiresAgeClaim(scope) {
  const entry = CLOUD_CAPABILITY_SCOPES[scope];
  return Boolean(entry && entry.requires_age_18);
}

// The set of scopes the UI offers as user-grantable.  Audit history can
// surface other scopes that came in via direct API calls (e.g. agent
// onboarding); those still render via formatScopeLabel().
export const GRANTABLE_SCOPES = Object.keys(CLOUD_CAPABILITY_SCOPES);
