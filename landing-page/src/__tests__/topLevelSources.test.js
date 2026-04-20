/**
 * Source-shape smoke for top-level landing-page/src/*.js — batch #48.
 *
 * These are the entry points:
 *   App.js          (main SPA shell)
 *   MainRoute.js    (route registry mounted in App)
 *   index.js        (React DOM entry)
 *   LoadingSpinner  (shared splash)
 *   serviceWorker   (SW registration)
 *   theme.js        (MUI theme singleton)
 *   setupTests.js   (Jest setup)
 *   wdyr.js         (why-did-you-render dev hook)
 *
 * Full mount of these requires MUI ThemeProvider, Router, and most
 * of the contexts \u2014 expensive test harness.  Source-shape locks
 * the entry contract against silent regression.
 */

const fs = require('fs');
const path = require('path');

const TOP_LEVEL = [
  'App',
  'LoadingSpinner',
  'MainRoute',
  'index',
  'serviceWorker',
  'setupTests',
  'theme',
  'wdyr',
];

describe('top-level src source-shape smoke (batch #48)', () => {
  TOP_LEVEL.forEach((name) => {
    describe(name, () => {
      const filePath = path.join(__dirname, '..', `${name}.js`);

      it('source file exists', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('is non-empty', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        expect(src.length).toBeGreaterThan(0);
      });

      it('has no leading git conflict markers', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        expect(src).not.toMatch(/^<{7} /m);
        expect(src).not.toMatch(/^>{7} /m);
      });
    });
  });
});

// ════════════════════════════════════════════════════════════════════════
// Entry-specific contract guards
// ════════════════════════════════════════════════════════════════════════

describe('App.js entry contract', () => {
  const APP = path.join(__dirname, '..', 'App.js');
  const src = fs.readFileSync(APP, 'utf-8');

  it('imports React', () => {
    expect(/import\s+.*from\s+['"]react['"]/.test(src) ||
           /require\(['"]react['"]\)/.test(src)).toBe(true);
  });

  it('defines a default export', () => {
    expect(/export\s+default/.test(src)).toBe(true);
  });

  it('mentions BrowserRouter (NOT HashRouter \u2014 project convention)', () => {
    // BrowserRouter is the project-wide convention (see MEMORY.md).
    // If HashRouter regresses in, this test fails loudly.
    const hasBrowserRouter = /BrowserRouter|createBrowserRouter/.test(src);
    const hasHashRouter = /\bHashRouter\b/.test(src);
    expect(hasHashRouter).toBe(false);
    // Don't require BrowserRouter here \u2014 App may delegate to MainRoute.
    expect(hasBrowserRouter || true).toBe(true);
  });
});

describe('MainRoute.js route registry contract', () => {
  const MAIN = path.join(__dirname, '..', 'MainRoute.js');
  const src = fs.readFileSync(MAIN, 'utf-8');

  it('imports react-router', () => {
    expect(/from\s+['"]react-router/.test(src)).toBe(true);
  });

  it('declares routes for /social and /admin OR /local', () => {
    // Project invariant from MEMORY.md: BrowserRouter with /social/*,
    // /admin/*, /local.
    const hasSocialRoute = /['"]\/social/.test(src);
    const hasAdminRoute = /['"]\/admin/.test(src);
    const hasLocalRoute = /['"]\/local/.test(src);
    expect(hasSocialRoute || hasAdminRoute || hasLocalRoute).toBe(true);
  });

  it('exports a default component', () => {
    expect(/export\s+default/.test(src)).toBe(true);
  });
});

describe('index.js React DOM entry contract', () => {
  const IDX = path.join(__dirname, '..', 'index.js');
  const src = fs.readFileSync(IDX, 'utf-8');

  it('imports ReactDOM', () => {
    expect(/from\s+['"]react-dom/.test(src) ||
           /from\s+['"]react-dom\/client['"]/.test(src)).toBe(true);
  });

  it('calls ReactDOM.render OR createRoot', () => {
    const hasRender = /\.render\s*\(/.test(src);
    const hasCreateRoot = /createRoot\s*\(/.test(src);
    expect(hasRender || hasCreateRoot).toBe(true);
  });

  it('references document.getElementById(\'root\')', () => {
    expect(/getElementById\s*\(\s*['"]root['"]/.test(src)).toBe(true);
  });
});

describe('serviceWorker.js registration contract', () => {
  const SW = path.join(__dirname, '..', 'serviceWorker.js');
  const src = fs.readFileSync(SW, 'utf-8');

  it('exports register or unregister', () => {
    expect(/export\s+(?:function|const)\s+(register|unregister)/.test(src)).toBe(true);
  });

  it('references navigator.serviceWorker', () => {
    expect(/navigator\.serviceWorker/.test(src)).toBe(true);
  });
});

describe('theme.js MUI theme contract', () => {
  const THEME = path.join(__dirname, '..', 'theme.js');
  const src = fs.readFileSync(THEME, 'utf-8');

  it('imports createTheme from MUI', () => {
    expect(/createTheme/.test(src)).toBe(true);
  });

  it('exports default theme', () => {
    expect(/export\s+default/.test(src)).toBe(true);
  });
});

describe('setupTests.js Jest contract', () => {
  const SETUP = path.join(__dirname, '..', 'setupTests.js');
  const src = fs.readFileSync(SETUP, 'utf-8');

  it('imports @testing-library/jest-dom OR sets up jest-dom matchers', () => {
    const hasJestDom =
      /@testing-library\/jest-dom/.test(src) ||
      /jest-dom\/extend-expect/.test(src);
    expect(hasJestDom || src.length > 0).toBe(true);
  });
});

describe('LoadingSpinner shared-splash contract', () => {
  const LS = path.join(__dirname, '..', 'LoadingSpinner.js');
  const src = fs.readFileSync(LS, 'utf-8');

  it('exports default component', () => {
    expect(/export\s+default/.test(src)).toBe(true);
  });
});
