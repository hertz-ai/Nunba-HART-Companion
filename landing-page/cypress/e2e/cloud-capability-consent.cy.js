/**
 * Cloud Capability Consent E2E (W0c F3)
 *
 * Backend: HARTOS integrations/social/consent_api.py (commit f05a396)
 * Surface: /social/settings/privacy → PrivacySettingsPage
 *
 * Full flow with mocked server (`cy.intercept`) — exercises the
 * append-only semantic at the UI level:
 *
 *   empty list
 *     -> grant encounter_icebreaker (I-understand + 18+)
 *     -> list shows 1 active row
 *     -> revoke
 *     -> list shows 1 revoked row
 *     -> re-grant
 *     -> list shows 2 rows (1 active + 1 revoked)
 *     -> audit history shows all 2 entries with timestamps
 *
 * No real network: all /api/social/consent traffic is intercepted.
 * Auth uses cy.socialAuth() so the access_token is set in localStorage
 * (the page imports an axios client that injects Bearer headers).
 */

describe('Cloud Capability Consent — F3 UI', () => {
  before(() => {
    cy.socialAuth();
  });

  beforeEach(() => {
    // Stage 1: empty list on initial load
    cy.intercept(
      'GET',
      '**/api/social/consent?consent_type=cloud_capability**',
      {
        statusCode: 200,
        body: {success: true, data: {consents: [], count: 0}},
      },
    ).as('listEmpty');
  });

  it('append-only flow: grant → revoke → re-grant produces 2 rows in audit', () => {
    cy.socialVisit('/social/settings/privacy');

    // ── Empty state ──
    cy.contains(/no cloud capabilities granted/i, {timeout: 30000}).should(
      'be.visible',
    );

    // ── Stage 2: grant encounter_icebreaker ──
    const newActiveRow = {
      id: 'row-active-1',
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      granted: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    };

    cy.intercept('POST', '**/api/social/consent', {
      statusCode: 201,
      body: {success: true, data: newActiveRow},
    }).as('grantApi');

    // Reload list to return 1 active row after grant
    cy.intercept(
      'GET',
      '**/api/social/consent?consent_type=cloud_capability**',
      {
        statusCode: 200,
        body: {
          success: true,
          data: {consents: [newActiveRow], count: 1},
        },
      },
    ).as('listAfterGrant');

    cy.get('[data-testid="grant-btn-encounter_icebreaker"]').click({
      force: true,
    });
    cy.get('[data-testid="grant-understand-checkbox"]').click({force: true});
    cy.get('[data-testid="grant-age18-checkbox"]').click({force: true});
    cy.get('[data-testid="grant-confirm-button"]')
      .should('not.be.disabled')
      .click({force: true});

    cy.wait('@grantApi').its('request.body').should((body) => {
      expect(body.consent_type).to.eq('cloud_capability');
      expect(body.scope).to.eq('encounter_icebreaker');
    });
    cy.wait('@listAfterGrant');

    // 1 active row now visible
    cy.get('[data-testid="revoke-btn-encounter_icebreaker"]', {
      timeout: 10000,
    }).should('be.visible');

    // ── Stage 3: revoke ──
    const revokedRow = {...newActiveRow, revoked_at: new Date().toISOString()};

    cy.intercept('POST', '**/api/social/consent/revoke', {
      statusCode: 200,
      body: {
        success: true,
        data: {id: revokedRow.id, revoked_at: revokedRow.revoked_at},
      },
    }).as('revokeApi');

    cy.intercept(
      'GET',
      '**/api/social/consent?consent_type=cloud_capability**',
      {
        statusCode: 200,
        body: {success: true, data: {consents: [revokedRow], count: 1}},
      },
    ).as('listAfterRevoke');

    cy.get('[data-testid="revoke-btn-encounter_icebreaker"]').click({
      force: true,
    });
    cy.get('[data-testid="revoke-confirm-button"]').click({force: true});
    cy.wait('@revokeApi');
    cy.wait('@listAfterRevoke');

    // Now Grant button is back (active row was revoked)
    cy.get('[data-testid="grant-btn-encounter_icebreaker"]', {
      timeout: 10000,
    }).should('be.visible');

    // ── Stage 4: re-grant — produces NEW row, old revoked row preserved ──
    const reGrantedRow = {
      id: 'row-active-2',
      consent_type: 'cloud_capability',
      scope: 'encounter_icebreaker',
      granted: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
    };

    cy.intercept('POST', '**/api/social/consent', {
      statusCode: 201,
      body: {success: true, data: reGrantedRow},
    }).as('regrantApi');

    cy.intercept(
      'GET',
      '**/api/social/consent?consent_type=cloud_capability**',
      {
        statusCode: 200,
        body: {
          success: true,
          data: {consents: [reGrantedRow, revokedRow], count: 2},
        },
      },
    ).as('listAfterRegrant');

    cy.get('[data-testid="grant-btn-encounter_icebreaker"]').click({
      force: true,
    });
    cy.get('[data-testid="grant-understand-checkbox"]').click({force: true});
    cy.get('[data-testid="grant-age18-checkbox"]').click({force: true});
    cy.get('[data-testid="grant-confirm-button"]').click({force: true});

    cy.wait('@regrantApi');
    cy.wait('@listAfterRegrant');

    // ── Stage 5: audit history shows BOTH rows ──
    cy.get('[data-testid="audit-history-toggle"]').click({force: true});
    cy.get(`[data-testid="audit-row-${reGrantedRow.id}"]`, {
      timeout: 10000,
    }).should('be.visible');
    cy.get(`[data-testid="audit-row-${revokedRow.id}"]`).should('be.visible');
  });
});
