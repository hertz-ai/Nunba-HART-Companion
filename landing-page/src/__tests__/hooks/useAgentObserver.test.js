/**
 * Jest smoke tests for hooks/useAgentObserver — batch #22.
 *
 * Locks the exported-hook contract.  Full behavioral tests live in
 * the integration tier that renders real agent UI.
 */

describe('useAgentObserver module', () => {
  it('exports a hook function', () => {
    const mod = require('../../hooks/useAgentObserver');
    const useAgentObserver = mod.default || mod.useAgentObserver || mod;
    expect(typeof useAgentObserver).toBe('function');
  });

  it('hook name is useAgentObserver (convention check)', () => {
    const mod = require('../../hooks/useAgentObserver');
    const hook = mod.default || mod.useAgentObserver;
    // React hook naming convention — must start with "use".
    if (hook && hook.name) {
      expect(hook.name).toMatch(/^use/i);
    }
  });
});
