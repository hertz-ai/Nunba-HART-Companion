/**
 * Jest smoke test for Admin/RevenueAnalyticsPage — batch #33.
 */

describe('Admin/RevenueAnalyticsPage module', () => {
  it('module loads without error', () => {
    const mod = require('../../../components/Admin/RevenueAnalyticsPage');
    expect(mod).toBeDefined();
  });

  it('exports a default React component', () => {
    const mod = require('../../../components/Admin/RevenueAnalyticsPage');
    const Comp = mod.default || mod.RevenueAnalyticsPage;
    expect(Comp).toBeDefined();
    const typeOk = typeof Comp === 'function' ||
      (Comp && typeof Comp.$$typeof !== 'undefined');
    expect(typeOk).toBe(true);
  });
});
