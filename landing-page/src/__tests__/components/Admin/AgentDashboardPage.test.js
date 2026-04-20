/**
 * Jest smoke test for Admin/AgentDashboardPage — batch #33.
 * Locks the exported-component contract.
 */

describe('Admin/AgentDashboardPage module', () => {
  it('module loads without error', () => {
    const mod = require('../../../components/Admin/AgentDashboardPage');
    expect(mod).toBeDefined();
  });

  it('exports a default React component', () => {
    const mod = require('../../../components/Admin/AgentDashboardPage');
    const Comp = mod.default || mod.AgentDashboardPage;
    expect(Comp).toBeDefined();
    // Component should be a function or forwardRef object
    const typeOk = typeof Comp === 'function' ||
      (Comp && typeof Comp.$$typeof !== 'undefined');
    expect(typeOk).toBe(true);
  });
});
