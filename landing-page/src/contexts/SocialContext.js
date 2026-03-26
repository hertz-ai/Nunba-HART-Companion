import {useReferral} from '../hooks/useReferral';
import {apiCache} from '../services/apiCache';
import realtimeService from '../services/realtimeService';
import {
  authApi,
  notificationsApi,
  resonanceApi,
  onboardingApi,
  mailerApi,
} from '../services/socialApi';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';

const SocialContext = createContext();

export function SocialProvider({children}) {
  // Capture referral code from URL on mount
  useReferral();

  const [currentUser, setCurrentUser] = useState(null);
  const [resonance, setResonance] = useState(null);
  const [onboardingProgress, setOnboardingProgress] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      setAuthError(null);
      const res = await authApi.me();
      setCurrentUser(res.data);
    } catch (err) {
      const status = err?.response?.status || err?.status;
      if (status === 401 || status === 403) {
        // Token is invalid/expired — clear user
        setCurrentUser(null);
      } else if (!status) {
        // Network error (backend unreachable) — keep JWT-based user as fallback
        setAuthError('Unable to connect to server');
        setCurrentUser((prev) => prev); // keep existing JWT-decoded user if any
      } else {
        setCurrentUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResonance = useCallback(async () => {
    try {
      const res = await resonanceApi.getWallet();
      setResonance(res.data);
    } catch {
      // silent
    }
  }, []);

  const fetchOnboarding = useCallback(async () => {
    try {
      const res = await onboardingApi.getProgress();
      setOnboardingProgress(res.data);
    } catch {
      // silent
    }
  }, []);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await notificationsApi.list({unread: true, limit: 1});
      setUnreadCount(res.meta ? res.meta.total : 0);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      // Decode JWT payload for instant UI (no signature check — just for display).
      // This becomes the fallback user if backend is unreachable.
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          // Token expired — clear it
          localStorage.removeItem('access_token');
          // If this was a guest session, try to silently recover it
          // instead of losing the entire session
          const guestId = localStorage.getItem('guest_user_id');
          const guestName = localStorage.getItem('guest_name');
          if (localStorage.getItem('guest_mode') === 'true' && guestId) {
            authApi
              .guestRecover({device_id: guestId, display_name: guestName})
              .then((res) => {
                if (res?.data?.token) {
                  localStorage.setItem('access_token', res.data.token);
                  localStorage.setItem(
                    'social_user_id',
                    res.data.user?.id || guestId
                  );
                  setCurrentUser({
                    id: res.data.user?.id || guestId,
                    username: guestName || 'User',
                    role: 'guest',
                  });
                  fetchProfile();
                }
              })
              .catch(() => {
                // Recovery failed (key rotated after reinstall) — re-register as guest
                authApi
                  .guestRegister({
                    guest_name: guestName || 'User',
                    device_id: guestId,
                  })
                  .then((res) => {
                    if (res?.data?.token) {
                      localStorage.setItem('access_token', res.data.token);
                      localStorage.setItem(
                        'social_user_id',
                        res.data.user?.id || guestId
                      );
                      setCurrentUser({
                        id: res.data.user?.id || guestId,
                        username: guestName || 'User',
                        role: 'guest',
                      });
                      fetchProfile();
                    } else {
                      setCurrentUser({
                        id: guestId,
                        username: guestName || 'User',
                        role: 'guest',
                      });
                    }
                  })
                  .catch(() => {
                    setCurrentUser({
                      id: guestId,
                      username: guestName || 'User',
                      role: 'guest',
                    });
                  });
              })
              .finally(() => setLoading(false));
            return;
          }
          setLoading(false);
          return;
        }
        setCurrentUser({
          id: payload.user_id || localStorage.getItem('social_user_id'),
          username:
            payload.username || localStorage.getItem('guest_name') || 'User',
          role: payload.role || 'flat',
          _fromJwt: true, // flag: populated from JWT, not backend
        });
      } catch {
        // Not a valid JWT — fall through to fetchProfile
      }
      fetchProfile();
      fetchResonance();
      fetchOnboarding();
      fetchUnread();
      // Poll unread as fallback (SSE provides instant updates when available)
      const interval = setInterval(fetchUnread, 30000);
      // Proactive JWT refresh — check every 60s, refresh 5 min before expiry
      let _refreshing = false;
      const tokenRefreshInterval = setInterval(() => {
        if (_refreshing) return; // prevent concurrent refresh requests
        try {
          const t = localStorage.getItem('access_token');
          if (!t) return;
          const p = JSON.parse(atob(t.split('.')[1]));
          if (p.exp) {
            const expiresIn = p.exp * 1000 - Date.now();
            if (expiresIn > 0 && expiresIn < 5 * 60 * 1000) {
              const refreshToken = localStorage.getItem('refresh_token');
              if (refreshToken) {
                _refreshing = true;
                mailerApi
                  .renewToken({refresh_token: refreshToken})
                  .then((res) => {
                    if (res?.access_token)
                      localStorage.setItem('access_token', res.access_token);
                  })
                  .catch(() => {}) // silent — worst case 401 interceptor handles it
                  .finally(() => {
                    _refreshing = false;
                  });
              }
            }
          }
        } catch {
          // Invalid token format — ignore
        }
      }, 60_000);
      // Subscribe to realtime events for instant updates
      const unsubNotification = realtimeService.on('notification', () => {
        setUnreadCount((c) => c + 1);
      });
      const unsubAchievement = realtimeService.on('achievement', () => {
        fetchResonance();
      });
      return () => {
        clearInterval(interval);
        clearInterval(tokenRefreshInterval);
        unsubNotification();
        unsubAchievement();
      };
    } else if (localStorage.getItem('guest_mode') === 'true') {
      // No token but guest session exists — restore from localStorage.
      // The user's chosen name and identity persist independently of JWT.
      const guestId = localStorage.getItem('guest_user_id');
      const guestName = localStorage.getItem('guest_name');
      if (guestId || guestName) {
        setCurrentUser({
          id: guestId || `guest-${Date.now()}`,
          username: guestName || 'User',
          role: 'guest',
        });
        // Try to silently re-authenticate in the background
        authApi
          .guestRecover({device_id: guestId, display_name: guestName})
          .then((res) => {
            if (res?.data?.token) {
              localStorage.setItem('access_token', res.data.token);
              if (res.data.user?.id)
                localStorage.setItem('social_user_id', res.data.user.id);
            }
          })
          .catch(() => {}); // silent — guest UI still works without a token
      }
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [fetchProfile, fetchResonance, fetchOnboarding, fetchUnread]);

  const logout = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    apiCache.clearAll(); // Flush user-scoped cache to prevent data bleed
    setCurrentUser(null);
    setResonance(null);
    setOnboardingProgress(null);
    setUnreadCount(0);
  }, []);

  // Listen for token expiry events dispatched by socialApi 401 interceptor
  useEffect(() => {
    const handleExpiry = () => {
      // For guests, preserve identity — only clear the token, not the session.
      // The user's name and local mind persist regardless of JWT state.
      if (localStorage.getItem('guest_mode') === 'true') {
        const guestId = localStorage.getItem('guest_user_id');
        const guestName = localStorage.getItem('guest_name');
        if (guestId || guestName) {
          setCurrentUser({
            id: guestId || `guest-${Date.now()}`,
            username: guestName || 'User',
            role: 'guest',
          });
          // Try silent re-auth
          authApi
            .guestRecover({device_id: guestId, display_name: guestName})
            .then((res) => {
              if (res?.data?.token)
                localStorage.setItem('access_token', res.data.token);
            })
            .catch(() => {});
          return;
        }
      }
      setCurrentUser(null);
      setResonance(null);
      setOnboardingProgress(null);
      setUnreadCount(0);
    };
    window.addEventListener('auth:expired', handleExpiry);
    return () => window.removeEventListener('auth:expired', handleExpiry);
  }, []);

  // Derived auth state
  const isAuthenticated = !!currentUser && !currentUser._pending;
  const userRole = currentUser?.role || null;
  const isGuest =
    currentUser?.role === 'guest' ||
    (!currentUser && localStorage.getItem('guest_mode') === 'true');
  const accessTier = useMemo(() => {
    if (currentUser?.role) return currentUser.role;
    // Authenticated user without role field defaults to 'flat'
    if (currentUser && !currentUser._pending) return 'flat';
    if (isGuest) return 'guest';
    return 'anonymous';
  }, [currentUser, isGuest]);

  return (
    <SocialContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        resonance,
        fetchResonance,
        onboardingProgress,
        fetchOnboarding,
        currentSeason,
        setCurrentSeason,
        unreadCount,
        fetchUnread,
        loading,
        logout,
        authError,
        isAuthenticated,
        userRole,
        isGuest,
        accessTier,
      }}
    >
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  return useContext(SocialContext);
}

export default SocialContext;
