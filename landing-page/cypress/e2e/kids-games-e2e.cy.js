/**
 * kids-games-e2e.cy.js — End-to-end tests for Kids Learning Game templates.
 *
 * Tests game lifecycle, visual upgrades, multiplayer lobby, and graceful degradation.
 *
 * Route: /social/kids (hub), /social/kids/game/:gameId (game screen)
 * Stubs all backend + TTS model API calls for deterministic testing.
 *
 * NOTE: Lazy-loaded React chunks take 10-15s in headless Electron.
 * All content assertions use 25s+ timeouts to accommodate this.
 */

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwicm9sZSI6ImZsYXQifQ.fake';

// Helper: stub auth + social context + TTS models for /social routes
function stubAll() {
  cy.intercept('GET', '**/api/social/auth/me', {
    statusCode: 200,
    body: {
      success: true,
      data: {
        id: 1,
        username: 'testuser',
        role: 'flat',
        display_name: 'Test User',
      },
    },
  }).as('authMe');

  // Stub SocialContext API calls
  cy.intercept('GET', '**/api/social/resonance/**', {
    statusCode: 200,
    body: {success: true, data: {}},
  });
  cy.intercept('GET', '**/api/social/onboarding/**', {
    statusCode: 200,
    body: {success: true, data: {}},
  });
  cy.intercept('GET', '**/api/social/notifications*', {
    statusCode: 200,
    body: {success: true, data: [], meta: {total: 0}},
  });
  cy.intercept('GET', '**/api/social/feed*', {
    statusCode: 200,
    body: {success: true, data: []},
  });
  cy.intercept('GET', '**/api/social/gamification*', {
    statusCode: 200,
    body: {success: true, data: {}},
  });

  // Stub media/TTS backend endpoints
  cy.intercept('POST', '**/api/media/asset*', {
    statusCode: 503,
    body: {error: 'stub'},
  });
  cy.intercept('GET', '**/api/media/asset*', {
    statusCode: 503,
    body: {error: 'stub'},
  });
  cy.intercept('POST', '**/api/social/tts*', {
    statusCode: 503,
    body: {error: 'stub'},
  });

  // Stub HuggingFace ONNX model downloads (TTS engine tries to download these)
  cy.intercept('GET', '**/huggingface.co/**', {
    statusCode: 503,
    body: '',
  });

  // Stub game session APIs for multiplayer lobby
  cy.intercept('POST', '**/api/social/games/sessions', {
    statusCode: 200,
    body: {
      success: true,
      data: {id: 'test-session-1', participants: []},
    },
  });
  cy.intercept('POST', '**/api/social/games/sessions/*/join', {
    statusCode: 200,
    body: {success: true, data: {participants: []}},
  });
  cy.intercept('POST', '**/api/social/games/quick-match', {
    statusCode: 200,
    body: {
      success: true,
      data: {id: 'test-session-1', participants: [], is_host: true},
    },
  });
  cy.intercept('GET', '**/api/social/games/sessions/*', {
    statusCode: 200,
    body: {
      success: true,
      data: {id: 'test-session-1', participants: [], status: 'waiting'},
    },
  });
}

function visitKidsHub() {
  cy.visit('/social/kids', {
    failOnStatusCode: false,
    timeout: 60000,
    onBeforeLoad(win) {
      win.localStorage.setItem('access_token', FAKE_TOKEN);
    },
  });
  // Wait for lazy chunks to load (10-15s in headless Electron)
  cy.contains(/learn|game/i, {timeout: 30000}).should('exist');
}

function navigateToGame() {
  // Click first game card
  cy.get('[class*="MuiCardActionArea"]', {timeout: 10000})
    .first()
    .click({force: true});
  // Wait for the game page to load — the lobby renders "Solo" text.
  // Use contains with long timeout to wait for lazy chunk + game screen render.
  cy.contains(/solo/i, {timeout: 30000}).should('exist');
}

describe('Kids Learning Games — E2E', () => {
  // No before() — all API calls are stubbed in beforeEach, and visitKidsHub()
  // sets a fake JWT in localStorage. No live backend required.

  beforeEach(() => {
    stubAll();
  });

  // =========================================================================
  // 1. Kids Hub loads correctly
  // =========================================================================
  describe('Kids Learning Hub', () => {
    it('loads the hub page with game cards', () => {
      visitKidsHub();
      cy.url().should('include', '/social/kids');
      cy.get('[class*="MuiCard"]', {timeout: 5000}).should(
        'have.length.at.least',
        1
      );
    });

    it('displays category tabs', () => {
      visitKidsHub();
      cy.contains(/english/i, {timeout: 5000}).should('exist');
      cy.contains(/math/i, {timeout: 5000}).should('exist');
    });

    it('game cards navigate to game page', () => {
      visitKidsHub();
      navigateToGame();
      // Verify URL changed to game page (navigateToGame already confirmed render)
      cy.url({timeout: 15000}).should('include', '/social/kids/game/');
    });
  });

  // =========================================================================
  // 2. Game screen — Multiplayer Lobby
  // =========================================================================
  describe('Game screen — Multiplayer Lobby', () => {
    it('shows the multiplayer lobby with Solo Play button', () => {
      visitKidsHub();
      navigateToGame();
      cy.contains(/solo/i).should('be.visible');
    });

    it('shows Quick Match and Create Room options', () => {
      visitKidsHub();
      navigateToGame();
      cy.contains(/quick match/i, {timeout: 10000}).should('exist');
      cy.contains(/create room/i, {timeout: 10000}).should('exist');
    });

    it('shows KidsCharacter SVG avatars in lobby', () => {
      visitKidsHub();
      navigateToGame();
      cy.get('svg[viewBox]', {timeout: 10000}).should(
        'have.length.at.least',
        1
      );
    });

    it('clicking Solo Play starts the game', () => {
      visitKidsHub();
      navigateToGame();
      // Click the Solo Play MUI Button specifically
      cy.contains('button', /solo/i).click({force: true});
      // After intro phase (2s), game should be playing — lobby buttons gone
      cy.contains(/quick match/i, {timeout: 10000}).should('not.exist');
    });
  });

  // =========================================================================
  // 3. Visual upgrades — shared components
  // =========================================================================
  describe('Visual upgrades (shared components)', () => {
    it('hub page renders game content correctly', () => {
      visitKidsHub();
      cy.url().should('include', '/social/kids');
      cy.get('input[placeholder*="earch"]', {timeout: 5000}).should('exist');
    });

    it('does not crash with 503 on media/TTS endpoints', () => {
      visitKidsHub();
      cy.get('[class*="MuiCard"]', {timeout: 5000}).should(
        'have.length.at.least',
        1
      );
    });
  });

  // =========================================================================
  // 4. Accessibility
  // =========================================================================
  describe('Accessibility', () => {
    it('hub page has interactive elements with proper roles', () => {
      visitKidsHub();
      cy.get('button, [role="button"], a', {timeout: 5000}).should(
        'have.length.at.least',
        1
      );
    });

    it('game elements support keyboard focus', () => {
      visitKidsHub();
      cy.get('[tabindex], button, a, input', {timeout: 5000}).should(
        'have.length.at.least',
        1
      );
    });
  });

  // =========================================================================
  // 5. Responsive layout
  // =========================================================================
  describe('Responsive layout', () => {
    it('renders correctly on mobile viewport', () => {
      cy.viewport('iphone-6');
      visitKidsHub();
      cy.get('[class*="MuiCard"]', {timeout: 5000}).should(
        'have.length.at.least',
        1
      );
    });

    it('renders correctly on tablet viewport', () => {
      cy.viewport('ipad-2');
      visitKidsHub();
      cy.get('[class*="MuiCard"]', {timeout: 5000}).should(
        'have.length.at.least',
        1
      );
    });
  });

  // =========================================================================
  // 6. Game flow — start to play
  // =========================================================================
  describe('Game flow — Solo Play through lobby', () => {
    it('navigates hub → game → lobby → Solo Play → playing', () => {
      visitKidsHub();
      navigateToGame();
      // Click the Solo Play MUI Button specifically
      cy.contains('button', /solo/i).click({force: true});
      // After intro phase (2s) the game enters playing state.
      // Verify lobby buttons are gone by checking Quick Match disappears.
      cy.contains(/quick match/i, {timeout: 10000}).should('not.exist');
    });
  });

  // =========================================================================
  // 7. Sound and TTS graceful degradation
  // =========================================================================
  describe('Sound and TTS graceful degradation', () => {
    it('games work even when TTS endpoint returns 503', () => {
      visitKidsHub();
      navigateToGame();
      // Lobby should still render
      cy.contains(/solo/i).should('be.visible');
    });

    it('games work even when media asset endpoint returns 503', () => {
      visitKidsHub();
      navigateToGame();
      cy.contains(/solo/i).should('be.visible');
    });
  });
});
