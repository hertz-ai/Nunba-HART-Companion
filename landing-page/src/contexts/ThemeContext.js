/**
 * NunbaThemeProvider — Dynamic theme context
 *
 * Manages three theme layers:
 *   1. ownTheme     — user's saved theme (loaded from backend on auth)
 *   2. visitorTheme — temp override when viewing another user's page
 *   3. previewTheme — temp override for live preview in settings
 *
 * Priority: previewTheme > visitorTheme > ownTheme > DEFAULT_THEME_CONFIG
 *
 * Chat pages (/, /local) are isolated — always use the default theme.
 */

import {themeApi} from '../services/socialApi';
import buildMuiTheme from '../theme/themeBuilder';
import {
  DEFAULT_THEME_CONFIG,
  mergeThemeConfig,
  getPresetById,
} from '../theme/themePresets';

import {ThemeProvider as MuiThemeProvider, CssBaseline} from '@mui/material';
import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
} from 'react';
import {useLocation} from 'react-router-dom';


// Safe wrapper — theme API failures must NEVER trigger auth token clearing.
// The socialApi 401 interceptor clears localStorage on 401, which would log the
// user out if the theme endpoints don't exist yet (e.g. old backend).
function safeThemeCall(fn) {
  return fn().catch(() => null);
}

const ThemeContext = createContext(null);

// Routes that are NOT themed (chat stays on default theme)
const CHAT_ROUTES = ['/', '/local'];

function isChatRoute(pathname) {
  return CHAT_ROUTES.includes(pathname);
}

// ── CSS Custom Property Injection ───────────────────────────────────────────

function injectCSSVars(config) {
  const c = config.colors || {};
  const g = config.glass || {};
  const a = config.animations || {};
  const root = document.documentElement;

  root.style.setProperty('--nunba-bg', c.background || '#0F0E17');
  root.style.setProperty('--nunba-paper', c.paper || '#1A1932');
  root.style.setProperty('--nunba-primary', c.primary || '#6C63FF');
  root.style.setProperty(
    '--nunba-primary-light',
    c.primary_light || c.primary || '#9B94FF'
  );
  root.style.setProperty(
    '--nunba-primary-dark',
    c.primary_dark || c.primary || '#4A42CC'
  );
  root.style.setProperty('--nunba-secondary', c.secondary || '#FF6B6B');
  root.style.setProperty('--nunba-accent', c.accent || '#2ECC71');
  root.style.setProperty('--nunba-text', c.text_primary || '#FFFFFE');
  root.style.setProperty(
    '--nunba-text-secondary',
    c.text_secondary || 'rgba(255,255,254,0.72)'
  );
  root.style.setProperty(
    '--nunba-divider',
    c.divider || 'rgba(255,255,255,0.12)'
  );
  root.style.setProperty('--nunba-glass-blur', `${g.blur_radius ?? 20}px`);
  root.style.setProperty(
    '--nunba-glass-opacity',
    `${g.surface_opacity ?? 0.85}`
  );
  root.style.setProperty(
    '--nunba-anim-glass',
    a.glassmorphism?.enabled !== false ? '1' : '0'
  );
  root.style.setProperty(
    '--nunba-anim-gradient',
    a.gradients?.enabled !== false ? '1' : '0'
  );
  root.style.setProperty(
    '--nunba-anim-liquid',
    a.liquid_motion?.enabled !== false ? '1' : '0'
  );
}

// ── Provider ────────────────────────────────────────────────────────────────

export function NunbaThemeProvider({children}) {
  const location = useLocation();
  const [ownTheme, setOwnTheme] = useState(null);
  const [visitorTheme, setVisitorTheme] = useState(null);
  const [visitorUser, setVisitorUser] = useState(null);
  const [previewTheme, setPreviewTheme] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Load user's saved theme on mount (if logged in)
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      setLoaded(true);
      return;
    }
    safeThemeCall(() => themeApi.getActive())
      .then((res) => {
        const t = res?.data?.theme;
        if (t && t.id) {
          setOwnTheme(t);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  // Re-fetch when auth changes
  useEffect(() => {
    const handleAuth = () => {
      const token = localStorage.getItem('access_token');
      if (token) {
        safeThemeCall(() => themeApi.getActive()).then((res) => {
          const t = res?.data?.theme;
          if (t && t.id) setOwnTheme(t);
        });
      } else {
        setOwnTheme(null);
      }
    };
    window.addEventListener('auth:login', handleAuth);
    window.addEventListener('auth:expired', handleAuth);
    return () => {
      window.removeEventListener('auth:login', handleAuth);
      window.removeEventListener('auth:expired', handleAuth);
    };
  }, []);

  // Compute active config (respecting chat route isolation)
  const activeConfig = useMemo(() => {
    if (isChatRoute(location.pathname)) {
      return DEFAULT_THEME_CONFIG;
    }
    return previewTheme || visitorTheme || ownTheme || DEFAULT_THEME_CONFIG;
  }, [location.pathname, previewTheme, visitorTheme, ownTheme]);

  // Build MUI theme from config
  const muiTheme = useMemo(() => buildMuiTheme(activeConfig), [activeConfig]);

  // Inject CSS vars whenever theme changes
  useEffect(() => {
    injectCSSVars(activeConfig);
  }, [activeConfig]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const applyPreset = useCallback(async (presetId) => {
    const preset = getPresetById(presetId);
    setOwnTheme(preset);
    setPreviewTheme(null);
    try {
      await themeApi.apply(presetId);
    } catch (err) {
      console.warn(
        '[ThemeContext] Failed to persist preset (optimistic update applied):',
        err?.message || err
      );
    }
  }, []);

  const saveCustom = useCallback(
    async (overrides) => {
      const base = ownTheme || DEFAULT_THEME_CONFIG;
      const merged = mergeThemeConfig(base, overrides);
      merged.id = 'custom';
      merged.name = 'Custom';
      merged.metadata = {...merged.metadata, is_preset: false};
      setOwnTheme(merged);
      setPreviewTheme(null);
      try {
        await themeApi.customize(merged);
      } catch (err) {
        console.error(
          '[ThemeContext] Failed to persist custom theme:',
          err?.message || err
        );
      }
    },
    [ownTheme]
  );

  const resetToDefault = useCallback(async () => {
    setOwnTheme(DEFAULT_THEME_CONFIG);
    setPreviewTheme(null);
    setVisitorTheme(null);
    try {
      await themeApi.apply('hart-default');
    } catch (err) {
      console.warn(
        '[ThemeContext] Failed to persist default reset:',
        err?.message || err
      );
    }
  }, []);

  const loadVisitorTheme = useCallback(async (userId, username) => {
    try {
      const res = await themeApi.getUserTheme(userId);
      const t = res?.data?.theme;
      if (t && t.id && t.id !== 'hart-default') {
        setVisitorTheme(t);
        setVisitorUser({id: userId, username: username || 'User'});
      }
    } catch (err) {
      console.warn(
        '[ThemeContext] No visitor theme available for user',
        userId,
        ':',
        err?.message || err
      );
    }
  }, []);

  const clearVisitorTheme = useCallback(() => {
    setVisitorTheme(null);
    setVisitorUser(null);
  }, []);

  const clearPreview = useCallback(() => {
    setPreviewTheme(null);
  }, []);

  const value = useMemo(
    () => ({
      themeConfig: activeConfig,
      ownTheme: ownTheme || DEFAULT_THEME_CONFIG,
      isVisitorTheme: !!visitorTheme,
      visitorUser,
      isPreview: !!previewTheme,
      loaded,
      applyPreset,
      saveCustom,
      resetToDefault,
      setPreviewTheme,
      clearPreview,
      loadVisitorTheme,
      clearVisitorTheme,
    }),
    [
      activeConfig,
      ownTheme,
      visitorTheme,
      visitorUser,
      previewTheme,
      loaded,
      applyPreset,
      saveCustom,
      resetToDefault,
      loadVisitorTheme,
      clearVisitorTheme,
      clearPreview,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useNunbaTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useNunbaTheme must be used within NunbaThemeProvider');
  }
  return ctx;
}

export default ThemeContext;
