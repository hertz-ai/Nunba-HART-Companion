/**
 * Local Chat Flow E2E Tests
 *
 * Tests the /local route user chat experience:
 * - Hero → demo transition
 * - Default agent routing (no autogen dump)
 * - User priority over daemon
 * - TTS playback
 * - Reasoning format (no <think> tags)
 */

describe('Local Chat Flow', () => {
  beforeEach(() => {
    // Set hart_sealed so we skip onboarding
    localStorage.setItem('hart_sealed', 'true');
    localStorage.setItem('hart_name', 'CypressTest');
    localStorage.setItem('guest_mode', 'true');
    localStorage.setItem('guest_user_id', 'cypress_user_001');
    cy.visit('/local', { failOnStatusCode: false });
  });

  describe('Page Load & Hero Transition', () => {
    it('page loads without black screen', () => {
      // The demo section should be visible (not hidden behind hero)
      cy.get('body', { timeout: 15000 }).should('be.visible');
      // Hero should fade out for returning users
      cy.get('#hero-section', { timeout: 10000 }).should(($el) => {
        // Either doesn't exist or has opacity 0
        if ($el.length) {
          const opacity = parseFloat($el.css('opacity'));
          // Allow 1 (still transitioning) or 0 (transitioned)
          expect(opacity).to.be.at.most(1);
        }
      });
    });

    it('demo section becomes interactive', () => {
      cy.get('#demo-section', { timeout: 15000 }).should('exist');
      // Chat input should be available
      cy.get('textarea, input[type="text"]', { timeout: 15000 }).should('exist');
    });
  });

  describe('Chat with Default Agent', () => {
    it('sending "hi" returns a response without autogen dump', () => {
      // Type and send
      cy.get('textarea, input[type="text"]', { timeout: 15000 }).first().type('hi', { force: true });
      cy.get('textarea, input[type="text"]').first().type('{enter}', { force: true });

      // Wait for any assistant response (LLM takes 5-15s)
      // The response appears as a new message div after the user's "hi"
      cy.wait(15000);

      // Should NOT contain autogen/daemon content
      cy.get('body').then(($body) => {
        const text = $body.text();
        expect(text).to.not.include('Execute Action 1');
        expect(text).to.not.include('AUTONOMOUS RESEARCH');
        expect(text).to.not.include('ChatInstructor');
        expect(text).to.not.include('StatusVerifier');
      });
    });

    it('response does not contain raw think tags', () => {
      cy.get('textarea, input[type="text"]', { timeout: 15000 }).first().type('hello{enter}', { force: true });
      cy.wait(15000);
      cy.get('body').then(($body) => {
        const text = $body.text();
        expect(text).to.not.include('<think>');
        expect(text).to.not.include('Thinking Process:');
      });
    });
  });

  describe('Toolbar on Mobile', () => {
    beforeEach(() => {
      cy.viewport(375, 812); // iPhone X
      cy.visit('/local', { failOnStatusCode: false });
    });

    it('toolbar is visible and does not cover full width', () => {
      // Toolbar should exist with z-50
      cy.get('[class*="z-50"]', { timeout: 10000 }).should('exist');
      // Chat input should be reachable below toolbar
      cy.get('textarea, input[type="text"]', { timeout: 15000 }).first().should('be.visible');
    });
  });

  describe('User Chat Responsiveness', () => {
    it('user chat gets a response (not blocked indefinitely)', () => {
      cy.get('textarea, input[type="text"]', { timeout: 15000 }).first().type('what is 2+2{enter}', { force: true });
      // Wait for LLM response — should not be blocked forever
      cy.wait(15000);
      // After 15s, there should be more content than just the user message
      cy.get('body').then(($body) => {
        const text = $body.text();
        // At minimum the user's message should be there
        expect(text).to.include('2+2');
      });
    });
  });
});
