import {referralsApi} from '../services/socialApi';

import {useEffect} from 'react';

/**
 * useReferral — Captures referral code from URL query params on mount.
 * Stores in localStorage for attribution on registration, and notifies backend.
 *
 * Usage: Call once in SocialContext or App-level component.
 *   useReferral();
 */
export function useReferral() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (!ref) return;

      // Store for attribution on registration
      const existing = localStorage.getItem('nunba_referral_code');
      if (!existing) {
        localStorage.setItem('nunba_referral_code', ref);
        localStorage.setItem('nunba_referral_ts', Date.now().toString());
      }

      // Notify backend (fire-and-forget, don't block)
      const token = localStorage.getItem('social_jwt');
      if (token) {
        referralsApi.use({code: ref}).catch(() => {});
      }

      // Clean URL without reload
      params.delete('ref');
      const newUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    } catch {
      // Non-critical — don't break the app
    }
  }, []);
}

/**
 * getReferralCode — Get stored referral code (for use during registration).
 */
export function getReferralCode() {
  return localStorage.getItem('nunba_referral_code') || null;
}
