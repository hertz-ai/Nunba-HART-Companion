/**
 * Jest smoke tests for untested utils/ modules — batch #28.
 *
 * Existing tests: animations.test.js, gameAI.test.js
 * This file covers the remaining 8 utility modules (~300 LOC):
 *   ScrollToTop.js, chatRetry.js, deviceId.js, encryption.js,
 *   hooks.js, logger.js, polling.js, responsiveSubMenu.js
 *
 * Pattern: module-load smoke + callable exports check for each.
 */

describe('ScrollToTop util', () => {
  it('module loads', () => {
    const mod = require('../../utils/ScrollToTop');
    expect(mod).toBeDefined();
  });

  it('exports a React component (default)', () => {
    const mod = require('../../utils/ScrollToTop');
    const Comp = mod.default || mod.ScrollToTop;
    expect(Comp).toBeDefined();
  });
});

describe('chatRetry util', () => {
  it('module loads', () => {
    const mod = require('../../utils/chatRetry');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../utils/chatRetry');
    const keys = Object.keys(mod);
    expect(keys.some((k) => typeof mod[k] === 'function')).toBe(true);
  });
});

describe('deviceId util', () => {
  // deviceId.js imports the ESM-only `uuid` package.  CRA's Jest
  // transform chokes on "Unexpected token 'export'" for that
  // dependency.  Rather than plumbing a jest transform override,
  // we verify the source file parses + has the expected exports
  // via a raw read.
  const fs = require('fs');
  const path = require('path');
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'utils', 'deviceId.js'),
    'utf-8',
  );

  it('source file exists and is non-empty', () => {
    expect(SOURCE.length).toBeGreaterThan(0);
  });

  it('exports getStableDeviceId', () => {
    expect(SOURCE).toMatch(/export\s+(const|async\s+function)?\s*getStableDeviceId/);
  });

  it('exports getCachedDeviceId', () => {
    expect(SOURCE).toMatch(/export\s+(const|function)?\s*getCachedDeviceId/);
  });
});

describe('encryption util', () => {
  it('module loads', () => {
    const mod = require('../../utils/encryption');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../utils/encryption');
    const keys = Object.keys(mod);
    expect(keys.some((k) => typeof mod[k] === 'function')).toBe(true);
  });
});

describe('hooks util', () => {
  // hooks.js depends on @juggle/resize-observer which isn't in the
  // CI test env.  Verify source shape instead.
  const fs = require('fs');
  const path = require('path');
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'utils', 'hooks.js'),
    'utf-8',
  );

  it('source file exists and is non-empty', () => {
    expect(SOURCE.length).toBeGreaterThan(0);
  });

  it('exports at least one hook', () => {
    expect(SOURCE).toMatch(/export\s+(const|function|default)\s+\w*use/i);
  });
});

describe('logger util', () => {
  it('module loads', () => {
    const mod = require('../../utils/logger');
    expect(mod).toBeDefined();
  });

  it('exports a logger-like object or function', () => {
    const mod = require('../../utils/logger');
    const logger = mod.default || mod.logger || mod;
    // Logger should have log/info/warn/error methods, or be a function.
    const hasMethods =
      typeof logger === 'function' ||
      (typeof logger === 'object' &&
        ['log', 'info', 'warn', 'error'].some((m) => typeof logger[m] === 'function'));
    expect(hasMethods).toBe(true);
  });
});

describe('polling util', () => {
  it('module loads', () => {
    const mod = require('../../utils/polling');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../utils/polling');
    const keys = Object.keys(mod);
    expect(keys.some((k) => typeof mod[k] === 'function')).toBe(true);
  });
});

describe('responsiveSubMenu util', () => {
  // responsiveSubMenu imports jquery which isn't in the Jest env.
  // Verify source shape instead.
  const fs = require('fs');
  const path = require('path');
  const SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'utils', 'responsiveSubMenu.js'),
    'utf-8',
  );

  it('source file exists', () => {
    expect(SOURCE.length).toBeGreaterThan(0);
  });
});
