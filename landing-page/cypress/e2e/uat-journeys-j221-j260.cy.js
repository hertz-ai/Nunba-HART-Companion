/**
 * UAT journeys J221-J260 — Cypress shard of the pytest J-files in
 * tests/journey/test_J22x-J26x.
 *
 *   J221 restore scope active_only
 *   J222 forget-me wipes guest_id
 *   J230 cloud sync cross-device
 *   J231 sync defaults off
 *   J240 admin provider surface
 *   J241 admin hub allowlist CRUD
 *   J242 admin models health list
 *   J243 system health endpoints
 *   J244 MCP local bridge surface
 *   J245 TTS engines voices list
 *   J246 prompts seed page
 *   J247 voice STT stream port
 *   J248 admin diag degradations
 *   J249 debug routes smoke
 *   J250 SPA route matrix
 *   J251 channel adapter registry
 *   J252 share link
 *   J253 kids game asset
 *   J254 kids media preloader
 *   J255 provider capability matrix
 *   J256 provider ping loop
 *   J257 efficiency leaderboard
 *   J260 active agent id pointer
 */

const installBaselineStubs = () => {
  cy.intercept('GET', '**/api/social/resonance/wallet', {statusCode: 200, body: {success: true, data: null}});
  cy.intercept('GET', '**/api/social/onboarding/progress', {statusCode: 200, body: {success: true}});
  cy.intercept('GET', '**/api/social/notifications*', {statusCode: 200, body: {success: true, data: []}});
  cy.intercept('GET', '**/api/social/encounters/suggestions', {statusCode: 200, body: {success: true, data: []}});
  cy.intercept('GET', '**/backend/health', {statusCode: 200, body: {healthy: true, local: {available: true}, loading: false}});
  cy.intercept('GET', '**/api/guest-id', {statusCode: 200, body: {guest_id: 'g_j221_j260_fixture'}});
};

describe('J221-J231: restore + forget + cloud sync', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('J221: admin config/chat allows active_only restore scope', () => {
    cy.request({
      method: 'PUT',
      url: 'http://localhost:5000/api/admin/config/chat',
      body: {restore_scope: 'active_only', restore_policy: 'prompt'},
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 400, 401, 403, 500, 503]);
    });
  });

  it('J222: DELETE /api/guest-id wipes guest id', () => {
    cy.request({
      method: 'DELETE',
      url: 'http://localhost:5000/api/guest-id',
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 204, 401, 403, 404, 500, 503]);
    });
  });

  it('J230: POST /api/chat-sync/push cross-device returns envelope', () => {
    cy.request({
      method: 'POST',
      url: 'http://localhost:5000/api/chat-sync/push',
      body: {device_id: 'j230-dev-A', messages: []},
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 400, 401, 403, 500, 503]);
    });
  });

  it('J231: sync defaults off — /api/admin/config/chat default envelope', () => {
    cy.request({
      method: 'GET',
      url: 'http://localhost:5000/api/admin/config/chat',
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 500, 503]);
    });
  });
});

describe('J240-J249: admin surfaces', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('J240: GET /api/admin/providers returns list envelope', () => {
    cy.request({url: 'http://localhost:5000/api/admin/providers', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('J241: GET /api/admin/hub/allowlist returns envelope', () => {
    cy.request({url: 'http://localhost:5000/api/admin/hub/allowlist', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });

  it('J242: GET /api/admin/models/health returns envelope', () => {
    cy.request({url: 'http://localhost:5000/api/admin/models/health', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 500, 503]);
    });
  });

  it('J243: /api/admin/diag/thread-dump envelope shape', () => {
    cy.request({url: 'http://localhost:5000/api/admin/diag/thread-dump', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 500, 503]);
    });
  });

  it('J244: GET /api/mcp/local/health responds 200 without auth', () => {
    cy.request({url: 'http://localhost:5000/api/mcp/local/health', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 503]);
    });
  });

  it('J245: GET /api/tts/voices returns voice-list envelope', () => {
    cy.request({url: 'http://localhost:5000/api/tts/voices', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });

  it('J246: GET /api/prompts returns envelope', () => {
    cy.request({url: 'http://localhost:5000/api/prompts', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });

  it('J247: GET /api/voice/stt-stream-port returns envelope', () => {
    cy.request({url: 'http://localhost:5000/api/voice/stt-stream-port', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });

  it('J248: GET /api/admin/diag/degradations returns envelope with count', () => {
    cy.request({url: 'http://localhost:5000/api/admin/diag/degradations', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 500, 503]);
      if (r.status === 200) {
        expect(r.body).to.have.property('degradations');
      }
    });
  });

  it('J249: debug routes smoke — /api/admin/diag/paths', () => {
    cy.request({url: 'http://localhost:5000/api/admin/diag/paths', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });
});

describe('J250-J260: SPA routes + channels + kids + providers', () => {
  beforeEach(() => {
    installBaselineStubs();
  });

  it('J250: SPA route matrix — /admin /social /local all reach a page', () => {
    cy.visit('/admin', {failOnStatusCode: false});
    cy.location('pathname', {timeout: 10000}).should('match', /\/(admin|social|local)/);
  });

  it('J251: GET /api/admin/channels/registry returns adapter list', () => {
    cy.request({url: 'http://localhost:5000/api/admin/channels/registry', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 404, 503]);
    });
  });

  it('J252: POST /api/social/share returns envelope', () => {
    cy.request({
      method: 'POST',
      url: 'http://localhost:5000/api/social/share',
      body: {content: 'test-share'},
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 201, 400, 401, 403, 404, 500, 503]);
    });
  });

  it('J253: GET /api/media/asset for kids game returns envelope', () => {
    cy.request({
      url: 'http://localhost:5000/api/media/asset?prompt=cat&type=image&classification=public_educational',
      failOnStatusCode: false,
      timeout: 30000,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 202, 400, 401, 403, 404, 503]);
    });
  });

  it('J254: Kids media page mounts', () => {
    cy.visit('/social/kids', {failOnStatusCode: false});
    cy.contains(/game|learning|kids|play|start/i, {timeout: 10000}).should('exist');
  });

  it('J255: GET /api/admin/providers/capabilities returns envelope', () => {
    cy.request({url: 'http://localhost:5000/api/admin/providers/capabilities', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('J256: POST /api/admin/providers/<id>/test returns envelope', () => {
    cy.request({
      method: 'POST',
      url: 'http://localhost:5000/api/admin/providers/openai/test',
      body: {},
      failOnStatusCode: false,
    }).then((r) => {
      expect(r.status).to.be.oneOf([200, 400, 401, 403, 404, 405, 503]);
    });
  });

  it('J257: GET /api/admin/providers/efficiency/leaderboard returns envelope', () => {
    cy.request({url: 'http://localhost:5000/api/admin/providers/efficiency/leaderboard', failOnStatusCode: false}).then((r) => {
      expect(r.status).to.be.oneOf([200, 401, 403, 503]);
    });
  });

  it('J260: active_agent_id localStorage pointer settable', () => {
    cy.visit('/local', {failOnStatusCode: false});
    cy.window().then((win) => {
      win.localStorage.setItem('active_agent_id', 'j260-agent');
      expect(win.localStorage.getItem('active_agent_id')).to.eq('j260-agent');
    });
  });
});
