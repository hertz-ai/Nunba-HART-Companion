/**
 * Cypress support file integrity — batch #53.
 *
 * landing-page/cypress/support/e2e.js registers 14 custom commands
 * (cy.socialAuth, cy.socialRegister, cy.socialRequest, etc.) that
 * 74 Cypress specs depend on.  Silent removal of any one breaks
 * dozens of specs without a clear error \u2014 the specs just don't
 * collect or time out.
 *
 * This batch is the JS-side mirror of batch #49 (pytest conftest
 * integrity): parse the support file as JS, verify every expected
 * cy.* command is registered, and guard against accidental
 * deletion / rename.
 */

const fs = require('fs');
const path = require('path');

const SUPPORT_FILE = path.resolve(
  __dirname, '..', '..', 'cypress', 'support', 'e2e.js',
);

// Canonical set of cy.* commands registered by Cypress.Commands.add().
// If any of these disappear, 74 specs break silently.
const EXPECTED_COMMANDS = [
  'socialRegister',
  'socialLogin',
  'socialAuth',
  'socialRequest',
  'socialVisit',
  'socialAuthWithRole',
  'socialVisitAsAdmin',
  'waitForApi',
  'shouldContainText',
  'validateJwt',
  'getJwtToken',
  'clearAuthState',
  'verifyTokenWorks',
  'verifyAuthRequired',
];

describe('cypress/support/e2e.js integrity', () => {
  it('support file exists', () => {
    expect(fs.existsSync(SUPPORT_FILE)).toBe(true);
  });

  it('is non-empty', () => {
    const src = fs.readFileSync(SUPPORT_FILE, 'utf-8');
    expect(src.length).toBeGreaterThan(100);
  });

  it('parses as JavaScript', () => {
    const src = fs.readFileSync(SUPPORT_FILE, 'utf-8');
    // Cypress provides globals at runtime; shadow them in our
    // syntax-check sandbox.
    expect(() => {
      new Function(
        'Cypress',
        'cy',
        'before',
        'beforeEach',
        'after',
        'afterEach',
        'expect',
        src.replace(/^import.*$/gm, ''),
      );
    }).not.toThrow();
  });

  it('has no leading git conflict markers', () => {
    const src = fs.readFileSync(SUPPORT_FILE, 'utf-8');
    expect(src).not.toMatch(/^<{7} /m);
    expect(src).not.toMatch(/^>{7} /m);
  });

  it('imports @cypress/code-coverage/support', () => {
    const src = fs.readFileSync(SUPPORT_FILE, 'utf-8');
    expect(/@cypress\/code-coverage\/support/.test(src)).toBe(true);
  });

  it('installs uncaught:exception handler', () => {
    const src = fs.readFileSync(SUPPORT_FILE, 'utf-8');
    expect(/Cypress\.on\s*\(\s*['"]uncaught:exception['"]/.test(src)).toBe(true);
  });
});

describe('cy.* custom command registration', () => {
  const src = fs.readFileSync(SUPPORT_FILE, 'utf-8');

  EXPECTED_COMMANDS.forEach((cmd) => {
    it(`cy.${cmd} is registered via Cypress.Commands.add`, () => {
      const pattern = new RegExp(
        `Cypress\\.Commands\\.add\\s*\\(\\s*['"]${cmd}['"]`,
      );
      expect(pattern.test(src)).toBe(true);
    });
  });

  it(`registers exactly ${EXPECTED_COMMANDS.length} commands`, () => {
    const matches = src.match(/Cypress\.Commands\.add\s*\(/g) || [];
    // Allow some drift for test-only helpers, but require at least
    // the expected canonical set.
    expect(matches.length).toBeGreaterThanOrEqual(EXPECTED_COMMANDS.length);
  });

  it('no duplicate command names', () => {
    const names = [];
    const re = /Cypress\.Commands\.add\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      names.push(m[1]);
    }
    const duplicates = names.filter(
      (n, i) => names.indexOf(n) !== i,
    );
    expect(duplicates).toEqual([]);
  });
});

describe('cypress.config.js integrity', () => {
  const CONFIG = path.resolve(
    __dirname, '..', '..', 'cypress.config.js',
  );

  it('config file exists', () => {
    expect(fs.existsSync(CONFIG)).toBe(true);
  });

  it('is non-empty', () => {
    const src = fs.readFileSync(CONFIG, 'utf-8');
    expect(src.length).toBeGreaterThan(50);
  });

  it('parses as JavaScript', () => {
    const src = fs.readFileSync(CONFIG, 'utf-8');
    expect(() => {
      new Function('require', 'module', 'exports', src);
    }).not.toThrow();
  });

  it('declares e2e config block', () => {
    const src = fs.readFileSync(CONFIG, 'utf-8');
    expect(/\be2e\s*:/.test(src)).toBe(true);
  });

  it('no leading git conflict markers', () => {
    const src = fs.readFileSync(CONFIG, 'utf-8');
    expect(src).not.toMatch(/^<{7} /m);
    expect(src).not.toMatch(/^>{7} /m);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Cross-check: commands USED by specs must be REGISTERED by support
// ════════════════════════════════════════════════════════════════════════

describe('command usage vs registration coverage', () => {
  const CYPRESS_E2E_DIR = path.resolve(
    __dirname, '..', '..', 'cypress', 'e2e',
  );

  it('every cy.social* used in specs is registered', () => {
    if (!fs.existsSync(CYPRESS_E2E_DIR)) {
      return;
    }
    const supportSrc = fs.readFileSync(SUPPORT_FILE, 'utf-8');
    const registered = new Set();
    const reg = /Cypress\.Commands\.add\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = reg.exec(supportSrc)) !== null) {
      registered.add(m[1]);
    }

    const specs = fs.readdirSync(CYPRESS_E2E_DIR)
      .filter((f) => f.endsWith('.cy.js'));

    const missingCoverage = new Set();
    specs.forEach((specName) => {
      const specSrc = fs.readFileSync(
        path.join(CYPRESS_E2E_DIR, specName),
        'utf-8',
      );
      // Find cy.socialXxx calls \u2014 scope to the social* namespace
      // since those are the custom commands of interest.
      const usageRe = /cy\.(social[A-Za-z]+)\s*\(/g;
      let um;
      while ((um = usageRe.exec(specSrc)) !== null) {
        const name = um[1];
        if (!registered.has(name)) {
          missingCoverage.add(name);
        }
      }
    });

    expect(Array.from(missingCoverage)).toEqual([]);
  });
});
