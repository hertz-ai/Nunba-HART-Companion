/**
 * IcebreakerDraftSheet.jsx — review-before-send modal for BLE
 * encounter icebreaker drafts (W0c F2 — master-orchestrator GREENLIGHT
 * post-prereq d4405b55 + 7dadd6bc + 65084ae2 + 8e4f462d).
 *
 * Architectural choice: mounted ONCE at EncountersPage.js (Option b
 * from the F2 brief) rather than per-card.  Rationale:
 *   - One WAMP subscription instead of N (one per visible match).
 *   - One MUI Dialog/Drawer instance in the DOM.
 *   - Per-match dismiss is filtered inside the modal via the active
 *     `match.id` so cross-match WAMP events cannot leak (ethical-
 *     hacker gate).  See state-machine PEER_DISMISSED below.
 *
 * Mission-anchor enforcement (CLAUDE.md §0 + project_encounter_icebreaker.md §1):
 *   1. AI never sends.  Send is a USER ACTION button — there is no
 *      auto-send code path anywhere in this file.  The `approve`
 *      service call only fires on the explicit Send onClick.
 *   2. The user-edited TextField value is what's POSTed to /approve,
 *      NOT the original LLM/template draft.  Editing is encouraged.
 *   3. WAMP callback filters by `match.id` — events for OTHER matches
 *      cannot dismiss this modal.  No cross-match leak.
 *   4. Decline reasons feed the OPERATOR audit trail server-side; we
 *      send `{reason}` only.  Reason text never relays to peer.
 *   5. Drafts expire 24h after issue (project_encounter_icebreaker.md
 *      §2 "draft expires 24h unsent") — countdown chip surfaces this
 *      live so the user sees the staleness boundary.
 *
 * Marketing-as-spec linkage (marketing/video_stories/encounters.md
 * Scene 6 / B3): the modal's title verbatim "Your icebreaker — review
 * before sending" matches the chyron in the canonical video brief.
 * "AI drafts. You decide. Always." footer text mirrors the Scene 6
 * chyron.  Closes the loop between the marketing director's treatment
 * (the spec) and the engineering surface (the implementation).
 *
 * Backend chain — cited file:line, all already shipped:
 *   /icebreaker/draft   → encounter_api.py:638-664 → returns
 *     {draft, alt_drafts:[2 strings], rationale, length, shared_tag,
 *      source: 'llm'|'template'} per icebreaker_service.draft_icebreaker
 *     (icebreaker_service.py:194-202 docstring, :280-287 return).
 *   /icebreaker/approve → encounter_api.py:667-714 → 413 when text
 *     exceeds ENCOUNTER_DRAFT_MAX_CHARS (mirrored client-side at
 *     constants/encounter.js).
 *   /icebreaker/decline → encounter_api.py:717-747 → reason logged
 *     server-side, not relayed to peer.
 *
 * Realtime chain — single source-of-truth:
 *   subscribeEncounterIcebreaker (realtimeService.js:570-574) →
 *   `com.hevolve.encounter.icebreaker.{userId}` per HARTOS
 *   _publish_icebreaker, JWT-gated.  We FILTER incoming payloads by
 *   the active match.id before reacting (ethical-hacker gate).
 */
import {
  ENCOUNTER_BRAND_EMERALD,
  ENCOUNTER_DECLINE_REASONS,
  ENCOUNTER_DRAFT_EXPIRY_MS,
  ENCOUNTER_DRAFT_MAX_CHARS,
  ENCOUNTER_DRAFT_WARN_RATIO,
} from '../../../../constants/encounter';
import {subscribeEncounterIcebreaker} from '../../../../services/realtimeService';
import {bleEncounterApi} from '../../../../services/socialApi';
import {RADIUS} from '../../../../theme/socialTokens';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  SwipeableDrawer,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

// State machine — explicit string union so the test asserts on the
// outermost data-testid value rather than reaching into props.
const STATE = Object.freeze({
  LOADING: 'loading',
  READY: 'ready',
  SENDING: 'sending',
  SENT: 'sent',
  DECLINING: 'declining', // user opened reason picker
  SENT_DECLINE: 'sent_decline',
  ERROR: 'error',
  PEER_DISMISSED: 'peer_dismissed',
});

// Auto-close delays (ms).  Honor prefers-reduced-motion: zero them out
// so screen-reader users can read the success line without a race
// against the dismiss timer (a11y reviewer gate).
const AUTO_CLOSE_SENT_MS = 1200;
const AUTO_CLOSE_DECLINE_MS = 2000;
const AUTO_CLOSE_PEER_MS = 2000;

function reducedMotionPref() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * ExpiryCountdown — isolated child so the parent doesn't re-render
 * every second (performance-engineer gate).  Renders a Chip with the
 * remaining hh:mm:ss until the draft expires (24h after first issue).
 *
 * Memoized via React.memo on the issuedAt timestamp.
 */
const ExpiryCountdown = React.memo(function ExpiryCountdown({issuedAt}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!issuedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [issuedAt]);

  if (!issuedAt) return null;
  const remaining = Math.max(0, issuedAt + ENCOUNTER_DRAFT_EXPIRY_MS - now);
  const hh = Math.floor(remaining / 3_600_000);
  const mm = Math.floor((remaining % 3_600_000) / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1_000);
  const label = remaining > 0
    ? `Draft expires in ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : 'Draft expired';
  return (
    <Chip
      data-testid="icebreaker-draft-expiry"
      role="timer"
      aria-live="off"
      label={label}
      size="small"
      variant="outlined"
      sx={{borderRadius: RADIUS.sm}}
    />
  );
});

/**
 * IcebreakerDraftSheet — review-before-send modal.
 *
 * @param {Object} props
 * @param {boolean} props.open — whether the modal is visible
 * @param {Object|null} props.match — the BLE match row
 *   ({id, user_a, user_b, ...}); null means "nothing to draft for"
 * @param {Object} [props.viewer] — current user; reserved for
 *   future copy personalization (unused today)
 * @param {Function} props.onClose — invoked on dismiss / Esc / backdrop
 * @param {Function} [props.onSent] — invoked once after a successful
 *   approve, with the match arg
 */
export default function IcebreakerDraftSheet({
  open,
  match,
  viewer, // eslint-disable-line no-unused-vars
  onClose,
  onSent,
}) {
  const theme = useTheme();
  const isNarrow = useMediaQuery(theme.breakpoints.down('sm'));
  const reducedMotion = reducedMotionPref();

  // ── State ────────────────────────────────────────────────────────
  const [phase, setPhase] = useState(STATE.LOADING);
  const [drafts, setDrafts] = useState([]); // [draft, ...alt_drafts]
  const [rationale, setRationale] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editedText, setEditedText] = useState('');
  const [issuedAt, setIssuedAt] = useState(null); // for expiry chip
  const [errorMsg, setErrorMsg] = useState('');
  const [peerLine, setPeerLine] = useState('');

  // Refs for cleanup-on-unmount.  Auto-close timers must clear so the
  // setPhase doesn't fire after the parent has dropped the modal.
  const autoCloseRef = useRef(null);
  const sendButtonRef = useRef(null);

  const clearAutoClose = useCallback(() => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  // ── Effect: load draft on open + match change ────────────────────
  // The /draft endpoint is sub-second on flat (template fallback) but
  // can take 1–5s on central topology when the LLM callback fires.
  // We always show LOADING until the response arrives.
  useEffect(() => {
    if (!open || !match) return undefined;
    let cancelled = false;
    setPhase(STATE.LOADING);
    setErrorMsg('');
    setPeerLine('');

    bleEncounterApi
      .draftIcebreaker(match.id)
      .then((res) => {
        if (cancelled) return;
        // Axios envelope: res.data === {success, data: {draft, ...}}
        const payload = res?.data?.data || res?.data || {};
        const primary = typeof payload.draft === 'string' ? payload.draft : '';
        const alts = Array.isArray(payload.alt_drafts) ? payload.alt_drafts : [];
        const all = [primary, ...alts].filter((s) => typeof s === 'string' && s);
        if (all.length === 0) {
          setErrorMsg('No drafts returned by the server.');
          setPhase(STATE.ERROR);
          return;
        }
        setDrafts(all);
        setRationale(typeof payload.rationale === 'string' ? payload.rationale : '');
        setSelectedIdx(0);
        setEditedText(all[0]);
        setIssuedAt(Date.now());
        setPhase(STATE.READY);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load draft';
        setErrorMsg(msg);
        setPhase(STATE.ERROR);
      });

    return () => {
      cancelled = true;
    };
  }, [open, match]);

  // ── Effect: subscribe to per-user icebreaker WAMP topic ──────────
  // Filter by match.id; cross-match payloads MUST NOT mutate state
  // (ethical-hacker gate — no cross-match leak).
  useEffect(() => {
    if (!open || !match) return undefined;
    const unsubscribe = subscribeEncounterIcebreaker((event) => {
      if (!event || event.match_id !== match.id) return;
      // Only react to terminal peer actions; our own /approve already
      // optimistically transitions to SENT before the WAMP echo.
      if (event.status === 'declined') {
        setPeerLine('They declined this draft.');
        setPhase(STATE.PEER_DISMISSED);
      } else if (event.status === 'sent' && phase !== STATE.SENT) {
        // Peer sent first — show polite line so user knows.
        setPeerLine('They already sent first.');
        setPhase(STATE.PEER_DISMISSED);
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
    // phase intentionally read at handler-call-time via the closure;
    // adding it to deps would re-subscribe on every transition, which
    // is wasteful — the stale closure is acceptable here because the
    // SENT branch is only an optimization (peer line over success).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, match]);

  // ── Effect: auto-close after terminal phases ─────────────────────
  useEffect(() => {
    clearAutoClose();
    const isSent = phase === STATE.SENT;
    const isDeclined = phase === STATE.SENT_DECLINE;
    const isPeer = phase === STATE.PEER_DISMISSED;
    if (!isSent && !isDeclined && !isPeer) return undefined;
    let delay;
    if (isSent) delay = AUTO_CLOSE_SENT_MS;
    else if (isDeclined) delay = AUTO_CLOSE_DECLINE_MS;
    else delay = AUTO_CLOSE_PEER_MS;
    if (reducedMotion) delay = Math.max(delay, 4000); // give SR readers room
    autoCloseRef.current = setTimeout(() => {
      autoCloseRef.current = null;
      onClose?.();
    }, delay);
    return clearAutoClose;
  }, [phase, onClose, clearAutoClose, reducedMotion]);

  // ── Derived values ───────────────────────────────────────────────
  const charCount = editedText.length;
  const overCap = charCount > ENCOUNTER_DRAFT_MAX_CHARS;
  const warnZone =
    charCount > ENCOUNTER_DRAFT_MAX_CHARS * ENCOUNTER_DRAFT_WARN_RATIO;
  const sendDisabled =
    phase !== STATE.READY || !editedText.trim() || overCap;

  const counterColor = useMemo(() => {
    if (overCap) return 'error.main';
    if (warnZone) return 'warning.main';
    return 'text.secondary';
  }, [overCap, warnZone]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSelectDraft = (idx) => {
    setSelectedIdx(idx);
    setEditedText(drafts[idx] || '');
  };

  // Internal — fires the /approve POST without re-checking sendDisabled
  // (caller is responsible for the gate).  Kept private so the public
  // handleSend can enforce the disabled-state guard while retry can
  // bypass it (after error, phase=ERROR makes sendDisabled true; retry
  // intentionally re-attempts the same payload).
  const submitApprove = useCallback(() => {
    if (!match || !editedText.trim()) return;
    setPhase(STATE.SENDING);
    setErrorMsg('');
    bleEncounterApi
      .approveIcebreaker(match.id, editedText.trim())
      .then(() => {
        setPhase(STATE.SENT);
        if (typeof onSent === 'function') onSent(match);
      })
      .catch((err) => {
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'Failed to send icebreaker';
        setErrorMsg(msg);
        setPhase(STATE.ERROR);
      });
  }, [match, editedText, onSent]);

  const handleSend = useCallback(() => {
    if (sendDisabled) return;
    submitApprove();
  }, [sendDisabled, submitApprove]);

  const handleRetry = useCallback(() => {
    if (!match) return;
    if (drafts.length > 0 && editedText.trim()) {
      // Retry the approve attempt with the same edited text — bypass
      // sendDisabled because phase is currently ERROR.
      submitApprove();
    } else {
      // Re-issue the draft request.
      setPhase(STATE.LOADING);
      bleEncounterApi
        .draftIcebreaker(match.id)
        .then((res) => {
          const payload = res?.data?.data || res?.data || {};
          const primary = typeof payload.draft === 'string' ? payload.draft : '';
          const alts = Array.isArray(payload.alt_drafts) ? payload.alt_drafts : [];
          const all = [primary, ...alts].filter((s) => typeof s === 'string' && s);
          setDrafts(all);
          setRationale(typeof payload.rationale === 'string' ? payload.rationale : '');
          setSelectedIdx(0);
          setEditedText(all[0] || '');
          setIssuedAt(Date.now());
          setPhase(STATE.READY);
        })
        .catch((err) => {
          const msg =
            err?.response?.data?.error ||
            err?.message ||
            'Failed to load draft';
          setErrorMsg(msg);
          setPhase(STATE.ERROR);
        });
    }
  }, [match, drafts, editedText, submitApprove]);

  const handleOpenDecline = () => setPhase(STATE.DECLINING);

  const handleSelectDeclineReason = useCallback(
    (reason) => {
      if (!match) return;
      setPhase(STATE.SENDING);
      bleEncounterApi
        .declineIcebreaker(match.id, reason)
        .then(() => setPhase(STATE.SENT_DECLINE))
        .catch((err) => {
          const msg =
            err?.response?.data?.error ||
            err?.message ||
            'Failed to decline';
          setErrorMsg(msg);
          setPhase(STATE.ERROR);
        });
    },
    [match],
  );

  // ── Cleanup ──────────────────────────────────────────────────────
  useEffect(() => () => clearAutoClose(), [clearAutoClose]);

  // ── Body renderer (shared between Dialog + Drawer) ───────────────
  function renderBody() {
    if (phase === STATE.LOADING) {
      return (
        <Box
          data-testid="icebreaker-loading"
          sx={{
            py: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <CircularProgress size={32} />
          <Typography variant="caption" color="text.secondary">
            Drafting an opener…
          </Typography>
        </Box>
      );
    }

    if (phase === STATE.SENT) {
      return (
        <Box
          data-testid="icebreaker-sent"
          sx={{py: 4, textAlign: 'center'}}
          role="status"
          aria-live="polite"
        >
          <CheckCircleIcon sx={{color: 'success.main', fontSize: 48, mb: 1}} />
          <Typography variant="subtitle1" sx={{fontWeight: 600}}>
            Sent.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            They&apos;ll see it on their end.
          </Typography>
        </Box>
      );
    }

    if (phase === STATE.SENT_DECLINE) {
      return (
        <Box
          data-testid="icebreaker-declined"
          sx={{py: 4, textAlign: 'center'}}
          role="status"
          aria-live="polite"
        >
          <Typography variant="subtitle1" sx={{fontWeight: 600}}>
            Declined.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            We&apos;ll learn from this for next time.
          </Typography>
        </Box>
      );
    }

    if (phase === STATE.PEER_DISMISSED) {
      return (
        <Box
          data-testid="icebreaker-peer-dismissed"
          sx={{py: 4, textAlign: 'center'}}
          role="status"
          aria-live="polite"
        >
          <Typography variant="subtitle1" sx={{fontWeight: 600}}>
            {peerLine || 'They acted first.'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Closing…
          </Typography>
        </Box>
      );
    }

    if (phase === STATE.ERROR) {
      return (
        <Box
          data-testid="icebreaker-error"
          sx={{py: 3, display: 'flex', flexDirection: 'column', gap: 2}}
        >
          <Alert severity="error" sx={{borderRadius: RADIUS.sm}}>
            {errorMsg || 'Something went wrong.'}
          </Alert>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={onClose} data-testid="icebreaker-error-close">
              Close
            </Button>
            <Button
              variant="contained"
              onClick={handleRetry}
              data-testid="icebreaker-error-retry"
            >
              Retry
            </Button>
          </Stack>
        </Box>
      );
    }

    if (phase === STATE.DECLINING) {
      return (
        <Box data-testid="icebreaker-declining" sx={{py: 1}}>
          <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
            Why are you skipping this one?  We&apos;ll keep it private.
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{flexWrap: 'wrap'}}
            role="group"
            aria-label="Decline reason"
          >
            {ENCOUNTER_DECLINE_REASONS.map((reason) => (
              <Chip
                key={reason}
                label={reason}
                onClick={() => handleSelectDeclineReason(reason)}
                clickable
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelectDeclineReason(reason);
                  }
                }}
                data-testid={`icebreaker-decline-${reason
                  .toLowerCase()
                  .replace(/\s+/g, '-')}`}
                sx={{borderRadius: RADIUS.pill, mb: 1}}
              />
            ))}
          </Stack>
        </Box>
      );
    }

    // READY or SENDING — main editable form.
    return (
      <Box data-testid="icebreaker-ready" sx={{position: 'relative', py: 1}}>
        {phase === STATE.SENDING && (
          <Box
            data-testid="icebreaker-sending"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'rgba(0,0,0,0.35)',
              zIndex: 1,
              borderRadius: RADIUS.sm,
            }}
          >
            <CircularProgress size={28} />
          </Box>
        )}

        {rationale && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{display: 'block', mb: 2}}
            data-testid="icebreaker-rationale"
          >
            {rationale}
          </Typography>
        )}

        <RadioGroup
          aria-label="Pick a draft to edit"
          value={String(selectedIdx)}
          onChange={(e) => handleSelectDraft(Number(e.target.value))}
          sx={{mb: 2}}
        >
          {drafts.map((d, idx) => (
            <FormControlLabel
              key={idx}
              value={String(idx)}
              control={<Radio size="small" />}
              label={
                <Typography
                  variant="body2"
                  sx={{
                    color: idx === selectedIdx ? 'text.primary' : 'text.secondary',
                  }}
                >
                  {d}
                </Typography>
              }
              sx={{
                alignItems: 'flex-start',
                mr: 0,
                mb: 1,
                '& .MuiFormControlLabel-label': {pt: 0.25},
              }}
              data-testid={`icebreaker-draft-option-${idx}`}
            />
          ))}
        </RadioGroup>

        <TextField
          multiline
          minRows={3}
          maxRows={6}
          fullWidth
          value={editedText}
          onChange={(e) => setEditedText(e.target.value)}
          inputProps={{
            'aria-label': 'Edit your icebreaker text',
            'data-testid': 'icebreaker-text-input',
          }}
          sx={{mb: 1}}
        />
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="space-between"
          sx={{flexWrap: 'wrap', gap: 1}}
        >
          <Typography
            variant="caption"
            sx={{color: counterColor}}
            data-testid="icebreaker-char-count"
            aria-live="polite"
          >
            {charCount} / {ENCOUNTER_DRAFT_MAX_CHARS}
          </Typography>
          <ExpiryCountdown issuedAt={issuedAt} />
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{display: 'block', mt: 2, fontStyle: 'italic'}}
        >
          AI drafts. You decide. Always.
        </Typography>
      </Box>
    );
  }

  // ── Title + footer (shared) ──────────────────────────────────────
  const titleNode = (
    <Stack
      direction="row"
      alignItems="flex-start"
      justifyContent="space-between"
      spacing={1}
    >
      <Box sx={{flex: 1, minWidth: 0}}>
        <Typography variant="h6" sx={{fontWeight: 600, lineHeight: 1.3}}>
          Your icebreaker — review before sending
        </Typography>
      </Box>
      <IconButton
        onClick={onClose}
        size="small"
        aria-label="Close icebreaker draft"
        data-testid="icebreaker-close"
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Stack>
  );

  const showActions =
    phase === STATE.READY || phase === STATE.SENDING;
  const actionsNode = showActions ? (
    <Stack
      direction="row"
      spacing={1}
      sx={{px: 2, py: 1.5, justifyContent: 'space-between'}}
    >
      <Button
        onClick={handleOpenDecline}
        disabled={phase === STATE.SENDING}
        data-testid="icebreaker-decline-open"
      >
        Decline
      </Button>
      <Button
        ref={sendButtonRef}
        onClick={handleSend}
        disabled={sendDisabled}
        variant="contained"
        startIcon={<SendIcon />}
        data-testid="icebreaker-send"
        sx={{
          background: ENCOUNTER_BRAND_EMERALD,
          color: '#000',
          '&:hover': {background: ENCOUNTER_BRAND_EMERALD, opacity: 0.9},
          '&.Mui-disabled': {
            background: theme.palette.action.disabledBackground,
            color: theme.palette.action.disabled,
          },
        }}
      >
        Send
      </Button>
    </Stack>
  ) : null;

  // ── Render: SwipeableDrawer (mobile) or Dialog (desktop) ─────────
  if (isNarrow) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open={open && !!match}
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        keepMounted={false}
        data-testid="icebreaker-drawer"
        PaperProps={{
          sx: {
            borderTopLeftRadius: RADIUS.lg,
            borderTopRightRadius: RADIUS.lg,
            p: 2,
          },
        }}
      >
        <Box sx={{mb: 1}}>{titleNode}</Box>
        <Box>{renderBody()}</Box>
        {actionsNode}
      </SwipeableDrawer>
    );
  }

  return (
    <Dialog
      open={open && !!match}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="icebreaker-dialog"
      aria-labelledby="icebreaker-title"
      PaperProps={{sx: {borderRadius: RADIUS.lg}}}
    >
      <DialogTitle id="icebreaker-title" sx={{pb: 0.5}}>
        {titleNode}
      </DialogTitle>
      <DialogContent dividers>{renderBody()}</DialogContent>
      {actionsNode && <DialogActions>{actionsNode}</DialogActions>}
    </Dialog>
  );
}
