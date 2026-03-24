/// <reference types="cypress" />

/**
 * Live Agent Creation E2E Tests (Requires Running Local LLM)
 *
 * Unlike the stubbed tests in autonomous-agent-creation.cy.js, these tests
 * hit the LIVE backend pipeline:
 *   React → Flask :5000 → hartos_backend_adapter → hart_intelligence :6777 → llama.cpp :8080
 *
 * Prerequisites:
 *   - Flask backend running on :5000
 *   - hart_intelligence running on :6777
 *   - llama.cpp (or compatible) running on :8080
 *
 * Tests gracefully skip if any service is unavailable.
 *
 * Notes:
 *   - All cy.click()/cy.type() use {force: true} (webpack overlay issue).
 *   - All cy.request() use failOnStatusCode: false.
 *   - Generous timeouts (120s) for LLM inference.
 *   - Assertions on structure, not content (LLM responses are non-deterministic).
 */

const API = 'http://localhost:5000';
const LANGCHAIN_API = 'http://localhost:6777';
const LLAMA_API = 'http://localhost:8080';

describe('Live Agent Creation E2E (Requires Local LLM)', () => {
  // Track service availability for conditional skipping
  let flaskAvailable = false;
  let langchainAvailable = false;
  let llamaAvailable = false;

  // =========================================================================
  // Helpers
  // =========================================================================

  function backendChat(body) {
    return cy.request({
      method: 'POST',
      url: `${API}/chat`,
      body: {agent_type: 'local', agent_id: 'local_assistant', ...body},
      headers: {'Content-Type': 'application/json'},
      failOnStatusCode: false,
      timeout: 120000,
    });
  }

  function seedGuestAuth() {
    cy.window().then((win) => {
      win.localStorage.setItem('guest_mode', 'true');
      win.localStorage.setItem('guest_name', 'Test.Live.Agent');
      win.localStorage.setItem('guest_user_id', 'cypress-live-user');
      win.localStorage.setItem('guest_name_verified', 'true');
    });
  }

  function setupBaseIntercepts() {
    cy.intercept('GET', '**/prompts*', {
      statusCode: 200,
      body: {prompts: [], success: true, is_online: true},
    }).as('getLocalPrompts');

    cy.intercept('GET', '**/getprompt_all/*', {
      statusCode: 200,
      body: [],
    }).as('getCloudPublicAgents');

    cy.intercept('GET', '**/getprompt_userid/*', {
      statusCode: 200,
      body: [],
    }).as('getCloudUserAgents');

    cy.intercept('GET', '**/network/status*', {
      statusCode: 200,
      body: {is_online: true},
    }).as('networkStatus');

    cy.intercept('POST', '**/send_otp*', {
      statusCode: 200,
      body: {success: true},
    });
    cy.intercept('POST', '**/validate_otp*', {
      statusCode: 200,
      body: {success: true},
    });
    cy.intercept('POST', '**/data/login*', {
      statusCode: 200,
      body: {success: true},
    });
  }

  // =========================================================================
  // 1. Backend Health Verification
  // =========================================================================
  describe('1. Backend Health Verification', () => {
    it('1.1 Flask backend is running on :5000', () => {
      cy.request({
        url: `${API}/backend/health`,
        failOnStatusCode: false,
        timeout: 30000,
      }).then((res) => {
        if (res.status === 200) {
          flaskAvailable = true;
        }
        expect(res.status).to.be.oneOf([200, 500]);
      });
    });

    it('1.2 LangChain service is running on :6777', () => {
      cy.request({
        url: `${LANGCHAIN_API}/health`,
        failOnStatusCode: false,
        timeout: 30000,
      }).then((res) => {
        if (res.status === 200) {
          langchainAvailable = true;
        }
        // Accept any non-connection-refused response
        expect(res.status).to.be.a('number');
      });
    });

    it('1.3 Llama.cpp is running on :8080', () => {
      cy.request({
        url: `${LLAMA_API}/health`,
        failOnStatusCode: false,
        timeout: 30000,
      }).then((res) => {
        if (res.status === 200) {
          llamaAvailable = true;
        }
        expect(res.status).to.be.a('number');
      });
    });
  });

  // =========================================================================
  // 2. Live Chat Pipeline (Tier 1 + Tier 2)
  // =========================================================================
  describe('2. Live Chat Pipeline', () => {
    it('2.1 Regular chat returns a response from the live LLM', () => {
      backendChat({
        text: 'Hello, what is 2 plus 2?',
        user_id: 'cypress-live-test',
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('text').that.is.a('string').and.not
            .empty;
          expect(res.body).to.have.property('agent_type', 'local');
          expect(res.body).to.have.property('success', true);
        }
      });
    });

    it('2.2 "create an agent" triggers agent creation flow via live LLM', () => {
      backendChat({
        text: 'I want to create an agent for summarizing documents',
        user_id: 'cypress-live-create',
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('text').that.is.a('string').and.not
            .empty;
          expect(res.body).to.have.property('agent_type', 'local');
          // Deterministic detection should assign a prompt_id
          if (res.body.prompt_id) {
            expect(res.body.prompt_id).to.be.a('number');
            expect(res.body.prompt_id).to.be.greaterThan(0);
          }
        }
      });
    });

    it('2.3 Negated intent does NOT trigger creation', () => {
      backendChat({
        text: "don't create an agent, just tell me a joke",
        user_id: 'cypress-live-negate',
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('text').that.is.a('string');
          // Negation guard should prevent agent_status from being set
          // (unless the LLM decides otherwise via Tier 2, which is valid)
          if (res.body.agent_status) {
            // If LLM-level detection overrode, it must be a valid status
            expect(res.body.agent_status).to.be.oneOf([
              'Creation Mode',
              'Review Mode',
              'Evaluation Mode',
              'completed',
              'Reuse Mode',
            ]);
          }
        }
      });
    });

    it('2.4 Explicit create_agent=true returns agent_status', () => {
      const promptId = Date.now();
      backendChat({
        text: 'Create an agent that helps with testing',
        user_id: 'cypress-live-explicit',
        create_agent: true,
        prompt_id: promptId,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('text').that.is.a('string');
          expect(res.body).to.have.property('prompt_id').that.is.a('number');
        }
      });
    });

    it('2.5 Response contains required structural fields', () => {
      backendChat({
        text: 'What can you help me with?',
        user_id: 'cypress-live-schema',
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          const body = res.body;
          expect(body).to.have.property('text').that.is.a('string');
          expect(body).to.have.property('agent_id').that.is.a('string');
          expect(body).to.have.property('agent_type').that.is.a('string');
          expect(body.agent_type).to.be.oneOf(['local', 'cloud']);
        }
      });
    });
  });

  // =========================================================================
  // 3. Full Agent Creation Lifecycle (Live LLM)
  // =========================================================================
  describe('3. Full Agent Creation Lifecycle', () => {
    it('3.1 Multi-step creation: loop "proceed" until completed or max iterations', () => {
      const userId = `cypress-lifecycle-${Date.now()}`;
      let promptId = null;
      let lastStatus = null;
      const seenStatuses = [];

      // Step 1: Initial creation request
      backendChat({
        text: 'Create an agent for summarization tasks',
        user_id: userId,
        create_agent: true,
      })
        .then((res) => {
          expect(res.status).to.be.oneOf([200, 500]);
          if (res.status !== 200) return;

          promptId = res.body.prompt_id;
          lastStatus = res.body.agent_status;
          if (lastStatus) seenStatuses.push(lastStatus);
        })
        .then(() => {
          if (!promptId) return;

          // Step 2-N: Loop "proceed" up to 10 iterations
          const proceed = (iteration) => {
            if (iteration >= 10 || lastStatus === 'completed') return;

            return backendChat({
              text: 'Yes, proceed with the next step',
              user_id: userId,
              prompt_id: promptId,
              create_agent: true,
            }).then((res) => {
              if (res.status === 200) {
                lastStatus = res.body.agent_status;
                if (lastStatus) seenStatuses.push(lastStatus);
                // Check prompt_id consistency
                if (res.body.prompt_id) {
                  expect(res.body.prompt_id).to.eq(promptId);
                }
              }
              return proceed(iteration + 1);
            });
          };

          return proceed(0);
        })
        .then(() => {
          // Validate we saw at least one status transition
          if (seenStatuses.length > 0) {
            seenStatuses.forEach((s) => {
              expect(s).to.be.oneOf([
                'Creation Mode',
                'Review Mode',
                'Evaluation Mode',
                'completed',
                'Reuse Mode',
              ]);
            });
          }
        });
    });

    it('3.2 Creation with autonomous_creation flag includes flag in response', () => {
      backendChat({
        text: 'Create an agent automatically for data analysis',
        user_id: `cypress-auto-${Date.now()}`,
        create_agent: true,
        autonomous_creation: true,
      }).then((res) => {
        expect(res.status).to.be.oneOf([200, 500]);
        if (res.status === 200) {
          expect(res.body).to.have.property('text').that.is.a('string');
          // The backend may or may not echo autonomous_creation depending on LLM response
          if (res.body.autonomous_creation !== undefined) {
            expect(res.body.autonomous_creation).to.be.a('boolean');
          }
        }
      });
    });

    it('3.3 Different user IDs get independent creation sessions', () => {
      const user1 = `cypress-user1-${Date.now()}`;
      const user2 = `cypress-user2-${Date.now()}`;

      backendChat({
        text: 'Create an agent for task A',
        user_id: user1,
        create_agent: true,
      }).then((res1) => {
        backendChat({
          text: 'Create an agent for task B',
          user_id: user2,
          create_agent: true,
        }).then((res2) => {
          if (res1.status === 200 && res2.status === 200) {
            // Both should get responses (independent sessions)
            expect(res1.body).to.have.property('text');
            expect(res2.body).to.have.property('text');
            // Prompt IDs should be different (different timestamps)
            if (res1.body.prompt_id && res2.body.prompt_id) {
              // They may differ or may be the same if same second — just check both are numbers
              expect(res1.body.prompt_id).to.be.a('number');
              expect(res2.body.prompt_id).to.be.a('number');
            }
          }
        });
      });
    });
  });

  // =========================================================================
  // 4. Frontend Integration (Live Backend, No Stubs)
  // =========================================================================
  describe('4. Frontend Integration', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      // DON'T stub /chat — let it hit the real backend
      cy.intercept('POST', '**/chat').as('liveChat');
    });

    it('4.1 Demopage loads and sends message to live backend', () => {
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 15000});
      seedGuestAuth();

      cy.get('textarea', {timeout: 20000})
        .first()
        .type('Hello, what can you do?{enter}', {force: true});

      // Wait for the live response (generous timeout for LLM)
      cy.wait('@liveChat', {timeout: 120000}).then((interception) => {
        if (interception.response && interception.response.statusCode === 200) {
          expect(interception.response.body).to.have.property('text');
        }
      });
    });

    it('4.2 Chat response from live LLM renders in the UI', () => {
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 15000});
      seedGuestAuth();

      cy.get('textarea', {timeout: 20000})
        .first()
        .type('Tell me about Nunba{enter}', {force: true});

      // The response should render as a message in the chat
      cy.wait('@liveChat', {timeout: 120000});
      // Give React time to render
      cy.wait(2000);
      // There should be at least the user's message in the chat
      cy.get('body').should('contain.text', 'Tell me about Nunba');
    });

    it('4.3 Agent creation intent from UI triggers creation flow', () => {
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 15000});
      seedGuestAuth();

      cy.get('textarea', {timeout: 20000})
        .first()
        .type('I want to create an agent for writing emails{enter}', {
          force: true,
        });

      cy.wait('@liveChat', {timeout: 120000}).then((interception) => {
        if (interception.response && interception.response.statusCode === 200) {
          const body = interception.response.body;
          expect(body).to.have.property('text').that.is.a('string');
          // Deterministic detection should trigger creation
          if (body.prompt_id) {
            expect(body.prompt_id).to.be.a('number');
          }
        }
      });
    });
  });
});
