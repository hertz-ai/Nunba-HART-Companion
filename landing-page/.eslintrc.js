module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    jest: true,
  },
  extends: ['plugin:react/recommended', 'google', 'prettier'],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      presets: ['@babel/preset-react'],
    },
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  plugins: ['react', 'prettier', 'react-hooks', 'import', 'security'],
  rules: {
    // ── JSDoc / legacy Google rules — off (not our convention) ──
    'valid-jsdoc': 'off',
    'require-jsdoc': 'off',
    'no-invalid-this': 'off',

    // ── Prettier — handled by separate prettier pipeline, don't double-enforce ──
    'prettier/prettier': 'off',

    // ── React ──
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off', // react-scripts 17+ auto-imports
    'react/no-unescaped-entities': 'warn',
    'react/no-unknown-property': ['warn', { ignore: ['jsx', 'global'] }], // styled-jsx
    'react/jsx-no-duplicate-props': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // ── Variable declarations ──
    // NOTE: no-var / prefer-const demoted to warn for vendored/legacy files
    // (responsiveSubMenu.js, gameAI.js etc.).  New code should still prefer
    // const/let — caught at review time.  Flip back to error after a focused
    // cleanup PR.
    'no-var': 'warn',
    'prefer-const': 'warn',
    'one-var': 'off', // legacy comma-separated declarations common in vendored utils
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-unused-expressions': 'off',
    'guard-for-in': 'warn',
    'prefer-promise-reject-errors': 'warn',

    // ── Naming — legacy snake_case from Python backend fields is pervasive ──
    'camelcase': 'warn',
    'new-cap': 'warn',

    // ── Comments ──
    'spaced-comment': 'warn',

    // ── Imports — order is warn (style debt), resolution off (CRA/webpack aliases) ──
    'import/no-unresolved': 'off',
    'import/named': 'off',
    'import/default': 'off',
    'import/export': 'warn',
    'import/first': 'off',
    'import/order': [
      'warn',
      {
        groups: [
          'index',
          'sibling',
          'parent',
          'internal',
          'external',
          'builtin',
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],

    // ── Security (OSS Veracode-equivalent) ──
    // detect-object-injection has a 95%+ false-positive rate on legit bracket
    // access (state[key], arr[i], etc.) — 1,100+ false positives drowned real
    // signal.  Off by default; re-enable for targeted security audits via
    // `npx eslint --no-eslintrc -c .eslintrc-security.js src/`.
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-regexp': 'warn',

    // ── Hard errors (never demote) ──
    'no-eval': 'error',
    'no-implied-eval': 'error',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
