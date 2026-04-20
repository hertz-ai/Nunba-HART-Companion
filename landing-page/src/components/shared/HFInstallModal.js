/**
 * HFInstallModal — Liquid-UI install rejection modal.
 *
 * Replaces raw `alert()` for 4 error codes emitted by
 * /api/admin/models/hub/install:
 *
 *   invalid_hf_id         (400)  — homoglyph / non-ASCII ID
 *   unverified_org        (403)  — org not on trusted list, offers override
 *   unsafe_weights_format (415)  — pickle/.bin, deep-links to safetensors search
 *   hf_timeout            (504)  — renders inline banner with exponential retry
 *
 * Palette (from theme/socialTokens.js):
 *   #0F0E17  base background
 *   #6C63FF  primary accent
 *   #FF6B6B  danger accent
 *
 * Accessibility:
 *   role="alertdialog", aria-labelledby, aria-describedby
 *   focus-trapped (Tab cycles within modal)
 *   ESC closes
 *   confirm button receives focus on open (:focus-visible)
 *   respects prefers-reduced-motion (no fade/slide if set)
 *
 * Scope: lives under src/components/shared/ so other admin pages may reuse.
 * NO external dependencies beyond React + socialTokens (keeps admin page
 * bundle lean — admin page is not MUI-based).
 */
import {RADIUS, SHADOWS, EASINGS, DURATIONS} from '../../theme/socialTokens';

import React, {useEffect, useRef, useCallback, useState} from 'react';

const BG = '#0F0E17';
const SURFACE = '#1a1830';
const PRIMARY = '#6C63FF';
const DANGER = '#FF6B6B';
const WARNING = '#FFAB00';
const TEXT = '#ffffff';
const TEXT_MUTED = '#8899aa';
const BORDER = 'rgba(108, 99, 255, 0.25)';

const prefersReducedMotion = () => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Icons — inline SVG so no icon-lib dependency.
const WarningIcon = ({color = WARNING, size = 40}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const ShieldIcon = ({color = DANGER, size = 40}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <line x1="9" y1="12" x2="15" y2="12" />
  </svg>
);

const ErrorIcon = ({color = DANGER, size = 40}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

// ── Focus trap helper ────────────────────────────────────────────────────────
function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active || !containerRef.current) return undefined;
    const container = containerRef.current;
    const selector =
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(container.querySelectorAll(selector)).filter(
        (n) => !n.hasAttribute('data-trap-skip')
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };

    container.addEventListener('keydown', onKey);
    return () => container.removeEventListener('keydown', onKey);
  }, [containerRef, active]);
}

// ── Modal shell ──────────────────────────────────────────────────────────────
function ModalShell({
  children,
  onClose,
  labelId,
  descId,
  initialFocusRef,
}) {
  const containerRef = useRef(null);
  const reducedMotion = prefersReducedMotion();

  useFocusTrap(containerRef, true);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (containerRef.current) {
      containerRef.current.focus();
    }
    // Lock page scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused && previouslyFocused.focus) {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [initialFocusRef]);

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 14, 23, 0.72)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 16,
    animation: reducedMotion
      ? 'none'
      : `hfFade ${DURATIONS.fast}ms ${EASINGS.smooth}`,
  };

  const dialogStyle = {
    background: BG,
    color: TEXT,
    border: `1px solid ${BORDER}`,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOWS.float,
    width: '100%',
    maxWidth: 520,
    padding: 24,
    outline: 'none',
    animation: reducedMotion
      ? 'none'
      : `hfLift ${DURATIONS.normal}ms ${EASINGS.smooth}`,
  };

  return (
    <div
      style={overlayStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{`
        @keyframes hfFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes hfLift { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hfFade { from { opacity: 1; } to { opacity: 1; } }
          @keyframes hfLift { from { opacity: 1; transform: none; } to { opacity: 1; transform: none; } }
        }
      `}</style>
      <div
        ref={containerRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        tabIndex={-1}
        style={dialogStyle}
      >
        {children}
      </div>
    </div>
  );
}

// ── Button primitive ─────────────────────────────────────────────────────────
const btn = (color, {disabled, primary} = {}) => ({
  padding: '10px 18px',
  borderRadius: RADIUS.sm,
  border: primary ? 'none' : `1px solid ${BORDER}`,
  background: disabled ? '#3a3852' : primary ? color : 'transparent',
  color: disabled ? '#777' : primary ? '#fff' : color,
  fontWeight: 600,
  fontSize: 14,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1,
  transition: `background ${DURATIONS.fast}ms ${EASINGS.smooth}, transform ${DURATIONS.instant}ms ${EASINGS.snappy}`,
});

// ── UnverifiedOrgModal (403) ─────────────────────────────────────────────────
function UnverifiedOrgModal({hfId, publisher, reason, onConfirm, onClose}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const confirmRef = useRef(null);
  const checkboxRef = useRef(null);
  const labelId = 'hf-modal-unverified-label';
  const descId = 'hf-modal-unverified-desc';

  return (
    <ModalShell
      onClose={onClose}
      labelId={labelId}
      descId={descId}
      initialFocusRef={checkboxRef}
    >
      <div style={{display: 'flex', gap: 16, alignItems: 'flex-start'}}>
        <WarningIcon />
        <div style={{flex: 1, minWidth: 0}}>
          <h2
            id={labelId}
            style={{margin: 0, fontSize: 18, color: TEXT, fontWeight: 700}}
          >
            Unverified publisher
          </h2>
          <p
            id={descId}
            style={{margin: '8px 0 0', color: TEXT_MUTED, fontSize: 14, lineHeight: 1.5}}
          >
            <strong style={{color: TEXT}}>{publisher || hfId}</strong> is not on
            the trusted-publisher list.
            {reason ? ` ${reason}` : ''} Installing models from unverified
            sources means you are trusting arbitrary code and weights — only
            proceed if you know this publisher.
          </p>
        </div>
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginTop: 20,
          padding: 12,
          background: SURFACE,
          borderRadius: RADIUS.sm,
          border: `1px solid ${BORDER}`,
          cursor: 'pointer',
        }}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          aria-describedby={descId}
          style={{marginTop: 3, accentColor: PRIMARY}}
        />
        <span style={{color: TEXT, fontSize: 13, lineHeight: 1.5}}>
          I understand the risk and want to install <code>{hfId}</code> anyway.
        </span>
      </label>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 20,
        }}
      >
        <button type="button" onClick={onClose} style={btn(TEXT_MUTED)}>
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          disabled={!acknowledged}
          onClick={() => acknowledged && onConfirm({confirm_unverified: true})}
          style={btn(WARNING, {disabled: !acknowledged, primary: true})}
          aria-disabled={!acknowledged}
        >
          Install anyway
        </button>
      </div>
    </ModalShell>
  );
}

// ── UnsafeWeightsModal (415) ─────────────────────────────────────────────────
function UnsafeWeightsModal({hfId, onFindSafetensors, onClose}) {
  const ctaRef = useRef(null);
  const labelId = 'hf-modal-unsafe-label';
  const descId = 'hf-modal-unsafe-desc';

  return (
    <ModalShell
      onClose={onClose}
      labelId={labelId}
      descId={descId}
      initialFocusRef={ctaRef}
    >
      <div style={{display: 'flex', gap: 16, alignItems: 'flex-start'}}>
        <ShieldIcon />
        <div style={{flex: 1, minWidth: 0}}>
          <h2
            id={labelId}
            style={{margin: 0, fontSize: 18, color: TEXT, fontWeight: 700}}
          >
            Unsafe weight format
          </h2>
          <p
            id={descId}
            style={{margin: '8px 0 0', color: TEXT_MUTED, fontSize: 14, lineHeight: 1.5}}
          >
            <strong style={{color: TEXT}}>{hfId}</strong> ships weights as{' '}
            <code>pickle</code> / <code>.bin</code>. These formats can execute
            arbitrary code on load. We only allow <code>safetensors</code>{' '}
            weights.
          </p>
          <p style={{margin: '8px 0 0', color: TEXT_MUTED, fontSize: 13}}>
            No override is available — pick a safetensors variant instead.
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 20,
        }}
      >
        <button type="button" onClick={onClose} style={btn(TEXT_MUTED)}>
          Cancel
        </button>
        <button
          ref={ctaRef}
          type="button"
          onClick={() => onFindSafetensors(hfId)}
          style={btn(PRIMARY, {primary: true})}
        >
          Find safetensors variant
        </button>
      </div>
    </ModalShell>
  );
}

// ── InvalidIdModal (400 homoglyph) ───────────────────────────────────────────
function InvalidIdModal({hfId, reason, onClose}) {
  const closeRef = useRef(null);
  const labelId = 'hf-modal-invalid-label';
  const descId = 'hf-modal-invalid-desc';

  return (
    <ModalShell
      onClose={onClose}
      labelId={labelId}
      descId={descId}
      initialFocusRef={closeRef}
    >
      <div style={{display: 'flex', gap: 16, alignItems: 'flex-start'}}>
        <ErrorIcon />
        <div style={{flex: 1, minWidth: 0}}>
          <h2
            id={labelId}
            style={{margin: 0, fontSize: 18, color: TEXT, fontWeight: 700}}
          >
            Invalid model ID
          </h2>
          <p
            id={descId}
            style={{margin: '8px 0 0', color: TEXT_MUTED, fontSize: 14, lineHeight: 1.5}}
          >
            <code style={{color: TEXT, wordBreak: 'break-all'}}>{hfId}</code>{' '}
            contains non-ASCII characters (possible homoglyph impersonation).
            {reason ? ` ${reason}` : ''} This ID is blocked for safety and
            cannot be installed.
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 20,
        }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          style={btn(PRIMARY, {primary: true})}
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
}

// ── TimeoutBanner (504) — inline, not modal ──────────────────────────────────
const RETRY_DELAYS = [5, 15, 45]; // seconds — exponential backoff, 3 max

function TimeoutBanner({hfId, attempt, onRetry, onDismiss}) {
  const delay = RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
  const [remaining, setRemaining] = useState(delay);
  const [autoArm, setAutoArm] = useState(true);
  const reducedMotion = prefersReducedMotion();
  const maxedOut = attempt >= RETRY_DELAYS.length;

  useEffect(() => {
    if (maxedOut || !autoArm) return undefined;
    setRemaining(delay);
    const id = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [delay, autoArm, maxedOut]);

  const bannerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    marginBottom: 10,
    borderRadius: RADIUS.sm,
    background: 'rgba(255, 171, 0, 0.08)',
    border: `1px solid ${WARNING}`,
    color: TEXT,
    fontSize: 13,
  };

  return (
    <div role="alert" aria-live="polite" style={bannerStyle}>
      <WarningIcon color={WARNING} size={20} />
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontWeight: 600}}>
          HuggingFace Hub timeout
          {!maxedOut && (
            <span
              style={{color: TEXT_MUTED, fontWeight: 400, marginLeft: 6}}
            >
              · attempt {attempt + 1} of {RETRY_DELAYS.length}
            </span>
          )}
        </div>
        <div style={{color: TEXT_MUTED, fontSize: 12, marginTop: 2}}>
          <code>{hfId}</code>{' '}
          {maxedOut
            ? '— retries exhausted. Check your network and try again later.'
            : autoArm
              ? `— retry armed in ${remaining}s`
              : '— retry paused'}
        </div>
      </div>
      {!maxedOut && (
        <>
          <button
            type="button"
            onClick={() => setAutoArm((a) => !a)}
            style={{
              ...btn(TEXT_MUTED),
              padding: '6px 12px',
              fontSize: 12,
            }}
            aria-pressed={!autoArm}
          >
            {autoArm ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            onClick={() => onRetry(attempt + 1)}
            disabled={remaining > 0 && autoArm}
            style={{
              ...btn(PRIMARY, {
                primary: true,
                disabled: remaining > 0 && autoArm,
              }),
              padding: '6px 12px',
              fontSize: 12,
              animation:
                reducedMotion || remaining > 0
                  ? 'none'
                  : `hfFade ${DURATIONS.fast}ms ${EASINGS.smooth}`,
            }}
          >
            Retry now
          </button>
        </>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss timeout banner"
        style={{
          ...btn(TEXT_MUTED),
          padding: '6px 10px',
          fontSize: 12,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
/**
 * @param {{
 *   error: { code: string, hf_id: string, publisher?: string, reason?: string } | null,
 *   onConfirmUnverified: (hfId: string, body: object) => void,
 *   onFindSafetensors: (hfId: string) => void,
 *   onRetryTimeout: (hfId: string, attempt: number) => void,
 *   onDismiss: () => void,
 *   timeoutAttempt?: number,
 * }} props
 */
export default function HFInstallModal({
  error,
  onConfirmUnverified,
  onFindSafetensors,
  onRetryTimeout,
  onDismiss,
  timeoutAttempt = 0,
}) {
  const handleConfirmUnverified = useCallback(
    (body) => onConfirmUnverified(error?.hf_id, body),
    [error, onConfirmUnverified]
  );

  if (!error) return null;

  switch (error.code) {
    case 'unverified_org':
      return (
        <UnverifiedOrgModal
          hfId={error.hf_id}
          publisher={error.publisher}
          reason={error.reason}
          onConfirm={handleConfirmUnverified}
          onClose={onDismiss}
        />
      );
    case 'unsafe_weights_format':
      return (
        <UnsafeWeightsModal
          hfId={error.hf_id}
          onFindSafetensors={onFindSafetensors}
          onClose={onDismiss}
        />
      );
    case 'invalid_hf_id':
      return (
        <InvalidIdModal
          hfId={error.hf_id}
          reason={error.reason}
          onClose={onDismiss}
        />
      );
    case 'hf_timeout':
      // Rendered inline by the caller via <HFInstallModal.TimeoutBanner ... />
      return (
        <TimeoutBanner
          hfId={error.hf_id}
          attempt={timeoutAttempt}
          onRetry={(next) => onRetryTimeout(error.hf_id, next)}
          onDismiss={onDismiss}
        />
      );
    default:
      return null;
  }
}

HFInstallModal.TimeoutBanner = TimeoutBanner;
