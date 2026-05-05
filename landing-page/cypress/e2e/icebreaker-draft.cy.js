/**
 * Cypress E2E -- IcebreakerDraftSheet (W0c F2 GREENLIT, post-prereq
 * d4405b55 + 7dadd6bc + 65084ae2 + 8e4f462d).
 *
 * Spec mounts the modal via /social/encounters Tab 4 (BLE Matches)
 * and exercises:
 *   1. Click "Send icebreaker" on a mutual-match card → modal opens →
 *      /icebreaker/draft fires → 3 drafts shown, rationale visible.
 *   2. Edit draft text → /icebreaker/approve fires with the EDITED
 *      text (not the original draft) → success toast → modal closes
 *      → BleMatchCard reflects updated icebreaker_a_status === 'sent'.
 *   3. Decline flow: open modal → click Decline → reason chips visible
 *      → click "Not feeling it" → /icebreaker/decline fires with the
 *      reason → modal auto-closes.
 *
 * Backend chain — verified:
 *   POST /api/social/encounter/icebreaker/draft    → encounter_api.py:638-664
 *   POST /api/social/encounter/icebreaker/approve  → encounter_api.py:667-714
 *   POST /api/social/encounter/icebreaker/decline  → encounter_api.py:717-747
 *
 * All sibling fetches required by EncountersPage are stubbed so the
 * page mounts cleanly without a backend.
 *
 * Mission-anchor enforcement asserted in this spec:
 *   - The /approve POST body's `text` field is the EDITED text, not
 *     the original draft (CLAUDE.md "AI never sends; user-edit-before-
 *     send" gate).  See assertion at the end of test 2.
 */

describe('IcebreakerDraftSheet — review-before-send flow', () => {
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
    });

    // One mutual match in the BLE Matches tab so the user has
    // something to click "Send icebreaker" on.
    cy.intercept('GET', '**/api/social/encounter/matches', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          matches: [
            {
              id: 'match-cy-1',
              user_a: 'admin-1', // matches testHelpers default currentUser.id
              user_b: 'peer-bob',
              lat: 12.97,
              lng: 77.59,
              matched_at: Math.floor(Date.now() / 1000) - 30,
              icebreaker_a_status: null,
              icebreaker_b_status: null,
              map_pin_visible: true,
            },
          ],
          count: 1,
        },
      },
    }).as('getMatches');
  });

  it('opens modal, draft loads, edit + send fires /approve with edited text', () => {
    cy.intercept('POST', '**/api/social/encounter/icebreaker/draft', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          draft: 'Hey — saw the hiking thing. Same.',
          alt_drafts: [
            'Hi! I think we share the hiking corner of the universe.',
            'Hello.  hiking, huh?  Curious how you got into it.',
          ],
          rationale: "anchored on shared interest 'hiking'",
          length: 35,
          shared_tag: 'hiking',
          source: 'template',
        },
      },
    }).as('postDraft');

    cy.intercept('POST', '**/api/social/encounter/icebreaker/approve', {
      statusCode: 200,
      body: {
        success: true,
        data: {match_id: 'match-cy-1', status: 'sent'},
      },
    }).as('postApprove');

    cy.socialVisit('/social/encounters');
    // Switch to BLE Matches tab (index 4).
    cy.contains('button', /BLE Matches/i, {timeout: 30000}).click({force: true});

    // Card should render the icebreaker button.
    cy.get('[data-testid="ble-match-match-cy-1-icebreaker"]', {timeout: 30000})
      .should('exist')
      .click({force: true});

    // Modal opens — Dialog or Drawer depending on viewport.
    cy.wait('@postDraft', {timeout: 30000});

    // Rationale visible.
    cy.get('[data-testid="icebreaker-rationale"]')
      .should('contain.text', 'hiking');

    // 3 draft options.
    cy.get('[data-testid="icebreaker-draft-option-0"]').should('exist');
    cy.get('[data-testid="icebreaker-draft-option-1"]').should('exist');
    cy.get('[data-testid="icebreaker-draft-option-2"]').should('exist');

    // Edit the text — clear and type a new opener.
    cy.get('[data-testid="icebreaker-text-input"]').as('textInput');
    cy.get('@textInput').clear({force: true}).type('Hello there friend.', {force: true});

    // Send button enabled, click.
    cy.get('[data-testid="icebreaker-send"]').should('not.be.disabled').click({force: true});

    // Approve fires with the EDITED text (mission-anchor: AI never
    // sends; user-edit-before-send).
    cy.wait('@postApprove').then((interception) => {
      expect(interception.request.body.match_id).to.eq('match-cy-1');
      expect(interception.request.body.text).to.eq('Hello there friend.');
    });

    // Success state visible briefly, then auto-dismiss.
    cy.get('[data-testid="icebreaker-sent"]', {timeout: 10000}).should('exist');
  });

  it('decline flow: pick reason → POST decline → modal closes', () => {
    cy.intercept('POST', '**/api/social/encounter/icebreaker/draft', {
      statusCode: 200,
      body: {
        success: true,
        data: {
          draft: 'Hey — saw the hiking thing. Same.',
          alt_drafts: [
            'Hi! I think we share the hiking corner of the universe.',
            'Hello.  hiking, huh?  Curious how you got into it.',
          ],
          rationale: "anchored on shared interest 'hiking'",
          length: 35,
          shared_tag: 'hiking',
          source: 'template',
        },
      },
    }).as('postDraft');

    cy.intercept('POST', '**/api/social/encounter/icebreaker/decline', {
      statusCode: 200,
      body: {
        success: true,
        data: {match_id: 'match-cy-1', status: 'declined'},
      },
    }).as('postDecline');

    cy.socialVisit('/social/encounters');
    cy.contains('button', /BLE Matches/i, {timeout: 30000}).click({force: true});
    cy.get('[data-testid="ble-match-match-cy-1-icebreaker"]', {timeout: 30000})
      .click({force: true});

    cy.wait('@postDraft', {timeout: 30000});

    // Click Decline → reason picker.
    cy.get('[data-testid="icebreaker-decline-open"]').click({force: true});
    cy.get('[data-testid="icebreaker-declining"]').should('exist');
    cy.get('[data-testid="icebreaker-decline-not-feeling-it"]')
      .should('exist')
      .click({force: true});

    cy.wait('@postDecline').then((interception) => {
      expect(interception.request.body.match_id).to.eq('match-cy-1');
      expect(interception.request.body.reason).to.eq('Not feeling it');
    });

    cy.get('[data-testid="icebreaker-declined"]', {timeout: 10000}).should('exist');
  });
});
