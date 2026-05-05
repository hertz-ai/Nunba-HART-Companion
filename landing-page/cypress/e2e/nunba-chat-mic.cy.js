/// <reference types="cypress" />

/**
 * Nunba Chat Panel Mic — F4 GREENLIT (orchestrator aa3ead1).
 *
 * Validates the floating chat panel's mic flow:
 *   1. Permission flow with mocked getUserMedia.
 *   2. Local-Whisper WebSocket path -> "Local (private)" badge.
 *   3. Browser fallback path -> "Cloud (browser)" badge.
 *   4. Transcript appended to TextField, persists after stop.
 *
 * The Cypress test launches against the running Nunba app (CI runs the
 * full Flask+HARTOS stack — see `reference_ci_fullstack_e2e.md`).
 */

// Helper: open the floating chat panel.  The panel is anchored bottom-right
// and toggled by NunbaChatPill — visiting /social mounts it but the chat is
// collapsed by default.  We simulate the user expanding it.
function openChatPanel() {
  // Trigger the same path the pill uses by setting context state.  In a real
  // E2E this is done by clicking the pill; we expose a window hook for the
  // test only when CYPRESS_OPEN_CHAT is set.  Fallback: click any element
  // matching the pill.
  cy.get('[data-testid="nunba-chat-pill"], [aria-label="Open Nunba chat"]', {
    timeout: 30000,
  })
    .first()
    .click({force: true});
}

// Stub getUserMedia + WebSocket before the page loads.
function stubMicAndWs(opts = {}) {
  const wsConnects = opts.wsConnects ?? true;

  return {
    onBeforeLoad(win) {
      win.localStorage.setItem('guest_mode', 'true');
      win.localStorage.setItem('guest_name', 'Mic Tester');
      win.localStorage.setItem('hart_sealed', 'true');
      win.localStorage.setItem('hart_language', 'en');

      // Mock getUserMedia → returns a fake MediaStream that won't actually
      // emit audio.  The mock satisfies the permission flow without hitting
      // the user's real microphone.
      const fakeTrack = {
        stop: () => {},
        kind: 'audio',
        enabled: true,
      };
      const fakeStream = {
        getTracks: () => [fakeTrack],
        getAudioTracks: () => [fakeTrack],
      };
      win.navigator.mediaDevices = win.navigator.mediaDevices || {};
      win.navigator.mediaDevices.getUserMedia = () =>
        Promise.resolve(fakeStream);

      // Mock WebSocket.  When wsConnects=true, simulate an open() so the
      // panel sees `activeMethod === 'ws'`.  When false, fail immediately
      // so the hook falls back to browser SpeechRecognition.
      const realWs = win.WebSocket;
      win.WebSocket = function FakeWS(url) {
        const self = this;
        self.url = url;
        self.readyState = 0;
        self.send = () => {};
        self.close = () => {
          self.readyState = 3;
          if (self.onclose) self.onclose({});
        };
        setTimeout(() => {
          if (wsConnects) {
            self.readyState = 1;
            if (self.onopen) self.onopen({});
            // Push a fake transcript so the panel's append effect fires.
            setTimeout(() => {
              if (self.onmessage)
                self.onmessage({
                  data: JSON.stringify({
                    text: 'hello from whisper',
                    is_final: true,
                  }),
                });
            }, 50);
          } else {
            self.readyState = 3;
            if (self.onerror) self.onerror({});
            if (self.onclose) self.onclose({});
          }
        }, 0);
      };
      win.WebSocket.OPEN = 1;
      win.WebSocket.CLOSED = 3;
      win.WebSocket._real = realWs;

      // Stub AudioContext so processor wiring doesn't crash under jsdom.
      const fakeProcessor = {
        connect: () => {},
        disconnect: () => {},
        onaudioprocess: null,
      };
      const fakeSource = {connect: () => {}};
      const fakeAudioCtx = {
        createMediaStreamSource: () => fakeSource,
        createScriptProcessor: () => fakeProcessor,
        close: () => Promise.resolve(),
        destination: {},
      };
      win.AudioContext = function () {
        return fakeAudioCtx;
      };
      win.webkitAudioContext = win.AudioContext;

      // Stub browser SpeechRecognition for the cloud-fallback path.
      win.SpeechRecognition = function FakeRecognition() {
        const self = this;
        self.start = () => {
          if (self.onstart) self.onstart({});
          setTimeout(() => {
            if (self.onresult)
              self.onresult({
                resultIndex: 0,
                results: [
                  {
                    isFinal: true,
                    0: {transcript: 'hello from browser', confidence: 0.9},
                    length: 1,
                  },
                ],
              });
          }, 50);
        };
        self.stop = () => {
          if (self.onend) self.onend({});
        };
      };
      win.webkitSpeechRecognition = win.SpeechRecognition;
    },
  };
}

describe('NunbaChatPanel mic — F4 (orchestrator aa3ead1)', () => {
  it('uses local Whisper WebSocket path → "Local (private)" badge', () => {
    cy.visit('/social', stubMicAndWs({wsConnects: true}));

    openChatPanel();

    // Mic button is rendered inside the floating panel.
    cy.get('[data-testid="mic-toggle-button"]', {timeout: 15000})
      .should('exist')
      .click({force: true});

    // Local-private badge appears once WS opens.
    cy.get('[data-testid="mic-path-local"]', {timeout: 5000}).should(
      'be.visible'
    );

    // Transcript is appended into the TextField.
    cy.get('textarea, input[placeholder*="Message"]', {timeout: 5000})
      .first()
      .should(($el) => {
        expect($el.val()).to.match(/hello from whisper/i);
      });

    // Stopping the mic must NOT clear the transcript already in the field.
    cy.get('[data-testid="mic-toggle-button"]').click({force: true});
    cy.get('textarea, input[placeholder*="Message"]')
      .first()
      .should(($el) => {
        expect($el.val()).to.match(/hello from whisper/i);
      });
  });

  it('falls back to browser SpeechRecognition → "Cloud (browser)" badge when WS refuses', () => {
    cy.visit('/social', stubMicAndWs({wsConnects: false}));

    openChatPanel();

    cy.get('[data-testid="mic-toggle-button"]', {timeout: 15000})
      .should('exist')
      .click({force: true});

    cy.get('[data-testid="mic-path-cloud"]', {timeout: 5000}).should(
      'be.visible'
    );
  });
});
