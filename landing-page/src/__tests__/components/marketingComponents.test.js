/**
 * Jest source-shape smoke tests for the marketing/legacy landing-page
 * components that still lack tests — batch #40.
 *
 * These are the older homepage/demo/docs components (pre-Nunba
 * branding).  Tests use source-shape (fs.readFileSync + regex) to
 * avoid the cost of plumbing jest transforms for their browser-only
 * deps (Stripe, GoogleMaps, jQuery, etc.).
 */

const fs = require('fs');
const path = require('path');

// Components that exist but haven't been tested yet.
const COMPONENTS = [
  'aboutOne',
  'aboutThree',
  'aboutTwo',
  'aiFeatures',
  'brandLogo',
  'clients',
  'consearch',
  'consearch_new',
  'contact',
  'content',
  'createBook',
  'curriculai',
  'demoConsearch',
  'demoVideo',
  'essentials',
  'faq',
  'features',
  'featuresnew',
  'footer',
  'footerlite',
  'hertz',
  'hevolveDemo',
  'home-multipurpose',
  'knnresults',
  'navbar',
  'navbarlite',
  'parallaxCodepen',
  'privacyPage',
  'prompt',
  'pupitDocs',
  'recap',
  'signIn',
  'thumbnails',
  'uploadFIle',
  'useForm',
];

describe('Marketing / legacy component source-shape smoke', () => {
  COMPONENTS.forEach((name) => {
    describe(name, () => {
      const filePath = path.join(
        __dirname, '..', '..', 'components', `${name}.js`,
      );

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
