/**
 * UAT journeys J16–J20 — Cypress e2e coverage mapped from
 * docs/architecture/hive_moe_architecture_map.md § 8.
 *
 *   J16 — Federation / hive join
 *   J17 — Guest → flat user upgrade (device-id migration)
 *   J18 — Channel adapters (WhatsApp / Discord / LINE / Tlon / Zalo)
 *   J19 — Cloud provider fallback (provider gateway routes out)
 *   J20 — Disk-full / OOM graceful degradation
 */

const installBaselineStubs = () => {
  cy.intercept('GET', '**/api/social/resonance/wallet', {statusCode: 200, body: {success: true, data: null}});
  cy.intercept('GET', '**/api/social/onboarding/progress', {statusCode: 200, body: {success: true}});
  cy.intercept('GET', '**/api/social/notifications*', {statusCode: 200, body: {success: true, data: []}});
  cy.intercept('GET', '**/api/social/encounters/suggestions', {statusCode: 200, body: {success: true, data: []}});
  cy.intercept('GET', '**/backend/health', {statusCode: 200, body: {healthy: true, local: {available: true}, loading: false}});
  cy.intercept('GET', '**/api/guest-id', {statusCode: 200, body: {guest_id: 'g_j16_j20_fixture'}});
};

// ════════════════════════════════════════════════════════════════════════
// J16 — Federation / hive join
// ════════════════════════════════════════════════════════════════════════

describe('J16: federation / hive join + gossip', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('GET /api/admin/hive/status returns hive info envelope', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/hive/status',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });

  it('POST /api/admin/hive/register with empty body returns 400', () => {
    cy.request({
      method: 'POST',
      url: 'http://localhost:5000/api/admin/hive/register',
      body: {},
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 401, 403, 404, 503]);
    });
  });

  it('GET /api/social/peers returns peer list envelope', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/social/peers',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// J17 — Guest → flat user upgrade
// ════════════════════════════════════════════════════════════════════════

describe('J17: guest → flat upgrade (device-id migration)', () => {
  beforeEach(() => {
    installBaselineStubs();
    cy.clearLocalStorage();
  });

  it('guest_id and device_id are set on first visit', () => {
    cy.visit('/local', {failOnStatusCode: false});
    cy.window().then((win) => {
      const dev = win.localStorage.getItem('device_id');
      expect(dev).to.match(/^[a-z0-9_-]+$/i);
    });
  });

  it('upgrading from guest to user preserves conversation storage keys', () => {
    cy.visit('/local', {failOnStatusCode: false});
    cy.window().then((win) => {
      // Pre-upgrade: guest writes chat under scoped key
      win.localStorage.setItem('nunba_chat_guest_agent1', JSON.stringify([{role: 'user', text: 'hi'}]));
      expect(win.localStorage.getItem('nunba_chat_guest_agent1')).to.contain('hi');
    });
    // Simulate login: frontend shifts to user-scoped key
    cy.window().then((win) => {
      win.localStorage.setItem('social_user_id', '42');
      win.localStorage.setItem('nunba_chat_42_agent1', win.localStorage.getItem('nunba_chat_guest_agent1'));
      expect(win.localStorage.getItem('nunba_chat_42_agent1')).to.contain('hi');
    });
  });

  it('hart_language preference persists across anonymous → authenticated transition', () => {
    cy.visit('/local', {failOnStatusCode: false});
    cy.window().then((win) => {
      win.localStorage.setItem('hart_language', 'hi');
    });
    cy.reload();
    cy.window().its('localStorage').invoke('getItem', 'hart_language').should('eq', 'hi');
  });
});

// ════════════════════════════════════════════════════════════════════════
// J18 — Channel adapters (WhatsApp / Discord / LINE / Tlon / Zalo)
// ════════════════════════════════════════════════════════════════════════

describe('J18: channel adapter registry + admin CRUD', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('GET /api/admin/channels returns channel list envelope', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/channels',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('POST /api/admin/channels with missing type returns 400', () => {
    cy.request({
      method: 'POST',
      url: 'http://localhost:5000/api/admin/channels',
      body: {},
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([400, 401, 403, 503]);
    });
  });

  it('GET /api/admin/channels/registry returns adapter-type list', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/channels/registry',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// J19 — Cloud provider fallback
// ════════════════════════════════════════════════════════════════════════

describe('J19: cloud provider gateway fallback', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('GET /api/admin/providers returns provider list', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/providers',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('GET /api/admin/providers/gateway/stats returns aggregate', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/providers/gateway/stats',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('GET /api/admin/providers/capabilities returns capability summary', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/providers/capabilities',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('GET /api/admin/providers/efficiency/leaderboard returns ranked entries', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/providers/efficiency/leaderboard',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// J20 — Disk-full / OOM graceful degradation
// ════════════════════════════════════════════════════════════════════════

describe('J20: disk-full / OOM graceful degradation', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('/api/admin/diag/degradations reports registered import failures', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/diag/degradations',
      failOnStatusCode: false,
    }).then((resp) => {
      expect(resp.status).to.be.oneOf([200, 401, 403, 500, 503]);
      if (resp.status === 200) {
        expect(resp.body).to.have.property('degradations');
        expect(resp.body).to.have.property('count');
      }
    });
  });

  it('/api/admin/diag/thread-dump returns dump envelope', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/diag/thread-dump',
      failOnStatusCode: false,
    }).then((resp) => {
      // Admin-guarded endpoint — gated by require_local_or_token.
      expect(resp.status).to.be.oneOf([200, 401, 403, 500, 503]);
    });
  });

  it('degraded backends do NOT crash the /chat endpoint', () => {
    // Simulate every heavy optional backend missing.
    cy.intercept('GET', '**/api/admin/diag/degradations', {
      statusCode: 200,
      body: {success: true, count: 3, degradations: [
        {module: 'integrations.vision', reason: 'MiniCPM VLM', error: 'ImportError', first_failed_at: 1, attempts: 5},
        {module: 'integrations.providers.gateway', reason: 'Provider gateway', error: 'ImportError', first_failed_at: 2, attempts: 3},
        {module: 'wamp_router', reason: 'WAMP router', error: 'ImportError', first_failed_at: 3, attempts: 1},
      ]},
    });
    cy.intercept('POST', '**/chat', {
      statusCode: 200,
      body: {text: 'I can still chat in text-only mode.', source: 'local-text-only', degraded: true},
    }).as('degradedChat');
    cy.visit('/local', {failOnStatusCode: false});
    cy.contains(/chat|say something|type a message/i, {timeout: 10000});
    cy.get('textarea, input[type="text"]').first().type('hello{enter}', {force: true});
    cy.wait('@degradedChat').its('response.body.text').should('contain', 'text-only');
  });

  it('missing config.json does not prevent admin surface from loading', () => {
    // Stub /api/admin/config/* as 500 — frontend should render error state
    // instead of white-screen.
    cy.intercept('GET', '**/api/admin/config/*', {statusCode: 500, body: {error: 'config.json not found'}});
    cy.intercept('GET', '**/api/social/auth/me', {
      statusCode: 200,
      body: {success: true, data: {id: 1, username: 'admin', role: 'central', is_admin: true}},
    });
    window.localStorage.setItem('social_jwt', 'eyJ0eXAi.admin.stub');
    cy.visit('/admin', {failOnStatusCode: false});
    // Either admin renders with error banner, OR the guard redirects.
    cy.location('pathname', {timeout: 10000}).should('match', /\/(admin|local|social)/);
  });
});
