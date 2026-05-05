/**
 * PrivacySettingsPage.jsx — F3 GREENLIT (master-orchestrator aa3ead1,
 * post-prereq f05a396).
 *
 * UserConsent UI for the `cloud_capability` scope.  Lets the user
 * grant/revoke per-capability consent that the server uses to gate
 * cloud-side processing (e.g. encounter_icebreaker drafting via a
 * central-topology LLM).
 *
 * Backend chain (verified, do NOT re-verify):
 *   POST /api/social/consent          — APPEND a new row.  See
 *     HARTOS integrations/social/consent_api.py:117 (grant_consent).
 *     Re-grant after revoke creates a NEW row; revoked rows are
 *     PRESERVED in the audit trail.
 *   POST /api/social/consent/revoke   — set revoked_at on the
 *     most-recent active row; granted_at is NEVER rewritten.  See
 *     consent_api.py:173 (revoke_consent).
 *   GET  /api/social/consent          — newest-first list.  Filters:
 *     consent_type, active_only.  See consent_api.py:231 (list_consents).
 *
 * DRY guard (orchestrator-flagged):
 *   This UI MUST consume `/api/social/consent` ONLY.  The legacy
 *   `/api/consent/<user_id>/*` surface in consent_service.py is
 *   UPSERT semantics + a 5-item CONSENT_TYPES allowlist that DOES
 *   NOT include 'cloud_capability'.  Calling it would corrupt the
 *   audit trail.
 *
 * Mission anchors (orchestrator-mandated):
 *   1) Append-only history visible — the audit panel renders all rows
 *      newest-first; we never suggest revoke "deletes" anything.
 *   2) Re-grant creates a NEW row — after every grant/revoke we
 *      refetch the list so the visible audit count grows.
 *   3) Defensive consent dialog — Grant button is gated behind an
 *      "I understand" checkbox AND, for scopes flagged
 *      requires_age_18 (encounter_icebreaker), an additional 18+
 *      checkbox.  Defense-in-depth at the UI; server is still the
 *      authority on every invariant.
 *   4) Privacy-first copy — "Drafts run locally without it" framing
 *      makes consent feel opt-in by default.
 */
/* eslint-disable no-unused-vars */
import {
  CLOUD_CAPABILITY_TYPE,
  CLOUD_CAPABILITY_SCOPES,
  GRANTABLE_SCOPES,
  formatScopeLabel,
  formatScopeDescription,
  scopeRequiresAgeClaim,
} from './cloudCapabilityScopes';

import {consentApi} from '../../../services/socialApi';

import {
  CloudOff,
  Cloud,
  CheckCircleOutline,
  HighlightOff,
  ExpandMore,
  ExpandLess,
  History,
} from '@mui/icons-material';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Checkbox,
  FormControlLabel,
  Tooltip,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Stack,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect, useCallback, useMemo} from 'react';

const glass = {
  bgcolor: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 2,
};

const STATUS_COLORS = {
  // emerald = active; muted = revoked. Matches accessibility-reviewer gate
  // (status pill announceable + visually distinct).
  active: {
    bg: 'rgba(46,204,113,0.18)',
    border: 'rgba(46,204,113,0.55)',
    fg: '#2ECC71',
  },
  revoked: {
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.18)',
    fg: 'rgba(255,255,255,0.55)',
  },
};

function isActive(row) {
  return Boolean(row && row.granted && !row.revoked_at);
}

function formatRelative(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const now = Date.now();
  const sec = Math.floor((now - t) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatAbsolute(iso) {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  return t.toLocaleString();
}

function truncateId(id) {
  if (!id) return '';
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…`;
}

// ── Dialog: Grant ────────────────────────────────────────────────────────
function GrantDialog({open, scope, onClose, onConfirm, busy}) {
  const requiresAge = scopeRequiresAgeClaim(scope);
  const [understood, setUnderstood] = useState(false);
  const [age18, setAge18] = useState(false);

  // Reset on every open — never persist across mounts (matches
  // DiscoverableTogglePanel mission anchor 1).
  useEffect(() => {
    if (open) {
      setUnderstood(false);
      setAge18(false);
    }
  }, [open]);

  const canGrant = understood && (!requiresAge || age18) && !busy;

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="grant-consent-title"
    >
      <DialogTitle id="grant-consent-title" sx={{fontWeight: 600}}>
        Cloud capability — confirm
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{mb: 1.5}}>
          <strong>{formatScopeLabel(scope)}</strong>
        </DialogContentText>
        <DialogContentText sx={{mb: 2}}>
          {formatScopeDescription(scope)}
        </DialogContentText>
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                inputProps={{
                  'aria-required': 'true',
                  'data-testid': 'grant-understand-checkbox',
                }}
              />
            }
            label="I understand that granting this consent enables cloud-side processing for this feature."
          />
          {requiresAge && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={age18}
                  onChange={(e) => setAge18(e.target.checked)}
                  inputProps={{
                    'aria-required': 'true',
                    'data-testid': 'grant-age18-checkbox',
                  }}
                />
              }
              label="I confirm I am 18 or older."
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2}}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!canGrant}
          variant="contained"
          data-testid="grant-confirm-button"
          startIcon={busy ? <CircularProgress size={16} /> : <Cloud />}
          sx={{
            bgcolor: '#6C63FF',
            '&:hover': {bgcolor: '#5A52E0'},
          }}
        >
          Grant consent
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Dialog: Revoke ───────────────────────────────────────────────────────
function RevokeDialog({open, scope, onClose, onConfirm, busy}) {
  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="revoke-consent-title"
    >
      <DialogTitle id="revoke-consent-title" sx={{fontWeight: 600}}>
        Revoke cloud capability
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{mb: 1.5}}>
          <strong>{formatScopeLabel(scope)}</strong>
        </DialogContentText>
        <DialogContentText>
          This will disable {formatScopeLabel(scope).toLowerCase()} immediately.
          You can re-grant later, but the original consent stays in your audit
          history.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{px: 3, pb: 2}}>
        <Button onClick={onClose} disabled={busy} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={busy}
          variant="contained"
          color="error"
          data-testid="revoke-confirm-button"
          startIcon={busy ? <CircularProgress size={16} /> : <CloudOff />}
        >
          Revoke
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Status Pill ──────────────────────────────────────────────────────────
function StatusPill({active}) {
  const colors = active ? STATUS_COLORS.active : STATUS_COLORS.revoked;
  return (
    <Box
      role="status"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: '9999px',
        fontSize: 11,
        fontWeight: 600,
        bgcolor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        minWidth: 60,
        justifyContent: 'center',
      }}
    >
      {active ? (
        <CheckCircleOutline sx={{fontSize: 13}} aria-hidden="true" />
      ) : (
        <HighlightOff sx={{fontSize: 13}} aria-hidden="true" />
      )}
      {active ? 'Active' : 'Revoked'}
    </Box>
  );
}

// ── Per-Scope Row ────────────────────────────────────────────────────────
function ScopeRow({scope, activeRow, onGrant, onRevoke}) {
  const active = isActive(activeRow);
  return (
    <Box
      data-testid={`scope-row-${scope}`}
      sx={{
        display: 'flex',
        flexDirection: {xs: 'column', sm: 'row'},
        alignItems: {xs: 'flex-start', sm: 'center'},
        justifyContent: 'space-between',
        gap: 1.5,
        py: 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        '&:last-child': {borderBottom: 'none'},
      }}
    >
      <Box sx={{flex: 1, minWidth: 0}}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography
            variant="body1"
            sx={{color: '#fff', fontWeight: 500, mr: 1}}
          >
            {formatScopeLabel(scope)}
          </Typography>
          <StatusPill active={active} />
        </Box>
        <Typography
          variant="caption"
          sx={{color: 'rgba(255,255,255,0.55)', display: 'block', mt: 0.5}}
        >
          {formatScopeDescription(scope)}
        </Typography>
        {activeRow && (
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255,255,255,0.4)',
              display: 'block',
              mt: 0.5,
            }}
          >
            <Tooltip title={formatAbsolute(activeRow.granted_at)}>
              <span>Granted {formatRelative(activeRow.granted_at)}</span>
            </Tooltip>
            {activeRow.revoked_at && (
              <Tooltip title={formatAbsolute(activeRow.revoked_at)}>
                <span>
                  {' · revoked '}
                  {formatRelative(activeRow.revoked_at)}
                </span>
              </Tooltip>
            )}
          </Typography>
        )}
      </Box>
      <Box>
        {active ? (
          <Button
            variant="outlined"
            color="error"
            size="small"
            onClick={() => onRevoke(scope)}
            data-testid={`revoke-btn-${scope}`}
            startIcon={<CloudOff />}
          >
            Revoke
          </Button>
        ) : (
          <Button
            variant="contained"
            size="small"
            onClick={() => onGrant(scope)}
            data-testid={`grant-btn-${scope}`}
            startIcon={<Cloud />}
            sx={{
              bgcolor: '#6C63FF',
              '&:hover': {bgcolor: '#5A52E0'},
            }}
          >
            Grant
          </Button>
        )}
      </Box>
    </Box>
  );
}

// ── Audit History ────────────────────────────────────────────────────────
function AuditHistory({rows, expanded, onToggle}) {
  return (
    <Paper sx={{...glass, p: 2.5, mt: 2}}>
      <Box
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
        aria-controls="audit-history-content"
        data-testid="audit-history-toggle"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          '&:hover': {opacity: 0.85},
        }}
      >
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
          <History sx={{color: 'rgba(255,255,255,0.6)', fontSize: 18}} />
          <Typography variant="subtitle2" sx={{color: '#fff', fontWeight: 600}}>
            Audit history
          </Typography>
          <Chip
            label={rows.length}
            size="small"
            sx={{
              ml: 0.5,
              bgcolor: 'rgba(108,99,255,0.2)',
              color: '#6C63FF',
              fontSize: 10,
              height: 18,
            }}
          />
        </Box>
        <IconButton size="small" sx={{color: 'rgba(255,255,255,0.5)'}}>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>
      <Collapse in={expanded} id="audit-history-content">
        <Box sx={{mt: 2, overflowX: 'auto'}}>
          {rows.length === 0 ? (
            <Typography
              variant="body2"
              sx={{color: 'rgba(255,255,255,0.5)', py: 1}}
            >
              No consent activity yet.
            </Typography>
          ) : (
            <Table size="small" data-testid="audit-history-table">
              <TableHead>
                <TableRow>
                  <TableCell scope="col" sx={{color: 'rgba(255,255,255,0.6)'}}>
                    Scope
                  </TableCell>
                  <TableCell scope="col" sx={{color: 'rgba(255,255,255,0.6)'}}>
                    Status
                  </TableCell>
                  <TableCell scope="col" sx={{color: 'rgba(255,255,255,0.6)'}}>
                    Granted
                  </TableCell>
                  <TableCell scope="col" sx={{color: 'rgba(255,255,255,0.6)'}}>
                    Revoked
                  </TableCell>
                  <TableCell scope="col" sx={{color: 'rgba(255,255,255,0.6)'}}>
                    ID
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => {
                  const active = isActive(r);
                  return (
                    <TableRow
                      key={r.id}
                      data-testid={`audit-row-${r.id}`}
                      sx={{
                        opacity: active ? 1 : 0.65,
                        '& td': {
                          color: '#fff',
                          borderColor: 'rgba(255,255,255,0.06)',
                        },
                      }}
                    >
                      <TableCell>{formatScopeLabel(r.scope)}</TableCell>
                      <TableCell>
                        <StatusPill active={active} />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={formatAbsolute(r.granted_at)}>
                          <span>{formatRelative(r.granted_at)}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        {r.revoked_at ? (
                          <Tooltip title={formatAbsolute(r.revoked_at)}>
                            <span>{formatRelative(r.revoked_at)}</span>
                          </Tooltip>
                        ) : (
                          <span style={{color: 'rgba(255,255,255,0.4)'}}>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Tooltip title={r.id}>
                          <span style={{fontFamily: 'monospace', fontSize: 11}}>
                            {truncateId(r.id)}
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────
export default function PrivacySettingsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [snack, setSnack] = useState(null); // {severity, message, retry?}
  const [auditExpanded, setAuditExpanded] = useState(false);

  // Dialog state
  const [grantDialog, setGrantDialog] = useState(null); // scope | null
  const [revokeDialog, setRevokeDialog] = useState(null); // scope | null
  const [actionBusy, setActionBusy] = useState(false);

  const fetchList = useCallback(
    async ({preserveOnError = false} = {}) => {
      setLoading(true);
      setError(null);
      try {
        const res = await consentApi.list({
          consent_type: CLOUD_CAPABILITY_TYPE,
        });
        const data = res?.data?.data || res?.data || {};
        const consents = Array.isArray(data.consents) ? data.consents : [];
        setRows(consents);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401) {
          // Auth interceptor (axiosFactory) already handles redirect; we
          // just stop showing a stale list.
          if (!preserveOnError) setRows([]);
          setError('You need to sign in to manage consents.');
        } else {
          // Preserve last-known state for sre/graceful-degradation gate.
          setError('Could not load your consents.');
          setSnack({
            severity: 'error',
            message: 'Network error loading consents.',
            retry: true,
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // active row for a scope = first row in the newest-first list whose
  // granted=true AND revoked_at is null AND scope matches.
  const activeByScope = useMemo(() => {
    const out = {};
    for (const r of rows) {
      if (!isActive(r)) continue;
      if (out[r.scope]) continue; // first match wins (newest-first server order)
      out[r.scope] = r;
    }
    return out;
  }, [rows]);

  // The newest row per scope (active or revoked) — used to show the
  // "granted X · revoked Y" line for the per-scope row UI.
  const newestByScope = useMemo(() => {
    const out = {};
    for (const r of rows) {
      if (out[r.scope]) continue;
      out[r.scope] = r;
    }
    return out;
  }, [rows]);

  const handleGrantOpen = useCallback((scope) => {
    setGrantDialog(scope);
  }, []);

  const handleRevokeOpen = useCallback((scope) => {
    setRevokeDialog(scope);
  }, []);

  const handleGrantConfirm = useCallback(async () => {
    const scope = grantDialog;
    if (!scope) return;
    setActionBusy(true);
    try {
      await consentApi.grant({
        consent_type: CLOUD_CAPABILITY_TYPE,
        scope,
      });
      setSnack({
        severity: 'success',
        message: `Granted: ${formatScopeLabel(scope)}.`,
      });
      setGrantDialog(null);
      // Mission anchor 2 — refetch so the audit count grows.
      await fetchList();
    } catch (e) {
      setSnack({
        severity: 'error',
        message: 'Could not grant consent. Please retry.',
        retry: true,
      });
    } finally {
      setActionBusy(false);
    }
  }, [grantDialog, fetchList]);

  const handleRevokeConfirm = useCallback(async () => {
    const scope = revokeDialog;
    if (!scope) return;
    setActionBusy(true);
    try {
      await consentApi.revoke({
        consent_type: CLOUD_CAPABILITY_TYPE,
        scope,
      });
      setSnack({
        severity: 'success',
        message: `Revoked: ${formatScopeLabel(scope)}.`,
      });
      setRevokeDialog(null);
      await fetchList();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404) {
        // Defensive — UI usually doesn't show Revoke for inactive rows,
        // but stay graceful if the server says there's nothing to revoke.
        setSnack({
          severity: 'info',
          message: 'No active consent to revoke.',
        });
        setRevokeDialog(null);
        await fetchList();
      } else {
        setSnack({
          severity: 'error',
          message: 'Could not revoke consent. Please retry.',
          retry: true,
        });
      }
    } finally {
      setActionBusy(false);
    }
  }, [revokeDialog, fetchList]);

  const handleSnackClose = () => setSnack(null);
  const handleSnackRetry = async () => {
    setSnack(null);
    await fetchList({preserveOnError: true});
  };

  if (loading && rows.length === 0) {
    return (
      <Box sx={{p: 3, textAlign: 'center'}}>
        <CircularProgress size={24} sx={{color: '#6C63FF'}} />
      </Box>
    );
  }

  const hasAnyConsent = rows.length > 0;

  return (
    <Box sx={{maxWidth: 700, mx: 'auto', p: {xs: 2, md: 3}}}>
      <Typography variant="h5" sx={{color: '#fff', mb: 0.5, fontWeight: 600}}>
        Privacy & cloud capabilities
      </Typography>
      <Typography
        variant="body2"
        sx={{color: 'rgba(255,255,255,0.55)', mb: 3}}
      >
        Choose which features may use cloud-side processing. Granting opt-ins
        is per-capability and reversible — revoking does not erase the audit
        trail.
      </Typography>

      {error && !snack && (
        <Alert severity="warning" sx={{mb: 2}}>
          {error}
        </Alert>
      )}

      <Paper sx={{...glass, p: 2.5}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1.5}}>
          <Cloud sx={{color: '#6C63FF'}} />
          <Typography variant="subtitle1" sx={{color: '#fff', fontWeight: 600}}>
            Cloud capabilities
          </Typography>
        </Box>
        {!hasAnyConsent && (
          <Typography
            variant="body2"
            sx={{color: 'rgba(255,255,255,0.55)', mb: 1}}
            data-testid="empty-state-text"
          >
            No cloud capabilities granted. Some features (like icebreaker
            drafting at central nodes) require explicit consent. Grant them
            when you&apos;re ready.
          </Typography>
        )}
        <Box>
          {GRANTABLE_SCOPES.map((scope) => (
            <ScopeRow
              key={scope}
              scope={scope}
              activeRow={activeByScope[scope] || newestByScope[scope] || null}
              onGrant={handleGrantOpen}
              onRevoke={handleRevokeOpen}
            />
          ))}
        </Box>
      </Paper>

      <AuditHistory
        rows={rows}
        expanded={auditExpanded}
        onToggle={() => setAuditExpanded((v) => !v)}
      />

      <GrantDialog
        open={Boolean(grantDialog)}
        scope={grantDialog}
        onClose={() => setGrantDialog(null)}
        onConfirm={handleGrantConfirm}
        busy={actionBusy}
      />
      <RevokeDialog
        open={Boolean(revokeDialog)}
        scope={revokeDialog}
        onClose={() => setRevokeDialog(null)}
        onConfirm={handleRevokeConfirm}
        busy={actionBusy}
      />

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={snack?.severity === 'error' ? null : 4000}
        onClose={handleSnackClose}
        anchorOrigin={{vertical: 'bottom', horizontal: 'center'}}
      >
        {snack ? (
          <Alert
            severity={snack.severity}
            onClose={handleSnackClose}
            role="status"
            aria-live="polite"
            action={
              snack.retry ? (
                <Button
                  size="small"
                  onClick={handleSnackRetry}
                  sx={{color: '#fff'}}
                >
                  Retry
                </Button>
              ) : undefined
            }
            sx={{width: '100%'}}
          >
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
