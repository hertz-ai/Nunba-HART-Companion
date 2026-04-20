/**
 * Jest smoke tests for the service modules in landing-page/src/services
 * that don't yet have dedicated tests — batch #27.
 *
 * Existing tests: apiCache.test.js, socialApi.test.js
 *
 * This file covers:
 *   realtimeService.js      (431 LOC)
 *   pocketTTS.js            (389 LOC)
 *   axiosFactory.js         (162 LOC)
 *   gameRealtimeService.js  (135 LOC)
 *   ttsCapabilityProbe.js   (105 LOC)
 *   routePrefetcher.js      (74 LOC)
 *
 * Pattern: module-load smoke + exported symbol callable check.
 * Deep behavior tests require WebSocket/IndexedDB mocks — covered
 * by Cypress e2e tier (batches #3-#15).
 */

describe('realtimeService module', () => {
  it('module loads without error', () => {
    const mod = require('../../services/realtimeService');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../services/realtimeService');
    const keys = Object.keys(mod);
    const hasCallable = keys.some((k) => typeof mod[k] === 'function');
    expect(hasCallable || typeof mod === 'function').toBe(true);
  });
});

describe('pocketTTS module', () => {
  it('module loads without error', () => {
    const mod = require('../../services/pocketTTS');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../services/pocketTTS');
    const keys = Object.keys(mod);
    const hasCallable = keys.some((k) => typeof mod[k] === 'function');
    expect(hasCallable || typeof mod === 'function').toBe(true);
  });
});

describe('axiosFactory module', () => {
  it('module loads without error', () => {
    const mod = require('../../services/axiosFactory');
    expect(mod).toBeDefined();
  });

  it('exports createApiClient factory', () => {
    const mod = require('../../services/axiosFactory');
    expect(typeof mod.createApiClient).toBe('function');
  });
});

describe('gameRealtimeService module', () => {
  it('module loads without error', () => {
    const mod = require('../../services/gameRealtimeService');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../services/gameRealtimeService');
    const keys = Object.keys(mod);
    const hasCallable = keys.some((k) => typeof mod[k] === 'function');
    expect(hasCallable || typeof mod === 'function').toBe(true);
  });
});

describe('ttsCapabilityProbe module', () => {
  it('module loads without error', () => {
    const mod = require('../../services/ttsCapabilityProbe');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../services/ttsCapabilityProbe');
    const keys = Object.keys(mod);
    const hasCallable = keys.some((k) => typeof mod[k] === 'function');
    expect(hasCallable || typeof mod === 'function').toBe(true);
  });
});

describe('routePrefetcher module', () => {
  it('module loads without error', () => {
    const mod = require('../../services/routePrefetcher');
    expect(mod).toBeDefined();
  });
});
