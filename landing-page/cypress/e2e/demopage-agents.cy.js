/// <reference types="cypress" />

describe('Demopage - Agent Loading E2E', () => {
  beforeEach(() => {
    // Intercept real API calls to localhost:5000 backend
    cy.intercept('GET', '**/prompts*').as('getPrompts');
  });

  it('loads the demopage and fetches agents from backend', () => {
    cy.visit('/local');

    cy.wait('@getPrompts', {timeout: 20000}).then((interception) => {
      // Assert backend returned correct format
      expect(interception.response.statusCode).to.eq(200);
      expect(interception.response.body).to.have.property('prompts');
      expect(interception.response.body.prompts).to.be.an('array');
      expect(interception.response.body.prompts.length).to.be.greaterThan(0);
    });
  });

  it('renders agent names from API response in the UI', () => {
    cy.visit('/local');

    cy.wait('@getPrompts', {timeout: 20000}).then((interception) => {
      const agentNames = interception.response.body.prompts.map((p) => p.name);

      // Wait for React to render the data
      cy.wait(2000);

      // At least one agent name from the API should appear in the UI
      cy.get('#root').then(($root) => {
        const pageText = $root.text();
        const foundAgent = agentNames.some((name) => pageText.includes(name));
        expect(
          foundAgent,
          `Expected one of [${agentNames.join(', ')}] in the UI`
        ).to.be.true;
      });
    });
  });

  it('does NOT crash with .map error on prompts response', () => {
    cy.visit('/local');

    cy.wait('@getPrompts', {timeout: 20000});
    cy.wait(2000);

    // Page should not show crash or .map error
    cy.get('#root').invoke('html').should('not.be.empty');
    cy.get('body')
      .invoke('text')
      .should('not.contain', '.map is not a function');
  });

  it('agent cards are interactive (buttons exist)', () => {
    cy.visit('/local');

    cy.wait('@getPrompts', {timeout: 20000});
    cy.wait(2000);

    // Page should have clickable buttons for agents
    cy.get('button', {timeout: 10000}).should('have.length.greaterThan', 0);
  });
});
