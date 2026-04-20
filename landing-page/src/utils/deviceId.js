/**
 * Canonical device-id resolver — single source of truth across guest
 * auth, OTP auth, and any future caller that needs a stable per-device
 * identifier.
 *
 * Precedence:
 *   1. Backend /status.device_id (hardware-derived, stable across reinstalls)
 *   2. localStorage cache ('device_id') — preserves id when backend offline
 *   3. uuidv4() freshly minted and cached — last-resort fallback
 *
 * The returned id is ALWAYS mirrored into localStorage under 'device_id'
 * so subsequent synchronous call sites (getCachedDeviceId) can read it
 * without an await.
 *
 * WHY THIS EXISTS (2026-04-15):
 * guest_register on HARTOS was always creating a new User row, even
 * when the same device was re-registering after a JWT expiry.  That
 * orphaned the user's localStorage chat (keyed on prompt_id).  The
 * backend is now idempotent on device_id — but the frontend has to
 * actually SEND the device_id on the guest-refresh path for the
 * idempotence to engage.  Previously OtpAuthModal had its own private
 * copy of this helper, and Demopage.js's guest-refresh path didn't
 * use it at all.  This util is the canonical home.
 */
import axios from 'axios';
import {v4 as uuidv4} from 'uuid';

import {API_BASE_URL} from '../config/apiBase';

const STORAGE_KEY = 'device_id';

/**
 * Async resolver — calls backend first, falls back to cache then uuid.
 * Mirrors the final value into localStorage before returning.
 */
export const getStableDeviceId = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/status`, {timeout: 3000});
    if (res.data?.device_id) {
      localStorage.setItem(STORAGE_KEY, res.data.device_id);
      return res.data.device_id;
    }
  } catch {
    // Backend unreachable — fall through to cache
  }
  let cached = localStorage.getItem(STORAGE_KEY);
  if (!cached) {
    cached = uuidv4();
    localStorage.setItem(STORAGE_KEY, cached);
  }
  return cached;
};

/**
 * Synchronous read of the cached device_id without touching the
 * backend.  Use this when you're inside a synchronous code path
 * (e.g., an event handler) and can tolerate a cache-miss uuid fallback.
 *
 * If the cache is empty, mints a uuid and persists it — never returns
 * null/undefined so callers don't need to guard.
 */
export const getCachedDeviceId = () => {
  let cached = localStorage.getItem(STORAGE_KEY);
  if (!cached) {
    cached = uuidv4();
    localStorage.setItem(STORAGE_KEY, cached);
  }
  return cached;
};
