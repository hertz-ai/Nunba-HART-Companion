/**
 * Jest smoke tests for hooks/useGameCatalog — batch #22.
 */

describe('useGameCatalog module', () => {
  it('module loads without error', () => {
    const mod = require('../../hooks/useGameCatalog');
    expect(mod).toBeDefined();
  });

  it('exports a hook (default or named)', () => {
    const mod = require('../../hooks/useGameCatalog');
    const hook = mod.default || mod.useGameCatalog;
    expect(typeof hook).toBe('function');
  });
});
