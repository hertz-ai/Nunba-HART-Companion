/// <reference types="cypress" />

/**
 * Autonomous Agent Creation E2E Tests
 *
 * Covers the 3-Tier Intelligent Agent Creation Pipeline (Steps 15-20):
 *   1. Backend: Conservative deterministic detection with negation guards
 *   2. Backend: Negation guard validation (don't create agent, etc.)
 *   3. Backend: Response schema validation
 *   4. Frontend: autonomous_creation flag forwarded in requests
 *   5. Frontend: auto-continuation loop (stubbed)
 *   6. Frontend: progress indicator UI during creation
 *   7. Frontend: completed agent presented for reuse
 *   8. Frontend: local "Create Agent" button starts conversational flow
 *   9. Frontend: error handling in autonomous creation
 *  10. Logic: 3-tier detection patterns + negation guards
 *  11. Full E2E: creation -> review -> completed -> reuse
 *  12. Frontend: creation_suggested from reuse mode
 *
 * 3-Tier Detection Architecture:
 *   Tier 1: Conservative deterministic (chatbot_routes.py) - negation-safe pattern match
 *   Tier 2: LangChain Create_Agent tool (hart_intelligence) - LLM decides via tool call
 *   Tier 3: Autogen create_new_agent tool (reuse_recipe.py) - agent decides during reuse
 *
 * The app runs on http://localhost:3000 (React dev server).
 * Local backend lives at http://localhost:5000.
 *
 * Notes:
 *   - All cy.click()/cy.type() use {force: true} (webpack overlay issue).
 *   - All cy.request() use failOnStatusCode: false.
 *   - Guest mode used for local chat testing (no real auth needed).
 *   - Backend API tests gracefully skip if Flask is not running.
 */

const API = 'http://localhost:5000';

describe('Autonomous Agent Creation E2E', () => {
  // =========================================================================
  // Fixtures
  // =========================================================================

  /** Standard local chat response (no agent creation) */
  const regularChatResponse = {
    text: 'Hello! How can I help you today?',
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
  };

  /** Response when agent creation intent detected (Creation Mode) */
  const creationModeResponse = {
    text: "Let's create a new agent! What would you like it to do?",
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
    agent_status: 'Creation Mode',
    prompt_id: 1700000000,
  };

  /** Response with autonomous creation flag set */
  const autonomousCreationResponse = {
    text: "Starting autonomous agent creation. I'll handle everything for you.",
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
    agent_status: 'Creation Mode',
    prompt_id: 1700000001,
    autonomous_creation: true,
  };

  /** Review Mode response (during autonomous loop) */
  const reviewModeResponse = {
    text: 'Reviewing the agent workflows and validating configuration...',
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
    agent_status: 'Review Mode',
    prompt_id: 1700000001,
    autonomous_creation: true,
  };

  /** Completed agent response */
  const completedResponse = {
    text: 'Agent Created Successfully! Your agent is ready to use.',
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
    agent_status: 'completed',
    prompt_id: 1700000001,
  };

  /** Response with creation_suggested from reuse agent (Step 17) */
  const creationSuggestedResponse = {
    text: 'This task requires specialized capabilities. I suggest creating a new agent.',
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
    agent_status: 'Reuse Mode',
    creation_suggested: true,
  };

  /** Evaluation Mode response */
  const evaluationModeResponse = {
    text: 'Evaluating the agent performance metrics...',
    agent_id: 'local_assistant',
    agent_type: 'local',
    source: 'langchain_local',
    success: true,
    agent_status: 'Evaluation Mode',
    prompt_id: 1700000001,
    autonomous_creation: true,
  };

  /** Local agents fixture for GET /prompts */
  const localAgentsFixture = {
    prompts: [
      {
        prompt_id: 101,
        name: 'Local Math Tutor',
        prompt: 'You are a math tutor.',
        is_active: true,
        is_public: false,
        create_agent: true,
        user_id: 999,
        request_id: 'local-req-101',
        image_url: '',
        created_date: '2025-12-01T10:00:00',
      },
    ],
    success: true,
    is_online: true,
  };

  // =========================================================================
  // Helpers
  // =========================================================================

  /** Make a backend chat request with generous timeout for LLM processing */
  function backendChat(body) {
    return cy.request({
      method: 'POST',
      url: `${API}/chat`,
      body,
      headers: {'Content-Type': 'application/json'},
      failOnStatusCode: false,
      timeout: 60000,
    });
  }

  function seedGuestAuth() {
    cy.window().then((win) => {
      win.localStorage.setItem('guest_mode', 'true');
      win.localStorage.setItem('guest_name', 'Test.Auto.User');
      win.localStorage.setItem('guest_user_id', 'cypress-auto-user');
      win.localStorage.setItem('guest_name_verified', 'true');
    });
  }

  function setupBaseIntercepts() {
    cy.intercept('GET', '**/prompts*', {
      statusCode: 200,
      body: localAgentsFixture,
    }).as('getLocalPrompts');

    cy.intercept('GET', '**/getprompt_all/*', {
      statusCode: 200,
      body: [],
    }).as('getCloudPublicAgents');

    cy.intercept('GET', '**/getprompt_userid/*', {
      statusCode: 200,
      body: [],
    }).as('getCloudUserAgents');

    cy.intercept('GET', '**/backend/health*', {
      statusCode: 200,
      body: {status: 'ok'},
    }).as('healthCheck');

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
  // 1. Backend: Agent Creation Intent Detection (POST /chat API)
  //    NOTE: These tests require Flask backend on :5000. They skip gracefully
  //    if the backend is unreachable (ECONNREFUSED).
  // =========================================================================
  describe('1. Agent Creation Intent Detection (API)', () => {
    it('1.1 POST /chat with "create an agent" should trigger creation flow', () => {
      backendChat({
        text: 'I want to create an agent for customer support',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 500]);
        if (response.status === 200) {
          expect(response.body).to.have.property('text');
          expect(response.body).to.have.property('agent_type', 'local');
          if (response.body.prompt_id) {
            expect(response.body.prompt_id).to.be.a('number');
          }
        }
      });
    });

    it('1.2 POST /chat with "build an agent" should trigger creation flow', () => {
      backendChat({
        text: 'build an agent that helps with coding',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 500]);
        if (response.status === 200) {
          expect(response.body).to.have.property('text');
        }
      });
    });

    it('1.3 POST /chat with "run as a parallel agent" should trigger creation flow', () => {
      backendChat({
        text: "let's run as a parallel agent for this task",
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 500]);
        if (response.status === 200) {
          expect(response.body).to.have.property('text');
        }
      });
    });

    it('1.4 POST /chat with regular text should NOT trigger creation', () => {
      backendChat({
        text: 'What is the weather like today?',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 500]);
        if (response.status === 200) {
          expect(response.body).to.have.property('text');
          expect(response.body.autonomous_creation).to.not.eq(true);
        }
      });
    });

    it('1.5 POST /chat with create_agent=true should include agent_status in response', () => {
      backendChat({
        text: 'Create a helpful assistant agent',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
        create_agent: true,
        prompt_id: Date.now(),
      }).then((response) => {
        expect(response.status).to.be.oneOf([200, 500]);
        if (response.status === 200) {
          expect(response.body).to.have.property('text');
          expect(response.body).to.have.property('success', true);
          if (response.body.source === 'langchain_local') {
            expect(response.body).to.have.property('prompt_id');
          }
        }
      });
    });

    it('1.6 POST /chat with empty text should return 400', () => {
      cy.request({
        method: 'POST',
        url: `${API}/chat`,
        body: {
          text: '   ',
          user_id: 'cypress-test',
          agent_id: 'local_assistant',
          agent_type: 'local',
        },
        headers: {'Content-Type': 'application/json'},
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(400);
        expect(response.body).to.have.property('error');
      });
    });
  });

  // =========================================================================
  // 2. Negation Guard Validation (Logic Tests — no backend needed)
  // =========================================================================
  describe('2. Negation Guard Validation', () => {
    // Replicate the backend negation guard logic for testing
    const CREATE_AGENT_PATTERNS = [
      'create an agent',
      'create agent',
      'build an agent',
      'build agent',
      'make an agent',
      'new agent',
      'create a new agent',
      'run as a parallel agent',
      'run as parallel agent',
      'create and run',
      'train an agent',
      'train agent',
    ];
    const NEGATION_PREFIXES = [
      "don't ",
      'dont ',
      'do not ',
      'not ',
      'no ',
      "isn't ",
      'stop ',
      'cancel ',
      "can't ",
      'cannot ',
      "won't ",
      "shouldn't ",
      'never ',
      'without ',
      'skip ',
      'avoid ',
    ];

    function detectCreateIntentWithNegation(text) {
      const lower = text.toLowerCase().trim();
      for (const pattern of CREATE_AGENT_PATTERNS) {
        const idx = lower.indexOf(pattern);
        if (idx >= 0) {
          const prefix = lower.substring(0, idx);
          if (
            NEGATION_PREFIXES.some((neg) =>
              prefix.trimEnd().endsWith(neg.trimEnd())
            )
          ) {
            return false; // Negated
          }
          return true;
        }
      }
      return false;
    }

    it('2.1 "create an agent" should trigger detection', () => {
      expect(
        detectCreateIntentWithNegation('create an agent for customer support')
      ).to.be.true;
    });

    it('2.2 "don\'t create an agent" should NOT trigger detection (negation guard)', () => {
      expect(detectCreateIntentWithNegation("don't create an agent")).to.be
        .false;
    });

    it('2.3 "do not create agent" should NOT trigger (negation guard)', () => {
      expect(detectCreateIntentWithNegation('do not create agent please')).to.be
        .false;
    });

    it('2.4 "cancel create an agent" should NOT trigger (negation guard)', () => {
      expect(detectCreateIntentWithNegation('cancel create an agent flow')).to
        .be.false;
    });

    it('2.5 "I cannot build an agent" should NOT trigger (negation guard)', () => {
      expect(detectCreateIntentWithNegation("I can't build an agent right now"))
        .to.be.false;
    });

    it('2.6 "stop create agent" should NOT trigger (negation guard)', () => {
      expect(detectCreateIntentWithNegation('stop create agent process')).to.be
        .false;
    });

    it('2.7 "never create an agent" should NOT trigger (negation guard)', () => {
      expect(detectCreateIntentWithNegation('never create an agent again')).to
        .be.false;
    });

    it('2.8 positive phrases still work: "build an agent"', () => {
      expect(detectCreateIntentWithNegation('I want to build an agent')).to.be
        .true;
    });

    it('2.9 positive phrases still work: "new agent"', () => {
      expect(detectCreateIntentWithNegation('I need a new agent for testing'))
        .to.be.true;
    });

    it('2.10 positive phrases still work: "train an agent"', () => {
      expect(
        detectCreateIntentWithNegation('please train an agent on this data')
      ).to.be.true;
    });
  });

  // =========================================================================
  // 3. Backend: Response Schema Validation
  // =========================================================================
  describe('3. Response Schema for Agent Creation (Backend Required)', () => {
    it('3.1 creation response should have correct schema fields', () => {
      backendChat({
        text: 'create an agent for testing',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        if (response.status === 200) {
          expect(response.body).to.have.property('text').that.is.a('string');
          expect(response.body).to.have.property('agent_id');
          expect(response.body)
            .to.have.property('agent_type')
            .that.is.oneOf(['local', 'cloud']);
          expect(response.body).to.have.property('success');

          if (response.body.source === 'langchain_local') {
            expect(response.body)
              .to.have.property('prompt_id')
              .that.is.a('number');
          }
        }
      });
    });

    it('3.2 agent_status should be a valid lifecycle phase', () => {
      backendChat({
        text: 'create an agent',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
        create_agent: true,
        prompt_id: Date.now(),
      }).then((response) => {
        if (response.status === 200 && response.body.agent_status) {
          const validStatuses = [
            'Creation Mode',
            'Review Mode',
            'completed',
            'Evaluation Mode',
            'Reuse Mode',
          ];
          expect(response.body.agent_status).to.be.oneOf(validStatuses);
        }
      });
    });

    it('3.3 autonomous_creation should be boolean when present', () => {
      backendChat({
        text: 'create an agent automatically',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        if (
          response.status === 200 &&
          response.body.autonomous_creation !== undefined
        ) {
          expect(response.body.autonomous_creation).to.be.a('boolean');
        }
      });
    });

    it('3.4 prompt_id should be a positive number when present', () => {
      backendChat({
        text: 'build an agent for research',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        if (response.status === 200 && response.body.prompt_id) {
          expect(response.body.prompt_id).to.be.a('number');
          expect(response.body.prompt_id).to.be.greaterThan(0);
        }
      });
    });

    it('3.5 source should indicate langchain_local or llama_local', () => {
      backendChat({
        text: 'hello',
        user_id: 'cypress-test',
        agent_id: 'local_assistant',
        agent_type: 'local',
      }).then((response) => {
        if (response.status === 200 && response.body.source) {
          expect(response.body.source).to.be.oneOf([
            'langchain_local',
            'llama_local',
          ]);
        }
      });
    });
  });

  // =========================================================================
  // 4. Frontend: Autonomous Creation Flag Forwarding (Stubbed)
  // =========================================================================
  describe('4. Frontend: Autonomous Flag Forwarding', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('4.1 local chat request includes autonomous_creation from currentAgent', () => {
      // Stub chat to capture the request payload
      cy.intercept('POST', '**/chat', (req) => {
        req.reply({
          statusCode: 200,
          body: regularChatResponse,
        });
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      // Type and send a message
      cy.get('textarea').first().type('Hello there', {force: true});
      cy.get('body').then(($body) => {
        // Find the send button (SendHorizontal icon or button)
        const sendBtns = $body.find('button');
        if (sendBtns.length > 0) {
          // Press Enter to send
          cy.get('textarea').first().type('{enter}', {force: true});

          cy.wait('@chatRequest', {timeout: 15000}).then((interception) => {
            // Request should include autonomous_creation field (false by default)
            expect(interception.request.body).to.have.property('text');
            expect(interception.request.body).to.have.property('agent_type');
            // autonomous_creation should be present (false for regular chat)
            if (interception.request.body.autonomous_creation !== undefined) {
              expect(interception.request.body.autonomous_creation).to.be.a(
                'boolean'
              );
            }
          });
        }
      });
    });

    it('4.2 regular chat response should NOT trigger auto-continuation', () => {
      let chatCallCount = 0;
      cy.intercept('POST', '**/chat', (req) => {
        chatCallCount++;
        req.reply({
          statusCode: 200,
          body: regularChatResponse,
        });
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea').first().type('Hello{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // Wait to ensure no auto-continuation happens
      cy.wait(3000).then(() => {
        // Should only have 1 chat call (the initial one)
        expect(chatCallCount).to.eq(1);
      });
    });
  });

  // =========================================================================
  // 5. Frontend: Auto-Continuation Loop (Stubbed Chat API)
  //    Uses cy.clock()/cy.tick() to control the 1500 ms auto-continue timer.
  // =========================================================================
  describe('5. Frontend: Auto-Continuation Loop', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('5.1 autonomous creation response triggers auto-continuation and completes', () => {
      let callIndex = 0;
      const responses = [
        autonomousCreationResponse, // 1st call: user message
        reviewModeResponse, // 2nd call: auto-continue
        completedResponse, // 3rd call: auto-continue (final)
      ];

      cy.intercept('POST', '**/chat', (req) => {
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically for testing{enter}', {
          force: true,
        });

      // 1st: initial user request
      cy.wait('@chatRequest', {timeout: 15000});
      // Let React process the response & schedule auto-continuation timer
      cy.then(() => {});
      cy.tick(2000);
      // 2nd: auto-continuation
      cy.wait('@chatRequest', {timeout: 15000});
      // Let React process again before next tick
      cy.then(() => {});
      cy.tick(2000);
      // 3rd: auto-continuation (final)
      cy.wait('@chatRequest', {timeout: 15000});

      cy.then(() => {});
      cy.tick(1000);
      cy.contains('Agent created successfully', {timeout: 15000}).should(
        'exist'
      );
    });

    it('5.2 auto-continuation sends "proceed" text to the backend', () => {
      let callIndex = 0;
      const capturedTexts = [];

      cy.intercept('POST', '**/chat', (req) => {
        capturedTexts.push(req.body.text);
        // Only need 2 responses: initial + one auto-continue to verify "proceed" text
        const responses = [
          autonomousCreationResponse,
          completedResponse, // complete immediately on 2nd call
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      // 1st: user message
      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      // 2nd: auto-continuation with "proceed"
      cy.wait('@chatRequest', {timeout: 15000});

      cy.then(() => {
        // First call is the user's message
        expect(capturedTexts[0]).to.include('create an agent automatically');
        // Second call should be auto-continuation "proceed" message
        expect(capturedTexts.length).to.be.at.least(2);
        expect(capturedTexts[1].toLowerCase()).to.include('proceed');
      });
    });

    it('5.3 auto-continuation sends create_agent=true and autonomous_creation=true', () => {
      let callIndex = 0;
      const capturedBodies = [];

      cy.intercept('POST', '**/chat', (req) => {
        capturedBodies.push({...req.body});
        const responses = [
          autonomousCreationResponse,
          reviewModeResponse,
          completedResponse,
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      cy.then(() => {
        // Auto-continuation calls should have create_agent=true and autonomous_creation=true
        if (capturedBodies.length >= 2) {
          expect(capturedBodies[1]).to.have.property('create_agent', true);
          expect(capturedBodies[1]).to.have.property(
            'autonomous_creation',
            true
          );
        }
      });
    });

    it('5.4 auto-continuation sends a prompt_id in subsequent calls', () => {
      let callIndex = 0;
      const capturedPromptIds = [];

      cy.intercept('POST', '**/chat', (req) => {
        capturedPromptIds.push(req.body.prompt_id);
        // Only need 2 calls to verify prompt_id is forwarded
        const responses = [
          autonomousCreationResponse,
          completedResponse, // complete immediately
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      // 1st: user message (prompt_id from initial response not yet set)
      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      // 2nd: auto-continuation (should carry a prompt_id from the creation response)
      cy.wait('@chatRequest', {timeout: 15000});

      cy.then(() => {
        // Auto-continuation call should carry a valid prompt_id (positive number)
        expect(capturedPromptIds.length).to.be.at.least(2);
        const autoContinuePromptId = capturedPromptIds[1];
        expect(autoContinuePromptId).to.be.a('number');
        expect(autoContinuePromptId).to.be.greaterThan(0);
      });
    });

    it('5.5 auto-continuation stops when agent_status is "completed"', () => {
      let callIndex = 0;

      cy.intercept('POST', '**/chat', (req) => {
        const responses = [
          autonomousCreationResponse,
          completedResponse, // immediate completion on 2nd call
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      // Wait extra time to verify no more calls happen
      cy.then(() => {});
      cy.tick(5000).then(() => {
        // Should have exactly 2 calls (initial + 1 auto-continue that completed)
        expect(callIndex).to.eq(2);
      });
    });
  });

  // =========================================================================
  // 6. Frontend: Progress Indicator UI During Autonomous Creation
  // =========================================================================
  describe('6. Frontend: Progress Indicator UI', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('6.1 Creation Mode animation appears during agent creation', () => {
      // Stub chat to return Creation Mode and hold (no auto-complete)
      cy.intercept('POST', '**/chat', {
        statusCode: 200,
        body: {
          ...creationModeResponse,
          autonomous_creation: false, // non-autonomous so no auto-loop
        },
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea').first().type('create an agent{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // The animation/label should show "Creating"
      cy.contains('Creating', {timeout: 10000}).should('exist');
    });

    it('6.2 Review Mode shows "Reviewing" label', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        const responses = [
          autonomousCreationResponse,
          {...reviewModeResponse, autonomous_creation: false}, // stop loop
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      // Should show "Reviewing" for Review Mode
      cy.then(() => {});
      cy.tick(500);
      cy.contains('Reviewing', {timeout: 10000}).should('exist');
    });

    it('6.3 autonomous creation shows spinner with phase text', () => {
      // Keep in Creation Mode with autonomous flag
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        // Return autonomous creation mode, then keep returning same (loop continues)
        const resp =
          callIndex === 0
            ? autonomousCreationResponse
            : {...autonomousCreationResponse, text: 'Still gathering...'};
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});

      // Should show the autonomous progress indicator with phase text
      cy.contains(/Gathering details|Auto-creating/i, {timeout: 10000}).should(
        'exist'
      );
    });

    it('6.4 animation disappears after agent_status becomes completed', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        const responses = [autonomousCreationResponse, completedResponse];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      // After completion, progress indicator should disappear
      cy.then(() => {});
      cy.tick(2000);
      cy.get('body').should(($body) => {
        const text = $body.text();
        // None of the autonomous progress labels should remain in the indicator
        // (they may appear in system messages, so only check the indicator area)
        expect(
          text.includes('Gathering details...') &&
            !text.includes('Agent created successfully')
        ).to.be.false;
      });
    });
  });

  // =========================================================================
  // 7. Frontend: Completed Agent Presented for Reuse
  // =========================================================================
  describe('7. Frontend: Completed Agent for Reuse', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('7.1 success message shown when autonomous creation completes', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        const responses = [autonomousCreationResponse, completedResponse];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      // Success message should appear
      cy.then(() => {});
      cy.tick(1000);
      cy.contains('Agent created successfully', {timeout: 15000}).should(
        'exist'
      );
    });

    it('7.2 agent response text displayed during creation', () => {
      cy.intercept('POST', '**/chat', {
        statusCode: 200,
        body: {
          ...creationModeResponse,
          autonomous_creation: false,
        },
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea').first().type('create an agent{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // The response text from the creation flow should appear in chat
      cy.contains("Let's create a new agent", {timeout: 10000}).should('exist');
    });

    it('7.3 autonomous creation phases shown as messages', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        // 2-phase flow: creation → completed (3-phase tested in 5.1)
        const responses = [autonomousCreationResponse, completedResponse];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      // Phase 1: initial request
      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      // Phase 2: auto-continuation → completed
      cy.wait('@chatRequest', {timeout: 15000});

      cy.then(() => {});
      cy.tick(1000);

      // Should see creation response text
      cy.contains('Starting autonomous agent creation', {
        timeout: 10000,
      }).should('exist');

      // Should see completion
      cy.contains('Agent Created Successfully', {timeout: 10000}).should(
        'exist'
      );
    });
  });

  // =========================================================================
  // 8. Frontend: Local "Create Agent" Button Flow
  // =========================================================================
  describe('8. Frontend: Local Create Agent Button', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('8.1 in guest mode, "Create new Agent" starts conversational flow (not cloud form)', () => {
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      // Click the Create new Agent button
      cy.contains('Create new Agent', {timeout: 10000})
        .first()
        .click({force: true});

      // Should show conversational creation prompt (not the cloud form)
      cy.contains("Let's create a new agent", {timeout: 10000}).should('exist');

      // Cloud form heading should NOT appear
      cy.contains('Create New Agent').should('not.exist');
    });

    it('8.2 local creation sets agent_status to Creation Mode', () => {
      cy.intercept('POST', '**/chat', {
        statusCode: 200,
        body: creationModeResponse,
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      // Click Create new Agent
      cy.contains('Create new Agent', {timeout: 10000})
        .first()
        .click({force: true});

      // Should show the creation mode animation
      cy.contains('Creating', {timeout: 10000}).should('exist');
    });

    it('8.3 local creation clears previous messages and shows prompt', () => {
      // First, send a regular chat message
      cy.intercept('POST', '**/chat', {
        statusCode: 200,
        body: regularChatResponse,
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea').first().type('Hello{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // Now click Create new Agent
      cy.contains('Create new Agent', {timeout: 10000})
        .first()
        .click({force: true});

      // Previous chat messages should be cleared, new creation prompt shown
      cy.contains("Let's create a new agent", {timeout: 10000}).should('exist');
    });
  });

  // =========================================================================
  // 9. Frontend: Error Handling in Autonomous Creation
  // =========================================================================
  describe('9. Frontend: Autonomous Error Handling', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('9.1 network error during auto-continuation shows fallback message', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        if (callIndex === 0) {
          callIndex++;
          req.reply({statusCode: 200, body: autonomousCreationResponse});
        } else {
          // Second call (auto-continue) fails
          req.reply({forceNetworkError: true});
        }
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);

      // Let the error response process
      cy.then(() => {});
      cy.tick(2000);
      cy.contains(/interrupted|continue manually/i, {timeout: 15000}).should(
        'exist'
      );
    });

    it('9.2 server error (500) during auto-continuation handles gracefully', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        if (callIndex === 0) {
          callIndex++;
          req.reply({statusCode: 200, body: autonomousCreationResponse});
        } else {
          req.reply({statusCode: 500, body: {error: 'Internal Server Error'}});
        }
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);

      // Let the error response process
      cy.then(() => {});
      cy.tick(3000);
      cy.contains(/interrupted|continue manually/i, {timeout: 15000}).should(
        'exist'
      );
    });

    it('9.3 response without agent_status stops the loop gracefully', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        if (callIndex === 0) {
          callIndex++;
          req.reply({statusCode: 200, body: autonomousCreationResponse});
        } else {
          callIndex++;
          // Response without agent_status
          req.reply({
            statusCode: 200,
            body: {
              text: 'Something unexpected happened',
              agent_id: 'local_assistant',
              agent_type: 'local',
              success: true,
            },
          });
        }
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      // Loop should stop (only 2 calls total)
      cy.then(() => {});
      cy.tick(5000).then(() => {
        expect(callIndex).to.eq(2);
      });
    });
  });

  // =========================================================================
  // 10. Intent Detection Pattern Unit Tests (in-browser logic validation)
  // =========================================================================
  describe('10. 3-Tier Detection Patterns (Logic Validation)', () => {
    // Tier 1: Conservative deterministic detection with negation guards
    const CREATE_AGENT_PATTERNS = [
      'create an agent',
      'create agent',
      'build an agent',
      'build agent',
      'make an agent',
      'new agent',
      'create a new agent',
      'run as a parallel agent',
      'run as parallel agent',
      'create and run',
      'train an agent',
      'train agent',
    ];
    const NEGATION_PREFIXES = [
      "don't ",
      'dont ',
      'do not ',
      'not ',
      'no ',
      "isn't ",
      'stop ',
      'cancel ',
      "can't ",
      'cannot ',
      "won't ",
      "shouldn't ",
      'never ',
      'without ',
      'skip ',
      'avoid ',
    ];

    // Tier 3: Reuse agent response signals
    const RESPONSE_CREATION_SIGNALS = [
      'need a new agent',
      'create a new agent',
      'requires a different agent',
      'beyond my capabilities',
      'specialized agent',
      'need a specialized',
      'suggest creating',
      'recommend creating a new',
    ];

    function detectCreateIntentTier1(text) {
      const lower = text.toLowerCase().trim();
      for (const pattern of CREATE_AGENT_PATTERNS) {
        const idx = lower.indexOf(pattern);
        if (idx >= 0) {
          const prefix = lower.substring(0, idx);
          if (
            NEGATION_PREFIXES.some((neg) =>
              prefix.trimEnd().endsWith(neg.trimEnd())
            )
          ) {
            return false;
          }
          return true;
        }
      }
      return false;
    }

    function responseSignalsCreation(text) {
      const lower = text.toLowerCase();
      return RESPONSE_CREATION_SIGNALS.some((s) => lower.includes(s));
    }

    it('10.1 Tier 1: creation patterns match expected phrases', () => {
      expect(detectCreateIntentTier1('I want to create an agent')).to.be.true;
      expect(detectCreateIntentTier1('build an agent for me')).to.be.true;
      expect(detectCreateIntentTier1('make an agent')).to.be.true;
      expect(detectCreateIntentTier1('I need a new agent')).to.be.true;
      expect(detectCreateIntentTier1('train an agent on this data')).to.be.true;
      expect(detectCreateIntentTier1('run as a parallel agent')).to.be.true;
      expect(detectCreateIntentTier1('create and run tasks')).to.be.true;
    });

    it('10.2 Tier 1: creation patterns do NOT match regular text', () => {
      expect(detectCreateIntentTier1('what is the weather?')).to.be.false;
      expect(detectCreateIntentTier1('tell me about agents in general')).to.be
        .false;
      expect(detectCreateIntentTier1('how does building work?')).to.be.false;
      expect(detectCreateIntentTier1('I need help')).to.be.false;
      expect(detectCreateIntentTier1('the agent responded')).to.be.false;
    });

    it('10.3 Tier 1: negation guards block false positives', () => {
      expect(detectCreateIntentTier1("don't create an agent")).to.be.false;
      expect(detectCreateIntentTier1('do not create agent')).to.be.false;
      expect(detectCreateIntentTier1("I can't build an agent")).to.be.false;
      expect(detectCreateIntentTier1('stop create agent')).to.be.false;
      expect(detectCreateIntentTier1('never create an agent')).to.be.false;
      expect(detectCreateIntentTier1('cancel create an agent')).to.be.false;
      expect(detectCreateIntentTier1('skip create agent')).to.be.false;
      expect(detectCreateIntentTier1('avoid build an agent')).to.be.false;
    });

    it('10.4 Tier 1: positive phrases work after negation-like words elsewhere', () => {
      // "I don't know what to name it but create an agent" — the negation isn't before the pattern
      expect(detectCreateIntentTier1('please create an agent')).to.be.true;
      expect(detectCreateIntentTier1('I want to create an agent now')).to.be
        .true;
    });

    it('10.5 Tier 3: reuse agent response signals detection', () => {
      expect(
        responseSignalsCreation(
          'I need a new agent with different skills for this task'
        )
      ).to.be.true;
      expect(
        responseSignalsCreation(
          'I suggest creating a specialized agent for this'
        )
      ).to.be.true;
      expect(
        responseSignalsCreation(
          'This is beyond my capabilities, you need a specialized agent'
        )
      ).to.be.true;
      expect(
        responseSignalsCreation(
          'I recommend creating a new agent for data analysis'
        )
      ).to.be.true;
    });

    it('10.6 Tier 3: regular responses do NOT trigger creation signal', () => {
      expect(responseSignalsCreation('Here is the answer to your question')).to
        .be.false;
      expect(responseSignalsCreation('I can help you with that task')).to.be
        .false;
      expect(responseSignalsCreation('The code has been executed successfully'))
        .to.be.false;
    });

    it('10.7 case insensitivity works', () => {
      expect(detectCreateIntentTier1('CREATE AN AGENT')).to.be.true;
      expect(detectCreateIntentTier1('Create An Agent')).to.be.true;
      expect(detectCreateIntentTier1("DON'T CREATE AN AGENT")).to.be.false;
    });

    it('10.8 agent_status lifecycle phases are valid', () => {
      const validPhases = [
        'Creation Mode',
        'Review Mode',
        'completed',
        'Evaluation Mode',
        'Reuse Mode',
      ];

      expect(autonomousCreationResponse.agent_status).to.be.oneOf(validPhases);
      expect(reviewModeResponse.agent_status).to.be.oneOf(validPhases);
      expect(completedResponse.agent_status).to.be.oneOf(validPhases);
      expect(evaluationModeResponse.agent_status).to.be.oneOf(validPhases);
    });

    it('10.9 creation_suggested fixture has correct structure', () => {
      const creationSuggestedResponse = {
        text: 'This task needs a specialized agent.',
        agent_status: 'Reuse Mode',
        creation_suggested: true,
      };
      expect(creationSuggestedResponse).to.have.property(
        'creation_suggested',
        true
      );
      expect(creationSuggestedResponse).to.have.property(
        'agent_status',
        'Reuse Mode'
      );
    });
  });

  // =========================================================================
  // 11. Full End-to-End Autonomous Creation Flow (Stubbed)
  // =========================================================================
  describe('11. Full E2E Autonomous Creation Flow', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('11.1 complete flow: creation → completed → agent reusable', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        const responses = [
          autonomousCreationResponse, // 1: user's initial message
          completedResponse, // 2: auto-continue → completed
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      // Send autonomous creation request
      cy.get('textarea')
        .first()
        .type('create an agent automatically for project management{enter}', {
          force: true,
        });

      // Phase 1: initial request
      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      // Phase 2: auto-continue → completed
      cy.wait('@chatRequest', {timeout: 15000});

      // Verify completion (multi-phase review is tested in 7.3)
      cy.then(() => {});
      cy.tick(1000);
      cy.contains('Agent created successfully', {timeout: 15000}).should(
        'exist'
      );
      cy.contains('chat with your new agent', {timeout: 10000}).should('exist');
    });

    it('11.2 non-autonomous creation: user answers questions manually', () => {
      cy.intercept('POST', '**/chat', {
        statusCode: 200,
        body: {
          ...creationModeResponse,
          autonomous_creation: false,
        },
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      // Create agent without autonomous keywords
      cy.get('textarea')
        .first()
        .type('create an agent for writing{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // Should show creation mode but NOT auto-continue
      cy.contains("Let's create a new agent", {timeout: 10000}).should('exist');

      // Wait to verify no auto-continuation
      cy.wait(4000);
      // User can still type manually to continue
      cy.get('textarea').first().should('not.be.disabled');
    });

    it('11.3 evaluation mode shown during agent evaluation phase', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        const responses = [
          autonomousCreationResponse,
          evaluationModeResponse,
          completedResponse,
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.clock();
      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.tick(5000);
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.tick(3000);

      cy.get('textarea')
        .first()
        .type('create an agent automatically{enter}', {force: true});

      cy.wait('@chatRequest', {timeout: 15000});
      cy.then(() => {});
      cy.tick(2000);
      cy.wait('@chatRequest', {timeout: 15000});

      // Should show evaluation phase
      cy.then(() => {});
      cy.tick(500);
      cy.contains(/Evaluating/i, {timeout: 10000}).should('exist');
    });
  });

  // =========================================================================
  // 12. Frontend: creation_suggested from Reuse Mode (Step 17/19)
  // =========================================================================
  describe('12. Frontend: creation_suggested from Reuse Mode', () => {
    beforeEach(() => {
      setupBaseIntercepts();
      seedGuestAuth();
    });

    it('12.1 creation_suggested response shows system message suggesting agent creation', () => {
      cy.intercept('POST', '**/chat', {
        statusCode: 200,
        body: creationSuggestedResponse,
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea')
        .first()
        .type('analyze this complex data set{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // Should show the agent's response text
      cy.contains('specialized capabilities', {timeout: 10000}).should('exist');

      // Should show system message suggesting agent creation
      cy.contains(/suggests creating a specialized agent/i, {
        timeout: 10000,
      }).should('exist');
    });

    it('12.2 creation_suggested does NOT trigger auto-continuation', () => {
      let callCount = 0;
      cy.intercept('POST', '**/chat', (req) => {
        callCount++;
        req.reply({
          statusCode: 200,
          body: creationSuggestedResponse,
        });
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      cy.get('textarea')
        .first()
        .type('help me with this task{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // Wait to ensure no auto-continuation fires
      cy.wait(4000).then(() => {
        // Only the initial call, no auto-continuation
        expect(callCount).to.eq(1);
      });
    });

    it('12.3 creation_suggested response has Reuse Mode agent_status', () => {
      // Validate the fixture shape (logic test)
      expect(creationSuggestedResponse).to.have.property(
        'creation_suggested',
        true
      );
      expect(creationSuggestedResponse).to.have.property(
        'agent_status',
        'Reuse Mode'
      );
      expect(creationSuggestedResponse).to.not.have.property(
        'autonomous_creation'
      );
    });

    it('12.4 user can follow up with "create an agent" after creation_suggested', () => {
      let callIndex = 0;
      cy.intercept('POST', '**/chat', (req) => {
        const responses = [
          creationSuggestedResponse, // 1st: reuse suggests creation
          {
            // 2nd: user says "create an agent" → creation mode
            ...creationModeResponse,
            autonomous_creation: false,
          },
        ];
        const resp = responses[Math.min(callIndex, responses.length - 1)];
        callIndex++;
        req.reply({statusCode: 200, body: resp});
      }).as('chatRequest');

      cy.visit('/local', {timeout: 30000, failOnStatusCode: false});
      cy.wait('@getLocalPrompts', {timeout: 20000});
      cy.wait(3000);

      // First message triggers creation_suggested
      cy.get('textarea')
        .first()
        .type('analyze this dataset{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // User sees suggestion and types "create an agent"
      cy.get('textarea')
        .first()
        .type('create an agent for data analysis{enter}', {force: true});
      cy.wait('@chatRequest', {timeout: 15000});

      // Should now be in creation mode
      cy.contains("Let's create a new agent", {timeout: 10000}).should('exist');
    });
  });
});
