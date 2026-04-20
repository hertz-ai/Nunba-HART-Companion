/**
 * Jest smoke tests for contexts/ThemeContext — batch #22.
 *
 * ThemeContext provides the MUI theme + dark/light mode toggle.
 * 291 LOC, previously untested — this locks the exported-API contract.
 */

describe('ThemeContext module', () => {
  it('module loads without error', () => {
    const mod = require('../../contexts/ThemeContext');
    expect(mod).toBeDefined();
  });

  it('exports NunbaThemeProvider component', () => {
    const mod = require('../../contexts/ThemeContext');
    expect(typeof mod.NunbaThemeProvider).toBe('function');
  });

  it('exports useNunbaTheme hook', () => {
    const mod = require('../../contexts/ThemeContext');
    expect(typeof mod.useNunbaTheme).toBe('function');
  });

  it('default export is the ThemeContext object', () => {
    const mod = require('../../contexts/ThemeContext');
    // default is the React Context (typeof === 'object')
    expect(mod.default).toBeDefined();
  });
});
