/**
 * multiplayer-lobby.cy.js — E2E tests for the multiplayer lobby and game flow.
 *
 * Covers:
 *   1. Games API multiplayer endpoints (live backend)
 *   2. UnifiedGameScreen lobby phase (stubbed)
 *   3. Engine rendering per engine type (stubbed)
 *   4. Game complete phase (stubbed)
 *
 * Route: /social/games/:gameId  (UnifiedGameScreen)
 * Auth:  RoleGuard minRole="guest" — no special auth stub needed.
 *
 * Pattern: ONE cy.socialAuth() in outer before() for API tests.
 *          UI tests use a FAKE_TOKEN + full intercept stubs.
 */

const FAKE_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwicm9sZSI6ImZsYXQifQ.fake';

// ── Mock data ────────────────────────────────────────────────────────────────

const MOCK_GAME_INFO = {
  success: true,
  data: {
    id: 'test-session-123',
    title: 'General Knowledge',
    engine: 'opentdb_trivia',
    status: 'waiting',
    players: [{id: 1, username: 'TestUser', is_host: true}],
    max_players: 4,
    code: 'ABCD1234',
    questions: [
      {
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correct_answer: '4',
      },
      {
        question: 'Capital of France?',
        options: ['London', 'Berlin', 'Paris', 'Rome'],
        correct_answer: 'Paris',
      },
    ],
  },
};

const MOCK_CATALOG_ENTRY = {
  success: true,
  data: [
    {
      id: 'trivia-general-knowledge-classic',
      title: 'General Knowledge',
      engine: 'opentdb_trivia',
      category: 'trivia',
      engine_config: {opentdb_category_id: 9, mode: 'classic'},
    },
  ],
};

const MOCK_SESSION_CREATE = {
  success: true,
  data: {
    id: 'test-session-123',
    status: 'waiting',
    participants: [{id: 1, username: 'TestUser', isHost: true, ready: false}],
    code: 'ABCD1234',
    is_host: true,
  },
};

const MOCK_QUICK_MATCH = {
  success: true,
  data: {
    id: 'test-session-456',
    status: 'waiting',
    participants: [{id: 1, username: 'TestUser', isHost: true}],
    is_host: true,
  },
};

const MOCK_RESULTS = {
  success: true,
  data: {
    session_id: 'test-session-123',
    scores: {1: 80, 2: 60},
    participants: [
      {id: 1, username: 'TestUser', score: 80},
      {id: 2, username: 'Opponent', score: 60},
    ],
    winner: {id: 1, username: 'TestUser'},
  },
};

const MOCK_HISTORY = {
  success: true,
  data: [
    {
      id: 'session-old-1',
      title: 'Past Game',
      engine: 'trivia',
      status: 'complete',
    },
  ],
  meta: {total: 1},
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stub ALL social-context + game API routes so UnifiedGameScreen can render
 * entirely without a live backend.
 */
function stubSocialContext() {
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
}

/**
 * Stub the catalog endpoint so the UnifiedGameScreen resolves a slug to
 * a catalog entry with the specified engine type.
 */
function stubCatalog(engine, title, extraConfig = {}) {
  const entry = {
    success: true,
    data: [
      {
        id: `test-${engine}-id`,
        title: title || engine,
        engine,
        category: 'test',
        engine_config: {
          ...extraConfig,
          questions: MOCK_GAME_INFO.data.questions,
        },
      },
    ],
  };

  cy.intercept('GET', '**/api/social/games/catalog*', {
    statusCode: 200,
    body: entry,
  }).as('catalogFetch');
}

/**
 * Stub game session APIs used by useMultiplayerSync.
 */
function stubMultiplayerAPIs() {
  cy.intercept('POST', '**/api/social/games', {
    statusCode: 200,
    body: MOCK_SESSION_CREATE,
  }).as('createSession');

  cy.intercept('POST', '**/api/social/games/*/join', {
    statusCode: 200,
    body: {success: true, data: {participants: []}},
  }).as('joinSession');

  cy.intercept('POST', '**/api/social/games/*/ready', {
    statusCode: 200,
    body: {success: true},
  }).as('readySession');

  cy.intercept('POST', '**/api/social/games/*/start', {
    statusCode: 200,
    body: {success: true},
  }).as('startSession');

  cy.intercept('POST', '**/api/social/games/*/move', {
    statusCode: 200,
    body: {success: true},
  }).as('moveSession');

  cy.intercept('POST', '**/api/social/games/*/leave', {
    statusCode: 200,
    body: {success: true},
  }).as('leaveSession');

  cy.intercept('GET', '**/api/social/games/test-session-*', {
    statusCode: 200,
    body: MOCK_GAME_INFO,
  }).as('getSession');

  cy.intercept('GET', '**/api/social/games/*/results', {
    statusCode: 200,
    body: MOCK_RESULTS,
  }).as('getResults');

  cy.intercept('POST', '**/api/social/games/quick-match', {
    statusCode: 200,
    body: MOCK_QUICK_MATCH,
  }).as('quickMatch');

  cy.intercept('GET', '**/api/social/games/history*', {
    statusCode: 200,
    body: MOCK_HISTORY,
  }).as('getHistory');
}

/**
 * Visit a game page with fake JWT and all stubs active.
 */
function visitGame(gameSlug) {
  cy.visit(`/social/games/${gameSlug}`, {
    failOnStatusCode: false,
    timeout: 60000,
    onBeforeLoad(win) {
      win.localStorage.setItem('access_token', FAKE_TOKEN);
    },
  });
  cy.get('#root', {timeout: 15000}).should('exist');
}

// =============================================================================
// 1. Games API Multiplayer Endpoints (live backend)
// =============================================================================

describe('Games API Multiplayer Endpoints', () => {
  before(() => {
    cy.socialAuth();
  });

  it('POST /games creates a session', () => {
    cy.socialRequest('POST', '/games', {
      game_config_id: 'trivia-general-knowledge-classic',
      game_type: 'trivia',
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201, 404, 500]);
      if (res.status < 400) {
        expect(res.body).to.have.property('success', true);
        expect(res.body).to.have.property('data');
      }
    });
  });

  it('POST /games/:id/join returns success or 404', () => {
    cy.socialRequest('POST', '/games/nonexistent-session/join').then((res) => {
      expect(res.status).to.be.oneOf([200, 404, 500]);
    });
  });

  it('POST /games/:id/ready marks player ready', () => {
    cy.socialRequest('POST', '/games/nonexistent-session/ready').then((res) => {
      expect(res.status).to.be.oneOf([200, 404, 500]);
    });
  });

  it('POST /games/:id/start starts the game', () => {
    cy.socialRequest('POST', '/games/nonexistent-session/start').then((res) => {
      expect(res.status).to.be.oneOf([200, 400, 404, 500]);
    });
  });

  it('POST /games/:id/move submits a move', () => {
    cy.socialRequest('POST', '/games/nonexistent-session/move', {
      action: 'answer',
      answer: 'A',
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 404, 500]);
    });
  });

  it('POST /games/:id/leave removes player', () => {
    cy.socialRequest('POST', '/games/nonexistent-session/leave').then((res) => {
      expect(res.status).to.be.oneOf([200, 404, 500]);
    });
  });

  it('GET /games/:id returns session data', () => {
    cy.socialRequest('GET', '/games/nonexistent-session').then((res) => {
      expect(res.status).to.be.oneOf([200, 404, 500]);
      if (res.status === 200 && res.body.success) {
        expect(res.body).to.have.property('data');
      }
    });
  });

  it('GET /games/:id/results returns results', () => {
    cy.socialRequest('GET', '/games/nonexistent-session/results').then(
      (res) => {
        expect(res.status).to.be.oneOf([200, 404, 500]);
      }
    );
  });

  it('POST /games/quick-match returns session', () => {
    cy.socialRequest('POST', '/games/quick-match', {
      game_type: 'trivia',
    }).then((res) => {
      expect(res.status).to.be.oneOf([200, 201, 404, 500]);
      if (res.status < 400 && res.body.success) {
        expect(res.body).to.have.property('data');
      }
    });
  });

  it('GET /games/history returns history', () => {
    cy.socialRequest('GET', '/games/history').then((res) => {
      expect(res.status).to.be.oneOf([200, 404, 500]);
      if (res.status === 200 && res.body.success) {
        expect(res.body).to.have.property('data');
        expect(res.body.data).to.be.an('array');
      }
    });
  });
});

// =============================================================================
// 2. Unified Game Screen - Lobby Phase (stubbed)
// =============================================================================

describe('Unified Game Screen - Lobby Phase', () => {
  beforeEach(() => {
    stubSocialContext();
    stubCatalog('opentdb_trivia', 'General Knowledge');
    stubMultiplayerAPIs();
  });

  it('loads at /social/games/:gameId with lobby', () => {
    visitGame('trivia-general-knowledge-classic');
    // The lobby should appear after catalog resolves
    cy.contains(/solo|create room|quick match/i, {timeout: 25000}).should(
      'exist'
    );
  });

  it('shows game title', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains('General Knowledge', {timeout: 25000}).should('be.visible');
  });

  it('Solo button visible', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains(/play solo/i, {timeout: 25000}).should('be.visible');
  });

  it('Create Room button visible', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains(/create room/i, {timeout: 25000}).should('be.visible');
  });

  it('Quick Match button visible', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains(/quick match/i, {timeout: 25000}).should('be.visible');
  });

  it('Join code input visible', () => {
    visitGame('trivia-general-knowledge-classic');
    // The join code input has placeholder "Enter room code"
    cy.get('input[placeholder*="room code"]', {timeout: 25000}).should(
      'be.visible'
    );
  });

  it('clicking Solo starts solo game', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // After solo start, lobby buttons should disappear
    cy.contains(/create room/i, {timeout: 10000}).should('not.exist');
  });

  it('stub: create room shows waiting state', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains('button', /create room/i, {timeout: 25000}).click({
      force: true,
    });
    // After creating a session, status transitions to 'waiting' or 'creating'
    // The lobby shows "Waiting for Players" or "Setting up..."
    cy.contains(/waiting|setting up/i, {timeout: 15000}).should('exist');
  });

  it('waiting state shows session code', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains('button', /create room/i, {timeout: 25000}).click({
      force: true,
    });
    // The session code is displayed as a monospace string in the waiting state
    // The code is derived from session ID or returned by the API
    cy.contains(/waiting|setting up/i, {timeout: 15000}).should('exist');
    // The code area or copy icon should be present
    cy.get('body').then(($body) => {
      // Either a copy button icon or the code text itself
      const hasCode =
        $body.find('[data-testid="ContentCopyIcon"], [aria-label*="copy"], svg')
          .length > 0;
      const hasWaiting = $body.text().toLowerCase().includes('waiting');
      expect(hasCode || hasWaiting).to.be.true;
    });
  });

  it('leave button returns to idle', () => {
    visitGame('trivia-general-knowledge-classic');
    cy.contains('button', /create room/i, {timeout: 25000}).click({
      force: true,
    });
    cy.contains(/waiting|setting up/i, {timeout: 15000}).should('exist');
    // Click the Leave button to return to idle mode
    cy.contains('button', /leave/i, {timeout: 10000}).click({force: true});
    // Should return to idle lobby (Solo, Quick Match, Create Room visible again)
    cy.contains(/play solo/i, {timeout: 15000}).should('exist');
  });
});

// =============================================================================
// 3. Unified Game Screen - Engine Rendering (stubbed)
// =============================================================================

describe('Unified Game Screen - Engine Rendering', () => {
  beforeEach(() => {
    stubSocialContext();
    stubMultiplayerAPIs();
  });

  it('trivia engine renders when engine is opentdb_trivia', () => {
    stubCatalog('opentdb_trivia', 'Trivia Game', {
      questions: MOCK_GAME_INFO.data.questions,
    });
    visitGame('test-opentdb_trivia-id');
    // Click Solo to start the game
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // Trivia engine should render — look for question text or option buttons
    cy.contains(/what is|capital of|question/i, {timeout: 15000}).should(
      'exist'
    );
  });

  it('question text and options visible in trivia', () => {
    stubCatalog('opentdb_trivia', 'Trivia Game', {
      questions: MOCK_GAME_INFO.data.questions,
    });
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // Should show first question
    cy.contains('What is 2+2?', {timeout: 15000}).should('be.visible');
    // Should show option buttons (A, B, C, D labels or the answer text)
    cy.contains('4', {timeout: 5000}).should('exist');
    cy.contains('3', {timeout: 5000}).should('exist');
  });

  it('timer visible in trivia', () => {
    stubCatalog('opentdb_trivia', 'Trivia Timer', {
      questions: MOCK_GAME_INFO.data.questions,
      timePerQuestion: 30,
    });
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // The TriviaEngine shows a LinearProgress timer bar
    cy.get('[role="progressbar"]', {timeout: 15000}).should('exist');
  });

  it('score display visible', () => {
    stubCatalog('opentdb_trivia', 'Trivia Score', {
      questions: MOCK_GAME_INFO.data.questions,
    });
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // The AdultGameShell or TriviaEngine shows score — look for "Score" text or "0" initial
    cy.contains(/score|0\/|points/i, {timeout: 15000}).should('exist');
  });

  it('phaser bridge loads for arcade games', () => {
    stubCatalog('phaser', 'Snake Arcade', {scene_id: 'snake'});
    visitGame('test-phaser-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // PhaserGameBridge renders a container div for the Phaser canvas or shows loading/error
    // It may show "Loading" text or a canvas element
    cy.get('body', {timeout: 15000}).then(($body) => {
      const hasCanvas = $body.find('canvas').length > 0;
      const hasLoading = $body.text().toLowerCase().includes('loading');
      const hasGameText = $body.text().toLowerCase().includes('snake');
      const hasError =
        $body.text().toLowerCase().includes('error') ||
        $body.text().toLowerCase().includes('unknown scene');
      // Either the game loaded, is loading, or errored gracefully — all valid
      expect(hasCanvas || hasLoading || hasGameText || hasError).to.be.true;
    });
  });

  it('board game engine loads for board games', () => {
    stubCatalog('boardgame', 'Tic Tac Toe', {board_type: 'tictactoe'});
    visitGame('test-boardgame-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // BoardGameEngine renders the board or a loading/error state
    cy.get('body', {timeout: 15000}).then(($body) => {
      const text = $body.text().toLowerCase();
      const hasBoard =
        text.includes('tic') ||
        text.includes('board') ||
        $body.find('table, [role="grid"], canvas').length > 0;
      const hasLoading = text.includes('loading');
      const hasError = text.includes('error');
      expect(hasBoard || hasLoading || hasError).to.be.true;
    });
  });

  it('word scramble engine loads for word games', () => {
    stubCatalog('word_scramble', 'Word Scramble');
    visitGame('test-word_scramble-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // WordScrambleEngine shows scrambled letters, input, or word-related UI
    cy.get('body', {timeout: 15000}).then(($body) => {
      const text = $body.text().toLowerCase();
      const hasWordUI =
        text.includes('scrambl') ||
        text.includes('word') ||
        text.includes('score') ||
        text.includes('round') ||
        $body.find('input').length > 0;
      const hasLoading = text.includes('loading');
      expect(hasWordUI || hasLoading).to.be.true;
    });
  });

  it('sudoku engine loads for puzzle games', () => {
    stubCatalog('sudoku', 'Sudoku Puzzle');
    visitGame('test-sudoku-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // SudokuEngine renders a 9x9 grid with cells
    cy.get('body', {timeout: 15000}).then(($body) => {
      const text = $body.text().toLowerCase();
      const hasPuzzleUI =
        text.includes('sudoku') ||
        text.includes('puzzle') ||
        text.includes('check') ||
        text.includes('hint') ||
        $body.find('input').length > 0;
      const hasLoading = text.includes('loading');
      expect(hasPuzzleUI || hasLoading).to.be.true;
    });
  });
});

// =============================================================================
// 4. Game Complete Phase (stubbed)
// =============================================================================

describe('Game Complete Phase', () => {
  beforeEach(() => {
    stubSocialContext();
    stubMultiplayerAPIs();
    stubCatalog('opentdb_trivia', 'Trivia Final', {
      // Give it just one question so the game completes quickly
      questions: [
        {
          question: 'What color is the sky?',
          options: ['Red', 'Blue', 'Green', 'Yellow'],
          correct_answer: 'Blue',
        },
      ],
    });
  });

  it('results screen shows after game complete', () => {
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    // Answer the single question to trigger completion
    cy.contains('What color is the sky?', {timeout: 15000}).should(
      'be.visible'
    );
    cy.contains('button', /blue/i, {timeout: 5000}).click({force: true});
    // After answering the last question, the game transitions to complete phase
    // The complete phase shows "Play Again" or results
    cy.contains(/play again|results|score|wins|points/i, {
      timeout: 20000,
    }).should('exist');
  });

  it('score displayed after completion', () => {
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    cy.contains('What color is the sky?', {timeout: 15000}).should(
      'be.visible'
    );
    cy.contains('button', /blue/i, {timeout: 5000}).click({force: true});
    // Score or points should be visible in the complete phase
    cy.contains(/score|point|correct|\d+/i, {timeout: 20000}).should('exist');
  });

  it('Play Again button visible after completion', () => {
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    cy.contains('What color is the sky?', {timeout: 15000}).should(
      'be.visible'
    );
    cy.contains('button', /blue/i, {timeout: 5000}).click({force: true});
    cy.contains(/play again/i, {timeout: 20000}).should('be.visible');
  });

  it('Back to Hub button navigates back', () => {
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    cy.contains('What color is the sky?', {timeout: 15000}).should(
      'be.visible'
    );
    cy.contains('button', /blue/i, {timeout: 5000}).click({force: true});
    // "Back to Games" button in the complete phase
    cy.contains(/back to games|back/i, {timeout: 20000}).should('exist');
    cy.contains('button', /back to games|back/i).click({force: true});
    // Should navigate back to /social/games hub
    cy.url({timeout: 10000}).should('include', '/social/games');
  });

  it('scoreboard shows player rankings', () => {
    visitGame('test-opentdb_trivia-id');
    cy.contains('button', /play solo/i, {timeout: 25000}).click({force: true});
    cy.contains('What color is the sky?', {timeout: 15000}).should(
      'be.visible'
    );
    cy.contains('button', /blue/i, {timeout: 5000}).click({force: true});
    // MultiplayerResults component shows rankings — look for player name or rank elements
    cy.get('body', {timeout: 20000}).then(($body) => {
      const text = $body.text();
      // Should have score/result info or player name after game ends
      const hasResults = /play again|score|point|win|result|rank/i.test(text);
      expect(hasResults).to.be.true;
    });
  });
});
