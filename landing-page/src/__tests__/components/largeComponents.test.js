/**
 * Jest source-shape smoke tests for the 10 highest-LOC
 * landing-page components that still lack tests — batch #35.
 *
 * These components are 500-1200 LOC each; a full render test
 * would require extensive mocking of Material-UI theme, React
 * Router context, Redux store, i18n, Stripe, etc.  Source-shape
 * tests lock the export contract against silent deletion
 * regressions without that plumbing cost.
 *
 * Together: ~7000 LOC of previously un-tested React code now
 * has at least one CI-enforced existence + export-shape check.
 */

const COMPONENTS = [
  {name: 'register', loc: 1199},
  {name: 'demo', loc: 951},
  {name: 'cortext', loc: 868},
  {name: 'TeacherSignUp', loc: 723},
  {name: 'createAssessment', loc: 648},
  {name: 'DynamicElementHandler', loc: 625},
  {name: 'reviewAssessment', loc: 615},
  {name: 'MindstorySDKDocs', loc: 575},
  {name: 'createCourse', loc: 544},
  {name: 'SpeechTherapy', loc: 505},
  {name: 'HevolveDocs', loc: 0},     // docs page — any size
  {name: 'DemoPage', loc: 0},
  {name: 'TeacherSignIn', loc: 0},
  {name: 'Partner', loc: 0},
  {name: 'PupitAi', loc: 0},
  {name: 'SpeechTherapy', loc: 0},
];

describe('Large landing-page components source-shape smoke', () => {
  const fs = require('fs');
  const path = require('path');
  const uniqueNames = Array.from(new Set(COMPONENTS.map((c) => c.name)));

  uniqueNames.forEach((name) => {
    describe(name, () => {
      it('source file exists and is non-trivial', () => {
        const src = fs.readFileSync(
          path.join(__dirname, '..', '..', 'components', `${name}.js`),
          'utf-8',
        );
        expect(src.length).toBeGreaterThan(200);
      });

      it('declares a React component export', () => {
        const src = fs.readFileSync(
          path.join(__dirname, '..', '..', 'components', `${name}.js`),
          'utf-8',
        );
        const hasDefault = /export\s+default/.test(src);
        const hasNamed = /export\s+(const|function|class)/.test(src);
        expect(hasDefault || hasNamed).toBe(true);
      });

      it('imports React (JSX file)', () => {
        const src = fs.readFileSync(
          path.join(__dirname, '..', '..', 'components', `${name}.js`),
          'utf-8',
        );
        // React/JSX components must either import React or a hook.
        const importsReact =
          /import\s+React/.test(src) ||
          /from\s+['"]react['"]/.test(src);
        expect(importsReact).toBe(true);
      });
    });
  });
});
