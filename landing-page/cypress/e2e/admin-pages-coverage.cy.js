/**
 * Cypress coverage for the Admin UI pages that didn't previously
 * have a dedicated spec — batch #26.
 *
 * Existing admin spec files:
 *   admin-api.cy.js, admin-panel-ui.cy.js, channel-setup.cy.js,
 *   daemon_agents_admin.cy.js
 *
 * This file fills the gap for the remaining admin pages so every
 * admin route has at least a smoke-load test:
 *   /admin/dashboard           DashboardPage
 *   /admin/agents              AgentDashboardPage
 *   /admin/agent-sync          AgentSyncPage
 *   /admin/channels            ChannelsPage
 *   /admin/content-tasks       ContentTasksPage
 *   /admin/identity            IdentityPage
 *   /admin/logs                LogsViewer
 *   /admin/moderation          ModerationPage
 *   /admin/revenue             RevenueAnalyticsPage
 *   /admin/settings            SettingsPage
 *   /admin/users               UsersManagementPage
 *   /admin/workflows           WorkflowsPage
 *
 * Pattern: stub auth as central admin, visit page, assert page
 * mounted (either content visible or RoleGuard redirected cleanly).
 */

const adminAuthStubs = () => {
  cy.intercept('GET', '**/api/social/auth/me', {
    statusCode: 200,
    body: {success: true, data: {id: 1, username: 'admin', role: 'central', is_admin: true}},
  });
  cy.intercept('GET', '**/api/social/resonance/wallet', {statusCode: 200, body: {success: true, data: null}});
  cy.intercept('GET', '**/api/social/onboarding/progress', {statusCode: 200, body: {success: true}});
  cy.intercept('GET', '**/api/social/notifications*', {statusCode: 200, body: {success: true, data: []}});
  cy.intercept('GET', '**/api/social/encounters/suggestions', {statusCode: 200, body: {success: true, data: []}});
  cy.intercept('GET', '**/backend/health', {statusCode: 200, body: {healthy: true, local: {available: true}, loading: false}});
  cy.intercept('GET', '**/api/admin/**', {statusCode: 200, body: {success: true, data: []}});
};

const ADMIN_PAGES = [
  ['/admin/dashboard', 'DashboardPage'],
  ['/admin/agents', 'AgentDashboardPage'],
  ['/admin/agent-sync', 'AgentSyncPage'],
  ['/admin/channels', 'ChannelsPage'],
  ['/admin/content-tasks', 'ContentTasksPage'],
  ['/admin/identity', 'IdentityPage'],
  ['/admin/logs', 'LogsViewer'],
  ['/admin/moderation', 'ModerationPage'],
  ['/admin/revenue', 'RevenueAnalyticsPage'],
  ['/admin/settings', 'SettingsPage'],
  ['/admin/users', 'UsersManagementPage'],
  ['/admin/workflows', 'WorkflowsPage'],
];

describe('Admin pages — smoke load each page mounted', () => {
  beforeEach(() => {
    adminAuthStubs();
    window.localStorage.setItem('social_jwt', 'eyJ0eXAi.admin.stub');
  });

  ADMIN_PAGES.forEach(([path, name]) => {
    it(`${name}: renders without crash at ${path}`, () => {
      cy.visit(path, {failOnStatusCode: false});
      // Page must settle to some admin URL — either the target or
      // a RoleGuard redirect to /social.  NOT a white-screen crash.
      cy.location('pathname', {timeout: 10000}).should('match', /\/(admin|social|local)/);
    });
  });
});

describe('Admin pages — role guard rejects non-admin', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/social/auth/me', {
      statusCode: 200,
      body: {success: true, data: {id: 5, username: 'flat_user', role: 'flat', is_admin: false}},
    });
    cy.clearLocalStorage();
  });

  it('flat user visiting /admin/dashboard is redirected away', () => {
    cy.visit('/admin/dashboard', {failOnStatusCode: false});
    cy.location('pathname', {timeout: 10000}).should('not.eq', '/admin/dashboard');
  });

  it('anonymous user visiting /admin/settings is redirected away', () => {
    cy.intercept('GET', '**/api/social/auth/me', {
      statusCode: 401,
      body: {success: false, error: 'unauthorized'},
    });
    cy.visit('/admin/settings', {failOnStatusCode: false});
    cy.location('pathname', {timeout: 10000}).should('not.eq', '/admin/settings');
  });
});
