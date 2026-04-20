/**
 * events.js — shared CustomEvent name constants.
 *
 * Every cross-component CustomEvent goes here so a typo at either the
 * dispatch site or the listen site becomes a TypeScript/ESLint error
 * rather than a silent runtime no-op (which is what we had before —
 * the camera-consent event was a stringly-typed contract).
 */

export const NUNBA_CAMERA_CONSENT = 'nunba-camera-consent';
