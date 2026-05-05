/**
 * Cypress E2E -- DiscoverableTogglePanel (F1 GREENLIT, master-orchestrator aa3ead1).
 *
 * Spec mounts the panel via /social/encounters and exercises:
 *   1. Initial GET returns disabled state, Switch is disabled, age-claim is unchecked.
 *   2. Click 18+ checkbox → Switch becomes enabled.
 *   3. Click Switch → POST /encounter/discoverable fires with {enabled: true,
 *      age_claim_18: true, ...}.
 *   4. GET returns enabled state with expires_at → countdown chip rendered.
 *   5. Click Switch off → POST fires with {enabled: false, ...}.
 *   6. 429-after-MAX path: server returns 429 → Snackbar appears.
 *
 * NOTE: We avoid asserting on specific text inside the countdown
 * (it changes by the second).  We assert that the countdown
 * chip data-testid is mounted instead.
 *
 * Backend chain — verified:
 *   GET  /api/social/encounter/discoverable
 *   POST /api/social/encounter/discoverable
 *
 * All fetches required by EncountersPage are stubbed so the page
 * mounts cleanly even without a backend.
 */

describe('DiscoverableTogglePanel — full toggle flow', () => {
  before(() => {
    cy.socialAuth();
  });

  beforeEach(() => {
    // Stub the sibling tab fetches so the page mounts without backend.
    cy.intercept('GET', '**/api/social/encounters', {
      statusCode: 200,
      body: {success: true, data: []},
    });
    cy.intercept('GET', '**/api/social/encounters/suggestions', {
      statusCode: 200,
      body: {success: true, data: []},
    });
    cy.intercept('GET', '**/api/social/encounters/bonds', {
      statusCode: 200,
      body: {success: true, data: []},
    });
    cy.intercept('GET', '**/api/social/encounters/nearby-now', {
      statusCode: 200,
      body: {success: true, data: {count: 0}},
    });
    cy.intercept('GET', '**/api/social/encounters/proximity-matches*', {
      statusCode: 200,
      body: {success: true, data: []},
    });
    cy.intercept('GET', '**/api/social/encounters/location-settings', {
      statusCode: 200,
      body: {success: true, data: {enabled: false}},
    });
    cy.intercept('GET', '**/api/social/encounter/matches', {
      statusCode: 200,
      body: {success: true, data: {matches: [], count: 0}},
    });
  });

  it('runs the end-to-end toggle on→off flow', () => {
    // Initial GET: disabled.
    cy.intercept('GET', '**/api/social/encounter/discoverable', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          enabled: false,
          expires_at: null,
          remaining_sec: 0,
          toggle_count_24h: 0,
          age_claim_18: false,
          face_visible: false,
          avatar_style: 'studio_ghibli',
          vibe_tags: [],
        },
      },
    }).as('getDisabled');

    // POST to enable: returns enabled with expires_at 1 hour out.
    const futureIso = new Date(Date.now() + 3600_000).toISOString();
    cy.intercept('POST', '**/api/social/encounter/discoverable', (req) => {
      // Differentiate enable vs disable by request body.
      if (req.body && req.body.enabled === true) {
        req.reply({
          statusCode: 200,
          body: {
            success: true,
            data: {
              enabled: true,
              expires_at: futureIso,
              remaining_sec: 3600,
            },
          },
        });
      } else {
        req.reply({
          statusCode: 200,
          body: {
            success: true,
            data: {
              enabled: false,
              expires_at: null,
              remaining_sec: 0,
            },
          },
        });
      }
    }).as('postToggle');

    cy.socialVisit('/social/encounters');
    cy.wait('@getDisabled', {timeout: 30000});

    // Initial: panel is mounted, Switch disabled.
    cy.get('[data-testid="discoverable-toggle-panel"]', {timeout: 30000})
      .should('exist');
    cy.get('[data-testid="discoverable-switch"]').should('be.disabled');
    cy.get('[data-testid="age-claim-checkbox"]').should('not.be.checked');

    // After GET: re-stub so a re-fetch returns enabled.
    cy.intercept('GET', '**/api/social/encounter/discoverable', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          enabled: true,
          expires_at: futureIso,
          remaining_sec: 3600,
          toggle_count_24h: 1,
          age_claim_18: true,
          face_visible: false,
          avatar_style: 'studio_ghibli',
          vibe_tags: [],
        },
      },
    }).as('getEnabled');

    // Check 18+ → Switch becomes enabled.
    cy.get('[data-testid="age-claim-checkbox"]').click({force: true});
    cy.get('[data-testid="discoverable-switch"]').should('not.be.disabled');

    // Click Switch on → POST fires.
    cy.get('[data-testid="discoverable-switch"]').click({force: true});
    cy.wait('@postToggle').then((interception) => {
      expect(interception.request.body.enabled).to.eq(true);
      expect(interception.request.body.age_claim_18).to.eq(true);
    });

    // Re-fetch returns enabled → countdown chip renders.
    cy.wait('@getEnabled', {timeout: 30000});
    cy.get('[data-testid="ttl-countdown"]', {timeout: 10000})
      .should('exist')
      .should('contain.text', 'Visible for');

    // Toggle off.
    cy.get('[data-testid="discoverable-switch"]').click({force: true});
    cy.wait('@postToggle').then((interception) => {
      expect(interception.request.body.enabled).to.eq(false);
    });
  });

  it('surfaces Snackbar after 429 toggle-limit response', () => {
    cy.intercept('GET', '**/api/social/encounter/discoverable', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          enabled: false,
          expires_at: null,
          remaining_sec: 0,
          toggle_count_24h: 6,
          age_claim_18: false,
          face_visible: false,
          avatar_style: 'studio_ghibli',
          vibe_tags: [],
        },
      },
    }).as('getMaxed');

    cy.intercept('POST', '**/api/social/encounter/discoverable', {
      statusCode: 429,
      body: {success: false, error: 'toggle limit reached (6 per 24h)'},
    }).as('post429');

    cy.socialVisit('/social/encounters');
    cy.wait('@getMaxed', {timeout: 30000});

    cy.get('[data-testid="age-claim-checkbox"]').click({force: true});
    cy.get('[data-testid="discoverable-switch"]')
      .should('not.be.disabled')
      .click({force: true});
    cy.wait('@post429');

    // Snackbar appears with limit message.
    cy.get('[data-testid="discoverable-snackbar"]', {timeout: 10000})
      .should('exist')
      .should('contain.text', 'Toggle limit');

    // Switch is now locked.
    cy.get('[data-testid="discoverable-switch"]').should('be.disabled');
  });
});
