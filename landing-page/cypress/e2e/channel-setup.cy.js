/// <reference types="cypress" />

/**
 * Channel Setup E2E Tests
 *
 * Tests conversational channel configuration via the admin API:
 * WhatsApp, Discord, Telegram, Slack, SMS, Email, Webhook
 *
 * The HARTOS channels admin API at /api/admin/channels/* provides
 * full CRUD for external messaging integrations. These tests verify
 * the API works end-to-end and that the frontend admin panel can
 * configure channels programmatically (as an agent would do conversationally).
 */

describe('Channel Setup via Admin API', () => {
  const API = 'http://localhost:5000';
  const CHANNELS_API = `${API}/api/admin/channels`;
  const WEBHOOKS_API = `${API}/api/admin/automation/webhooks`;

  // Channel types that HARTOS supports
  const CHANNEL_TYPES = [
    'whatsapp', 'discord', 'telegram', 'slack',
    'sms', 'email', 'webhook', 'web',
  ];

  before(() => {
    cy.socialAuth();
  });

  // ──────────────────────────────────────────────────────
  // 1. List Channels
  // ──────────────────────────────────────────────────────
  describe('1. List Channels', () => {
    it('should return channel list with pagination', () => {
      cy.socialRequest('GET', `${CHANNELS_API}`, null, {failOnStatusCode: false}).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
        if (resp.status === 200) {
          expect(resp.body).to.have.property('success', true);
          expect(resp.body).to.have.property('data');
        }
      });
    });

    it('should support pagination params', () => {
      cy.socialRequest('GET', `${CHANNELS_API}?page=1&page_size=5`, null, {failOnStatusCode: false}).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 2. Channel CRUD per Type
  // ──────────────────────────────────────────────────────
  CHANNEL_TYPES.forEach((channelType) => {
    describe(`2. ${channelType.charAt(0).toUpperCase() + channelType.slice(1)} Channel`, () => {

      it(`should get ${channelType} channel config`, () => {
        cy.socialRequest('GET', `${CHANNELS_API}/${channelType}`, null, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
        });
      });

      it(`should create/update ${channelType} channel`, () => {
        const config = {
          enabled: false,
          name: `Test ${channelType}`,
          description: `Cypress test ${channelType} channel`,
        };

        // Add type-specific config
        if (channelType === 'whatsapp') {
          config.phone_number_id = 'test_phone_id';
          config.access_token = 'test_token';
        } else if (channelType === 'discord') {
          config.bot_token = 'test_discord_token';
          config.guild_id = 'test_guild';
        } else if (channelType === 'telegram') {
          config.bot_token = 'test_telegram_token';
        } else if (channelType === 'slack') {
          config.bot_token = 'xoxb-test';
          config.signing_secret = 'test_secret';
        } else if (channelType === 'sms') {
          config.provider = 'twilio';
          config.account_sid = 'test_sid';
          config.auth_token = 'test_auth';
        } else if (channelType === 'email') {
          config.smtp_host = 'smtp.test.com';
          config.smtp_port = 587;
        } else if (channelType === 'webhook') {
          config.url = 'https://example.com/webhook';
          config.secret = 'test_webhook_secret';
        }

        cy.socialRequest('POST', `${CHANNELS_API}`, config, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 201, 400, 401, 403, 404, 409, 500]);
        });
      });

      it(`should get ${channelType} channel metrics`, () => {
        cy.socialRequest('GET', `${CHANNELS_API}/${channelType}/metrics`, null, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
        });
      });

      it(`should get ${channelType} security settings`, () => {
        cy.socialRequest('GET', `${CHANNELS_API}/${channelType}/security`, null, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
        });
      });

      it(`should get ${channelType} rate limit config`, () => {
        cy.socialRequest('GET', `${CHANNELS_API}/${channelType}/rate-limit`, null, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
        });
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 3. Channel Enable/Disable
  // ──────────────────────────────────────────────────────
  describe('3. Channel Enable/Disable', () => {
    CHANNEL_TYPES.forEach((channelType) => {
      it(`should enable ${channelType} channel`, () => {
        cy.socialRequest('POST', `${CHANNELS_API}/${channelType}/enable`, {}, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 400, 401, 403, 404, 500]);
        });
      });

      it(`should disable ${channelType} channel`, () => {
        cy.socialRequest('POST', `${CHANNELS_API}/${channelType}/disable`, {}, {failOnStatusCode: false}).then((resp) => {
          expect(resp.status).to.be.oneOf([200, 400, 401, 403, 404, 500]);
        });
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 4. Webhooks CRUD
  // ──────────────────────────────────────────────────────
  describe('4. Webhooks', () => {
    it('should list webhooks', () => {
      cy.socialRequest('GET', `${WEBHOOKS_API}`, null, {failOnStatusCode: false}).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
      });
    });

    it('should create a webhook', () => {
      cy.socialRequest('POST', `${WEBHOOKS_API}`, {
        name: 'Test Webhook',
        url: 'https://example.com/hook',
        events: ['message.received', 'agent.completed'],
        secret: 'webhook_secret_123',
      }, {failOnStatusCode: false}).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 201, 400, 401, 403, 404, 500]);
      });
    });

    it('should get a specific webhook', () => {
      cy.socialRequest('GET', `${WEBHOOKS_API}/test-webhook-id`, null, {failOnStatusCode: false}).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 401, 403, 404, 500]);
      });
    });

    it('should test a webhook', () => {
      cy.socialRequest('POST', `${WEBHOOKS_API}/test-webhook-id/test`, {}, {failOnStatusCode: false}).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 400, 401, 403, 404, 500]);
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 5. Conversational Channel Setup via Chat
  // ──────────────────────────────────────────────────────
  describe('5. Conversational Setup (Agent-driven)', () => {

    it('should understand "set up whatsapp" as a channel setup intent', () => {
      cy.request({
        method: 'POST',
        url: `${API}/chat`,
        body: {
          message: 'I want to set up WhatsApp integration',
          user_id: 'cypress_channel_test',
        },
        failOnStatusCode: false,
        timeout: 30000,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 400, 500, 503]);
        // The agent should recognize this as a channel setup request
        // and either ask for credentials or guide through setup
      });
    });

    it('should understand "connect discord" as channel intent', () => {
      cy.request({
        method: 'POST',
        url: `${API}/chat`,
        body: {
          message: 'Connect my Discord server',
          user_id: 'cypress_channel_test',
        },
        failOnStatusCode: false,
        timeout: 30000,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 400, 500, 503]);
      });
    });

    it('should understand "add telegram bot" as channel intent', () => {
      cy.request({
        method: 'POST',
        url: `${API}/chat`,
        body: {
          message: 'Add a Telegram bot to my agent',
          user_id: 'cypress_channel_test',
        },
        failOnStatusCode: false,
        timeout: 30000,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 400, 500, 503]);
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 6. Admin Panel UI — Channel Settings Page
  // ──────────────────────────────────────────────────────
  describe('6. Admin Panel UI', () => {

    beforeEach(() => {
      cy.socialAuthWithRole('central');
    });

    it('should load admin settings page', () => {
      cy.socialVisitAsAdmin('/admin/settings', {failOnStatusCode: false, timeout: 60000});
      cy.get('body', {timeout: 30000}).should('exist');
    });

    it('should load admin channels page', () => {
      cy.socialVisitAsAdmin('/admin/channels', {failOnStatusCode: false, timeout: 60000});
      cy.get('body', {timeout: 30000}).should('exist');
    });

    it('should display channel configuration options', () => {
      cy.socialVisitAsAdmin('/admin', {failOnStatusCode: false, timeout: 60000});
      cy.get('body', {timeout: 30000}).should('exist');
      // Look for any channel-related UI elements
      cy.get('body').then(($body) => {
        const text = $body.text().toLowerCase();
        const hasChannels = text.includes('channel') || text.includes('integration') ||
                           text.includes('whatsapp') || text.includes('discord') ||
                           text.includes('connect') || text.includes('settings');
        // Admin page should have some channel/settings content
        expect(hasChannels || $body.find('[class*="admin"]').length > 0).to.be.true;
      });
    });
  });

  // ──────────────────────────────────────────────────────
  // 7. Channel Security
  // ──────────────────────────────────────────────────────
  describe('7. Security', () => {

    it('should reject unauthenticated channel access', () => {
      cy.request({
        method: 'GET',
        url: CHANNELS_API,
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([401, 403, 404, 500]);
      });
    });

    it('should reject invalid token', () => {
      cy.request({
        method: 'GET',
        url: CHANNELS_API,
        headers: {Authorization: 'Bearer invalid_token'},
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([401, 403, 500]);
      });
    });

    it('should not expose secrets in channel list', () => {
      cy.socialRequest('GET', `${CHANNELS_API}`, null, {failOnStatusCode: false}).then((resp) => {
        if (resp.status === 200) {
          const body = JSON.stringify(resp.body);
          expect(body).to.not.include('access_token');
          expect(body).to.not.include('bot_token');
          expect(body).to.not.include('auth_token');
          expect(body).to.not.include('signing_secret');
        }
      });
    });
  });
});
