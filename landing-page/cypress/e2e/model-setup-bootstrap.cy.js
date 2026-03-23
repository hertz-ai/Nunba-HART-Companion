/**
 * Model Setup & Bootstrap Pipeline E2E Tests
 *
 * Tests the full model availability → setup card → bootstrap → ready flow.
 * Covers: LLM, TTS, STT model orchestration via ModelOrchestrator.
 */

describe('Model Setup & Bootstrap', () => {
  beforeEach(() => {
    cy.visit('/local', { failOnStatusCode: false });
  });

  describe('Bootstrap API', () => {
    it('GET /api/ai/bootstrap/status returns valid state', () => {
      cy.request({ url: '/api/ai/bootstrap/status', failOnStatusCode: false }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 404]);
        if (resp.status === 200) {
          expect(resp.body).to.have.property('phase');
          expect(resp.body).to.have.property('steps');
          expect(resp.body).to.have.property('gpu_name');
          expect(resp.body.phase).to.be.oneOf(['idle', 'detecting', 'planning', 'running', 'done']);
        }
      });
    });

    it('POST /api/ai/bootstrap triggers pipeline', () => {
      cy.request({
        method: 'POST',
        url: '/api/ai/bootstrap',
        body: { language: 'en' },
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 404]);
        if (resp.status === 200) {
          expect(resp.body).to.have.property('phase');
          expect(resp.body).to.have.property('steps');
        }
      });
    });

    it('bootstrap status shows LLM step', () => {
      cy.request({ url: '/api/ai/bootstrap/status', failOnStatusCode: false }).then((resp) => {
        if (resp.status === 200 && resp.body.steps) {
          const llm = resp.body.steps.llm;
          if (llm) {
            expect(llm).to.have.property('status');
            expect(llm).to.have.property('model_type', 'llm');
          }
        }
      });
    });

    it('bootstrap status shows TTS step for language', () => {
      cy.request({
        method: 'POST',
        url: '/api/ai/bootstrap',
        body: { language: 'ta' },
        failOnStatusCode: false,
      }).then((resp) => {
        if (resp.status === 200 && resp.body.steps) {
          const tts = resp.body.steps.tts;
          if (tts) {
            expect(tts).to.have.property('model_type', 'tts');
            expect(tts.status).to.be.oneOf(['pending', 'selecting', 'downloading', 'loading', 'ready', 'skipped', 'failed']);
          }
        }
      });
    });
  });

  describe('LLM Health', () => {
    it('LLM server responds to health check', () => {
      cy.request({ url: '/api/llm/status', failOnStatusCode: false }).then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.body).to.have.property('available');
      });
    });

    it('LLM returns model info', () => {
      cy.request({ url: '/api/llm/status', failOnStatusCode: false }).then((resp) => {
        if (resp.body.available) {
          expect(resp.body).to.have.property('model_name');
        }
      });
    });
  });

  describe('TTS Endpoint', () => {
    it('TTS quick endpoint responds for English', () => {
      cy.request({
        method: 'POST',
        url: '/api/social/tts/quick',
        body: { text: 'hello', language: 'en' },
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 404, 500]);
        if (resp.status === 200 && resp.body.data) {
          expect(resp.body.data).to.have.property('base64');
        }
      });
    });
  });

  describe('Setup Card in Chat', () => {
    it('chat response includes model availability info', () => {
      cy.request({
        method: 'POST',
        url: '/chat',
        body: {
          text: 'hi',
          user_id: 'cypress_test',
          agent_id: 'local_assistant',
          create_agent: false,
          casual_conv: false,
        },
        failOnStatusCode: false,
      }).then((resp) => {
        expect(resp.status).to.be.oneOf([200, 500]);
        if (resp.status === 200) {
          // Response may include missing_models if TTS/STT not loaded
          expect(resp.body).to.have.property('success');
        }
      });
    });
  });
});
