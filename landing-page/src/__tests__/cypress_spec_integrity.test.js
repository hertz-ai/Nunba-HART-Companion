/**
 * Cypress spec integrity meta-test — batch #39.
 *
 * Mirror of tests/test_harness_meta.py for the JS/Cypress tier.
 * Every landing-page/cypress/e2e/*.cy.js file must:
 *   1. parse as valid JavaScript
 *   2. contain at least one describe() or it()
 *   3. have no leading git conflict markers (<<<<<<<, >>>>>>>)
 *
 * When a refactor silently breaks a Cypress spec's syntax or empties
 * it, this meta-test catches it BEFORE CI silently drops those
 * Cypress tests from the run.
 */

const fs = require('fs');
const path = require('path');

const CYPRESS_DIR = path.resolve(__dirname, '..', '..', 'cypress', 'e2e');

function listCypressSpecs() {
  if (!fs.existsSync(CYPRESS_DIR)) return [];
  return fs
    .readdirSync(CYPRESS_DIR)
    .filter((f) => f.endsWith('.cy.js'))
    .map((f) => path.join(CYPRESS_DIR, f));
}

const SPECS = listCypressSpecs();

describe('Cypress spec directory', () => {
  it('is non-empty', () => {
    expect(SPECS.length).toBeGreaterThan(0);
  });

  it('contains at least 50 specs (post-coverage-expansion)', () => {
    expect(SPECS.length).toBeGreaterThanOrEqual(50);
  });
});

describe.each(SPECS.map((s) => [path.basename(s), s]))(
  'Cypress spec: %s',
  (basename, fullPath) => {
    const src = fs.readFileSync(fullPath, 'utf-8');

    it('parses as valid JavaScript', () => {
      // new Function() will throw a SyntaxError on malformed JS.
      // Cypress specs use describe/it globals which are defined at
      // runtime by Cypress — we can't call them here, but we can
      // still syntax-check the file text.
      expect(() => {
        // Use Function constructor instead of eval for cleaner scope.
        // Prefix with a no-op that shadows describe/it globals so the
        // syntax-checker doesn't complain about undefined references
        // (Cypress provides these at runtime).
        new Function(
          'describe',
          'it',
          'beforeEach',
          'before',
          'afterEach',
          'after',
          'cy',
          'Cypress',
          'expect',
          src,
        );
      }).not.toThrow();
    });

    it('contains at least one describe or it block', () => {
      const hasTest =
        /\bdescribe\s*(?:\.\w+\s*)?\(/.test(src) || /\bit\s*\(/.test(src);
      expect(hasTest).toBe(true);
    });

    it('has no leading git conflict markers', () => {
      expect(src).not.toMatch(/^<{7} /m);
      expect(src).not.toMatch(/^>{7} /m);
    });
  }
);

// ════════════════════════════════════════════════════════════════════════
// Batch-specific spec guards — UAT journey specs must remain present
// ════════════════════════════════════════════════════════════════════════

describe('UAT journey Cypress specs are all present', () => {
  const EXPECTED_UAT = [
    'uat-journeys-j01-j05.cy.js',
    'uat-journeys-j06-j10.cy.js',
    'uat-journeys-j11-j15.cy.js',
    'uat-journeys-j16-j20.cy.js',
    'uat-journeys-j21-j51-adapters.cy.js',
    'uat-journeys-j52-j99.cy.js',
    'uat-journeys-j100-j115.cy.js',
    'uat-journeys-j116-j137.cy.js',
    'uat-journeys-j138-j170.cy.js',
    'uat-journeys-j171-j199.cy.js',
    'uat-journeys-j200-j220.cy.js',
    'uat-journeys-j221-j260.cy.js',
    'uat-journeys-j261-j282.cy.js',
  ];

  EXPECTED_UAT.forEach((name) => {
    it(`${name} present`, () => {
      const full = path.join(CYPRESS_DIR, name);
      expect(fs.existsSync(full)).toBe(true);
    });
  });

  it('UAT coverage spans J01-J282 (all documented journey IDs)', () => {
    const missing = EXPECTED_UAT.filter(
      (n) => !fs.existsSync(path.join(CYPRESS_DIR, n)),
    );
    expect(missing).toEqual([]);
  });
});
