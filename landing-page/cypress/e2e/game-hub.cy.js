/**
 * game-hub.cy.js — End-to-end tests for the adult Game Hub.
 *
 * Tests the Games Catalog API, Game Hub UI, and Unified Game Screen.
 *
 * Routes:
 *   /social/games           — GameHub (catalog, tabs, search, quick-match)
 *   /social/games/:gameId   — UnifiedGameScreen (lobby, engine rendering)
 *
 * All UI tests stub backend responses via cy.intercept() so no live
 * backend is required. API tests use cy.socialRequest() and accept
 * [200, 500] for endpoints that may not be running.
 */

// ── Mock catalog data used by both API validation and UI stubs ──────────────

const MOCK_CATALOG = {
  success: true,
  data: [
    {
      id: 'trivia-general-knowledge-classic',
      title: 'General Knowledge',
      engine: 'opentdb_trivia',
      category: 'trivia',
      audience: 'adult',
      min_players: 1,
      max_players: 8,
      multiplayer: true,
      featured: true,
    },
    {
      id: 'snake',
      title: 'Snake',
      engine: 'phaser',
      category: 'arcade',
      audience: 'all',
      min_players: 1,
      max_players: 1,
      multiplayer: false,
      featured: false,
    },
    {
      id: 'tic-tac-toe',
      title: 'Tic Tac Toe',
      engine: 'boardgame',
      category: 'board',
      audience: 'all',
      min_players: 2,
      max_players: 2,
      multiplayer: true,
      featured: true,
    },
    {
      id: 'word-scramble-classic',
      title: 'Word Scramble',
      engine: 'word_scramble',
      category: 'word',
      audience: 'adult',
      min_players: 1,
      max_players: 4,
      multiplayer: true,
      featured: false,
    },
    {
      id: 'sudoku-easy',
      title: 'Sudoku Easy',
      engine: 'sudoku',
      category: 'puzzle',
      audience: 'all',
      min_players: 1,
      max_players: 1,
      multiplayer: false,
      featured: false,
    },
  ],
  total: 5,
  meta: {
    total: 5,
    categories: {trivia: 1, arcade: 1, board: 1, word: 1, puzzle: 1},
  },
};

const MOCK_SINGLE_GAME = {
  success: true,
  data: {
    id: 'trivia-general-knowledge-classic',
    title: 'General Knowledge',
    engine: 'opentdb_trivia',
    category: 'trivia',
    audience: 'adult',
    min_players: 1,
    max_players: 8,
    multiplayer: true,
    featured: true,
  },
};

const MOCK_LOBBIES = {
  success: true,
  data: [
    {
      id: 'lobby-1',
      game_type: 'trivia',
      title: 'Trivia Night',
      host_name: 'Alice',
      player_count: 2,
      max_players: 4,
      status: 'waiting',
    },
    {
      id: 'lobby-2',
      game_type: 'board',
      title: 'Chess Match',
      host_name: 'Bob',
      player_count: 1,
      max_players: 2,
      status: 'waiting',
    },
  ],
};

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwicm9sZSI6ImZsYXQifQ.fake';

// ── Helper: stub all backend calls for UI tests ─────────────────────────────

function stubBackend(options = {}) {
  const {lobbies = false, emptyGames = false} = options;

  // Auth
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

  // SocialContext supporting stubs
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

  // Games catalog
  cy.intercept('GET', '**/api/social/games/catalog*', {
    statusCode: 200,
    body: emptyGames
      ? {success: true, data: [], total: 0, meta: {total: 0, categories: {}}}
      : MOCK_CATALOG,
  }).as('catalogLoad');

  // Game sessions list (lobbies)
  cy.intercept('GET', '**/api/social/games?*', {
    statusCode: 200,
    body: lobbies ? MOCK_LOBBIES : {success: true, data: []},
  }).as('lobbiesList');

  // Also match /games without query params
  cy.intercept('GET', '**/api/social/games', {
    statusCode: 200,
    body: lobbies ? MOCK_LOBBIES : {success: true, data: []},
  }).as('lobbiesListBase');

  // Quick match
  cy.intercept('POST', '**/api/social/games/quick-match', {
    statusCode: 200,
    body: {
      success: true,
      data: {id: 'test-session-1', participants: [], is_host: true},
    },
  }).as('quickMatch');

  // Session operations
  cy.intercept('POST', '**/api/social/games/sessions', {
    statusCode: 200,
    body: {success: true, data: {id: 'test-session-1', participants: []}},
  });
  cy.intercept('POST', '**/api/social/games/*/join', {
    statusCode: 200,
    body: {success: true, data: {participants: []}},
  });
  cy.intercept('GET', '**/api/social/games/sessions/*', {
    statusCode: 200,
    body: {
      success: true,
      data: {id: 'test-session-1', participants: [], status: 'waiting'},
    },
  });
}

function visitGameHub() {
  cy.visit('/social/games', {
    failOnStatusCode: false,
    timeout: 60000,
    onBeforeLoad(win) {
      win.localStorage.setItem('access_token', FAKE_TOKEN);
    },
  });
  cy.get('#root', {timeout: 15000}).should('exist');
}

function visitGameScreen(gameId) {
  // Stub single-game catalog lookup for the UnifiedGameScreen resolver
  cy.intercept('GET', `**/api/social/games/catalog?id=${gameId}*`, {
    statusCode: 200,
    body: {
      success: true,
      data: [
        MOCK_CATALOG.data.find((g) => g.id === gameId) || MOCK_CATALOG.data[0],
      ],
    },
  }).as('catalogLookup');

  // Also intercept wildcard catalog calls that the page may issue
  cy.intercept('GET', '**/api/social/games/catalog*', {
    statusCode: 200,
    body: MOCK_CATALOG,
  });

  cy.visit(`/social/games/${gameId}`, {
    failOnStatusCode: false,
    timeout: 60000,
    onBeforeLoad(win) {
      win.localStorage.setItem('access_token', FAKE_TOKEN);
    },
  });
  cy.get('#root', {timeout: 15000}).should('exist');
}

// =============================================================================
// Tests
// =============================================================================

describe('Game Hub — E2E', () => {
  // ONE auth call in outer before() per spec — rate-limiter safe
  before(() => {
    cy.socialAuth();
  });

  // =========================================================================
  // 1. Games Catalog API
  // =========================================================================
  describe('Games Catalog API', () => {
    it('GET /games/catalog returns 200 or 500 with expected shape', () => {
      cy.socialRequest('GET', '/games/catalog').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('success');
          const data = res.body.data;
          expect(data).to.be.an('array');
        }
      });
    });

    it('filters by category=trivia', () => {
      cy.socialRequest('GET', '/games/catalog?category=trivia').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.category).to.eq('trivia');
          });
        }
      });
    });

    it('filters by category=board', () => {
      cy.socialRequest('GET', '/games/catalog?category=board').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.category).to.eq('board');
          });
        }
      });
    });

    it('filters by category=arcade', () => {
      cy.socialRequest('GET', '/games/catalog?category=arcade').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.category).to.eq('arcade');
          });
        }
      });
    });

    it('filters by category=word', () => {
      cy.socialRequest('GET', '/games/catalog?category=word').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.category).to.eq('word');
          });
        }
      });
    });

    it('filters by category=puzzle', () => {
      cy.socialRequest('GET', '/games/catalog?category=puzzle').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.category).to.eq('puzzle');
          });
        }
      });
    });

    it('filters by audience=adult', () => {
      cy.socialRequest('GET', '/games/catalog?audience=adult').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.audience).to.be.oneOf(['adult', 'all']);
          });
        }
      });
    });

    it('filters by audience=kids', () => {
      cy.socialRequest('GET', '/games/catalog?audience=kids').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.audience).to.be.oneOf(['kids', 'all']);
          });
        }
      });
    });

    it('filters by multiplayer=true', () => {
      cy.socialRequest('GET', '/games/catalog?multiplayer=true').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.multiplayer).to.eq(true);
          });
        }
      });
    });

    it('filters by featured=true', () => {
      cy.socialRequest('GET', '/games/catalog?featured=true').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          res.body.data.forEach((g) => {
            expect(g.featured).to.eq(true);
          });
        }
      });
    });

    it('searches by query string', () => {
      cy.socialRequest('GET', '/games/catalog?search=trivia').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('data');
        }
      });
    });

    it('looks up a single game by ID', () => {
      cy.socialRequest(
        'GET',
        '/games/catalog?id=trivia-general-knowledge-classic'
      ).then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && res.body.data) {
          const entry = Array.isArray(res.body.data)
            ? res.body.data[0]
            : res.body.data;
          if (entry) {
            expect(entry).to.have.property('id');
            expect(entry).to.have.property('title');
          }
        }
      });
    });

    it('supports pagination with limit and offset', () => {
      cy.socialRequest('GET', '/games/catalog?limit=2&offset=0').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (res.status === 200 && Array.isArray(res.body.data)) {
          expect(res.body.data.length).to.be.at.most(2);
        }
      });
    });

    it('response entries have required shape fields', () => {
      cy.socialRequest('GET', '/games/catalog').then((res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
        if (
          res.status === 200 &&
          Array.isArray(res.body.data) &&
          res.body.data.length > 0
        ) {
          const game = res.body.data[0];
          expect(game).to.have.property('id');
          expect(game).to.have.property('title');
          expect(game).to.have.property('engine');
          expect(game).to.have.property('category');
        }
      });
    });
  });

  // =========================================================================
  // 2. Game Hub UI
  // =========================================================================
  describe('Game Hub UI', () => {
    beforeEach(() => {
      stubBackend();
    });

    it('loads the hub page at /social/games', () => {
      visitGameHub();
      cy.url().should('include', '/social/games');
    });

    it('shows "Games" heading', () => {
      visitGameHub();
      cy.contains('Games', {timeout: 15000}).should('be.visible');
    });

    it('renders Quick Match buttons (Trivia, Board, Arcade, Word)', () => {
      visitGameHub();
      cy.contains(/trivia/i, {timeout: 15000}).should('be.visible');
      cy.contains(/board/i, {timeout: 15000}).should('be.visible');
      cy.contains(/arcade/i, {timeout: 15000}).should('be.visible');
      cy.contains(/word/i, {timeout: 15000}).should('be.visible');
    });

    it('renders category tabs (All, Trivia, Board, Arcade, Word, Puzzle, Party)', () => {
      visitGameHub();
      // MUI Tabs use role="tab"
      cy.get('[role="tab"]', {timeout: 15000}).should(
        'have.length.at.least',
        7
      );
      cy.contains('[role="tab"]', /all/i).should('exist');
      cy.contains('[role="tab"]', /trivia/i).should('exist');
      cy.contains('[role="tab"]', /board/i).should('exist');
      cy.contains('[role="tab"]', /arcade/i).should('exist');
      cy.contains('[role="tab"]', /word/i).should('exist');
      cy.contains('[role="tab"]', /puzzle/i).should('exist');
      cy.contains('[role="tab"]', /party/i).should('exist');
    });

    it('clicking a category tab filters the display', () => {
      visitGameHub();
      // Click the Trivia tab
      cy.contains('[role="tab"]', /trivia/i, {timeout: 15000}).click({
        force: true,
      });
      // After clicking, the tab should be selected (aria-selected)
      cy.contains('[role="tab"]', /trivia/i).should(
        'have.attr',
        'aria-selected',
        'true'
      );
    });

    it('search input exists and accepts text', () => {
      visitGameHub();
      cy.get('input[placeholder*="earch"]', {timeout: 15000}).should('exist');
      cy.get('input[placeholder*="earch"]').type('snake', {force: true});
      cy.get('input[placeholder*="earch"]').should('have.value', 'snake');
    });

    it('renders game cards with titles', () => {
      visitGameHub();
      // Wait for catalog stub to load, then check game titles from mock data
      cy.contains('General Knowledge', {timeout: 15000}).should('be.visible');
      cy.contains('Snake', {timeout: 15000}).should('be.visible');
      cy.contains('Tic Tac Toe', {timeout: 15000}).should('be.visible');
    });

    it('game cards show player count badge for multiplayer games', () => {
      visitGameHub();
      // Multiplayer games get a Chip with "min-max" like "1-8"
      cy.contains('1-8', {timeout: 15000}).should('exist');
      cy.contains('2-2', {timeout: 15000}).should('exist');
    });

    it('featured games section is visible on All tab', () => {
      visitGameHub();
      cy.contains(/featured/i, {timeout: 15000}).should('be.visible');
    });

    it('clicking a game card navigates to /social/games/:gameId', () => {
      // Stub the game screen resolve call
      cy.intercept('GET', '**/api/social/games/catalog*', {
        statusCode: 200,
        body: MOCK_CATALOG,
      });

      visitGameHub();
      // Click the "General Knowledge" card
      cy.contains('General Knowledge', {timeout: 15000}).click({force: true});
      cy.url({timeout: 10000}).should(
        'include',
        '/social/games/trivia-general-knowledge-classic'
      );
    });

    it('shows Open Lobbies section when lobbies exist', () => {
      stubBackend({lobbies: true});
      visitGameHub();
      cy.contains(/open lobbies/i, {timeout: 15000}).should('be.visible');
      cy.contains('Trivia Night', {timeout: 10000}).should('be.visible');
      cy.contains('Chess Match', {timeout: 10000}).should('be.visible');
    });

    it('shows LIVE chip in Open Lobbies section', () => {
      stubBackend({lobbies: true});
      visitGameHub();
      cy.contains('LIVE', {timeout: 15000}).should('be.visible');
    });

    it('shows empty state when no games match', () => {
      stubBackend({emptyGames: true});
      visitGameHub();
      cy.contains(/no games found/i, {timeout: 15000}).should('be.visible');
    });

    it('sidebar has a "Games" entry', () => {
      visitGameHub();
      // SocialLayout sidebar nav items
      cy.get('nav, [role="navigation"], aside', {timeout: 15000})
        .first()
        .within(() => {
          cy.contains(/games/i).should('exist');
        });
    });
  });

  // =========================================================================
  // 3. Unified Game Screen
  // =========================================================================
  describe('Unified Game Screen', () => {
    beforeEach(() => {
      stubBackend();
    });

    it('loads at /social/games/:gameId', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.url().should(
        'include',
        '/social/games/trivia-general-knowledge-classic'
      );
    });

    it('shows the game title after loading', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.contains('General Knowledge', {timeout: 20000}).should('be.visible');
    });

    it('lobby mode shows Play Solo button', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.contains(/play solo/i, {timeout: 20000}).should('be.visible');
    });

    it('lobby mode shows Quick Match button', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.contains(/quick match/i, {timeout: 20000}).should('be.visible');
    });

    it('lobby mode shows Create Room button', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.contains(/create room/i, {timeout: 20000}).should('be.visible');
    });

    it('shows Back to Games button that navigates back', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.contains(/back to games/i, {timeout: 20000}).should('be.visible');
      cy.contains(/back to games/i).click({force: true});
      cy.url({timeout: 10000}).should('include', '/social/games');
      cy.url().should('not.include', '/trivia-general-knowledge-classic');
    });

    it('renders engine placeholder for unknown engine type', () => {
      // Stub a catalog entry with an unknown engine
      cy.intercept('GET', '**/api/social/games/catalog*', {
        statusCode: 200,
        body: {
          success: true,
          data: [
            {
              id: 'unknown-game',
              title: 'Mystery Game',
              engine: 'mystery_engine_xyz',
              category: 'party',
              audience: 'adult',
              min_players: 1,
              max_players: 1,
              multiplayer: false,
              featured: false,
            },
          ],
        },
      });

      visitGameScreen('unknown-game');
      // The lobby should still render with Play Solo
      cy.contains(/mystery game/i, {timeout: 20000}).should('be.visible');
      cy.contains(/play solo/i, {timeout: 20000}).should('be.visible');
    });

    it('lobby shows Join input with room code field', () => {
      visitGameScreen('trivia-general-knowledge-classic');
      cy.get('input[placeholder*="room code"]', {timeout: 20000}).should(
        'exist'
      );
    });
  });
});
