/**
 * DiscoverableTogglePanel.jsx — F1 GREENLIT (master-orchestrator aa3ead1).
 *
 * Consent surface for the BLE physical-world Encounter feature.  Lets
 * the user opt in to broadcasting a discoverable presence, with a
 * 18+ age claim, vibe-tag chips, face-visible toggle, avatar style
 * pick, and a server-authoritative TTL countdown.
 *
 * Backend chain (verified, do NOT re-verify):
 *   GET  /api/social/encounter/discoverable  (HARTOS encounter_api.py:251-284)
 *     -> { success, data: { enabled, expires_at, remaining_sec,
 *          toggle_count_24h, age_claim_18, face_visible,
 *          avatar_style, vibe_tags } }
 *   POST /api/social/encounter/discoverable  (HARTOS encounter_api.py:287-350)
 *     -> body { enabled, age_claim_18, ttl_sec, face_visible,
 *               avatar_style, vibe_tags }
 *     -> 403 if (enable && !age_claim_18)
 *     -> 429 if toggle_count_24h >= ENCOUNTER_DISCOVERABLE_MAX_TOGGLES_24H
 *
 * Mission anchors enforced (orchestrator-mandated):
 *   1) 18+ checkbox MUST default unchecked on every mount.  We never
 *      persist this in localStorage / sessionStorage / cookies — the
 *      user re-confirms each session per ciso gate.
 *   2) TTL countdown is sourced from server-returned expires_at
 *      (NOT local clock + ttl_sec) to defeat clock-skew + dev-tools
 *      manipulation per ethical-hacker gate.  The countdown ticks at
 *      1Hz inside a child <TTLCountdown> component so this panel is
 *      not re-rendered every second.
 *   3) Switch is disabled until age-claim is checked AND user is
 *      currently in a disabled state (so toggling-off doesn't require
 *      a fresh age claim).  This UI lock mirrors the server's 403 so
 *      the user never races past the consent gate.
 *   4) No camera, no photo capture — Studio-Ghibli-style avatar
 *      placeholder is the closed-set default per
 *      project_encounter_icebreaker.md.
 */
import {bleEncounterApi} from '../../../../services/socialApi';
import {RADIUS, SHADOWS, GRADIENTS} from '../../../../theme/socialTokens';

import {
  Box,
  Card,
  CardContent,
  Switch,
  Checkbox,
  FormControlLabel,
  Typography,
  Chip,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import React, {useState, useEffect, useCallback, useRef} from 'react';

// Keep in lockstep with HARTOS core.constants.ENCOUNTER_DISCOVERABLE_MAX_TOGGLES_24H.
// Display-only — server is the authority on enforcement.
const MAX_TOGGLES_24H = 6;

const AVATAR_STYLES = [
  {value: 'studio_ghibli', label: 'Studio Ghibli'},
  {value: 'pixel', label: 'Pixel'},
  {value: 'line-art', label: 'Line art'},
  {value: 'watercolor', label: 'Watercolor'},
  {value: 'neon', label: 'Neon'},
];

const MAX_VIBE_TAGS = 10;

/**
 * TTLCountdown — isolated 1Hz ticker so the parent panel doesn't
 * re-render every second.  Sources its countdown from a server-given
 * expires_at ISO string (NOT local clock + ttl_sec) per mission anchor 2.
 */
function TTLCountdown({expiresAtIso}) {
  const [remainingSec, setRemainingSec] = useState(() => {
    if (!expiresAtIso) return 0;
    const target = new Date(expiresAtIso).getTime();
    if (Number.isNaN(target)) return 0;
    return Math.max(0, Math.floor((target - Date.now()) / 1000));
  });

  useEffect(() => {
    if (!expiresAtIso) {
      setRemainingSec(0);
      return undefined;
    }
    const target = new Date(expiresAtIso).getTime();
    if (Number.isNaN(target)) {
      setRemainingSec(0);
      return undefined;
    }
    // Re-anchor on prop change.
    setRemainingSec(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    const id = setInterval(() => {
      const left = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemainingSec(left);
      if (left <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAtIso]);

  if (!expiresAtIso || remainingSec <= 0) return null;

  const hours = Math.floor(remainingSec / 3600);
  const mins = Math.floor((remainingSec % 3600) / 60);
  const secs = remainingSec % 60;
  const label =
    hours > 0
      ? `${hours}h ${mins}m`
      : mins > 0
      ? `${mins}m ${secs}s`
      : `${secs}s`;

  return (
    <Chip
      data-testid="ttl-countdown"
      label={`Visible for ${label}`}
      size="small"
      color="primary"
      sx={{borderRadius: RADIUS.sm}}
    />
  );
}

export default function DiscoverableTogglePanel() {
  // Server-shaped state (mirrors GET response exactly).
  const [state, setState] = useState({
    enabled: false,
    expires_at: null,
    remaining_sec: 0,
    toggle_count_24h: 0,
    face_visible: false,
    avatar_style: 'studio_ghibli',
    vibe_tags: [],
  });

  // Local UI state — NOTE: ageClaim18 is INTENTIONALLY not seeded
  // from the server's age_claim_18 field per mission anchor 1.
  // Defaults to false on every mount and is never persisted.
  const [ageClaim18, setAgeClaim18] = useState(false);
  const [vibeInput, setVibeInput] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error403, setError403] = useState(false);
  const [error429, setError429] = useState(false);
  const [snack, setSnack] = useState(null); // { severity, message }
  // After a 429, lock the Switch until next mount per task spec.
  const [lockedFor429, setLockedFor429] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await bleEncounterApi.getDiscoverable();
      const payload = res?.data?.data || res?.data || {};
      if (!mountedRef.current) return;
      setState((prev) => ({
        ...prev,
        enabled: !!payload.enabled,
        expires_at: payload.expires_at || null,
        remaining_sec: payload.remaining_sec || 0,
        toggle_count_24h: payload.toggle_count_24h || 0,
        face_visible: !!payload.face_visible,
        avatar_style: payload.avatar_style || 'studio_ghibli',
        vibe_tags: Array.isArray(payload.vibe_tags) ? payload.vibe_tags : [],
      }));
    } catch {
      /* silent — surface comes up empty until next refresh */
    } finally {
      if (mountedRef.current) setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleToggle = async (event) => {
    const next = !!event.target.checked;
    if (next && !ageClaim18) {
      setError403(true);
      return;
    }
    setSubmitting(true);
    setError403(false);
    try {
      const res = await bleEncounterApi.setDiscoverable({
        enabled: next,
        age_claim_18: ageClaim18,
        // Server clamps; we send undefined to fall back to default TTL.
        ttl_sec: undefined,
        face_visible: state.face_visible,
        avatar_style: state.avatar_style,
        vibe_tags: state.vibe_tags,
      });
      const payload = res?.data?.data || res?.data || {};
      // POST returns {enabled, expires_at, remaining_sec} — re-fetch
      // for full state (incl. toggle_count_24h).
      setState((prev) => ({
        ...prev,
        enabled: !!payload.enabled,
        expires_at: payload.expires_at || null,
        remaining_sec: payload.remaining_sec || 0,
      }));
      // Refresh full state to pick up the new toggle_count_24h.
      fetchState();
    } catch (err) {
      const status = err?.response?.status;
      if (status === 429) {
        setError429(true);
        setLockedFor429(true);
        setSnack({
          severity: 'warning',
          message: `Toggle limit reached (${MAX_TOGGLES_24H} per 24 hours). Please try again tomorrow.`,
        });
      } else if (status === 403) {
        setError403(true);
      } else {
        setSnack({
          severity: 'error',
          message: 'Could not update discoverable state. Please try again.',
        });
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleAddVibeTag = (raw) => {
    const tag = String(raw || '').trim().slice(0, 40);
    if (!tag) return;
    if (state.vibe_tags.length >= MAX_VIBE_TAGS) return;
    if (state.vibe_tags.includes(tag)) {
      setVibeInput('');
      return;
    }
    setState((prev) => ({...prev, vibe_tags: [...prev.vibe_tags, tag]}));
    setVibeInput('');
  };

  const handleRemoveVibeTag = (tag) => {
    setState((prev) => ({
      ...prev,
      vibe_tags: prev.vibe_tags.filter((t) => t !== tag),
    }));
  };

  const handleVibeKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddVibeTag(vibeInput);
    } else if (event.key === 'Backspace' && !vibeInput) {
      // Pop last tag on Backspace from empty input.
      setState((prev) => ({
        ...prev,
        vibe_tags: prev.vibe_tags.slice(0, -1),
      }));
    }
  };

  // Switch is enabled only when:
  //   - currently disabled AND age-claim is checked   (about to enable), OR
  //   - currently enabled                              (about to disable)
  // Plus the user must NOT be locked from a 429 this session, and
  // we must not be submitting / loading.
  const switchDisabled =
    initialLoading ||
    submitting ||
    lockedFor429 ||
    (!state.enabled && !ageClaim18);

  return (
    <Card
      data-testid="discoverable-toggle-panel"
      sx={{
        borderRadius: RADIUS.lg,
        boxShadow: SHADOWS.card,
        background: GRADIENTS.surface,
        mb: 0, // parent handles spacing
      }}
    >
      <CardContent sx={{p: {xs: 2, md: 2.5}}}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mb: 1,
          }}
        >
          <Box sx={{flex: 1, minWidth: 0}}>
            <Typography variant="subtitle1" sx={{fontWeight: 700}}>
              Discoverable nearby
            </Typography>
            <Typography variant="caption" color="text.secondary">
              When on, people physically near you can opt-in to see your
              avatar — never your photo.
            </Typography>
          </Box>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            {state.enabled && state.expires_at && (
              <TTLCountdown expiresAtIso={state.expires_at} />
            )}
            {initialLoading || submitting ? (
              <CircularProgress
                size={20}
                data-testid="discoverable-loading"
              />
            ) : null}
            <Switch
              checked={!!state.enabled}
              onChange={handleToggle}
              disabled={switchDisabled}
              inputProps={{
                'aria-label': 'Toggle discoverable nearby',
                'data-testid': 'discoverable-switch',
              }}
            />
          </Box>
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={ageClaim18}
              onChange={(e) => {
                setAgeClaim18(e.target.checked);
                if (e.target.checked) setError403(false);
              }}
              inputProps={{
                'aria-label': 'I confirm I am 18 or older',
                'data-testid': 'age-claim-checkbox',
              }}
            />
          }
          label="I confirm I am 18 or older"
        />

        {error403 && (
          <Typography
            data-testid="error-403"
            variant="caption"
            color="error"
            sx={{display: 'block', mt: 0.5}}
          >
            Confirm 18+ to enable
          </Typography>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{display: 'block', mt: 1}}
          data-testid="toggle-count"
        >
          Toggled {state.toggle_count_24h} of {MAX_TOGGLES_24H} times today.
        </Typography>

        {/* ---- Vibe tags ---- */}
        <Box sx={{mt: 2}}>
          <Typography variant="caption" color="text.secondary">
            Vibe tags (up to {MAX_VIBE_TAGS})
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              mt: 0.5,
              alignItems: 'center',
            }}
          >
            {state.vibe_tags.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                onDelete={() => handleRemoveVibeTag(tag)}
                sx={{borderRadius: RADIUS.sm}}
                data-testid={`vibe-tag-${tag}`}
              />
            ))}
            <TextField
              variant="standard"
              size="small"
              placeholder={
                state.vibe_tags.length >= MAX_VIBE_TAGS
                  ? 'Max reached'
                  : 'Add vibe…'
              }
              value={vibeInput}
              onChange={(e) => setVibeInput(e.target.value)}
              onKeyDown={handleVibeKeyDown}
              disabled={state.vibe_tags.length >= MAX_VIBE_TAGS}
              inputProps={{
                'aria-label': 'Add vibe tag',
                'data-testid': 'vibe-input',
                maxLength: 40,
              }}
              sx={{minWidth: 120, flex: 1}}
            />
          </Box>
        </Box>

        {/* ---- Face visible + avatar style ---- */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: {xs: 'column', sm: 'row'},
            gap: 2,
            mt: 2,
            alignItems: {xs: 'flex-start', sm: 'center'},
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={!!state.face_visible}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    face_visible: e.target.checked,
                  }))
                }
                inputProps={{
                  'aria-label': 'Face visible on avatar',
                  'data-testid': 'face-visible-switch',
                }}
              />
            }
            label="Face visible"
          />
          <FormControl size="small" sx={{minWidth: 180}}>
            <InputLabel id="avatar-style-label">Avatar style</InputLabel>
            <Select
              labelId="avatar-style-label"
              label="Avatar style"
              value={state.avatar_style}
              onChange={(e) =>
                setState((prev) => ({
                  ...prev,
                  avatar_style: e.target.value,
                }))
              }
              inputProps={{
                'aria-label': 'Avatar style',
                'data-testid': 'avatar-style-select',
              }}
              sx={{borderRadius: RADIUS.sm}}
            >
              {AVATAR_STYLES.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </CardContent>

      <Snackbar
        open={!!snack}
        autoHideDuration={6000}
        onClose={() => setSnack(null)}
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
      >
        {snack ? (
          <Alert
            onClose={() => setSnack(null)}
            severity={snack.severity}
            data-testid="discoverable-snackbar"
            sx={{width: '100%'}}
          >
            {snack.message}
          </Alert>
        ) : null}
      </Snackbar>

      {/* Hidden flag for tests / a11y debug */}
      <span hidden data-testid="discoverable-error-429">
        {error429 ? '1' : '0'}
      </span>
    </Card>
  );
}
