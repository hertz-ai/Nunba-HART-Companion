/**
 * Jest smoke tests for contexts/RealtimeContext — batch #22.
 */

describe('RealtimeContext module', () => {
  it('module loads without error', () => {
    const mod = require('../../contexts/RealtimeContext');
    expect(mod).toBeDefined();
  });

  it('exports a Provider and/or context', () => {
    const mod = require('../../contexts/RealtimeContext');
    const provider = mod.RealtimeProvider || mod.default;
    const ctx = mod.RealtimeContext;
    expect(typeof provider === 'function' || typeof ctx === 'object').toBe(true);
  });
});
