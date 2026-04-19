/**
 * Jest smoke test for Admin/ContentTasksPage — batch #33.
 */

describe('Admin/ContentTasksPage module', () => {
  it('module loads without error', () => {
    const mod = require('../../../components/Admin/ContentTasksPage');
    expect(mod).toBeDefined();
  });

  it('exports a default React component', () => {
    const mod = require('../../../components/Admin/ContentTasksPage');
    const Comp = mod.default || mod.ContentTasksPage;
    expect(Comp).toBeDefined();
    const typeOk = typeof Comp === 'function' ||
      (Comp && typeof Comp.$$typeof !== 'undefined');
    expect(typeOk).toBe(true);
  });
});
