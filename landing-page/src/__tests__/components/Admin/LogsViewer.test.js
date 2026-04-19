/**
 * Jest smoke test for Admin/LogsViewer — batch #33.
 */

describe('Admin/LogsViewer module', () => {
  it('module loads without error', () => {
    const mod = require('../../../components/Admin/LogsViewer');
    expect(mod).toBeDefined();
  });

  it('exports a default React component', () => {
    const mod = require('../../../components/Admin/LogsViewer');
    const Comp = mod.default || mod.LogsViewer;
    expect(Comp).toBeDefined();
    const typeOk = typeof Comp === 'function' ||
      (Comp && typeof Comp.$$typeof !== 'undefined');
    expect(typeOk).toBe(true);
  });
});
