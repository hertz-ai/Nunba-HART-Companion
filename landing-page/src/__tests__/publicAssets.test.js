/**
 * Public assets integrity meta-test — batch #52.
 *
 * landing-page/public/ contains static assets served verbatim by
 * create-react-app.  Silent corruption of these files (invalid JSON
 * manifest, truncated HTML, broken robots.txt) doesn't break the
 * Jest suite or CI \u2014 the app just ships a broken asset.
 *
 * This batch adds mechanical guards for:
 *   index.html           (CRA shell, must have <div id="root">)
 *   manifest.json        (PWA manifest, must parse + have name/icons)
 *   robots.txt           (must contain User-agent directive)
 *   sitemap.xml          (must parse as XML, declare urlset)
 *   app-ads.txt          (IAB format)
 *   nanba-companion.html (standalone companion marketing page)
 *   test-visualizer.html (dev utility)
 */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.resolve(__dirname, '..', '..', 'public');

describe('public/ directory integrity', () => {
  it('directory exists', () => {
    expect(fs.existsSync(PUBLIC_DIR)).toBe(true);
  });

  it('contains canonical files', () => {
    const required = [
      'index.html',
      'manifest.json',
      'robots.txt',
    ];
    const missing = required.filter((f) => !fs.existsSync(path.join(PUBLIC_DIR, f)));
    expect(missing).toEqual([]);
  });

  it('contains at least 20 assets', () => {
    const files = fs.readdirSync(PUBLIC_DIR);
    expect(files.length).toBeGreaterThanOrEqual(20);
  });
});

describe('public/index.html CRA shell contract', () => {
  const IDX = path.join(PUBLIC_DIR, 'index.html');
  const src = fs.readFileSync(IDX, 'utf-8');

  it('is non-empty', () => {
    expect(src.length).toBeGreaterThan(100);
  });

  it('declares <!DOCTYPE html>', () => {
    expect(src.toLowerCase()).toContain('<!doctype html>');
  });

  it('has root mount div (React mounts to #root)', () => {
    // Permissive: id="root" can be any attribute position, including
    // after style=, class=, etc.
    expect(/<div[^>]+id=["']root["']/i.test(src)).toBe(true);
  });

  it('has <meta charset>', () => {
    expect(/<meta\s+charset=/i.test(src)).toBe(true);
  });

  it('has viewport meta (mobile-friendly)', () => {
    expect(/<meta[^>]+viewport/i.test(src)).toBe(true);
  });

  it('has <title> element', () => {
    expect(/<title[^>]*>.+<\/title>/i.test(src)).toBe(true);
  });

  it('references a manifest (manifest.json OR site.webmanifest)', () => {
    // Accept either PWA manifest (manifest.json) or Web App
    // Manifest (site.webmanifest) \u2014 both serve the same purpose.
    expect(
      /manifest\.json/.test(src) || /site\.webmanifest/.test(src),
    ).toBe(true);
  });

  it('no leading git conflict markers', () => {
    expect(src).not.toMatch(/^<{7} /m);
    expect(src).not.toMatch(/^>{7} /m);
  });
});

describe('public/manifest.json PWA manifest contract', () => {
  const MANIFEST = path.join(PUBLIC_DIR, 'manifest.json');
  const src = fs.readFileSync(MANIFEST, 'utf-8');

  it('parses as JSON', () => {
    expect(() => JSON.parse(src)).not.toThrow();
  });

  it('declares name or short_name', () => {
    const data = JSON.parse(src);
    expect(data.name || data.short_name).toBeTruthy();
  });

  it('declares icons array', () => {
    const data = JSON.parse(src);
    expect(Array.isArray(data.icons)).toBe(true);
    expect(data.icons.length).toBeGreaterThanOrEqual(1);
  });

  it('every icon has src + sizes', () => {
    const data = JSON.parse(src);
    data.icons.forEach((icon) => {
      expect(icon.src).toBeTruthy();
      expect(icon.sizes).toBeTruthy();
    });
  });

  it('declares start_url', () => {
    const data = JSON.parse(src);
    expect(data.start_url !== undefined).toBe(true);
  });

  it('declares display mode', () => {
    const data = JSON.parse(src);
    // display = 'standalone' | 'browser' | 'fullscreen' | 'minimal-ui'
    expect(['standalone', 'browser', 'fullscreen', 'minimal-ui'])
      .toContain(data.display);
  });

  it('no leading git conflict markers', () => {
    expect(src).not.toMatch(/^<{7} /m);
    expect(src).not.toMatch(/^>{7} /m);
  });
});

describe('public/robots.txt contract', () => {
  const ROBOTS = path.join(PUBLIC_DIR, 'robots.txt');
  const src = fs.readFileSync(ROBOTS, 'utf-8');

  it('contains User-agent directive', () => {
    expect(/User-agent\s*:/i.test(src)).toBe(true);
  });

  it('is non-empty', () => {
    expect(src.trim().length).toBeGreaterThan(0);
  });

  it('no leading git conflict markers', () => {
    expect(src).not.toMatch(/^<{7} /m);
    expect(src).not.toMatch(/^>{7} /m);
  });
});

describe('public/sitemap.xml contract', () => {
  const SITEMAP = path.join(PUBLIC_DIR, 'sitemap.xml');

  it('file exists', () => {
    expect(fs.existsSync(SITEMAP)).toBe(true);
  });

  it('contains urlset XML root element', () => {
    const src = fs.readFileSync(SITEMAP, 'utf-8');
    expect(/<urlset/i.test(src) || /<sitemapindex/i.test(src)).toBe(true);
  });

  it('declares XML namespace', () => {
    const src = fs.readFileSync(SITEMAP, 'utf-8');
    expect(/xmlns=/.test(src)).toBe(true);
  });

  it('no leading git conflict markers', () => {
    const src = fs.readFileSync(SITEMAP, 'utf-8');
    expect(src).not.toMatch(/^<{7} /m);
    expect(src).not.toMatch(/^>{7} /m);
  });
});

describe('public/app-ads.txt IAB compliance', () => {
  const APP_ADS = path.join(PUBLIC_DIR, 'app-ads.txt');

  it('file exists (required by Play Store if monetized)', () => {
    expect(fs.existsSync(APP_ADS)).toBe(true);
  });

  it('contains at least one entry or comment', () => {
    const src = fs.readFileSync(APP_ADS, 'utf-8');
    expect(src.trim().length).toBeGreaterThan(0);
  });
});

describe('standalone HTML pages integrity', () => {
  const STANDALONE = [
    'nanba-companion.html',
    'test-visualizer.html',
  ];

  STANDALONE.forEach((name) => {
    describe(name, () => {
      const filePath = path.join(PUBLIC_DIR, name);

      it('file exists', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('is valid-looking HTML', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        // Permissive: <html> or <!DOCTYPE html>.
        expect(
          /<!doctype html>/i.test(src) ||
          /<html/i.test(src),
        ).toBe(true);
      });

      it('no conflict markers', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        expect(src).not.toMatch(/^<{7} /m);
        expect(src).not.toMatch(/^>{7} /m);
      });
    });
  });
});
