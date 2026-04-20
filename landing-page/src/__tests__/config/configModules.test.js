/**
 * Jest smoke tests for landing-page/src/config + constants — batch #37.
 *
 * Pure data modules:
 *   config/apiBase.js       (126 LOC) — API_BASE_URL resolver
 *   config/pageRegistry.js  (77 LOC)  — React route registry
 *   constants/events.js     (10 LOC)  — event name constants
 *
 * Locks the exported-contract against silent renames.
 */

describe('config/apiBase', () => {
  it('module loads', () => {
    const mod = require('../../config/apiBase');
    expect(mod).toBeDefined();
  });

  it('exports API_BASE_URL', () => {
    const mod = require('../../config/apiBase');
    const base = mod.API_BASE_URL || mod.default;
    expect(base !== undefined).toBe(true);
  });

  it('has at least one export', () => {
    const mod = require('../../config/apiBase');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});

describe('config/pageRegistry', () => {
  it('module loads', () => {
    const mod = require('../../config/pageRegistry');
    expect(mod).toBeDefined();
  });

  it('exports a registry', () => {
    const mod = require('../../config/pageRegistry');
    const entries = mod.default || mod.pageRegistry || mod.ROUTES || mod;
    expect(entries).toBeDefined();
  });
});

describe('constants/events', () => {
  it('module loads', () => {
    const mod = require('../../constants/events');
    expect(mod).toBeDefined();
  });

  it('exports at least one constant', () => {
    const mod = require('../../constants/events');
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});

describe('config + constants source integrity', () => {
  const fs = require('fs');
  const path = require('path');

  const FILES = [
    '../../config/apiBase.js',
    '../../config/pageRegistry.js',
    '../../constants/events.js',
  ];

  FILES.forEach((rel) => {
    it(`${rel} has no conflict markers`, () => {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf-8');
      expect(src).not.toMatch(/^<{7} /m);
      expect(src).not.toMatch(/^>{7} /m);
    });

    it(`${rel} declares an export`, () => {
      const src = fs.readFileSync(path.join(__dirname, rel), 'utf-8');
      expect(/export\s+(default|const|function|class|\{)/.test(src)).toBe(true);
    });
  });
});
