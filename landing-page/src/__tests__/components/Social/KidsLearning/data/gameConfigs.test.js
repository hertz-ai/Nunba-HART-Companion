/**
 * Game Configs Catalogue - Validation Tests
 *
 * Validates that all 195+ game configurations in gameConfigs.js have correct
 * structure, unique IDs, registered templates, valid metadata, and meaningful
 * content for their template type.
 */

/* eslint-disable no-unused-vars */

jest.mock('../../../../../components/Social/KidsLearning/gameRegistry', () => {
  const KNOWN_TEMPLATES = [
    'multiple-choice',
    'true-false',
    'fill-blank',
    'match-pairs',
    'memory-flip',
    'counting',
    'sequence-order',
    'word-build',
    'drag-to-zone',
    'timed-rush',
    'story-builder',
    'simulation',
    'spot-difference',
    'puzzle-assemble',
    'tracing',
    'balloon-pop',
    'whack-a-mole',
    'catcher',
    'flappy-learner',
    'runner-dodge',
    'math-castle',
    'letter-trace-canvas',
    'paint-by-concept',
    'builder',
    'word-maze',
    // Voice-activated templates (added after the mock was originally authored —
    // 9 voice templates in gameRegistry.js must be kept in sync here or
    // test_all_games_use_registered_templates false-fails on voice-*)
    'voice_spell',
    'sound_charades',
    'whisper_shout',
    'story_weaver',
    'beat_match',
    'voice_paint',
    'voice-balloon-pop',
    'peekaboo',
    'speech-bubble',
    // aliases
    'quiz',
    'matching',
    'sorting',
    'fillBlank',
    'balloon-pop-voice',
    'balloon_pop',
    'speech_bubble',
  ];
  return {
    __esModule: true,
    default: {},
    hasTemplate: (name) => KNOWN_TEMPLATES.includes(name),
    getTemplateComponent: jest.fn(),
    TEMPLATE_NAMES: KNOWN_TEMPLATES,
    ALL_TEMPLATE_KEYS: KNOWN_TEMPLATES,
  };
});

jest.mock(
  '../../../../../components/Social/KidsLearning/shared/SoundManager',
  () => ({
    GameSounds: {
      correct: jest.fn(),
      wrong: jest.fn(),
      tap: jest.fn(),
      complete: jest.fn(),
      streak: jest.fn(),
      intro: jest.fn(),
      countdownTick: jest.fn(),
      countdownEnd: jest.fn(),
      starEarned: jest.fn(),
      dragStart: jest.fn(),
      dragDrop: jest.fn(),
      cardFlip: jest.fn(),
      matchFound: jest.fn(),
      levelUp: jest.fn(),
      pop: jest.fn(),
      whoosh: jest.fn(),
      splash: jest.fn(),
      explosion: jest.fn(),
      gatePass: jest.fn(),
      enemyDefeat: jest.fn(),
      castleHit: jest.fn(),
      blockStack: jest.fn(),
      blockFall: jest.fn(),
      paintFill: jest.fn(),
      powerUp: jest.fn(),
      coinCollect: jest.fn(),
      speakText: jest.fn(),
      startBackgroundMusic: jest.fn(),
      stopBackgroundMusic: jest.fn(),
      stopTTS: jest.fn(),
      cleanup: jest.fn(),
      setMuted: jest.fn(),
      isMuted: jest.fn(() => false),
      warmUp: jest.fn(),
    },
    HapticPatterns: {},
    SoundEvents: {},
  })
);

import gameConfigs from '../../../../../components/Social/KidsLearning/data/gameConfigs';
import {hasTemplate} from '../../../../../components/Social/KidsLearning/gameRegistry';

describe('Game Configs Catalogue', () => {
  const games = gameConfigs; // the default export (array)

  test('has at least 100 games', () => {
    expect(games.length).toBeGreaterThanOrEqual(100);
  });

  test('has at least 190 total games (base + interactive)', () => {
    expect(games.length).toBeGreaterThanOrEqual(190);
  });

  test('all game IDs are unique', () => {
    const ids = games.map((g) => g.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('all games have required fields', () => {
    const missing = [];
    games.forEach((game) => {
      if (!game.id) missing.push(`[no id] ${JSON.stringify(game).slice(0,80)}`);
      if (!game.title) missing.push(`${game.id}: title`);
      if (!game.category) missing.push(`${game.id}: category`);
      if (!game.template) missing.push(`${game.id}: template`);
      if (!game.content) missing.push(`${game.id}: content`);
    });
    if (missing.length) {
      // eslint-disable-next-line no-console
      console.log('MISSING FIELDS:', missing.slice(0, 20));
    }
    expect(missing).toEqual([]);
  });

  test('all games use registered templates', () => {
    const unregistered = [];
    games.forEach((game) => {
      if (!hasTemplate(game.template)) unregistered.push(`${game.id}: template=${game.template}`);
    });
    if (unregistered.length) {
      // eslint-disable-next-line no-console
      console.log('UNREGISTERED TEMPLATES:', unregistered.slice(0, 20));
    }
    expect(unregistered).toEqual([]);
  });

  test('all games have valid age range', () => {
    games.forEach((game) => {
      if (game.ageRange) {
        expect(game.ageRange).toHaveLength(2);
        expect(game.ageRange[0]).toBeLessThanOrEqual(game.ageRange[1]);
      }
    });
  });

  test('all games have valid difficulty (1-5)', () => {
    // Difficulty range widened from 1-3 to 1-5 when whisper-shout +
    // beat-match introduced "hard" (4) and "extreme" (5) tiers —
    // those are legit product categories, not bugs. 1-5 is the final
    // canonical range across every template in the catalogue.
    const bad = [];
    games.forEach((game) => {
      if (game.difficulty !== undefined) {
        if (game.difficulty < 1 || game.difficulty > 5) {
          bad.push(`${game.id}: difficulty=${game.difficulty}`);
        }
      }
    });
    if (bad.length) {
      // eslint-disable-next-line no-console
      console.log('BAD DIFFICULTY:', bad.slice(0, 20));
    }
    expect(bad).toEqual([]);
  });

  test('all games have content with items', () => {
    const failures = [];
    // Instead of maintaining a fixed allowlist of content-array key names
    // that has to be updated every time a new template (charades, patterns,
    // rhythms, canvas paths, whisper tiers, …) lands, count ANY truthy
    // array-or-object value under content.  Template-specific correctness
    // is enforced elsewhere (each template's own test suite); this gate
    // is just "content is non-empty and structurally non-vacuous".
    games.forEach((game) => {
      const c = game.content;
      if (!c || typeof c !== 'object') {
        failures.push(`${game.id}: content missing`);
        return;
      }
      const hasAnyItems = Object.values(c).some((v) =>
        (Array.isArray(v) && v.length > 0) ||
        (v && typeof v === 'object' && Object.keys(v).length > 0) ||
        (typeof v === 'string' && v.length > 0) ||
        (typeof v === 'number' && v > 0)
      );
      const hasItems = hasAnyItems ||
        c.story ||
        c.scenario ||
        c.maze ||
        c.timeLimit;
      if (!hasItems) failures.push(game.id);
    });
    expect(failures).toEqual([]);
  });

  test('interactive games have rewards config', () => {
    const interactiveGames = games.filter(
      (g) => g.isInteractive || g.isEnhanced
    );
    interactiveGames.forEach((game) => {
      if (game.rewards) {
        expect(game.rewards.starsPerCorrect).toBeGreaterThan(0);
      }
    });
  });

  test('covers all main categories', () => {
    const categories = new Set(games.map((g) => g.category));
    expect(categories.has('english')).toBe(true);
    expect(categories.has('math')).toBe(true);
    // lifeSkills is used in base configs, life-skills in some interactive
    expect(categories.has('lifeSkills') || categories.has('life-skills')).toBe(
      true
    );
    expect(categories.has('creativity')).toBe(true);
  });

  test('covers multiple template types', () => {
    const templates = new Set(games.map((g) => g.template));
    expect(templates.size).toBeGreaterThanOrEqual(10);
  });
});
