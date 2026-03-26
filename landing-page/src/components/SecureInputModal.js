import {chatApi} from '../services/socialApi';

import React, {useState, useRef, useEffect} from 'react';

const SecureInputModal = ({secretRequest, onClose}) => {
  const [value, setValue] = useState('');
  const [consent, setConsent] = useState(false);
  const [storing, setStoring] = useState(false);
  const [stored, setStored] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const handleStore = async () => {
    if (!value.trim() || !consent) return;
    setStoring(true);
    setError(null);
    try {
      const result = await chatApi.vaultStore({
        key_type: secretRequest.type || 'tool_key',
        key_name: secretRequest.key_name,
        value: value.trim(),
        channel_type: secretRequest.channel_type || '',
      });
      if (result?.success) {
        setStored(true);
        setTimeout(onClose, 1200);
      } else {
        setError(result?.error || 'Failed to store key');
      }
    } catch (err) {
      setError(err?.message || 'Connection error');
    } finally {
      setStoring(false);
    }
  };

  if (!secretRequest) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.lockIcon}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6C63FF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <h3 style={styles.title}>
            {secretRequest.label || 'API Key Required'}
          </h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#888"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Key purpose disclosure */}
        <p style={styles.description}>{secretRequest.description}</p>
        <div style={styles.purposeBadge}>
          <span style={styles.purposeLabel}>Used by:</span>
          <span style={styles.purposeValue}>
            {secretRequest.used_by || 'Agent tool'}
          </span>
        </div>

        {/* Secure input */}
        <input
          ref={inputRef}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && consent && value.trim()) handleStore();
          }}
          placeholder={`Enter ${secretRequest.label || 'API key'}...`}
          style={styles.input}
          disabled={stored}
        />

        {/* Consent checkbox */}
        <label style={styles.consentRow}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={styles.checkbox}
            disabled={stored}
          />
          <span style={styles.consentText}>
            I understand this secret will be encrypted and stored on this device
          </span>
        </label>

        {/* Trust indicator */}
        <div style={styles.trustRow}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10B981"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span style={styles.trustText}>
            Encrypted with machine-locked Fernet. Never leaves this device.
          </span>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        {/* Actions */}
        <div style={styles.actions}>
          <button onClick={onClose} style={styles.cancelBtn} disabled={storing}>
            Cancel
          </button>
          <button
            onClick={handleStore}
            disabled={!consent || !value.trim() || storing || stored}
            style={{
              ...styles.storeBtn,
              opacity: !consent || !value.trim() || storing || stored ? 0.5 : 1,
            }}
          >
            {stored ? 'Stored' : storing ? 'Encrypting...' : 'Store Securely'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    backgroundColor: '#0F0E17',
    borderRadius: '16px',
    border: '1px solid #2A2A3E',
    padding: '28px',
    width: '100%',
    maxWidth: '440px',
    margin: '0 16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  lockIcon: {
    width: '40px',
    height: '40px',
    borderRadius: '10px',
    backgroundColor: 'rgba(108,99,255,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    color: '#EEEEF0',
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    flex: 1,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
  },
  description: {
    color: '#9B9BAD',
    fontSize: '14px',
    lineHeight: '1.5',
    margin: '0 0 12px',
  },
  purposeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: 'rgba(108,99,255,0.1)',
    border: '1px solid rgba(108,99,255,0.25)',
    borderRadius: '8px',
    padding: '6px 12px',
    marginBottom: '20px',
  },
  purposeLabel: {
    color: '#9B9BAD',
    fontSize: '12px',
  },
  purposeValue: {
    color: '#6C63FF',
    fontSize: '12px',
    fontWeight: 600,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    backgroundColor: '#1A1A2E',
    border: '1px solid #2A2A3E',
    borderRadius: '10px',
    color: '#EEEEF0',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '16px',
    fontFamily: 'monospace',
  },
  consentRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginBottom: '12px',
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: '2px',
    accentColor: '#6C63FF',
    width: '16px',
    height: '16px',
    flexShrink: 0,
  },
  consentText: {
    color: '#BBBBC8',
    fontSize: '13px',
    lineHeight: '1.4',
  },
  trustRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  trustText: {
    color: '#10B981',
    fontSize: '12px',
  },
  error: {
    color: '#EF4444',
    fontSize: '13px',
    marginBottom: '12px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
  },
  cancelBtn: {
    padding: '10px 20px',
    backgroundColor: 'transparent',
    border: '1px solid #2A2A3E',
    borderRadius: '10px',
    color: '#9B9BAD',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  storeBtn: {
    padding: '10px 24px',
    background: 'linear-gradient(135deg, #6C63FF, #5A52E0)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 600,
  },
};

export default SecureInputModal;
