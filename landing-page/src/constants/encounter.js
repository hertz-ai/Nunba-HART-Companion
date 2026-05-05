/**
 * encounter.js — Shared constants for the BLE encounter / icebreaker
 * surface (W0c F2 IcebreakerDraftSheet).
 *
 * Single SPA-side source of truth — mirrors the canonical server-side
 * value at HARTOS `core.constants.ENCOUNTER_DRAFT_MAX_CHARS = 220`
 * (python-embed/Lib/site-packages/core/constants.py:332, also enforced
 * at integrations/social/encounter_api.py:680 where /icebreaker/approve
 * returns 413 if the body's `text` exceeds the cap).
 *
 * Design intent: keep the magic number out of inline component code so
 * that bumping the cap (e.g., to allow longer drafts in some future
 * locale) is one diff in two repos, not a grep-and-replace across
 * components and tests.  See `project_encounter_icebreaker.md` §9.
 */

// Hard length cap on icebreaker drafts.  Server enforces; UI mirrors
// so the Send button can disable + the char-count chip can warn before
// the user submits a 413.
export const ENCOUNTER_DRAFT_MAX_CHARS = 220;

// Soft warning threshold — char-count chip flips to warning palette
// once user is past 80% of the cap.  Pure UI affordance, not enforced
// server-side.
export const ENCOUNTER_DRAFT_WARN_RATIO = 0.8;

// Draft TTL — drafts not approved within this window are considered
// stale (per `project_encounter_icebreaker.md` §2: "draft expires 24h
// unsent").  UI surfaces a live countdown so users see when their
// in-progress draft will go stale.
export const ENCOUNTER_DRAFT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h

// Decline reasons surfaced to the user.  Free-text alternative is the
// last entry; otherwise these are operator-loggable constants the
// server can group on.  Order is intentional (most-likely first).
//
// Privacy: per design (project_encounter_icebreaker.md §1 threat-model
// row "Icebreaker auto-send → unwanted contact"), the reason is logged
// to OPERATOR audit trail, not relayed to the peer.  Server enforces.
export const ENCOUNTER_DECLINE_REASONS = Object.freeze([
  'Not feeling it',
  'Already met',
  'Too late',
  'Other',
]);

// Brand emerald — phone/desktop UI signature per
// marketing/video_stories/encounters.md ("Visual signature: Brand
// emerald (#00e89d) appears ONLY on phone / desktop screens").  Used
// on the Send button only — closes the marketing-as-spec linkage to
// Scene 6.
export const ENCOUNTER_BRAND_EMERALD = '#00e89d';
