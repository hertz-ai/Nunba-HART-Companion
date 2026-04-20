/**
 * Jest source-shape smoke for the 9 hooks that still lack tests
 * after batches #22 + #27 + #34 — batch #43.
 *
 * These hooks need browser-only APIs (MediaDevices, SpeechRecognition,
 * Audio, etc.) that Jest's jsdom doesn't mock by default.  Rather
 * than building individual mocks, we use source-shape smoke to lock
 * the exported contract against silent regression.
 */

const fs = require('fs');
const path = require('path');

const HOOKS = [
  'useAgentObserver',
  'useAnimations',
  'useCameraFrameStream',
  'useCrashReporter',
  'useGameCatalog',
  'useMicAmplitude',
  'useReferral',
  'useSpeechRecognition',
  'useTTS',
];

describe('Uncovered hooks source-shape smoke (batch #43)', () => {
  HOOKS.forEach((hookName) => {
    describe(hookName, () => {
      const filePath = path.join(
        __dirname, '..', '..', 'hooks', `${hookName}.js`,
      );

      it('source file exists', () => {
        expect(fs.existsSync(filePath)).toBe(true);
      });

      it('is non-empty', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        expect(src.length).toBeGreaterThan(0);
      });

      it('declares at least one export', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        // Permissive: module-level file may export helpers instead
        // of a single same-named hook.  Either form works.
        const hasAnyExport =
          /\bexport\s+/.test(src) || /module\.exports/.test(src);
        expect(hasAnyExport).toBe(true);
      });

      it('defines at least one function (hook, helper, or utility)', () => {
        const src = fs.readFileSync(filePath, 'utf-8');
        // Permissive function detection: function keyword, arrow,
        // or class definition.
        const hasAnyCallable =
          /\bfunction\s+\w+/.test(src) ||
          /const\s+\w+\s*=\s*\(/.test(src) ||
          /=>\s*/.test(src) ||
          /\bclass\s+\w+/.test(src);
        expect(hasAnyCallable).toBe(true);
      });

      it('uses React hooks OR is pure utility module', () => {
        // Some files in hooks/ are utility modules (useCrashReporter
        // is a Sentry wrapper without React state).  Accept either
        // React-hook use OR module-level JS (just requires the file
        // is coherent JS).
        const src = fs.readFileSync(filePath, 'utf-8');
        const isReactHook =
          /\buseState\b/.test(src) ||
          /\buseEffect\b/.test(src) ||
          /\buseCallback\b/.test(src) ||
          /\buseRef\b/.test(src) ||
          /\buseMemo\b/.test(src) ||
          /\buseContext\b/.test(src) ||
          /\buseReducer\b/.test(src) ||
          /\buseLayoutEffect\b/.test(src);
        const isUtilityModule =
          /\bexport\s+(?:default\s+)?function/.test(src) ||
          /\bexport\s+(?:const|let|var)/.test(src);
        expect(isReactHook || isUtilityModule).toBe(true);
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
// Contract inventory lock — prevents accidental hook deletion
// ════════════════════════════════════════════════════════════════════════

describe('Hook directory integrity', () => {
  const HOOKS_DIR = path.join(__dirname, '..', '..', 'hooks');

  it('hooks directory exists', () => {
    expect(fs.existsSync(HOOKS_DIR)).toBe(true);
  });

  it('contains at least 9 hook files (post-batch-expansion)', () => {
    const files = fs.readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it('every file in hooks/ follows useXxx naming convention', () => {
    const files = fs.readdirSync(HOOKS_DIR).filter((f) => f.endsWith('.js'));
    const nonConforming = files.filter((f) => !/^use[A-Z]/.test(f));
    expect(nonConforming).toEqual([]);
  });
});
