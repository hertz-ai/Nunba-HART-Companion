import {gamesApi} from '../services/socialApi';

import {useState, useEffect, useCallback, useRef, useMemo} from 'react';

// ── Client-side game catalog (fallback when backend catalog is unavailable) ──
export const LOCAL_CATALOG = [
  // Board Games
  {
    id: 'tic-tac-toe',
    name: 'Tic Tac Toe',
    category: 'board',
    description: 'Classic 3x3 grid game',
    multiplayer: true,
    featured: true,
    emoji: '\u2B1C',
  },
  {
    id: 'connect-four',
    name: 'Connect Four',
    category: 'board',
    description: 'Drop discs to connect four in a row',
    multiplayer: true,
    featured: true,
    emoji: '\uD83D\uDD34',
  },
  {
    id: 'checkers',
    name: 'Checkers',
    category: 'board',
    description: 'Jump and capture opponent pieces',
    multiplayer: true,
    emoji: '\u26AB',
  },
  {
    id: 'reversi',
    name: 'Reversi',
    category: 'board',
    description: 'Flip tiles to dominate the board',
    multiplayer: true,
    emoji: '\u26AA',
  },
  {
    id: 'mancala',
    name: 'Mancala',
    category: 'board',
    description: 'Ancient seed-sowing strategy game',
    multiplayer: true,
    emoji: '\uD83E\uDD5C',
  },

  // Arcade / Phaser Games
  {
    id: 'snake',
    name: 'Snake',
    category: 'arcade',
    description: 'Eat food and grow longer without hitting yourself',
    multiplayer: false,
    featured: true,
    emoji: '\uD83D\uDC0D',
  },
  {
    id: 'breakout',
    name: 'Breakout',
    category: 'arcade',
    description: 'Break all the bricks with a bouncing ball',
    multiplayer: false,
    emoji: '\uD83E\uDDF1',
  },
  {
    id: 'pong',
    name: 'Pong',
    category: 'arcade',
    description: 'Classic paddle ball game',
    multiplayer: true,
    emoji: '\uD83C\uDFD3',
  },
  {
    id: 'flappy',
    name: 'Flappy Bird',
    category: 'arcade',
    description: 'Navigate through pipes without crashing',
    multiplayer: false,
    featured: true,
    emoji: '\uD83D\uDC26',
  },
  {
    id: 'runner',
    name: 'Endless Runner',
    category: 'arcade',
    description: 'Run, jump and dodge obstacles',
    multiplayer: false,
    emoji: '\uD83C\uDFC3',
  },
  {
    id: 'bubble-shooter',
    name: 'Bubble Shooter',
    category: 'arcade',
    description: 'Match and pop colored bubbles',
    multiplayer: false,
    emoji: '\uD83E\uDEE7',
  },
  {
    id: 'match3',
    name: 'Match 3',
    category: 'puzzle',
    description: 'Swap gems to match three or more',
    multiplayer: false,
    emoji: '\uD83D\uDC8E',
  },

  // Trivia
  {
    id: 'trivia-general',
    name: 'General Trivia',
    category: 'trivia',
    description: 'Test your general knowledge',
    multiplayer: true,
    featured: true,
    emoji: '\uD83E\uDDE0',
  },
  {
    id: 'trivia-science',
    name: 'Science Quiz',
    category: 'trivia',
    description: 'Questions about science and nature',
    multiplayer: true,
    emoji: '\uD83D\uDD2C',
  },
  {
    id: 'trivia-history',
    name: 'History Quiz',
    category: 'trivia',
    description: 'Journey through historical events',
    multiplayer: true,
    emoji: '\uD83C\uDFDB\uFE0F',
  },
  {
    id: 'trivia-geography',
    name: 'Geography Quiz',
    category: 'trivia',
    description: 'Explore the world through questions',
    multiplayer: true,
    emoji: '\uD83C\uDF0D',
  },
  {
    id: 'trivia-tech',
    name: 'Tech Quiz',
    category: 'trivia',
    description: 'Test your technology knowledge',
    multiplayer: true,
    emoji: '\uD83D\uDCBB',
  },
  {
    id: 'trivia-movies',
    name: 'Movie Trivia',
    category: 'trivia',
    description: 'How well do you know films?',
    multiplayer: true,
    emoji: '\uD83C\uDFAC',
  },

  // Word Games
  {
    id: 'word-scramble',
    name: 'Word Scramble',
    category: 'word',
    description: 'Unscramble letters to form words',
    multiplayer: false,
    featured: true,
    emoji: '\uD83D\uDD24',
  },
  {
    id: 'word-search',
    name: 'Word Search',
    category: 'word',
    description: 'Find hidden words in a grid',
    multiplayer: false,
    emoji: '\uD83D\uDD0D',
  },
  {
    id: 'word-chain',
    name: 'Word Chain',
    category: 'word',
    description: 'Chain words by their last letter',
    multiplayer: true,
    emoji: '\uD83D\uDD17',
  },

  // Puzzle
  {
    id: 'sudoku',
    name: 'Sudoku',
    category: 'puzzle',
    description: 'Fill the 9x9 grid with numbers',
    multiplayer: false,
    emoji: '\uD83D\uDD22',
  },
  {
    id: 'collab-puzzle',
    name: 'Collaborative Puzzle',
    category: 'puzzle',
    description: 'Solve puzzles together in real-time',
    multiplayer: true,
    emoji: '\uD83E\uDDE9',
  },

  // Party
  {
    id: 'party-trivia',
    name: 'Party Trivia',
    category: 'party',
    description: 'Fast-paced trivia for groups',
    multiplayer: true,
    emoji: '\uD83C\uDF89',
  },
  {
    id: 'party-word-race',
    name: 'Word Race',
    category: 'party',
    description: 'Race to form words before your opponents',
    multiplayer: true,
    emoji: '\uD83C\uDFC1',
  },
];

function filterLocalCatalog(catalog, filters) {
  let result = [...catalog];

  if (filters.audience === 'kids') {
    // Kids games are in KidsLearningHub, not here
    return [];
  }

  if (filters.category && filters.category !== 'all') {
    result = result.filter((g) => g.category === filters.category);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q)
    );
  }

  if (filters.multiplayer !== undefined) {
    result = result.filter((g) => g.multiplayer === filters.multiplayer);
  }

  if (filters.featured) {
    result = result.filter((g) => g.featured);
  }

  return result;
}

function getCategoryCounts(catalog) {
  const counts = {};
  for (const g of catalog) {
    counts[g.category] = (counts[g.category] || 0) + 1;
  }
  return counts;
}

/**
 * useGameCatalog — Fetch game catalog from backend, fall back to client-side catalog.
 *
 * @param {Object} filters - { audience, category, multiplayer, featured, tag, search }
 * @returns {{ games, categories, total, loading, error, refetch }}
 */
export default function useGameCatalog(filters = {}) {
  const [games, setGames] = useState([]);
  const [categories, setCategories] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cacheRef = useRef({});

  // Stable reference: only changes when filter values actually change
  const stableFilters = useMemo(
    () => filters,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.audience,
      filters.category,
      filters.multiplayer,
      filters.featured,
      filters.tag,
      filters.search,
    ]
  );

  const fetchCatalog = useCallback(async () => {
    const cacheKey = JSON.stringify(stableFilters);
    if (cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      setGames(cached.data);
      setCategories(cached.meta?.categories || {});
      setTotal(cached.meta?.total || 0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await gamesApi.catalog(stableFilters);
      const data = res.data?.data || [];
      const meta = res.data?.meta || {};
      if (data.length > 0) {
        setGames(data);
        setCategories(meta.categories || {});
        setTotal(meta.total || data.length);
        cacheRef.current[cacheKey] = {data, meta};
        setLoading(false);
        return;
      }
    } catch {
      // Backend catalog unavailable — use local fallback
    }

    // Fallback to client-side catalog
    const filtered = filterLocalCatalog(LOCAL_CATALOG, stableFilters);
    const catCounts = getCategoryCounts(LOCAL_CATALOG);
    setGames(filtered);
    setCategories(catCounts);
    setTotal(LOCAL_CATALOG.length);
    cacheRef.current[cacheKey] = {
      data: filtered,
      meta: {categories: catCounts, total: LOCAL_CATALOG.length},
    };
    setLoading(false);
  }, [stableFilters]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return {games, categories, total, loading, error, refetch: fetchCatalog};
}

/**
 * getRelatedGames — Find related games for a "portal" suggestion after game completion.
 *
 * Strategy:
 *   1. Same category, different game (difficulty ladder)
 *   2. Cross-category suggestions via skill bridge mapping
 *   3. Mix: prefer 2 same-category + 1 cross-category, fill remaining with whatever is available
 *
 * @param {string} currentGameId - ID of the game just completed
 * @param {string} category - category of the current game
 * @param {number} maxResults - maximum number of suggestions (default 3)
 * @returns {Array} array of game objects from LOCAL_CATALOG
 */
export function getRelatedGames(currentGameId, category, maxResults = 3) {
  // 1. Same category, different game
  const sameCategory = LOCAL_CATALOG.filter(
    (g) => g.category === category && g.id !== currentGameId
  );

  // 2. Cross-category suggestions via skill bridge mapping
  const SKILL_BRIDGES = {
    word: ['trivia', 'puzzle'],
    trivia: ['word', 'board'],
    board: ['puzzle', 'arcade'],
    arcade: ['board', 'party'],
    puzzle: ['word', 'board'],
    party: ['trivia', 'arcade'],
  };
  const bridgeCategories = SKILL_BRIDGES[category] || [];
  const crossCategory = LOCAL_CATALOG.filter(
    (g) => bridgeCategories.includes(g.category) && g.id !== currentGameId
  );

  // Mix: 2 same category + 1 cross category (or fill with whatever is available)
  const results = [];
  const addUnique = (game) => {
    if (!results.find((r) => r.id === game.id)) results.push(game);
  };
  sameCategory.slice(0, 2).forEach(addUnique);
  crossCategory.slice(0, 1).forEach(addUnique);
  // Fill remaining
  [...sameCategory, ...crossCategory].forEach((g) => {
    if (results.length < maxResults) addUnique(g);
  });
  return results.slice(0, maxResults);
}
