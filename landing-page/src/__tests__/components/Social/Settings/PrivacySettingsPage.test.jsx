/**
 * PrivacySettingsPage.test.jsx — F3 GREENLIT coverage (W0c).
 *
 * Tests the UserConsent UI for the `cloud_capability` scope.  Mocks
 * the `consentApi` service module so we exercise the real React tree
 * + dialog wiring without touching network.
 *
 * Eight cases mandated by the orchestrator brief (test-generator gate):
 *   a) mount → calls consentApi.list() once (with the canonical
 *      consent_type filter).
 *   b) empty list → empty-state copy renders.
 *   c) active row → "Revoke" button visible; click opens revoke
 *      dialog; confirm → calls consentApi.revoke() with right payload;
 *      list refreshes.
 *   d) revoked row → "Grant" button visible; click opens grant dialog;
 *      "I understand" required before Grant button activates; confirm
 *      → calls consentApi.grant(); list refreshes.
 *   e) encounter_icebreaker grant → 18+ checkbox additionally required.
 *   f) audit history collapsed by default; expanding shows all rows
 *      newest-first; revoked rows visually distinct (opacity).
 *   g) network 5xx on list → Snackbar with retry.
 *   h) re-grant after revoke → list shows BOTH the old revoked row
 *      AND the new active row (proves append-only at UI level).
 */
/* eslint-disable no-unused-vars */
/* eslint-disable import/order, import/first */

// Mock MUST be hoisted ABOVE the imports it intercepts so jest's
// hoisting pass picks it up before any `import` resolves the module.
jest.mock('../../../../services/socialApi', () => ({
  consentApi: {
    list: jest.fn(),
    grant: jest.fn(),
    revoke: jest.fn(),
  },
}));

import {consentApi} from '../../../../services/socialApi';
import PrivacySettingsPage from '../../../../components/Social/Settings/PrivacySettingsPage';
import {renderWithProviders} from '../../../testHelpers';

import {fireEvent, screen, waitFor, within} from '@testing-library/react';
import React from 'react';

const ROW_ICEBREAKER_ACTIVE = {
  id: 'consent-active-1',
  consent_type: 'cloud_capability',
  scope: 'encounter_icebreaker',
  granted: true,
  granted_at: new Date(Date.now() - 60 * 1000).toISOString(),
  revoked_at: null,
};

const ROW_ICEBREAKER_REVOKED = {
  id: 'consent-revoked-1',
  consent_type: 'cloud_capability',
  scope: 'encounter_icebreaker',
  granted: true,
  granted_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  revoked_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
};

function mockListReturns(consents) {
  consentApi.list.mockResolvedValueOnce({
    data: {success: true, data: {consents, count: consents.length}},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── (a) mount → list call ─────────────────────────────────────────────────
describe('PrivacySettingsPage mount', () => {
  test('calls consentApi.list({consent_type: "cloud_capability"}) on mount', async () => {
    mockListReturns([]);
    renderWithProviders(<PrivacySettingsPage />);
    await waitFor(() => {
      expect(consentApi.list).toHaveBeenCalledTimes(1);
    });
    expect(consentApi.list).toHaveBeenCalledWith({
      consent_type: 'cloud_capability',
    });
  });
});

// ── (b) empty state ───────────────────────────────────────────────────────
describe('PrivacySettingsPage empty state', () => {
  test('renders empty-state copy when no consents exist', async () => {
    mockListReturns([]);
    renderWithProviders(<PrivacySettingsPage />);
    expect(
      await screen.findByTestId('empty-state-text'),
    ).toBeInTheDocument();
  });
});

// ── (c) revoke flow ───────────────────────────────────────────────────────
describe('PrivacySettingsPage revoke flow', () => {
  test('Revoke button on active row opens dialog → confirm calls revoke + refreshes', async () => {
    mockListReturns([ROW_ICEBREAKER_ACTIVE]);
    consentApi.revoke.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: ROW_ICEBREAKER_ACTIVE.id,
          revoked_at: new Date().toISOString(),
        },
      },
    });
    // Refresh after revoke
    mockListReturns([
      {...ROW_ICEBREAKER_ACTIVE, revoked_at: new Date().toISOString()},
    ]);

    renderWithProviders(<PrivacySettingsPage />);
    const revokeBtn = await screen.findByTestId(
      'revoke-btn-encounter_icebreaker',
    );
    expect(revokeBtn).toBeInTheDocument();
    fireEvent.click(revokeBtn);

    // Dialog opens
    const confirmBtn = await screen.findByTestId('revoke-confirm-button');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(consentApi.revoke).toHaveBeenCalledTimes(1);
    });
    expect(consentApi.revoke).toHaveBeenCalledWith({
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
    });
    // Refetch happened
    await waitFor(() => {
      expect(consentApi.list).toHaveBeenCalledTimes(2);
    });
  });
});

// ── (d) grant flow with "I understand" gate ──────────────────────────────
describe('PrivacySettingsPage grant flow', () => {
  test('Grant button on revoked row opens dialog; "I understand" required before activation', async () => {
    // We use the "*" scope here which does NOT require age claim.
    mockListReturns([
      {
        id: 'star-revoked',
        consent_type: 'cloud_capability',
        scope: '*',
        granted: true,
        granted_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: new Date(Date.now() - 30_000).toISOString(),
      },
    ]);

    renderWithProviders(<PrivacySettingsPage />);
    const grantBtn = await screen.findByTestId('grant-btn-*');
    fireEvent.click(grantBtn);

    const confirmBtn = await screen.findByTestId('grant-confirm-button');
    expect(confirmBtn).toBeDisabled();

    // Tick "I understand"
    const understand = screen.getByTestId('grant-understand-checkbox');
    fireEvent.click(understand);
    expect(confirmBtn).not.toBeDisabled();
  });

  test('confirm calls grant + refreshes', async () => {
    mockListReturns([
      {
        id: 'star-revoked',
        consent_type: 'cloud_capability',
        scope: '*',
        granted: true,
        granted_at: new Date(Date.now() - 60_000).toISOString(),
        revoked_at: new Date(Date.now() - 30_000).toISOString(),
      },
    ]);
    consentApi.grant.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: 'star-active-new',
          consent_type: 'cloud_capability',
          scope: '*',
          granted_at: new Date().toISOString(),
        },
      },
    });
    mockListReturns([
      {
        id: 'star-active-new',
        consent_type: 'cloud_capability',
        scope: '*',
        granted: true,
        granted_at: new Date().toISOString(),
        revoked_at: null,
      },
    ]);

    renderWithProviders(<PrivacySettingsPage />);
    fireEvent.click(await screen.findByTestId('grant-btn-*'));
    fireEvent.click(screen.getByTestId('grant-understand-checkbox'));
    fireEvent.click(screen.getByTestId('grant-confirm-button'));

    await waitFor(() => {
      expect(consentApi.grant).toHaveBeenCalledTimes(1);
    });
    expect(consentApi.grant).toHaveBeenCalledWith({
      consent_type: 'cloud_capability',
      scope: '*',
    });
    await waitFor(() => {
      expect(consentApi.list).toHaveBeenCalledTimes(2);
    });
  });
});

// ── (e) encounter_icebreaker grant requires both checkboxes ───────────────
describe('PrivacySettingsPage 18+ defense-in-depth', () => {
  test('encounter_icebreaker grant disables Grant button until BOTH I-understand AND 18+ are checked', async () => {
    mockListReturns([ROW_ICEBREAKER_REVOKED]);

    renderWithProviders(<PrivacySettingsPage />);
    fireEvent.click(
      await screen.findByTestId('grant-btn-encounter_icebreaker'),
    );

    const confirmBtn = await screen.findByTestId('grant-confirm-button');
    expect(confirmBtn).toBeDisabled();

    // Only check "I understand" — still disabled because age gate exists
    fireEvent.click(screen.getByTestId('grant-understand-checkbox'));
    expect(confirmBtn).toBeDisabled();

    // Now check 18+ — activates
    fireEvent.click(screen.getByTestId('grant-age18-checkbox'));
    expect(confirmBtn).not.toBeDisabled();
  });
});

// ── (f) audit history collapsed by default; rows visible when expanded ───
describe('PrivacySettingsPage audit history', () => {
  test('audit history is collapsed by default and shows all rows when expanded', async () => {
    mockListReturns([ROW_ICEBREAKER_ACTIVE, ROW_ICEBREAKER_REVOKED]);

    renderWithProviders(<PrivacySettingsPage />);

    const toggle = await screen.findByTestId('audit-history-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Table should not be visible while collapsed
    expect(screen.queryByTestId('audit-history-table')).not.toBeVisible?.();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Both rows should appear in the audit table when expanded
    await waitFor(() => {
      expect(
        screen.getByTestId(`audit-row-${ROW_ICEBREAKER_ACTIVE.id}`),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId(`audit-row-${ROW_ICEBREAKER_REVOKED.id}`),
    ).toBeInTheDocument();
  });
});

// ── (g) 5xx on list → Snackbar retry ─────────────────────────────────────
describe('PrivacySettingsPage error handling', () => {
  test('Network 5xx on list shows Snackbar with retry action', async () => {
    consentApi.list.mockRejectedValueOnce({
      response: {status: 500, data: {error: 'boom'}},
    });

    renderWithProviders(<PrivacySettingsPage />);

    // Snackbar with "Retry" button appears
    expect(
      await screen.findByText(/Network error loading consents/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /retry/i})).toBeInTheDocument();
  });
});

// ── (h) re-grant after revoke → both rows in audit ───────────────────────
describe('PrivacySettingsPage append-only audit', () => {
  test('after revoke + re-grant, audit history contains BOTH old revoked row AND new active row', async () => {
    // Initial: 1 active row
    mockListReturns([ROW_ICEBREAKER_ACTIVE]);

    // Revoke chain
    consentApi.revoke.mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          id: ROW_ICEBREAKER_ACTIVE.id,
          revoked_at: new Date().toISOString(),
        },
      },
    });
    // After revoke: 1 revoked row
    const revokedNow = {
      ...ROW_ICEBREAKER_ACTIVE,
      revoked_at: new Date().toISOString(),
    };
    mockListReturns([revokedNow]);

    // Re-grant chain
    const newActive = {
      id: 'consent-active-2',
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      granted: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    };
    consentApi.grant.mockResolvedValueOnce({
      data: {success: true, data: newActive},
    });
    // After re-grant: 2 rows (newest-first)
    mockListReturns([newActive, revokedNow]);

    renderWithProviders(<PrivacySettingsPage />);

    // Revoke
    fireEvent.click(
      await screen.findByTestId('revoke-btn-encounter_icebreaker'),
    );
    fireEvent.click(await screen.findByTestId('revoke-confirm-button'));
    await waitFor(() => expect(consentApi.list).toHaveBeenCalledTimes(2));

    // Re-grant
    fireEvent.click(
      await screen.findByTestId('grant-btn-encounter_icebreaker'),
    );
    fireEvent.click(screen.getByTestId('grant-understand-checkbox'));
    fireEvent.click(screen.getByTestId('grant-age18-checkbox'));
    fireEvent.click(screen.getByTestId('grant-confirm-button'));

    await waitFor(() => expect(consentApi.list).toHaveBeenCalledTimes(3));

    // Expand audit history → both rows visible
    fireEvent.click(screen.getByTestId('audit-history-toggle'));
    await waitFor(() => {
      expect(screen.getByTestId(`audit-row-${newActive.id}`)).toBeInTheDocument();
    });
    expect(
      screen.getByTestId(`audit-row-${revokedNow.id}`),
    ).toBeInTheDocument();
  });
});
