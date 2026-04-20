/**
 * Jest smoke tests for hooks/useCrashReporter — batch #22.
 */

describe('useCrashReporter module', () => {
  it('module loads without error', () => {
    const mod = require('../../hooks/useCrashReporter');
    expect(mod).toBeDefined();
  });

  it('exports at least one function', () => {
    const mod = require('../../hooks/useCrashReporter');
    const keys = Object.keys(mod);
    const hasCallable = keys.some((k) => typeof mod[k] === 'function');
    expect(hasCallable || typeof mod === 'function').toBe(true);
  });
});
