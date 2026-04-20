/**
 * Kids Learning Zone - Game Configuration Catalogue
 *
 * 195+ game configurations (30 English, 30 Math, 25 Life Skills, 10 Creativity + 100 Interactive)
 * adapted from the React Native reference implementation for the web app.
 *
 * Base configs (10+10+10+10) are defined below. Extra configs are imported
 * from englishGamesExtra.js (20), mathGamesExtra.js (20), and
 * lifeSkillsGamesExtra.js (15) and merged into the combined gameConfigs array.
 *
 * Each entry describes a game card visible on the hub and carries enough
 * metadata + content for KidsGameScreen to load the correct template at runtime.
 *
 * `template` is a key that maps to a React.lazy() dynamic import inside
 * gameRegistry.js (e.g. 'multiple-choice' -> ../templates/MultipleChoiceTemplate).
 *
 * Content shapes by template type:
 *   multiple-choice  -> content.questions[{ question, options, correctIndex, concept, hint }]
 *   true-false       -> content.statements[{ text, answer, concept, explanation }]
 *   fill-blank       -> content.questions[{ text, blank, options, concept, hint }]
 *   match-pairs      -> content.pairs[{ left, right, concept }]
 *   memory-flip      -> content.pairs[{ id, front, match, concept }], gridColumns
 *   counting         -> content.rounds[{ count, icon, color, concept, label }]
 *   sequence-order   -> content.sequences[{ items[], concept }]
 *   word-build       -> content.words[{ word, hint, concept, extraLetters }]
 *   drag-to-zone     -> content.zones[], content.items[]
 *   timed-rush       -> content.timeLimit, content.questions[]
 *   story-builder    -> content.story.{ start, scenes }
 *   simulation       -> content.scenario.{ title, concept, startingMoney, items[], goal }
 *   spot-difference  -> content.rounds[{ title, differences[{ x, y, label }], concept }]
 */

import ENGLISH_GAMES_EXTRA from './englishGamesExtra';
import INTERACTIVE_GAMES from './interactiveGames';
import LIFE_SKILLS_GAMES_EXTRA from './lifeSkillsGamesExtra';
import MATH_GAMES_EXTRA from './mathGamesExtra';
import VOICE_GAMES from './voiceGames';

// ============================================================================
// ENGLISH GAMES (10)
// ============================================================================

const ENGLISH_GAMES = [
  // 1. Animal Spelling Bee (word-build)
  {
    id: 'eng-spell-animals-01',
    title: 'Animal Spelling Bee',
    category: 'english',
    subcategory: 'spelling',
    template: 'word-build',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'bee',
    color: '#FF6B6B',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: ['spelling', 'vocabulary'],
    tags: ['animals', 'nature'],
    emoji: '\uD83D\uDC1D',
    content: {
      words: [
        {
          word: 'tiger',
          hint: 'A big striped cat that lives in the jungle',
          concept: 'spell:tiger',
          extraLetters: 3,
          emoji: '\uD83D\uDC2F',
          imagePrompt:
            'cute cartoon tiger, orange with black stripes, friendly face, white background, children educational illustration style',
        },
        {
          word: 'elephant',
          hint: 'The largest land animal with a long trunk',
          concept: 'spell:elephant',
          extraLetters: 3,
          emoji: '\uD83D\uDC18',
          imagePrompt:
            'cute cartoon elephant, gray with big floppy ears and long trunk, friendly smile, white background, children educational illustration style',
        },
        {
          word: 'giraffe',
          hint: 'The tallest animal with a very long neck',
          concept: 'spell:giraffe',
          extraLetters: 3,
          emoji: '\uD83E\uDD92',
          imagePrompt:
            'cute cartoon giraffe, tall with brown spots and long neck, friendly face, white background, children educational illustration style',
        },
        {
          word: 'dolphin',
          hint: 'A friendly sea creature that loves to jump',
          concept: 'spell:dolphin',
          extraLetters: 3,
          emoji: '\uD83D\uDC2C',
          imagePrompt:
            'cute cartoon dolphin, blue-gray and sleek, jumping out of water, friendly smile, white background, children educational illustration style',
        },
        {
          word: 'penguin',
          hint: 'A black and white bird that cannot fly but can swim',
          concept: 'spell:penguin',
          extraLetters: 3,
          emoji: '\uD83D\uDC27',
          imagePrompt:
            'cute cartoon penguin, black and white with orange beak and feet, waddling, white background, children educational illustration style',
        },
        {
          word: 'monkey',
          hint: 'A playful animal that swings from trees',
          concept: 'spell:monkey',
          extraLetters: 2,
          emoji: '\uD83D\uDC12',
          imagePrompt:
            'cute cartoon monkey, brown with curly tail, playful expression, white background, children educational illustration style',
        },
        {
          word: 'rabbit',
          hint: 'A furry animal with long ears that hops',
          concept: 'spell:rabbit',
          extraLetters: 2,
          emoji: '\uD83D\uDC07',
          imagePrompt:
            'cute cartoon rabbit, fluffy white with long pink ears, hopping, white background, children educational illustration style',
        },
        {
          word: 'parrot',
          hint: 'A colorful bird that can talk like a human',
          concept: 'spell:parrot',
          extraLetters: 2,
          emoji: '\uD83E\uDD9C',
          imagePrompt:
            'cute cartoon parrot, bright green red and blue feathers, perched on branch, white background, children educational illustration style',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 2. CVC Word Rhymes (match-pairs)
  {
    id: 'eng-phon-cvc-06',
    title: 'CVC Word Rhymes',
    category: 'english',
    subcategory: 'phonics',
    template: 'match-pairs',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'music-note',
    color: '#FF6B6B',
    estimatedMinutes: 3,
    questionsPerSession: 8,
    learningObjectives: ['phonics', 'rhyming', 'reading'],
    tags: ['cvc', 'rhyming', 'beginner'],
    emoji: '\uD83C\uDFB5',
    content: {
      pairs: [
        {
          left: 'cat',
          right: 'hat',
          concept: 'phonics:cvc-cat',
          leftEmoji: '\uD83D\uDC31',
          rightEmoji: '\uD83C\uDFA9',
          leftImagePrompt:
            'cute cartoon orange cat, friendly face, sitting, white background, children educational illustration style',
          rightImagePrompt:
            'cute cartoon black top hat, shiny, white background, children educational illustration style',
        },
        {
          left: 'big',
          right: 'pig',
          concept: 'phonics:cvc-big',
          rightEmoji: '\uD83D\uDC37',
          rightImagePrompt:
            'cute cartoon pink pig, round and chubby, friendly smile, white background, children educational illustration style',
        },
        {
          left: 'hot',
          right: 'pot',
          concept: 'phonics:cvc-hot',
          rightEmoji: '\uD83C\uDF6F',
          rightImagePrompt:
            'cute cartoon honey pot, golden honey overflowing, white background, children educational illustration style',
        },
        {
          left: 'run',
          right: 'sun',
          concept: 'phonics:cvc-run',
          rightEmoji: '\u2600\uFE0F',
          rightImagePrompt:
            'cute cartoon sun, bright yellow with warm rays and smiling face, white background, children educational illustration style',
        },
        {
          left: 'bed',
          right: 'red',
          concept: 'phonics:cvc-bed',
          leftEmoji: '\uD83D\uDECF\uFE0F',
          leftImagePrompt:
            'cute cartoon bed, cozy with pillow and blue blanket, white background, children educational illustration style',
        },
        {
          left: 'cup',
          right: 'pup',
          concept: 'phonics:cvc-cup',
          rightEmoji: '\uD83D\uDC36',
          rightImagePrompt:
            'cute cartoon puppy, small brown dog with floppy ears, friendly face, white background, children educational illustration style',
        },
        {left: 'sit', right: 'fit', concept: 'phonics:cvc-sit'},
        {
          left: 'log',
          right: 'dog',
          concept: 'phonics:cvc-log',
          rightEmoji: '\uD83D\uDC15',
          rightImagePrompt:
            'cute cartoon dog, friendly brown dog standing, wagging tail, white background, children educational illustration style',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 3. Home Items Quiz (multiple-choice)
  {
    id: 'eng-vocab-home-11',
    title: 'Home Items Quiz',
    category: 'english',
    subcategory: 'vocabulary',
    template: 'multiple-choice',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'home',
    emoji: '\uD83C\uDFE0',
    color: '#FF6B6B',
    estimatedMinutes: 4,
    questionsPerSession: 8,
    learningObjectives: ['vocabulary', 'comprehension'],
    tags: ['home', 'everyday', 'objects'],
    content: {
      questions: [
        {
          question: 'What do you use to sweep the floor?',
          options: ['Broom', 'Spoon', 'Pillow', 'Cup'],
          correctIndex: 0,
          concept: 'vocab:broom',
          hint: 'It has a long handle and bristles at the bottom',
        },
        {
          question: 'What do you sleep on at night?',
          options: ['Table', 'Chair', 'Bed', 'Shelf'],
          correctIndex: 2,
          concept: 'vocab:bed',
          hint: 'It is soft and has a pillow and blanket',
        },
        {
          question: 'What do you use to eat soup?',
          options: ['Fork', 'Knife', 'Plate', 'Spoon'],
          correctIndex: 3,
          concept: 'vocab:spoon',
          hint: 'It is round and can hold liquid',
        },
        {
          question: 'Where do you keep your clothes?',
          options: ['Oven', 'Wardrobe', 'Bathtub', 'Sink'],
          correctIndex: 1,
          concept: 'vocab:wardrobe',
          hint: 'It is a tall piece of furniture with hangers inside',
        },
        {
          question: 'What do you use to see yourself?',
          options: ['Window', 'Mirror', 'Door', 'Curtain'],
          correctIndex: 1,
          concept: 'vocab:mirror',
          hint: 'It reflects your image back to you',
        },
        {
          question: 'What keeps food cold and fresh?',
          options: ['Stove', 'Microwave', 'Refrigerator', 'Toaster'],
          correctIndex: 2,
          concept: 'vocab:refrigerator',
          hint: 'It is a large box in the kitchen that feels cold inside',
        },
        {
          question: 'What do you use to dry yourself after a bath?',
          options: ['Blanket', 'Towel', 'Curtain', 'Rug'],
          correctIndex: 1,
          concept: 'vocab:towel',
          hint: 'It is soft and hangs in the bathroom',
        },
        {
          question: 'What do you use to light up a dark room?',
          options: ['Fan', 'Lamp', 'Clock', 'Vase'],
          correctIndex: 1,
          concept: 'vocab:lamp',
          hint: 'It has a bulb inside that glows',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 4. Nature Words Quiz (multiple-choice)
  {
    id: 'eng-vocab-nature-12',
    title: 'Nature Words Quiz',
    category: 'english',
    subcategory: 'vocabulary',
    template: 'multiple-choice',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'tree',
    emoji: '🌳',
    color: '#FF6B6B',
    estimatedMinutes: 4,
    questionsPerSession: 8,
    learningObjectives: ['vocabulary', 'comprehension', 'nature'],
    tags: ['nature', 'environment'],
    content: {
      questions: [
        {
          question: 'What is a very tall plant with a trunk and branches?',
          options: ['Flower', 'Grass', 'Tree', 'Bush'],
          correctIndex: 2,
          concept: 'vocab:tree',
          hint: 'Birds build nests in it',
        },
        {
          question: 'What is a large body of flowing water?',
          options: ['Pond', 'Puddle', 'Lake', 'River'],
          correctIndex: 3,
          concept: 'vocab:river',
          hint: 'It flows from mountains to the sea',
        },
        {
          question: 'What is a very high landform with a peak?',
          options: ['Hill', 'Mountain', 'Valley', 'Plain'],
          correctIndex: 1,
          concept: 'vocab:mountain',
          hint: 'It can have snow on top and takes a long time to climb',
        },
        {
          question: 'What falls from the sky when clouds are heavy?',
          options: ['Snow', 'Rain', 'Wind', 'Sunshine'],
          correctIndex: 1,
          concept: 'vocab:rain',
          hint: 'It is made of water drops',
        },
        {
          question: 'What is the star that gives us light during the day?',
          options: ['Moon', 'Star', 'Sun', 'Cloud'],
          correctIndex: 2,
          concept: 'vocab:sun',
          hint: 'It is very bright and warm',
        },
        {
          question: 'What is a large area of sand with very little water?',
          options: ['Forest', 'Desert', 'Ocean', 'Jungle'],
          correctIndex: 1,
          concept: 'vocab:desert',
          hint: 'Camels live here and it is very hot and dry',
        },
        {
          question: 'What is the large body of salt water on Earth?',
          options: ['Lake', 'Pond', 'River', 'Ocean'],
          correctIndex: 3,
          concept: 'vocab:ocean',
          hint: 'Whales and sharks swim in it',
        },
        {
          question: 'What animal builds a web to catch insects?',
          options: ['Ant', 'Bee', 'Spider', 'Butterfly'],
          correctIndex: 2,
          concept: 'vocab:spider',
          hint: 'It has eight legs',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 5. Morning Routine (sequence-order)
  {
    id: 'eng-story-morning-16',
    title: 'Morning Routine',
    category: 'english',
    subcategory: 'sequencing',
    template: 'sequence-order',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'weather-sunny',
    emoji: '☀️',
    color: '#FF6B6B',
    estimatedMinutes: 3,
    questionsPerSession: 8,
    learningObjectives: ['sequencing', 'comprehension', 'daily-routines'],
    tags: ['routine', 'daily-life', 'ordering'],
    content: {
      sequences: [
        {
          items: [
            'Wake up',
            'Brush teeth',
            'Take a bath',
            'Get dressed',
            'Eat breakfast',
            'Pack schoolbag',
            'Put on shoes',
            'Go to school',
          ],
          concept: 'sequence:morning-routine',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 6. Is It a Noun? (true-false)
  {
    id: 'eng-gram-nouns-19',
    title: 'Is It a Noun?',
    category: 'english',
    subcategory: 'grammar',
    template: 'true-false',
    ageRange: [6, 8],
    difficulty: 2,
    icon: 'book-open-variant',
    emoji: '📖',
    color: '#FF6B6B',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: ['grammar', 'nouns', 'parts-of-speech'],
    tags: ['grammar', 'nouns'],
    content: {
      statements: [
        {
          text: '"Dog" is a noun.',
          answer: true,
          concept: 'grammar:noun-dog',
          explanation: 'Dog is a noun because it names an animal.',
        },
        {
          text: '"Running" is a noun.',
          answer: false,
          concept: 'grammar:noun-running',
          explanation: 'Running is a verb because it describes an action.',
        },
        {
          text: '"School" is a noun.',
          answer: true,
          concept: 'grammar:noun-school',
          explanation: 'School is a noun because it names a place.',
        },
        {
          text: '"Beautiful" is a noun.',
          answer: false,
          concept: 'grammar:noun-beautiful',
          explanation:
            'Beautiful is an adjective because it describes something.',
        },
        {
          text: '"Teacher" is a noun.',
          answer: true,
          concept: 'grammar:noun-teacher',
          explanation: 'Teacher is a noun because it names a person.',
        },
        {
          text: '"Quickly" is a noun.',
          answer: false,
          concept: 'grammar:noun-quickly',
          explanation:
            'Quickly is an adverb because it describes how something is done.',
        },
        {
          text: '"Happiness" is a noun.',
          answer: true,
          concept: 'grammar:noun-happiness',
          explanation:
            'Happiness is a noun because it names a feeling or idea.',
        },
        {
          text: '"Jump" is a noun.',
          answer: false,
          concept: 'grammar:noun-jump',
          explanation: 'Jump is a verb because it describes an action.',
        },
        {
          text: '"Mountain" is a noun.',
          answer: true,
          concept: 'grammar:noun-mountain',
          explanation: 'Mountain is a noun because it names a place or thing.',
        },
        {
          text: '"Bright" is a noun.',
          answer: false,
          concept: 'grammar:noun-bright',
          explanation: 'Bright is an adjective because it describes something.',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 7. Articles: A, An, The (fill-blank)
  {
    id: 'eng-fill-articles-22',
    title: 'Articles: A, An, The',
    category: 'english',
    subcategory: 'grammar',
    template: 'fill-blank',
    ageRange: [6, 8],
    difficulty: 2,
    icon: 'pencil',
    emoji: '✏️',
    color: '#FF6B6B',
    estimatedMinutes: 4,
    questionsPerSession: 8,
    learningObjectives: ['grammar', 'articles', 'sentence-structure'],
    tags: ['grammar', 'articles'],
    content: {
      questions: [
        {
          text: 'I saw ___ elephant at the zoo.',
          blank: 'an',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-an-elephant',
          hint: 'Use "an" before words that start with a vowel sound',
        },
        {
          text: '___ sun is shining brightly today.',
          blank: 'The',
          options: ['A', 'An', 'The'],
          concept: 'grammar:article-the-sun',
          hint: 'Use "the" when talking about something specific everyone knows',
        },
        {
          text: 'She ate ___ banana for breakfast.',
          blank: 'a',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-a-banana',
          hint: 'Use "a" before words that start with a consonant sound',
        },
        {
          text: 'He is ___ honest boy.',
          blank: 'an',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-an-honest',
          hint: 'The "h" in "honest" is silent, so it starts with a vowel sound',
        },
        {
          text: 'I need ___ umbrella because it is raining.',
          blank: 'an',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-an-umbrella',
          hint: 'Use "an" before words that start with a vowel sound',
        },
        {
          text: 'There is ___ cat sleeping on the couch.',
          blank: 'a',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-a-cat',
          hint: 'Use "a" when mentioning something for the first time',
        },
        {
          text: 'Please close ___ door behind you.',
          blank: 'the',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-the-door',
          hint: 'Use "the" when both people know which door you mean',
        },
        {
          text: 'I want to be ___ astronaut when I grow up.',
          blank: 'an',
          options: ['a', 'an', 'the'],
          concept: 'grammar:article-an-astronaut',
          hint: 'Use "an" before words that start with a vowel sound',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 8. Easy Synonyms (match-pairs)
  {
    id: 'eng-syn-easy-25',
    title: 'Easy Synonyms',
    category: 'english',
    subcategory: 'vocabulary',
    template: 'match-pairs',
    ageRange: [5, 7],
    difficulty: 1,
    icon: 'swap-horizontal',
    emoji: '🔄',
    color: '#FF6B6B',
    estimatedMinutes: 3,
    questionsPerSession: 8,
    learningObjectives: ['vocabulary', 'synonyms'],
    tags: ['synonyms', 'word-meaning'],
    content: {
      pairs: [
        {left: 'happy', right: 'glad', concept: 'synonym:happy-glad'},
        {left: 'big', right: 'large', concept: 'synonym:big-large'},
        {left: 'fast', right: 'quick', concept: 'synonym:fast-quick'},
        {left: 'smart', right: 'clever', concept: 'synonym:smart-clever'},
        {left: 'small', right: 'tiny', concept: 'synonym:small-tiny'},
        {
          left: 'pretty',
          right: 'beautiful',
          concept: 'synonym:pretty-beautiful',
        },
        {left: 'start', right: 'begin', concept: 'synonym:start-begin'},
        {left: 'end', right: 'finish', concept: 'synonym:end-finish'},
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 9. Sight Word Speed (timed-rush)
  {
    id: 'eng-rush-sight-28',
    title: 'Sight Word Speed',
    category: 'english',
    subcategory: 'reading',
    template: 'timed-rush',
    ageRange: [5, 7],
    difficulty: 2,
    icon: 'timer',
    emoji: '⏱️',
    color: '#FF6B6B',
    estimatedMinutes: 3,
    questionsPerSession: 15,
    learningObjectives: ['reading', 'sight-words', 'speed'],
    tags: ['sight-words', 'speed', 'reading'],
    content: {
      timeLimit: 45,
      questions: [
        {
          question: 'What does "happy" mean?',
          options: [
            'Feeling good and joyful',
            'Feeling tired',
            'Feeling hungry',
          ],
          correctIndex: 0,
          concept: 'sight:happy',
        },
        {
          question: 'What does "above" mean?',
          options: [
            'Below something',
            'Higher than something',
            'Next to something',
          ],
          correctIndex: 1,
          concept: 'sight:above',
        },
        {
          question: 'What does "friend" mean?',
          options: [
            'Someone you do not know',
            'Someone you like and play with',
            'A type of animal',
          ],
          correctIndex: 1,
          concept: 'sight:friend',
        },
        {
          question: 'What does "begin" mean?',
          options: ['To stop', 'To start', 'To sleep'],
          correctIndex: 1,
          concept: 'sight:begin',
        },
        {
          question: 'What does "carry" mean?',
          options: [
            'To hold and move something',
            'To throw something',
            'To eat something',
          ],
          correctIndex: 0,
          concept: 'sight:carry',
        },
        {
          question: 'What does "different" mean?',
          options: ['The same', 'Not the same', 'Very big'],
          correctIndex: 1,
          concept: 'sight:different',
        },
        {
          question: 'What does "enough" mean?',
          options: ['Too little', 'As much as needed', 'Way too much'],
          correctIndex: 1,
          concept: 'sight:enough',
        },
        {
          question: 'What does "found" mean?',
          options: [
            'Lost something',
            'Discovered something',
            'Broke something',
          ],
          correctIndex: 1,
          concept: 'sight:found',
        },
        {
          question: 'What does "group" mean?',
          options: [
            'One person alone',
            'Several things together',
            'A type of food',
          ],
          correctIndex: 1,
          concept: 'sight:group',
        },
        {
          question: 'What does "important" mean?',
          options: ['Not needed at all', 'Matters a lot', 'Very small'],
          correctIndex: 1,
          concept: 'sight:important',
        },
        {
          question: 'What does "kind" mean?',
          options: ['Mean and rude', 'Nice and helpful', 'Loud and noisy'],
          correctIndex: 1,
          concept: 'sight:kind',
        },
        {
          question: 'What does "listen" mean?',
          options: [
            'To talk loudly',
            'To pay attention with your ears',
            'To close your eyes',
          ],
          correctIndex: 1,
          concept: 'sight:listen',
        },
        {
          question: 'What does "mountain" mean?',
          options: ['A flat field', 'A deep hole', 'A very high piece of land'],
          correctIndex: 2,
          concept: 'sight:mountain',
        },
        {
          question: 'What does "never" mean?',
          options: ['Always', 'Sometimes', 'Not at any time'],
          correctIndex: 2,
          concept: 'sight:never',
        },
        {
          question: 'What does "only" mean?',
          options: ['Many of something', 'Just one and no more', 'All of them'],
          correctIndex: 1,
          concept: 'sight:only',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 12, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 10. The Lost Puppy (story-builder)
  {
    id: 'eng-story-adventure-30',
    title: 'The Lost Puppy',
    category: 'english',
    subcategory: 'story',
    template: 'story-builder',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'dog',
    emoji: '🐶',
    color: '#FF6B6B',
    estimatedMinutes: 6,
    questionsPerSession: 8,
    learningObjectives: [
      'reading',
      'comprehension',
      'moral-values',
      'decision-making',
    ],
    tags: ['story', 'adventure', 'kindness', 'responsibility'],
    content: {
      story: {
        start: 'park-discovery',
        scenes: {
          'park-discovery': {
            text: 'You are walking through the park on a sunny afternoon when you hear a soft whimper coming from behind a bush. You peek and see a small, scared puppy with no collar. It looks lost and hungry. What do you do?',
            icon: 'dog',
            choices: [
              {
                text: 'Go closer and try to help the puppy',
                nextScene: 'approach-puppy',
                isGood: true,
                concept: 'story:kindness-approach',
              },
              {
                text: 'Walk away and ignore it',
                nextScene: 'walk-away',
                isGood: false,
                concept: 'story:ignore-need',
              },
            ],
          },
          'approach-puppy': {
            text: 'You kneel down slowly and speak softly. The puppy wags its tiny tail and comes to you. It is shivering and looks thirsty. You notice a water fountain nearby and a snack in your bag. What do you do first?',
            icon: 'hand-heart',
            choices: [
              {
                text: 'Give the puppy some water',
                nextScene: 'give-water',
                isGood: true,
                concept: 'story:caring-water',
              },
              {
                text: 'Share your snack with the puppy',
                nextScene: 'give-food',
                isGood: true,
                concept: 'story:caring-food',
              },
            ],
          },
          'walk-away': {
            text: 'You walk away, but you cannot stop thinking about the little puppy all alone. Your heart feels heavy. You decide to go back. When you return, the puppy is still there, looking even more scared. You realize it is always better to help when you can.',
            icon: 'heart-broken',
            choices: [
              {
                text: 'Go to the puppy and help it now',
                nextScene: 'approach-puppy',
                isGood: true,
                concept: 'story:second-chance-kindness',
              },
            ],
          },
          'give-water': {
            text: 'You cup your hands under the fountain and bring water to the puppy. It drinks happily and licks your fingers. The puppy already trusts you! Now you need to figure out what to do next.',
            icon: 'water',
            choices: [
              {
                text: 'Take the puppy to the animal shelter nearby',
                nextScene: 'shelter',
                isGood: true,
                concept: 'story:responsibility-shelter',
              },
              {
                text: 'Ask people in the park if they know the puppy',
                nextScene: 'ask-around',
                isGood: true,
                concept: 'story:responsibility-ask',
              },
            ],
          },
          'give-food': {
            text: 'You break off a piece of your sandwich and offer it gently. The puppy eats eagerly and then nuzzles your hand. It seems a little stronger now. But the puppy still needs a safe home. What should you do?',
            icon: 'food',
            choices: [
              {
                text: 'Take the puppy to the animal shelter nearby',
                nextScene: 'shelter',
                isGood: true,
                concept: 'story:responsibility-shelter',
              },
              {
                text: 'Ask people in the park if they know the puppy',
                nextScene: 'ask-around',
                isGood: true,
                concept: 'story:responsibility-ask',
              },
            ],
          },
          'ask-around': {
            text: 'You carry the puppy and ask several people in the park. An elderly woman smiles and says, "I think that puppy belongs to the Johnsons on Maple Street. They have been looking everywhere for it!" What do you do?',
            icon: 'account-question',
            choices: [
              {
                text: 'Take the puppy to the Johnsons on Maple Street',
                nextScene: 'find-owner',
                isGood: true,
                concept: 'story:honesty-return',
              },
              {
                text: 'Take the puppy to the shelter just to be safe',
                nextScene: 'shelter',
                isGood: true,
                concept: 'story:caution-shelter',
              },
            ],
          },
          shelter: {
            text: 'You bring the puppy to the Happy Paws Animal Shelter. The kind worker there scans the puppy and finds a microchip! They call the owners right away. The Johnson family arrives in minutes, so happy to see their puppy named Biscuit.',
            icon: 'hospital-building',
            choices: [
              {
                text: 'Continue the story',
                nextScene: 'happy-ending',
                isGood: true,
                concept: 'story:shelter-reunion',
              },
            ],
          },
          'find-owner': {
            text: 'You walk to Maple Street with the puppy in your arms. When you knock on the Johnsons\' door, a little girl opens it and shouts, "Biscuit! You found Biscuit!" She hugs the puppy tightly. Her parents come out with tears of joy.',
            icon: 'home-heart',
            choices: [
              {
                text: 'Continue the story',
                nextScene: 'happy-ending',
                isGood: true,
                concept: 'story:direct-reunion',
              },
            ],
          },
          'happy-ending': {
            text: 'The Johnson family is so grateful that they invite you over for cookies and lemonade. Little Biscuit curls up at your feet, happy and safe. You learned that being kind and responsible can make a real difference. The End.',
            icon: 'star',
            choices: [],
          },
        },
      },
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },
];

// ============================================================================
// MATH GAMES (10)
// ============================================================================

const MATH_GAMES = [
  // 1. Addition Within 10 (multiple-choice)
  {
    id: 'math-add-10-31',
    title: 'Addition Within 10',
    category: 'math',
    subcategory: 'addition',
    template: 'multiple-choice',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'plus-circle',
    emoji: '➕',
    color: '#4ECDC4',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: ['addition', 'number-sense'],
    tags: ['numbers', 'basic-math'],
    content: {
      questions: [
        {
          question: '3 + 4 = ?',
          options: ['5', '6', '7', '8'],
          correctIndex: 2,
          concept: 'add:3+4',
          hint: 'Start at 3 and count up 4 more',
        },
        {
          question: '2 + 5 = ?',
          options: ['6', '7', '8', '9'],
          correctIndex: 1,
          concept: 'add:2+5',
          hint: 'Start at 2 and count up 5 more',
        },
        {
          question: '1 + 6 = ?',
          options: ['5', '6', '7', '8'],
          correctIndex: 2,
          concept: 'add:1+6',
          hint: 'Start at 1 and count up 6 more',
        },
        {
          question: '4 + 3 = ?',
          options: ['5', '6', '7', '8'],
          correctIndex: 2,
          concept: 'add:4+3',
          hint: 'Start at 4 and count up 3 more',
        },
        {
          question: '5 + 2 = ?',
          options: ['6', '7', '8', '9'],
          correctIndex: 1,
          concept: 'add:5+2',
          hint: 'Start at 5 and count up 2 more',
        },
        {
          question: '6 + 3 = ?',
          options: ['7', '8', '9', '10'],
          correctIndex: 2,
          concept: 'add:6+3',
          hint: 'Start at 6 and count up 3 more',
        },
        {
          question: '2 + 2 = ?',
          options: ['3', '4', '5', '6'],
          correctIndex: 1,
          concept: 'add:2+2',
          hint: 'Two plus two makes a pair of pairs',
        },
        {
          question: '1 + 8 = ?',
          options: ['7', '8', '9', '10'],
          correctIndex: 2,
          concept: 'add:1+8',
          hint: 'Start at 1 and count up 8 more',
        },
        {
          question: '5 + 5 = ?',
          options: ['8', '9', '10', '11'],
          correctIndex: 2,
          concept: 'add:5+5',
          hint: 'Two hands with 5 fingers each',
        },
        {
          question: '3 + 6 = ?',
          options: ['7', '8', '9', '10'],
          correctIndex: 2,
          concept: 'add:3+6',
          hint: 'Start at 3 and count up 6 more',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 2. Subtraction Within 10 (multiple-choice)
  {
    id: 'math-sub-10-34',
    title: 'Subtraction Within 10',
    category: 'math',
    subcategory: 'subtraction',
    template: 'multiple-choice',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'minus-circle',
    emoji: '➖',
    color: '#4ECDC4',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: ['subtraction', 'number-sense'],
    tags: ['numbers', 'basic-math'],
    content: {
      questions: [
        {
          question: '7 - 3 = ?',
          options: ['2', '3', '4', '5'],
          correctIndex: 2,
          concept: 'sub:7-3',
          hint: 'Start at 7 and count back 3',
        },
        {
          question: '9 - 5 = ?',
          options: ['2', '3', '4', '5'],
          correctIndex: 2,
          concept: 'sub:9-5',
          hint: 'Start at 9 and count back 5',
        },
        {
          question: '6 - 2 = ?',
          options: ['2', '3', '4', '5'],
          correctIndex: 2,
          concept: 'sub:6-2',
          hint: 'Start at 6 and count back 2',
        },
        {
          question: '8 - 4 = ?',
          options: ['2', '3', '4', '5'],
          correctIndex: 2,
          concept: 'sub:8-4',
          hint: 'Start at 8 and count back 4',
        },
        {
          question: '10 - 7 = ?',
          options: ['1', '2', '3', '4'],
          correctIndex: 2,
          concept: 'sub:10-7',
          hint: 'Start at 10 and count back 7',
        },
        {
          question: '5 - 1 = ?',
          options: ['2', '3', '4', '5'],
          correctIndex: 2,
          concept: 'sub:5-1',
          hint: 'One less than 5',
        },
        {
          question: '8 - 6 = ?',
          options: ['1', '2', '3', '4'],
          correctIndex: 1,
          concept: 'sub:8-6',
          hint: 'Start at 8 and count back 6',
        },
        {
          question: '10 - 4 = ?',
          options: ['4', '5', '6', '7'],
          correctIndex: 2,
          concept: 'sub:10-4',
          hint: 'Start at 10 and count back 4',
        },
        {
          question: '7 - 5 = ?',
          options: ['1', '2', '3', '4'],
          correctIndex: 1,
          concept: 'sub:7-5',
          hint: 'Start at 7 and count back 5',
        },
        {
          question: '9 - 3 = ?',
          options: ['4', '5', '6', '7'],
          correctIndex: 2,
          concept: 'sub:9-3',
          hint: 'Start at 9 and count back 3',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 3. Times Tables 2-5 (timed-rush)
  {
    id: 'math-mul-easy-37',
    title: 'Times Tables 2-5',
    category: 'math',
    subcategory: 'multiplication',
    template: 'timed-rush',
    ageRange: [6, 8],
    difficulty: 1,
    icon: 'close-circle',
    emoji: '✖️',
    color: '#4ECDC4',
    estimatedMinutes: 3,
    questionsPerSession: 10,
    learningObjectives: ['multiplication', 'times-tables'],
    tags: ['numbers', 'times-tables'],
    content: {
      timeLimit: 60,
      questions: [
        {
          question: '2 x 3 = ?',
          options: ['4', '5', '6', '7'],
          correctIndex: 2,
          concept: 'mul:2x3',
        },
        {
          question: '3 x 4 = ?',
          options: ['10', '11', '12', '13'],
          correctIndex: 2,
          concept: 'mul:3x4',
        },
        {
          question: '5 x 2 = ?',
          options: ['8', '9', '10', '11'],
          correctIndex: 2,
          concept: 'mul:5x2',
        },
        {
          question: '4 x 5 = ?',
          options: ['18', '19', '20', '21'],
          correctIndex: 2,
          concept: 'mul:4x5',
        },
        {
          question: '3 x 3 = ?',
          options: ['6', '7', '8', '9'],
          correctIndex: 3,
          concept: 'mul:3x3',
        },
        {
          question: '2 x 7 = ?',
          options: ['12', '13', '14', '15'],
          correctIndex: 2,
          concept: 'mul:2x7',
        },
        {
          question: '5 x 5 = ?',
          options: ['20', '23', '25', '27'],
          correctIndex: 2,
          concept: 'mul:5x5',
        },
        {
          question: '4 x 3 = ?',
          options: ['10', '11', '12', '13'],
          correctIndex: 2,
          concept: 'mul:4x3',
        },
        {
          question: '2 x 9 = ?',
          options: ['16', '17', '18', '19'],
          correctIndex: 2,
          concept: 'mul:2x9',
        },
        {
          question: '5 x 4 = ?',
          options: ['18', '19', '20', '21'],
          correctIndex: 2,
          concept: 'mul:5x4',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 4. Basic Division (fill-blank)
  {
    id: 'math-div-basic-40',
    title: 'Basic Division',
    category: 'math',
    subcategory: 'division',
    template: 'fill-blank',
    ageRange: [7, 9],
    difficulty: 2,
    icon: 'division',
    emoji: '➗',
    color: '#4ECDC4',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['division', 'number-sense'],
    tags: ['numbers', 'division'],
    content: {
      questions: [
        {
          text: '12 \u00f7 3 = ___',
          blank: '4',
          options: ['3', '4', '5', '6'],
          concept: 'div:12/3',
          hint: 'How many groups of 3 make 12?',
        },
        {
          text: '15 \u00f7 5 = ___',
          blank: '3',
          options: ['2', '3', '4', '5'],
          concept: 'div:15/5',
          hint: 'How many groups of 5 make 15?',
        },
        {
          text: '20 \u00f7 4 = ___',
          blank: '5',
          options: ['4', '5', '6', '7'],
          concept: 'div:20/4',
          hint: 'How many groups of 4 make 20?',
        },
        {
          text: '18 \u00f7 6 = ___',
          blank: '3',
          options: ['2', '3', '4', '5'],
          concept: 'div:18/6',
          hint: 'How many groups of 6 make 18?',
        },
        {
          text: '24 \u00f7 8 = ___',
          blank: '3',
          options: ['2', '3', '4', '5'],
          concept: 'div:24/8',
          hint: 'How many groups of 8 make 24?',
        },
        {
          text: '16 \u00f7 4 = ___',
          blank: '4',
          options: ['3', '4', '5', '6'],
          concept: 'div:16/4',
          hint: 'How many groups of 4 make 16?',
        },
        {
          text: '21 \u00f7 7 = ___',
          blank: '3',
          options: ['2', '3', '4', '5'],
          concept: 'div:21/7',
          hint: 'How many groups of 7 make 21?',
        },
        {
          text: '30 \u00f7 5 = ___',
          blank: '6',
          options: ['5', '6', '7', '8'],
          concept: 'div:30/5',
          hint: 'How many groups of 5 make 30?',
        },
        {
          text: '36 \u00f7 9 = ___',
          blank: '4',
          options: ['3', '4', '5', '6'],
          concept: 'div:36/9',
          hint: 'How many groups of 9 make 36?',
        },
        {
          text: '28 \u00f7 7 = ___',
          blank: '4',
          options: ['3', '4', '5', '6'],
          concept: 'div:28/7',
          hint: 'How many groups of 7 make 28?',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 5. Count to 10 (counting)
  {
    id: 'math-count-10-42',
    title: 'Count to 10',
    category: 'math',
    subcategory: 'counting',
    template: 'counting',
    ageRange: [3, 5],
    difficulty: 1,
    icon: 'numeric',
    emoji: '🔢',
    color: '#4ECDC4',
    estimatedMinutes: 3,
    questionsPerSession: 8,
    learningObjectives: ['counting', 'number-recognition'],
    tags: ['numbers', 'counting', 'beginner'],
    content: {
      rounds: [
        {
          count: 3,
          icon: 'star',
          color: '#FFD700',
          concept: 'count:objects-3',
          label: 'stars',
        },
        {
          count: 5,
          icon: 'apple',
          color: '#FF6347',
          concept: 'count:objects-5',
          label: 'apples',
        },
        {
          count: 4,
          icon: 'heart',
          color: '#FF69B4',
          concept: 'count:objects-4',
          label: 'hearts',
        },
        {
          count: 7,
          icon: 'flower',
          color: '#FF8C00',
          concept: 'count:objects-7',
          label: 'flowers',
        },
        {
          count: 6,
          icon: 'fish',
          color: '#4682B4',
          concept: 'count:objects-6',
          label: 'fish',
        },
        {
          count: 8,
          icon: 'cat',
          color: '#8B4513',
          concept: 'count:objects-8',
          label: 'cats',
        },
        {
          count: 9,
          icon: 'bird',
          color: '#20B2AA',
          concept: 'count:objects-9',
          label: 'birds',
        },
        {
          count: 10,
          icon: 'circle',
          color: '#9370DB',
          concept: 'count:objects-10',
          label: 'circles',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 6. 2D Shapes Basic (multiple-choice)
  {
    id: 'math-shape-2d-45',
    title: '2D Shapes Basic',
    category: 'math',
    subcategory: 'shapes',
    template: 'multiple-choice',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'shape',
    emoji: '🔷',
    color: '#4ECDC4',
    estimatedMinutes: 4,
    questionsPerSession: 8,
    learningObjectives: ['shapes', 'geometry-basics'],
    tags: ['shapes', 'geometry'],
    content: {
      questions: [
        {
          question: 'How many sides does a triangle have?',
          options: ['2', '3', '4', '5'],
          correctIndex: 1,
          concept: 'shape:triangle-sides',
          hint: 'Tri means three',
        },
        {
          question: 'How many sides does a square have?',
          options: ['3', '4', '5', '6'],
          correctIndex: 1,
          concept: 'shape:square-sides',
          hint: 'A square has equal sides all around',
        },
        {
          question: 'What shape is a ball?',
          options: ['Square', 'Triangle', 'Circle', 'Rectangle'],
          correctIndex: 2,
          concept: 'shape:circle',
          hint: 'It is perfectly round',
        },
        {
          question: 'How many corners does a rectangle have?',
          options: ['2', '3', '4', '5'],
          correctIndex: 2,
          concept: 'shape:rectangle-corners',
          hint: 'A rectangle is like a stretched square',
        },
        {
          question: 'Which shape has no corners?',
          options: ['Triangle', 'Square', 'Circle', 'Rectangle'],
          correctIndex: 2,
          concept: 'shape:circle-corners',
          hint: 'This shape is perfectly round',
        },
        {
          question: 'How many sides does a circle have?',
          options: ['0', '1', '2', '3'],
          correctIndex: 0,
          concept: 'shape:circle-sides',
          hint: 'A circle is round with no straight edges',
        },
        {
          question: 'What shape has 3 corners?',
          options: ['Circle', 'Triangle', 'Square', 'Rectangle'],
          correctIndex: 1,
          concept: 'shape:triangle-corners',
          hint: 'This shape has 3 sides too',
        },
        {
          question: 'Which shape has 4 equal sides?',
          options: ['Triangle', 'Circle', 'Square', 'Rectangle'],
          correctIndex: 2,
          concept: 'shape:square',
          hint: 'All four sides are the same length',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 7. Number Sequences (fill-blank)
  {
    id: 'math-pattern-num-49',
    title: 'Number Sequences',
    category: 'math',
    subcategory: 'patterns',
    template: 'fill-blank',
    ageRange: [5, 7],
    difficulty: 2,
    icon: 'grid',
    emoji: '📊',
    color: '#4ECDC4',
    estimatedMinutes: 5,
    questionsPerSession: 8,
    learningObjectives: ['patterns', 'number-sense', 'sequences'],
    tags: ['patterns', 'numbers'],
    content: {
      questions: [
        {
          text: '2, 4, 6, 8, ___',
          blank: '10',
          options: ['9', '10', '11', '12'],
          concept: 'pattern:count-by-2',
          hint: 'Each number goes up by 2',
        },
        {
          text: '5, 10, 15, 20, ___',
          blank: '25',
          options: ['22', '24', '25', '30'],
          concept: 'pattern:count-by-5',
          hint: 'Each number goes up by 5',
        },
        {
          text: '10, 20, 30, 40, ___',
          blank: '50',
          options: ['45', '50', '55', '60'],
          concept: 'pattern:count-by-10',
          hint: 'Each number goes up by 10',
        },
        {
          text: '1, 3, 5, 7, ___',
          blank: '9',
          options: ['8', '9', '10', '11'],
          concept: 'pattern:count-by-2-odd',
          hint: 'These are odd numbers going up by 2',
        },
        {
          text: '3, 6, 9, 12, ___',
          blank: '15',
          options: ['13', '14', '15', '16'],
          concept: 'pattern:count-by-3',
          hint: 'Each number goes up by 3',
        },
        {
          text: '4, 8, 12, 16, ___',
          blank: '20',
          options: ['18', '19', '20', '22'],
          concept: 'pattern:count-by-4',
          hint: 'Each number goes up by 4',
        },
        {
          text: '10, 9, 8, 7, ___',
          blank: '6',
          options: ['5', '6', '7', '8'],
          concept: 'pattern:count-down-1',
          hint: 'The numbers go down by 1',
        },
        {
          text: '20, 18, 16, 14, ___',
          blank: '12',
          options: ['10', '11', '12', '13'],
          concept: 'pattern:count-down-2',
          hint: 'The numbers go down by 2',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 8. Bigger / Smaller (sequence-order)
  {
    id: 'math-compare-big-51',
    title: 'Bigger / Smaller',
    category: 'math',
    subcategory: 'comparison',
    template: 'sequence-order',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'scale-balance',
    emoji: '⚖️',
    color: '#4ECDC4',
    estimatedMinutes: 4,
    questionsPerSession: 6,
    learningObjectives: ['comparison', 'number-sense', 'ordering'],
    tags: ['numbers', 'ordering'],
    content: {
      sequences: [
        {items: ['1', '3', '5', '7', '9'], concept: 'compare:order-1-9'},
        {items: ['2', '4', '6', '8', '10'], concept: 'compare:order-2-10'},
        {items: ['1', '2', '5', '7', '9'], concept: 'compare:order-mixed-1'},
        {items: ['3', '4', '6', '8', '10'], concept: 'compare:order-mixed-2'},
        {items: ['1', '3', '6', '8', '10'], concept: 'compare:order-mixed-3'},
        {items: ['2', '5', '6', '7', '9'], concept: 'compare:order-mixed-4'},
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 5, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 9. Tell Time: Hours (multiple-choice)
  {
    id: 'math-time-hours-56',
    title: 'Tell Time: Hours',
    category: 'math',
    subcategory: 'time',
    template: 'multiple-choice',
    ageRange: [5, 7],
    difficulty: 1,
    icon: 'clock-outline',
    emoji: '🕐',
    color: '#4ECDC4',
    estimatedMinutes: 4,
    questionsPerSession: 8,
    learningObjectives: ['time-telling', 'hours'],
    tags: ['time', 'clock'],
    content: {
      questions: [
        {
          question: 'The clock shows 3:00. What time is it?',
          options: ["2 o'clock", "3 o'clock", "4 o'clock", "5 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-3',
          hint: 'The short hand points to the 3',
        },
        {
          question: 'The clock shows 7:00. What time is it?',
          options: ["6 o'clock", "7 o'clock", "8 o'clock", "9 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-7',
          hint: 'The short hand points to the 7',
        },
        {
          question: 'The clock shows 12:00. What time is it?',
          options: ["11 o'clock", "12 o'clock", "1 o'clock", "10 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-12',
          hint: 'Both hands point to the 12',
        },
        {
          question: 'The clock shows 1:00. What time is it?',
          options: ["12 o'clock", "1 o'clock", "2 o'clock", "3 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-1',
          hint: 'The short hand points to the 1',
        },
        {
          question: 'The clock shows 9:00. What time is it?',
          options: ["8 o'clock", "9 o'clock", "10 o'clock", "11 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-9',
          hint: 'The short hand points to the 9',
        },
        {
          question: 'The clock shows 5:00. What time is it?',
          options: ["4 o'clock", "5 o'clock", "6 o'clock", "7 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-5',
          hint: 'The short hand points to the 5',
        },
        {
          question: 'The clock shows 10:00. What time is it?',
          options: ["9 o'clock", "10 o'clock", "11 o'clock", "12 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-10',
          hint: 'The short hand points to the 10',
        },
        {
          question: 'The clock shows 6:00. What time is it?',
          options: ["5 o'clock", "6 o'clock", "7 o'clock", "8 o'clock"],
          correctIndex: 1,
          concept: 'time:hour-6',
          hint: 'The short hand points to the 6',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 10. Addition Facts Memory (memory-flip)
  {
    id: 'math-memory-add-60',
    title: 'Addition Facts Memory',
    category: 'math',
    subcategory: 'addition',
    template: 'memory-flip',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'grid',
    emoji: '🧠',
    color: '#4ECDC4',
    estimatedMinutes: 5,
    questionsPerSession: 8,
    learningObjectives: ['addition', 'memory', 'number-sense'],
    tags: ['numbers', 'memory', 'addition'],
    content: {
      pairs: [
        {id: 'pair-1', front: '3 + 4', match: '7', concept: 'add:3+4'},
        {id: 'pair-2', front: '5 + 3', match: '8', concept: 'add:5+3'},
        {id: 'pair-3', front: '6 + 6', match: '12', concept: 'add:6+6'},
        {id: 'pair-4', front: '9 + 2', match: '11', concept: 'add:9+2'},
        {id: 'pair-5', front: '7 + 5', match: '12', concept: 'add:7+5'},
        {id: 'pair-6', front: '8 + 4', match: '12', concept: 'add:8+4'},
        {id: 'pair-7', front: '2 + 9', match: '11', concept: 'add:2+9'},
        {id: 'pair-8', front: '6 + 7', match: '13', concept: 'add:6+7'},
      ],
      gridColumns: 4,
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },
];

// ============================================================================
// LIFE SKILLS GAMES (10)
// ============================================================================

const LIFE_SKILLS_GAMES = [
  // 1. Morning Routine (sequence-order)
  {
    id: 'life-routine-morning-61',
    title: 'Morning Routine',
    category: 'lifeSkills',
    subcategory: 'daily-routine',
    template: 'sequence-order',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'weather-sunny',
    emoji: '🌅',
    color: '#FFE66D',
    estimatedMinutes: 3,
    questionsPerSession: 8,
    learningObjectives: ['daily-routine', 'time-management'],
    tags: ['routine', 'morning'],
    content: {
      sequences: [
        {
          items: [
            'Wake up',
            'Brush teeth',
            'Take a bath',
            'Get dressed',
            'Eat breakfast',
            'Pack bag',
            'Wear shoes',
            'Go to school',
          ],
          concept: 'routine:morning',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 2. Basic Emotions (multiple-choice)
  {
    id: 'life-emotion-basic-64',
    title: 'Basic Emotions',
    category: 'lifeSkills',
    subcategory: 'emotion-recognition',
    template: 'multiple-choice',
    ageRange: [4, 6],
    difficulty: 1,
    icon: 'emoticon-happy',
    emoji: '😊',
    color: '#FFE66D',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['emotion-recognition', 'self-awareness'],
    tags: ['emotions', 'feelings', 'basic'],
    content: {
      questions: [
        {
          question: 'Your friend shares a toy with you. How do you feel?',
          options: ['Happy', 'Sad', 'Angry', 'Scared'],
          correctIndex: 0,
          concept: 'emotion:happy',
          hint: 'When someone is kind to us, it makes us feel good!',
        },
        {
          question: 'You lost your favorite teddy bear. How do you feel?',
          options: ['Excited', 'Sad', 'Angry', 'Surprised'],
          correctIndex: 1,
          concept: 'emotion:sad',
          hint: 'Losing something we love makes us feel down.',
        },
        {
          question: 'Someone took your snack without asking. How do you feel?',
          options: ['Happy', 'Sleepy', 'Angry', 'Shy'],
          correctIndex: 2,
          concept: 'emotion:angry',
          hint: 'When someone takes our things, it can upset us.',
        },
        {
          question: 'You hear a loud thunder at night. How do you feel?',
          options: ['Happy', 'Proud', 'Bored', 'Scared'],
          correctIndex: 3,
          concept: 'emotion:scared',
          hint: 'Loud noises can be startling and make us feel afraid.',
        },
        {
          question: 'You got a gold star on your homework. How do you feel?',
          options: ['Proud', 'Sad', 'Angry', 'Scared'],
          correctIndex: 0,
          concept: 'emotion:proud',
          hint: 'Doing well makes us feel good about ourselves!',
        },
        {
          question: 'Your best friend moved to another city. How do you feel?',
          options: ['Excited', 'Sad', 'Angry', 'Silly'],
          correctIndex: 1,
          concept: 'emotion:sad-missing',
          hint: 'Missing someone we care about makes us feel down.',
        },
        {
          question:
            'Your mom gives you a big birthday surprise. How do you feel?',
          options: ['Angry', 'Bored', 'Surprised', 'Scared'],
          correctIndex: 2,
          concept: 'emotion:surprised',
          hint: 'When something unexpected and nice happens, we feel surprised!',
        },
        {
          question:
            'You are meeting new kids at school for the first time. How might you feel?',
          options: ['Angry', 'Shy', 'Proud', 'Bored'],
          correctIndex: 1,
          concept: 'emotion:shy',
          hint: 'New people can make us feel a little nervous.',
        },
        {
          question: 'You helped your mom carry the groceries. How do you feel?',
          options: ['Happy', 'Scared', 'Sad', 'Angry'],
          correctIndex: 0,
          concept: 'emotion:happy-helping',
          hint: 'Helping others makes us feel warm inside!',
        },
        {
          question:
            'Your pet dog licks your face when you come home. How do you feel?',
          options: ['Angry', 'Scared', 'Loved', 'Bored'],
          correctIndex: 2,
          concept: 'emotion:loved',
          hint: 'When someone shows affection, we feel loved.',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 3. Home Safety (true-false)
  {
    id: 'life-safety-home-67',
    title: 'Home Safety',
    category: 'lifeSkills',
    subcategory: 'safety',
    template: 'true-false',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'shield-check',
    emoji: '🛡️',
    color: '#FFE66D',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['home-safety', 'hazard-awareness'],
    tags: ['safety', 'home'],
    content: {
      statements: [
        {
          text: 'It is safe to touch a hot stove.',
          answer: false,
          concept: 'safety:hot-stove',
          explanation: 'Never touch a hot stove! It can burn you badly.',
        },
        {
          text: 'You should tell an adult if you find medicine on the floor.',
          answer: true,
          concept: 'safety:medicine',
          explanation:
            'Always tell a grown-up if you find medicine. Never eat it on your own.',
        },
        {
          text: 'Running with scissors is okay if you are careful.',
          answer: false,
          concept: 'safety:scissors',
          explanation:
            'Never run with scissors. Walk slowly and hold them pointing down.',
        },
        {
          text: 'You should never play with electrical outlets.',
          answer: true,
          concept: 'safety:electricity',
          explanation:
            'Electrical outlets are very dangerous. Never stick anything into them.',
        },
        {
          text: 'It is safe to climb on tall furniture by yourself.',
          answer: false,
          concept: 'safety:climbing',
          explanation:
            'Climbing on furniture can cause it to fall on you. Always ask for help.',
        },
        {
          text: 'You should always wash your hands before eating.',
          answer: true,
          concept: 'safety:hygiene',
          explanation: 'Washing hands removes germs and keeps you healthy!',
        },
        {
          text: 'It is okay to open the door for strangers when you are home alone.',
          answer: false,
          concept: 'safety:strangers-door',
          explanation:
            'Never open the door for strangers. Tell a trusted adult instead.',
        },
        {
          text: 'If there is a fire, you should get out of the house quickly.',
          answer: true,
          concept: 'safety:fire-escape',
          explanation:
            'In a fire, leave the house immediately and call for help.',
        },
        {
          text: 'Playing with matches is fun and safe.',
          answer: false,
          concept: 'safety:matches',
          explanation: 'Matches can start fires. Only adults should use them.',
        },
        {
          text: 'You should know your home address in case of emergency.',
          answer: true,
          concept: 'safety:address',
          explanation: 'Knowing your address helps emergency helpers find you.',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 4. Healthy vs Unhealthy Food (drag-to-zone)
  {
    id: 'life-health-food-70',
    title: 'Healthy vs Unhealthy Food',
    category: 'lifeSkills',
    subcategory: 'healthy-habits',
    template: 'drag-to-zone',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'food-apple',
    emoji: '🍎',
    color: '#FFE66D',
    estimatedMinutes: 4,
    questionsPerSession: 12,
    learningObjectives: ['healthy-eating', 'nutrition'],
    tags: ['health', 'food', 'nutrition'],
    content: {
      zones: [
        {id: 'healthy', label: 'Healthy', color: '#27AE60'},
        {id: 'unhealthy', label: 'Unhealthy', color: '#E74C3C'},
      ],
      items: [
        {id: 'apple', label: 'Apple', zone: 'healthy', concept: 'health:fruit'},
        {
          id: 'candy',
          label: 'Candy',
          zone: 'unhealthy',
          concept: 'health:sweets',
        },
        {
          id: 'carrot',
          label: 'Carrot',
          zone: 'healthy',
          concept: 'health:vegetable',
        },
        {
          id: 'soda',
          label: 'Soda',
          zone: 'unhealthy',
          concept: 'health:sugary-drink',
        },
        {id: 'milk', label: 'Milk', zone: 'healthy', concept: 'health:dairy'},
        {
          id: 'chips',
          label: 'Chips',
          zone: 'unhealthy',
          concept: 'health:junk-food',
        },
        {
          id: 'banana',
          label: 'Banana',
          zone: 'healthy',
          concept: 'health:fruit-banana',
        },
        {
          id: 'cake',
          label: 'Cake',
          zone: 'unhealthy',
          concept: 'health:sweets-cake',
        },
        {
          id: 'broccoli',
          label: 'Broccoli',
          zone: 'healthy',
          concept: 'health:vegetable-broccoli',
        },
        {
          id: 'donut',
          label: 'Donut',
          zone: 'unhealthy',
          concept: 'health:sweets-donut',
        },
        {id: 'eggs', label: 'Eggs', zone: 'healthy', concept: 'health:protein'},
        {
          id: 'french-fries',
          label: 'French Fries',
          zone: 'unhealthy',
          concept: 'health:fried-food',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 10, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 5. Good Hygiene Habits (drag-to-zone)
  {
    id: 'life-health-hygiene-72',
    title: 'Good Hygiene Habits',
    category: 'lifeSkills',
    subcategory: 'healthy-habits',
    template: 'drag-to-zone',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'heart-pulse',
    emoji: '💓',
    color: '#FFE66D',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: ['hygiene', 'cleanliness'],
    tags: ['health', 'hygiene', 'cleanliness'],
    content: {
      zones: [
        {id: 'good', label: 'Good Hygiene', color: '#2ECC71'},
        {id: 'bad', label: 'Bad Habits', color: '#E74C3C'},
      ],
      items: [
        {
          id: 'wash-hands',
          label: 'Washing Hands',
          zone: 'good',
          concept: 'hygiene:hand-washing',
        },
        {
          id: 'skip-brushing',
          label: 'Skipping Brushing Teeth',
          zone: 'bad',
          concept: 'hygiene:teeth',
        },
        {
          id: 'daily-bath',
          label: 'Taking a Daily Bath',
          zone: 'good',
          concept: 'hygiene:bathing',
        },
        {
          id: 'dirty-clothes',
          label: 'Wearing Dirty Clothes',
          zone: 'bad',
          concept: 'hygiene:clothing',
        },
        {
          id: 'cover-sneeze',
          label: 'Covering Your Sneeze',
          zone: 'good',
          concept: 'hygiene:sneezing',
        },
        {
          id: 'bite-nails',
          label: 'Biting Your Nails',
          zone: 'bad',
          concept: 'hygiene:nails',
        },
        {
          id: 'comb-hair',
          label: 'Combing Your Hair',
          zone: 'good',
          concept: 'hygiene:grooming',
        },
        {
          id: 'share-toothbrush',
          label: 'Sharing a Toothbrush',
          zone: 'bad',
          concept: 'hygiene:sharing-germs',
        },
        {
          id: 'clean-nails',
          label: 'Trimming Your Nails',
          zone: 'good',
          concept: 'hygiene:nails-trim',
        },
        {
          id: 'skip-bath',
          label: 'Skipping Bath Day',
          zone: 'bad',
          concept: 'hygiene:bathing-skip',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 6. Greeting People (story-builder)
  {
    id: 'life-manners-greet-73',
    title: 'Greeting People',
    category: 'lifeSkills',
    subcategory: 'manners',
    template: 'story-builder',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'hand-heart',
    emoji: '🤝',
    color: '#FFE66D',
    estimatedMinutes: 5,
    questionsPerSession: 8,
    learningObjectives: ['greetings', 'politeness', 'social-skills'],
    tags: ['manners', 'greetings', 'social'],
    content: {
      story: {
        start: 'scene1',
        scenes: {
          scene1: {
            text: 'It is your first day at a new school. You walk into the classroom and see your new teacher smiling at you.',
            icon: 'school',
            choices: [
              {
                text: 'Say "Good morning, Teacher!" with a smile',
                nextScene: 'scene2a',
                isGood: true,
                concept: 'manners:polite-greeting',
              },
              {
                text: 'Walk past without saying anything',
                nextScene: 'scene2b',
                isGood: false,
                concept: 'manners:ignoring',
              },
            ],
          },
          scene2a: {
            text: 'Your teacher says "Welcome! We are so happy to have you." She introduces you to the class. A kid named Sam waves at you.',
            icon: 'emoticon-happy',
            choices: [
              {
                text: 'Wave back and say "Hi, I\'m happy to meet you!"',
                nextScene: 'scene3a',
                isGood: true,
                concept: 'manners:friendly-intro',
              },
              {
                text: 'Look away and ignore Sam',
                nextScene: 'scene3b',
                isGood: false,
                concept: 'manners:ignoring-peer',
              },
            ],
          },
          scene2b: {
            text: 'The teacher looks a little sad. She still says "Welcome!" but you didn\'t make a good first impression.',
            icon: 'emoticon-sad',
            choices: [
              {
                text: 'Say "Sorry, good morning Teacher!" and smile',
                nextScene: 'scene2a',
                isGood: true,
                concept: 'manners:apologize-greet',
              },
              {
                text: 'Just sit down without saying anything',
                nextScene: 'scene_end_sad',
                isGood: false,
                concept: 'manners:continued-rudeness',
              },
            ],
          },
          scene3a: {
            text: 'Sam is excited to be your friend! At lunch, Sam introduces you to more kids. Everyone is friendly because you were kind first.',
            icon: 'emoticon-happy',
            choices: [
              {
                text: 'Say "Thank you for being so nice to me!"',
                nextScene: 'scene4a',
                isGood: true,
                concept: 'manners:gratitude',
              },
            ],
          },
          scene3b: {
            text: 'Sam looks disappointed. You sit alone at your desk. It feels a little lonely without any friends.',
            icon: 'emoticon-sad',
            choices: [
              {
                text: 'Go to Sam and say "Hi, sorry I was shy. Can we be friends?"',
                nextScene: 'scene4a',
                isGood: true,
                concept: 'manners:making-amends',
              },
              {
                text: "Stay alone and don't talk to anyone",
                nextScene: 'scene_end_sad',
                isGood: false,
                concept: 'manners:isolation',
              },
            ],
          },
          scene4a: {
            text: 'You made wonderful friends on your first day! Being polite and greeting people kindly helped you feel welcome. Great job!',
            icon: 'emoticon-happy',
            choices: [],
          },
          scene_end_sad: {
            text: 'The day ends and you feel lonely. Tomorrow, try greeting people with a smile. A simple "hello" can make a big difference!',
            icon: 'emoticon-sad',
            choices: [],
          },
        },
      },
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 7. Recycle Sorting (drag-to-zone)
  {
    id: 'life-env-recycle-75',
    title: 'Recycle Sorting',
    category: 'lifeSkills',
    subcategory: 'environment',
    template: 'drag-to-zone',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'recycle',
    emoji: '♻️',
    color: '#FFE66D',
    estimatedMinutes: 5,
    questionsPerSession: 12,
    learningObjectives: ['recycling', 'environment-care'],
    tags: ['environment', 'recycling', 'sorting'],
    content: {
      zones: [
        {id: 'paper', label: 'Paper', color: '#3498DB'},
        {id: 'plastic', label: 'Plastic', color: '#F39C12'},
        {id: 'glass', label: 'Glass', color: '#2ECC71'},
      ],
      items: [
        {
          id: 'newspaper',
          label: 'Newspaper',
          zone: 'paper',
          concept: 'environment:paper-recycle',
        },
        {
          id: 'water-bottle',
          label: 'Water Bottle',
          zone: 'plastic',
          concept: 'environment:plastic-recycle',
        },
        {
          id: 'jam-jar',
          label: 'Jam Jar',
          zone: 'glass',
          concept: 'environment:glass-recycle',
        },
        {
          id: 'cardboard-box',
          label: 'Cardboard Box',
          zone: 'paper',
          concept: 'environment:paper-cardboard',
        },
        {
          id: 'shampoo-bottle',
          label: 'Shampoo Bottle',
          zone: 'plastic',
          concept: 'environment:plastic-shampoo',
        },
        {
          id: 'juice-jar',
          label: 'Juice Jar',
          zone: 'glass',
          concept: 'environment:glass-juice',
        },
        {
          id: 'notebook',
          label: 'Old Notebook',
          zone: 'paper',
          concept: 'environment:paper-notebook',
        },
        {
          id: 'yogurt-cup',
          label: 'Yogurt Cup',
          zone: 'plastic',
          concept: 'environment:plastic-yogurt',
        },
        {
          id: 'sauce-bottle',
          label: 'Sauce Bottle',
          zone: 'glass',
          concept: 'environment:glass-sauce',
        },
        {
          id: 'magazine',
          label: 'Magazine',
          zone: 'paper',
          concept: 'environment:paper-magazine',
        },
        {
          id: 'milk-jug',
          label: 'Milk Jug',
          zone: 'plastic',
          concept: 'environment:plastic-milk',
        },
        {
          id: 'pickle-jar',
          label: 'Pickle Jar',
          zone: 'glass',
          concept: 'environment:glass-pickle',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 10, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 8. Basic First Aid (simulation)
  {
    id: 'life-firstaid-basic-77',
    title: 'Basic First Aid',
    category: 'lifeSkills',
    subcategory: 'first-aid',
    template: 'simulation',
    ageRange: [6, 9],
    difficulty: 2,
    icon: 'heart-pulse',
    emoji: '🩺',
    color: '#FFE66D',
    estimatedMinutes: 5,
    questionsPerSession: 8,
    learningObjectives: ['first-aid', 'wound-care'],
    tags: ['first-aid', 'health', 'safety'],
    content: {
      scenario: {
        title: 'Help! Someone Fell Down',
        concept: 'firstaid:wound-care',
        startingMoney: 0,
        items: [
          {
            name: 'Stay calm and check on them',
            price: 0,
            icon: 'heart-pulse',
            isGood: true,
            feedback: 'Great! Staying calm is the first step in any emergency.',
          },
          {
            name: 'Panic and run away',
            price: 0,
            icon: 'emoticon-sad',
            isGood: false,
            feedback: 'Running away does not help. Stay calm and try to help.',
          },
          {
            name: 'Clean the wound with water',
            price: 0,
            icon: 'water',
            isGood: true,
            feedback:
              'Rinsing with clean water helps remove dirt from the wound.',
          },
          {
            name: 'Put dirt on the wound',
            price: 0,
            icon: 'emoticon-sad',
            isGood: false,
            feedback: 'Dirt has germs! Never put dirt on a wound.',
          },
          {
            name: 'Apply a clean bandage',
            price: 0,
            icon: 'heart-pulse',
            isGood: true,
            feedback: 'A bandage protects the wound and helps it heal.',
          },
          {
            name: 'Ignore the wound',
            price: 0,
            icon: 'emoticon-sad',
            isGood: false,
            feedback:
              'Ignoring a wound can lead to infection. Always clean and cover it.',
          },
          {
            name: 'Tell an adult what happened',
            price: 0,
            icon: 'hand-heart',
            isGood: true,
            feedback:
              'An adult can help make sure the wound is properly taken care of.',
          },
          {
            name: 'Keep it a secret',
            price: 0,
            icon: 'emoticon-sad',
            isGood: false,
            feedback: 'Always tell a trusted adult if someone is hurt.',
          },
        ],
        goal: 'Choose all the correct first aid steps to help your friend!',
      },
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 9. Road Safety (true-false)
  {
    id: 'life-safety-road-68',
    title: 'Road Safety',
    category: 'lifeSkills',
    subcategory: 'safety',
    template: 'true-false',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'shield-check',
    emoji: '🚦',
    color: '#FFE66D',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['road-safety', 'traffic-rules'],
    tags: ['safety', 'road', 'traffic'],
    content: {
      statements: [
        {
          text: 'You should always look both ways before crossing the street.',
          answer: true,
          concept: 'safety:look-both-ways',
          explanation:
            'Looking left, right, then left again keeps you safe from cars.',
        },
        {
          text: 'It is okay to run across the road if no cars are coming.',
          answer: false,
          concept: 'safety:no-running-road',
          explanation:
            'Never run across the road. Always walk carefully even if it looks clear.',
        },
        {
          text: 'A red traffic light means you should stop.',
          answer: true,
          concept: 'safety:traffic-light-red',
          explanation:
            'Red means stop! Wait until the light turns green before crossing.',
        },
        {
          text: 'You can cross the road anywhere you want.',
          answer: false,
          concept: 'safety:crosswalk',
          explanation:
            'Always use a crosswalk or zebra crossing to cross the road safely.',
        },
        {
          text: 'Wearing a helmet while riding a bike keeps you safe.',
          answer: true,
          concept: 'safety:helmet',
          explanation: 'A helmet protects your head if you fall off your bike.',
        },
        {
          text: 'It is safe to play on the road if there is not much traffic.',
          answer: false,
          concept: 'safety:no-play-road',
          explanation:
            'Roads are for vehicles, not playing. Always play in parks or yards.',
        },
        {
          text: "You should hold an adult's hand when crossing a busy road.",
          answer: true,
          concept: 'safety:hold-hand',
          explanation: "Holding an adult's hand keeps you safe near traffic.",
        },
        {
          text: 'A green walking signal means it is safe to cross.',
          answer: true,
          concept: 'safety:walk-signal',
          explanation:
            'The green walk signal tells pedestrians it is their turn to cross.',
        },
        {
          text: 'You should wear bright clothes when walking near roads at night.',
          answer: true,
          concept: 'safety:visibility',
          explanation:
            'Bright or reflective clothes help drivers see you in the dark.',
        },
        {
          text: 'It is okay to chase a ball into the street without looking.',
          answer: false,
          concept: 'safety:chase-ball',
          explanation:
            'Always stop and look for cars before going into the street, even to get a ball.',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 10. Making a Sandwich (sequence-order)
  {
    id: 'life-cook-recipe-81',
    title: 'Making a Sandwich',
    category: 'lifeSkills',
    subcategory: 'cooking-basics',
    template: 'sequence-order',
    ageRange: [5, 8],
    difficulty: 1,
    icon: 'chef-hat',
    emoji: '👨‍🍳',
    color: '#FFE66D',
    estimatedMinutes: 3,
    questionsPerSession: 8,
    learningObjectives: ['cooking-basics', 'following-steps'],
    tags: ['cooking', 'recipe', 'sandwich'],
    content: {
      sequences: [
        {
          items: [
            'Get bread',
            'Add butter',
            'Put lettuce',
            'Add cheese',
            'Put tomato',
            'Close bread',
            'Cut in half',
            'Serve on plate',
          ],
          concept: 'cooking:sandwich-steps',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },
];

// ============================================================================
// CREATIVITY GAMES (10)
// ============================================================================

const CREATIVITY_GAMES = [
  // 1. Color Mixing Lab (simulation)
  {
    id: 'create-color-mixing-01',
    title: 'Color Mixing Lab',
    category: 'creativity',
    subcategory: 'color-theory',
    template: 'simulation',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'palette',
    emoji: '🎨',
    color: '#E056A0',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['color-theory', 'primary-colors', 'secondary-colors'],
    tags: ['colors', 'art', 'mixing'],
    content: {
      scenario: {
        title: 'Mix Colors Like an Artist',
        concept: 'creativity:color-mixing',
        startingMoney: 0,
        items: [
          {
            name: 'Mix Red + Yellow to make Orange',
            price: 0,
            icon: 'palette',
            isGood: true,
            feedback: 'Yes! Red and yellow combine to create a warm orange.',
          },
          {
            name: 'Mix Red + Green to make Orange',
            price: 0,
            icon: 'palette',
            isGood: false,
            feedback:
              'Red and green actually make a brownish color, not orange.',
          },
          {
            name: 'Mix Blue + Yellow to make Green',
            price: 0,
            icon: 'palette',
            isGood: true,
            feedback:
              'Correct! Blue and yellow make green, like grass and leaves.',
          },
          {
            name: 'Mix Blue + Red to make Green',
            price: 0,
            icon: 'palette',
            isGood: false,
            feedback: 'Blue and red make purple, not green.',
          },
          {
            name: 'Mix Red + Blue to make Purple',
            price: 0,
            icon: 'palette',
            isGood: true,
            feedback: 'Great job! Red and blue mix together to create purple.',
          },
          {
            name: 'Mix Yellow + Blue to make Purple',
            price: 0,
            icon: 'palette',
            isGood: false,
            feedback: 'Yellow and blue make green, not purple.',
          },
          {
            name: 'Mix Red + White to make Pink',
            price: 0,
            icon: 'palette',
            isGood: true,
            feedback: 'Adding white to red lightens it into a lovely pink.',
          },
          {
            name: 'Mix Blue + White to make Light Blue',
            price: 0,
            icon: 'palette',
            isGood: true,
            feedback:
              'Adding white to blue creates a soft light blue, like the sky.',
          },
          {
            name: 'Mix Yellow + Green to make Blue',
            price: 0,
            icon: 'palette',
            isGood: false,
            feedback:
              'Yellow and green do not make blue. Blue is a primary color.',
          },
          {
            name: 'Mix Black + White to make Gray',
            price: 0,
            icon: 'palette',
            isGood: true,
            feedback: 'Correct! Mixing black and white gives you gray.',
          },
        ],
        goal: 'Choose the correct color mixes to learn how new colors are made!',
      },
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 2. Pattern Rush (timed-rush)
  {
    id: 'create-pattern-rush-02',
    title: 'Pattern Rush',
    category: 'creativity',
    subcategory: 'patterns',
    template: 'timed-rush',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'shape-plus',
    emoji: '🔶',
    color: '#E056A0',
    estimatedMinutes: 3,
    questionsPerSession: 12,
    learningObjectives: [
      'pattern-recognition',
      'visual-thinking',
      'creativity',
    ],
    tags: ['patterns', 'shapes', 'colors'],
    content: {
      timeLimit: 60,
      questions: [
        {
          question: 'Red, Blue, Red, Blue, ___?',
          options: ['Green', 'Red', 'Yellow', 'Blue'],
          correctIndex: 1,
          concept: 'pattern:color-ab',
        },
        {
          question: 'Circle, Square, Circle, Square, ___?',
          options: ['Triangle', 'Circle', 'Star', 'Square'],
          correctIndex: 1,
          concept: 'pattern:shape-ab',
        },
        {
          question: 'Big, Small, Big, Small, ___?',
          options: ['Medium', 'Small', 'Big', 'Tiny'],
          correctIndex: 2,
          concept: 'pattern:size-ab',
        },
        {
          question: 'Star, Star, Heart, Star, Star, ___?',
          options: ['Star', 'Heart', 'Circle', 'Square'],
          correctIndex: 1,
          concept: 'pattern:aab',
        },
        {
          question: 'Red, Yellow, Blue, Red, Yellow, ___?',
          options: ['Red', 'Green', 'Blue', 'Yellow'],
          correctIndex: 2,
          concept: 'pattern:color-abc',
        },
        {
          question: 'Up, Down, Up, Down, ___?',
          options: ['Left', 'Down', 'Up', 'Right'],
          correctIndex: 2,
          concept: 'pattern:direction-ab',
        },
        {
          question: 'Happy, Sad, Happy, Sad, ___?',
          options: ['Angry', 'Happy', 'Sleepy', 'Sad'],
          correctIndex: 1,
          concept: 'pattern:emotion-ab',
        },
        {
          question: 'Triangle, Triangle, Circle, Triangle, Triangle, ___?',
          options: ['Square', 'Triangle', 'Circle', 'Star'],
          correctIndex: 2,
          concept: 'pattern:shape-aab',
        },
        {
          question: 'Clap, Clap, Stomp, Clap, Clap, ___?',
          options: ['Clap', 'Jump', 'Stomp', 'Snap'],
          correctIndex: 2,
          concept: 'pattern:rhythm-aab',
        },
        {
          question: 'Sun, Moon, Star, Sun, Moon, ___?',
          options: ['Moon', 'Sun', 'Star', 'Cloud'],
          correctIndex: 2,
          concept: 'pattern:sky-abc',
        },
        {
          question: '1, 2, 1, 2, 1, ___?',
          options: ['1', '3', '2', '0'],
          correctIndex: 2,
          concept: 'pattern:number-ab',
        },
        {
          question: 'Cat, Dog, Bird, Cat, Dog, ___?',
          options: ['Cat', 'Fish', 'Bird', 'Dog'],
          correctIndex: 2,
          concept: 'pattern:animal-abc',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 10, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 3. Musical Instruments Match (match-pairs)
  {
    id: 'create-music-match-03',
    title: 'Musical Instruments Match',
    category: 'creativity',
    subcategory: 'music',
    template: 'match-pairs',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'music',
    emoji: '🎶',
    color: '#E056A0',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: ['music-awareness', 'instrument-families', 'matching'],
    tags: ['music', 'instruments', 'sounds'],
    content: {
      pairs: [
        {left: 'Guitar', right: 'Strings', concept: 'music:guitar-family'},
        {left: 'Drum', right: 'Percussion', concept: 'music:drum-family'},
        {left: 'Flute', right: 'Woodwind', concept: 'music:flute-family'},
        {left: 'Trumpet', right: 'Brass', concept: 'music:trumpet-family'},
        {left: 'Piano', right: 'Keyboard', concept: 'music:piano-family'},
        {left: 'Violin', right: 'Strings', concept: 'music:violin-family'},
        {
          left: 'Tambourine',
          right: 'Percussion',
          concept: 'music:tambourine-family',
        },
        {
          left: 'Harmonica',
          right: 'Woodwind',
          concept: 'music:harmonica-family',
        },
        {
          left: 'Xylophone',
          right: 'Percussion',
          concept: 'music:xylophone-family',
        },
        {left: 'Harp', right: 'Strings', concept: 'music:harp-family'},
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 4. The Magical Art Show (story-builder)
  {
    id: 'create-story-adventure-04',
    title: 'The Magical Art Show',
    category: 'creativity',
    subcategory: 'storytelling',
    template: 'story-builder',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'book-open-page-variant',
    emoji: '📚',
    color: '#E056A0',
    estimatedMinutes: 6,
    questionsPerSession: 8,
    learningObjectives: [
      'storytelling',
      'imagination',
      'decision-making',
      'creative-thinking',
    ],
    tags: ['story', 'art', 'imagination', 'creativity'],
    content: {
      story: {
        start: 'studio-door',
        scenes: {
          'studio-door': {
            text: 'You find a mysterious door in the school hallway with a sign that reads "Art Studio of Wonders." You hear soft music playing inside and see sparkles of light under the door. What do you do?',
            icon: 'door',
            choices: [
              {
                text: 'Open the door and step inside',
                nextScene: 'inside-studio',
                isGood: true,
                concept: 'creativity:curiosity-explore',
              },
              {
                text: 'Walk away because it looks strange',
                nextScene: 'walk-away',
                isGood: false,
                concept: 'creativity:missed-opportunity',
              },
            ],
          },
          'walk-away': {
            text: 'You start to walk away, but you hear a gentle voice say "Every artist was first an explorer." Your curiosity grows stronger. Maybe you should go back and see what is inside.',
            icon: 'lightbulb',
            choices: [
              {
                text: 'Go back and open the door',
                nextScene: 'inside-studio',
                isGood: true,
                concept: 'creativity:courage-return',
              },
            ],
          },
          'inside-studio': {
            text: 'Inside is a magical art studio! Paintings float in the air, sculptures change shape, and paintbrushes dance by themselves. A friendly owl wearing a beret says "Welcome, young artist! Pick a creative tool to begin your adventure."',
            icon: 'palette',
            choices: [
              {
                text: 'Pick up the glowing paintbrush',
                nextScene: 'paintbrush-path',
                isGood: true,
                concept: 'creativity:painting-choice',
              },
              {
                text: 'Pick up the singing clay',
                nextScene: 'sculpture-path',
                isGood: true,
                concept: 'creativity:sculpture-choice',
              },
            ],
          },
          'paintbrush-path': {
            text: 'The paintbrush glows brighter in your hand! When you wave it through the air, it leaves trails of rainbow light. The owl says "Paint something from your imagination, and it will come to life!" What will you paint?',
            icon: 'brush',
            choices: [
              {
                text: 'Paint a friendly dragon',
                nextScene: 'dragon-scene',
                isGood: true,
                concept: 'creativity:imagination-dragon',
              },
              {
                text: 'Paint a beautiful garden',
                nextScene: 'garden-scene',
                isGood: true,
                concept: 'creativity:imagination-garden',
              },
            ],
          },
          'sculpture-path': {
            text: 'The clay hums a lovely tune as you hold it. When you shape it with your hands, it wiggles and giggles. The owl says "Whatever you sculpt will dance and play!" What will you create?',
            icon: 'creation',
            choices: [
              {
                text: 'Sculpt a playful kitten',
                nextScene: 'dragon-scene',
                isGood: true,
                concept: 'creativity:imagination-kitten',
              },
              {
                text: 'Sculpt a tiny castle',
                nextScene: 'garden-scene',
                isGood: true,
                concept: 'creativity:imagination-castle',
              },
            ],
          },
          'dragon-scene': {
            text: 'Your creation comes alive! It is small and friendly, and it wants to help you decorate the studio for the big Art Show tonight. You need to choose colors for the banner. What colors will you pick?',
            icon: 'star',
            choices: [
              {
                text: 'Bright rainbow colors to make everyone smile',
                nextScene: 'art-show',
                isGood: true,
                concept: 'creativity:color-bold',
              },
              {
                text: 'Soft pastel colors for a calm feeling',
                nextScene: 'art-show',
                isGood: true,
                concept: 'creativity:color-gentle',
              },
            ],
          },
          'garden-scene': {
            text: 'Your creation blooms with life! Flowers open, butterflies appear, and a little fountain plays music. The owl claps and says "Wonderful! Now help me design an invitation for the Art Show tonight."',
            icon: 'flower',
            choices: [
              {
                text: 'Draw colorful flowers on the invitation',
                nextScene: 'art-show',
                isGood: true,
                concept: 'creativity:design-floral',
              },
              {
                text: 'Write a poem for the invitation',
                nextScene: 'art-show',
                isGood: true,
                concept: 'creativity:design-poetry',
              },
            ],
          },
          'art-show': {
            text: 'The Art Show is a huge success! Everyone loves your creations. The owl gives you a Golden Brush award and says "Remember, creativity lives inside everyone. All you need to do is imagine, and your ideas can become real." You feel proud and inspired. The End!',
            icon: 'trophy',
            choices: [],
          },
        },
      },
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 5. Art & Colors Memory (memory-flip)
  {
    id: 'create-art-memory-05',
    title: 'Art & Colors Memory',
    category: 'creativity',
    subcategory: 'art-vocabulary',
    template: 'memory-flip',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'grid',
    emoji: '🌈',
    color: '#E056A0',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['art-vocabulary', 'memory', 'color-knowledge'],
    tags: ['art', 'colors', 'memory', 'vocabulary'],
    content: {
      pairs: [
        {
          id: 'art-1',
          front: 'Brush',
          match: 'Painting',
          concept: 'art:brush-painting',
        },
        {
          id: 'art-2',
          front: 'Red + Blue',
          match: 'Purple',
          concept: 'art:mix-purple',
        },
        {
          id: 'art-3',
          front: 'Pencil',
          match: 'Drawing',
          concept: 'art:pencil-drawing',
        },
        {
          id: 'art-4',
          front: 'Red + Yellow',
          match: 'Orange',
          concept: 'art:mix-orange',
        },
        {
          id: 'art-5',
          front: 'Clay',
          match: 'Sculpture',
          concept: 'art:clay-sculpture',
        },
        {
          id: 'art-6',
          front: 'Blue + Yellow',
          match: 'Green',
          concept: 'art:mix-green',
        },
        {
          id: 'art-7',
          front: 'Camera',
          match: 'Photography',
          concept: 'art:camera-photo',
        },
        {
          id: 'art-8',
          front: 'Stage',
          match: 'Theater',
          concept: 'art:stage-theater',
        },
        {
          id: 'art-9',
          front: 'Crayon',
          match: 'Coloring',
          concept: 'art:crayon-coloring',
        },
        {
          id: 'art-10',
          front: 'Scissors',
          match: 'Collage',
          concept: 'art:scissors-collage',
        },
      ],
      gridColumns: 4,
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 6. Art Styles Quiz (multiple-choice)
  {
    id: 'create-art-styles-06',
    title: 'Art Styles Quiz',
    category: 'creativity',
    subcategory: 'art-knowledge',
    template: 'multiple-choice',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'image-frame',
    emoji: '🖼️',
    color: '#E056A0',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: [
      'art-appreciation',
      'visual-literacy',
      'art-knowledge',
    ],
    tags: ['art', 'styles', 'knowledge'],
    content: {
      questions: [
        {
          question: 'What are the three primary colors?',
          options: [
            'Red, Green, Purple',
            'Red, Blue, Yellow',
            'Orange, Green, Purple',
            'Pink, Blue, Green',
          ],
          correctIndex: 1,
          concept: 'art:primary-colors',
          hint: 'These colors cannot be made by mixing other colors together',
        },
        {
          question: 'What do you call a picture of a person?',
          options: ['Landscape', 'Still Life', 'Portrait', 'Abstract'],
          correctIndex: 2,
          concept: 'art:portrait',
          hint: "It focuses on someone's face or full body",
        },
        {
          question: 'What tool does a sculptor use to shape clay?',
          options: ['Paintbrush', 'Scissors', 'Hands and tools', 'Pencil'],
          correctIndex: 2,
          concept: 'art:sculpture-tools',
          hint: 'Sculptors press and mold the material',
        },
        {
          question: 'What is a painting of mountains, trees, and sky called?',
          options: ['Portrait', 'Landscape', 'Abstract', 'Collage'],
          correctIndex: 1,
          concept: 'art:landscape',
          hint: 'It shows outdoor scenery and nature',
        },
        {
          question: 'What art form uses cut paper glued onto a surface?',
          options: ['Painting', 'Drawing', 'Collage', 'Sculpture'],
          correctIndex: 2,
          concept: 'art:collage',
          hint: 'You cut and paste different pieces together',
        },
        {
          question: 'Which color do you get when you mix red and white?',
          options: ['Purple', 'Orange', 'Pink', 'Gray'],
          correctIndex: 2,
          concept: 'art:mix-pink',
          hint: 'Adding white makes a color lighter',
        },
        {
          question: 'What is a drawing made with dots instead of lines called?',
          options: ['Pointillism', 'Cubism', 'Realism', 'Sketching'],
          correctIndex: 0,
          concept: 'art:pointillism',
          hint: 'Think of tiny points or dots placed close together',
        },
        {
          question: 'What do artists use an easel for?',
          options: [
            'Mixing paint',
            'Holding a canvas while painting',
            'Cleaning brushes',
            'Cutting paper',
          ],
          correctIndex: 1,
          concept: 'art:easel',
          hint: 'It stands upright and holds the surface you paint on',
        },
        {
          question: 'What are warm colors?',
          options: [
            'Blue, Green, Purple',
            'Red, Orange, Yellow',
            'Black, White, Gray',
            'Pink, Lavender, Teal',
          ],
          correctIndex: 1,
          concept: 'art:warm-colors',
          hint: 'Think of fire and sunshine',
        },
        {
          question: 'What are cool colors?',
          options: [
            'Red, Orange, Yellow',
            'Blue, Green, Purple',
            'Black, White, Gray',
            'Pink, Peach, Cream',
          ],
          correctIndex: 1,
          concept: 'art:cool-colors',
          hint: 'Think of water, sky, and grass',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 7. Creative Word Building (word-build)
  {
    id: 'create-word-art-07',
    title: 'Creative Word Building',
    category: 'creativity',
    subcategory: 'art-vocabulary',
    template: 'word-build',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'alphabetical-variant',
    emoji: '✨',
    color: '#E056A0',
    estimatedMinutes: 5,
    questionsPerSession: 10,
    learningObjectives: ['vocabulary', 'spelling', 'art-terms'],
    tags: ['words', 'art', 'vocabulary', 'spelling'],
    content: {
      words: [
        {
          word: 'paint',
          hint: 'A colorful liquid you spread on paper with a brush',
          concept: 'create-word:paint',
          extraLetters: 2,
          emoji: '🎨',
          imagePrompt:
            'cute cartoon paint palette, colorful blobs of paint, white background, children educational illustration style',
        },
        {
          word: 'color',
          hint: 'Red, blue, and yellow are examples of this',
          concept: 'create-word:color',
          extraLetters: 2,
          emoji: '🌈',
          imagePrompt:
            'cute cartoon rainbow, bright arc of red orange yellow green blue purple, white background, children educational illustration style',
        },
        {
          word: 'brush',
          hint: 'A tool with bristles used to apply paint',
          concept: 'create-word:brush',
          extraLetters: 2,
          emoji: '🖌️',
          imagePrompt:
            'cute cartoon paintbrush, wooden handle with colorful bristles, white background, children educational illustration style',
        },
        {
          word: 'music',
          hint: 'Sounds and rhythms that you hear in songs',
          concept: 'create-word:music',
          extraLetters: 3,
          emoji: '🎵',
          imagePrompt:
            'cute cartoon musical notes, colorful floating notes with happy faces, white background, children educational illustration style',
        },
        {
          word: 'dance',
          hint: 'Moving your body to rhythm and music',
          concept: 'create-word:dance',
          extraLetters: 2,
          emoji: '💃',
          imagePrompt:
            'cute cartoon girl dancing, happy expression with flowing dress, white background, children educational illustration style',
        },
        {
          word: 'canvas',
          hint: 'The flat surface that artists paint on',
          concept: 'create-word:canvas',
          extraLetters: 3,
          emoji: '🖼️',
          imagePrompt:
            'cute cartoon canvas on easel, blank white canvas ready to paint, white background, children educational illustration style',
        },
        {
          word: 'sketch',
          hint: 'A quick drawing made with a pencil',
          concept: 'create-word:sketch',
          extraLetters: 3,
          emoji: '✏️',
          imagePrompt:
            'cute cartoon pencil, yellow pencil with sharp tip drawing a line, white background, children educational illustration style',
        },
        {
          word: 'rhythm',
          hint: 'A pattern of beats in music or poetry',
          concept: 'create-word:rhythm',
          extraLetters: 3,
          emoji: '🥁',
          imagePrompt:
            'cute cartoon drum, small colorful drum with drumsticks, white background, children educational illustration style',
        },
        {
          word: 'sculpt',
          hint: 'To shape clay or material into art with your hands',
          concept: 'create-word:sculpt',
          extraLetters: 3,
          emoji: '🧱',
          imagePrompt:
            'cute cartoon clay block, colorful modeling clay with small hands shaping it, white background, children educational illustration style',
        },
        {
          word: 'design',
          hint: 'A plan or pattern for how something looks',
          concept: 'create-word:design',
          extraLetters: 3,
          emoji: '💡',
          imagePrompt:
            'cute cartoon lightbulb, bright glowing yellow lightbulb with happy face, white background, children educational illustration style',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 8. Art or Not? (true-false)
  {
    id: 'create-art-truefalse-08',
    title: 'Art or Not?',
    category: 'creativity',
    subcategory: 'art-knowledge',
    template: 'true-false',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'check-decagram',
    emoji: '✅',
    color: '#E056A0',
    estimatedMinutes: 4,
    questionsPerSession: 10,
    learningObjectives: [
      'art-awareness',
      'creative-thinking',
      'critical-thinking',
    ],
    tags: ['art', 'knowledge', 'true-false'],
    content: {
      statements: [
        {
          text: 'Drawing with crayons is a form of art.',
          answer: true,
          concept: 'art:crayon-art',
          explanation:
            'Drawing with crayons is definitely art! Any way you express your ideas visually is art.',
        },
        {
          text: 'Only adults can be artists.',
          answer: false,
          concept: 'art:anyone-artist',
          explanation:
            'Anyone can be an artist, even young children! Art is for everyone.',
        },
        {
          text: 'Music is a form of creative art.',
          answer: true,
          concept: 'art:music-is-art',
          explanation:
            'Music uses sounds and rhythms creatively, making it a wonderful art form.',
        },
        {
          text: 'You need expensive tools to make good art.',
          answer: false,
          concept: 'art:tools-myth',
          explanation:
            'You can make amazing art with simple things like paper, sticks, or even sand!',
        },
        {
          text: 'Dancing is a creative activity.',
          answer: true,
          concept: 'art:dance-creative',
          explanation:
            'Dancing uses your body to express feelings and ideas. It is very creative!',
        },
        {
          text: 'There is only one right way to draw a cat.',
          answer: false,
          concept: 'art:many-styles',
          explanation:
            'Every artist draws differently and that is what makes art special and unique!',
        },
        {
          text: 'Singing is a way to express creativity.',
          answer: true,
          concept: 'art:singing-creative',
          explanation:
            'Singing lets you use your voice to create beautiful sounds and tell stories.',
        },
        {
          text: 'A sculpture is a flat picture on paper.',
          answer: false,
          concept: 'art:sculpture-3d',
          explanation:
            'A sculpture is a 3D artwork that you can see from all sides, not flat like a picture.',
        },
        {
          text: 'Building with blocks can be a creative activity.',
          answer: true,
          concept: 'art:building-creative',
          explanation:
            'Building and constructing things uses imagination and problem-solving, which are creative skills!',
        },
        {
          text: 'Art must always look real and perfect.',
          answer: false,
          concept: 'art:abstract-ok',
          explanation:
            'Art can be abstract, silly, messy, or imaginary. There are no rules about what art should look like!',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 8, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 9. Art Tools Sorting (drag-to-zone)
  {
    id: 'create-tools-sort-09',
    title: 'Art Tools Sorting',
    category: 'creativity',
    subcategory: 'art-tools',
    template: 'drag-to-zone',
    ageRange: [4, 7],
    difficulty: 1,
    icon: 'toolbox',
    emoji: '🧰',
    color: '#E056A0',
    estimatedMinutes: 4,
    questionsPerSession: 12,
    learningObjectives: ['art-tools', 'classification', 'creative-awareness'],
    tags: ['art', 'tools', 'sorting', 'creativity'],
    content: {
      zones: [
        {id: 'drawing', label: 'Drawing Tools', color: '#9B59B6'},
        {id: 'painting', label: 'Painting Tools', color: '#E74C3C'},
        {id: 'crafts', label: 'Craft Supplies', color: '#2ECC71'},
      ],
      items: [
        {
          id: 'pencil',
          label: 'Pencil',
          zone: 'drawing',
          concept: 'art-tool:pencil',
        },
        {
          id: 'paintbrush',
          label: 'Paintbrush',
          zone: 'painting',
          concept: 'art-tool:paintbrush',
        },
        {
          id: 'glue-stick',
          label: 'Glue Stick',
          zone: 'crafts',
          concept: 'art-tool:glue',
        },
        {
          id: 'eraser',
          label: 'Eraser',
          zone: 'drawing',
          concept: 'art-tool:eraser',
        },
        {
          id: 'watercolors',
          label: 'Watercolors',
          zone: 'painting',
          concept: 'art-tool:watercolors',
        },
        {
          id: 'scissors',
          label: 'Scissors',
          zone: 'crafts',
          concept: 'art-tool:scissors',
        },
        {
          id: 'charcoal',
          label: 'Charcoal Stick',
          zone: 'drawing',
          concept: 'art-tool:charcoal',
        },
        {
          id: 'palette',
          label: 'Paint Palette',
          zone: 'painting',
          concept: 'art-tool:palette',
        },
        {
          id: 'glitter',
          label: 'Glitter',
          zone: 'crafts',
          concept: 'art-tool:glitter',
        },
        {
          id: 'crayon',
          label: 'Crayon',
          zone: 'drawing',
          concept: 'art-tool:crayon',
        },
        {
          id: 'sponge',
          label: 'Paint Sponge',
          zone: 'painting',
          concept: 'art-tool:sponge',
        },
        {
          id: 'tape',
          label: 'Craft Tape',
          zone: 'crafts',
          concept: 'art-tool:tape',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 10, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },

  // 10. Design Thinking Steps (sequence-order)
  {
    id: 'create-design-steps-10',
    title: 'Design Thinking Steps',
    category: 'creativity',
    subcategory: 'design-thinking',
    template: 'sequence-order',
    ageRange: [5, 8],
    difficulty: 2,
    icon: 'lightbulb-on',
    emoji: '💡',
    color: '#E056A0',
    estimatedMinutes: 4,
    questionsPerSession: 8,
    learningObjectives: [
      'design-thinking',
      'problem-solving',
      'creative-process',
    ],
    tags: ['design', 'thinking', 'process', 'creativity'],
    content: {
      sequences: [
        {
          items: [
            'Think of an idea',
            'Draw a sketch',
            'Pick your colors',
            'Gather materials',
            'Start creating',
            'Add details',
            'Check your work',
            'Share with friends',
          ],
          concept: 'design:creative-process',
        },
        {
          items: [
            'See a problem',
            'Ask questions',
            'Brainstorm ideas',
            'Pick the best idea',
            'Build a model',
            'Test it out',
            'Make it better',
            'Present your solution',
          ],
          concept: 'design:problem-solving',
        },
      ],
    },
    rewards: {starsPerCorrect: 1, bonusThreshold: 6, bonusStars: 3},
    threeR: {
      measuresRetention: true,
      measuresRecall: true,
      measuresRegistration: true,
    },
  },
];

// ============================================================================
// Combined game configs
// ============================================================================

const gameConfigs = [
  ...ENGLISH_GAMES,
  ...ENGLISH_GAMES_EXTRA,
  ...MATH_GAMES,
  ...MATH_GAMES_EXTRA,
  ...LIFE_SKILLS_GAMES,
  ...LIFE_SKILLS_GAMES_EXTRA,
  ...CREATIVITY_GAMES,
  ...INTERACTIVE_GAMES,
  ...VOICE_GAMES,
];

export default gameConfigs;

// ─── Helper functions ────────────────────────────────────────────────────────

/**
 * Get a game config by its unique ID.
 * @param {string} id
 * @returns {Object|null}
 */
export function getGameById(id) {
  return gameConfigs.find((g) => g.id === id) || null;
}

/**
 * Get all games in a given category.
 * @param {string} category - 'english' | 'math' | 'lifeSkills' | 'creativity' | 'all' (95 total)
 * @returns {Object[]}
 */
export function getGamesByCategory(category) {
  if (!category || category === 'all') return gameConfigs;
  return gameConfigs.filter((g) => g.category === category);
}

/**
 * Get games by template type.
 * @param {string} template - e.g. 'multiple-choice', 'match-pairs'
 * @returns {Object[]}
 */
export function getGamesByTemplate(template) {
  return gameConfigs.filter((g) => g.template === template);
}

/**
 * Get games suitable for a given age.
 * @param {number} age
 * @returns {Object[]}
 */
export function getGamesForAge(age) {
  return gameConfigs.filter(
    (g) => age >= g.ageRange[0] && age <= g.ageRange[1]
  );
}

/**
 * Get games filtered by difficulty level.
 * @param {number} difficulty - 1, 2, or 3
 * @returns {Object[]}
 */
export function getGamesByDifficulty(difficulty) {
  return gameConfigs.filter((g) => g.difficulty === difficulty);
}

/**
 * Get games matching multiple criteria.
 * @param {Object} filters - { category, template, difficulty, age, tags }
 * @returns {Object[]}
 */
export function filterGames(filters = {}) {
  let results = gameConfigs;

  if (filters.category && filters.category !== 'all') {
    results = results.filter((g) => g.category === filters.category);
  }
  if (filters.template) {
    results = results.filter((g) => g.template === filters.template);
  }
  if (filters.difficulty) {
    results = results.filter((g) => g.difficulty === filters.difficulty);
  }
  if (filters.age) {
    results = results.filter(
      (g) => filters.age >= g.ageRange[0] && filters.age <= g.ageRange[1]
    );
  }
  if (filters.tags && filters.tags.length > 0) {
    results = results.filter((g) =>
      filters.tags.some((tag) => g.tags && g.tags.includes(tag))
    );
  }

  return results;
}

// Named category exports for convenience
export {
  ENGLISH_GAMES,
  ENGLISH_GAMES_EXTRA,
  MATH_GAMES,
  MATH_GAMES_EXTRA,
  LIFE_SKILLS_GAMES,
  LIFE_SKILLS_GAMES_EXTRA,
  CREATIVITY_GAMES,
  INTERACTIVE_GAMES,
  VOICE_GAMES,
};
