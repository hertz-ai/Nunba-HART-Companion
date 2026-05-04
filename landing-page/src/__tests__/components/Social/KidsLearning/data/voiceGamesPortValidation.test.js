/**
 * Voice Games Port Validation
 *
 * Validates the 4 NEW voice games reverse-ported from the Hevolve_React_Native
 * app + 1 retag of an existing Nunba game:
 *
 *   NEW (ported):
 *     voice-balloon-science-06   (template: voice-balloon-pop, category: science)
 *     voice-peekaboo-speed-07    (template: peekaboo,          category: lifeSkills)
 *     voice-bubble-compound-06   (template: speech-bubble,     category: english)
 *     voice-bubble-sight-07      (template: speech-bubble,     category: english)
 *
 *   RETAGGED (existing Nunba game, science category restored from RN source):
 *     voice-peekaboo-space-05    (now category: science, was lifeSkills)
 *
 * Design rationale:
 *   - The RN source's voice-peekaboo-space-04 had science content that overlapped
 *     ~80% with Nunba's existing voice-peekaboo-space-05. Rather than adding a
 *     near-duplicate, we merged by retagging space-05 to science (its RN intent).
 *   - The 4 NEW ports use indices 06/07 to avoid collision with existing 01-05
 *     entries that were already taken in their respective arrays.
 *
 * This file uses text parsing (not runtime import) to side-step the pre-existing
 * ESM/babel transform issue in the main gameConfigs.test.js suite.
 */

const fs = require('fs');
const path = require('path');

const SOURCE = path.join(
  __dirname,
  '../../../../../components/Social/KidsLearning/data/voiceGames.js'
);

if (!fs.existsSync(SOURCE)) {
  throw new Error(`voiceGames.js not found at ${SOURCE}`);
}

// 4 NEW ports — all use index 06 or 07
const NEW_PORTED_IDS = [
  'voice-balloon-science-06',
  'voice-peekaboo-speed-07',
  'voice-bubble-compound-06',
  'voice-bubble-sight-07',
];

// 1 existing game that was retagged (not added — the id was already present)
const RETAGGED_ID = 'voice-peekaboo-space-05';

const ALL_PORTED_IDS = [...NEW_PORTED_IDS, RETAGGED_ID];

const VALID_CATEGORIES = ['english', 'math', 'lifeSkills', 'science', 'creativity'];
const VALID_VOICE_TEMPLATES = ['voice-balloon-pop', 'peekaboo', 'speech-bubble'];

function extractGameObject(source, id) {
  const idMarker = `id: '${id}'`;
  const idx = source.indexOf(idMarker);
  if (idx === -1) return null;
  // Walk back to the opening `{` of this object
  let start = idx;
  while (start > 0 && source[start] !== '{') start--;
  // Walk forward matching braces
  let depth = 0;
  let end = start;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return source.slice(start, end + 1);
}

describe('Voice Games Port Validation', () => {
  const source = fs.readFileSync(SOURCE, 'utf8');

  test('all ported ids exist in voiceGames.js', () => {
    ALL_PORTED_IDS.forEach((id) => {
      expect(source).toContain(`id: '${id}'`);
    });
  });

  test('removed placeholder ids are NOT present (no duplicate galaxy / old balloon-science-05)', () => {
    // These were initial attempts that got fixed during review
    expect(source).not.toContain(`id: 'voice-peekaboo-galaxy-06'`);
    expect(source).not.toContain(`id: 'voice-balloon-science-05'`);
  });

  ALL_PORTED_IDS.forEach((id) => {
    describe(`Game: ${id}`, () => {
      const obj = extractGameObject(source, id);

      test('extracts as a complete object', () => {
        expect(obj).toBeTruthy();
        expect(obj.startsWith('{')).toBe(true);
        expect(obj.endsWith('}')).toBe(true);
      });

      test('has required metadata', () => {
        expect(obj).toMatch(/title:\s*['"]/);
        expect(obj).toMatch(/category:\s*['"]/);
        expect(obj).toMatch(/template:\s*['"]/);
        expect(obj).toMatch(/ageRange:\s*\[/);
        expect(obj).toMatch(/difficulty:\s*\d/);
        expect(obj).toMatch(/icon:\s*['"]/);
        expect(obj).toMatch(/color:\s*['"]#/);
        expect(obj).toMatch(/emoji:\s*['"]/);
        expect(obj).toMatch(/questions:\s*\[/);
        expect(obj).toMatch(/rewards:\s*\{/);
        expect(obj).toMatch(/threeR:\s*\{/);
      });

      test('declares questions in the canonical voiceGames.js shape', () => {
        // Two valid shapes ship in voiceGames.js today:
        //   - flat:    `questions: [...]` at root
        //   - wrapped: `content: { questions: [...] }`
        // The original test asserted flat-only, but every entry in
        // voiceGames.js (49/49 at the time of writing) uses the
        // wrapped form — runtime readers (TemplateRenderer +
        // gameRegistry) accept both via .questions || .content?.questions.
        // The test is loosened to accept either shape so it reflects
        // the actual convention in source.
        const hasFlatQuestions = /^\s*questions:\s*\[/m.test(obj);
        const hasWrappedQuestions = /content:\s*\{\s*questions:\s*\[/.test(obj);
        expect(hasFlatQuestions || hasWrappedQuestions).toBe(true);
      });

      test('uses valid category', () => {
        const m = obj.match(/category:\s*['"]([^'"]+)['"]/);
        expect(m).toBeTruthy();
        expect(VALID_CATEGORIES).toContain(m[1]);
      });

      test('uses a voice template registered in Nunba gameRegistry', () => {
        const m = obj.match(/template:\s*['"]([^'"]+)['"]/);
        expect(m).toBeTruthy();
        expect(VALID_VOICE_TEMPLATES).toContain(m[1]);
      });
    });
  });

  test('no id collisions with existing voice games', () => {
    NEW_PORTED_IDS.forEach((id) => {
      const count = (source.match(new RegExp(`'${id}'`, 'g')) || []).length;
      expect(count).toBe(1);
    });
  });

  test('all NEW ported ids use indices 06 or 07 (convention: new adds start at 06)', () => {
    NEW_PORTED_IDS.forEach((id) => {
      expect(id).toMatch(/-0[67]$/);
    });
  });

  test('voice-peekaboo-space-05 is tagged as science (RN source intent preserved)', () => {
    const obj = extractGameObject(source, 'voice-peekaboo-space-05');
    expect(obj).toBeTruthy();
    expect(obj).toMatch(/category:\s*['"]science['"]/);
  });

  test('voice-balloon-science-06 uses a distinct color from sibling voice-balloon-colors-05', () => {
    const science = extractGameObject(source, 'voice-balloon-science-06');
    const colors = extractGameObject(source, 'voice-balloon-colors-05');
    expect(science).toBeTruthy();
    expect(colors).toBeTruthy();
    const sciColor = science.match(/color:\s*['"](#[0-9A-Fa-f]+)['"]/)[1];
    const colColor = colors.match(/color:\s*['"](#[0-9A-Fa-f]+)['"]/)[1];
    expect(sciColor).not.toBe(colColor);
  });
});
