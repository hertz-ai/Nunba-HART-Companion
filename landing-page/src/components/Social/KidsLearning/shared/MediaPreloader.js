/**
 * MediaPreloader - Pre-generation orchestrator for Kids Learning Zone (Web).
 *
 * Triggers pre-caching of media (images, TTS, music, video) in advance so that
 * content is ready when the user enters a game. All operations are
 * fire-and-forget -- failures are silently ignored.
 *
 * Usage:
 *   import MediaPreloader from './shared/MediaPreloader';
 *   await MediaPreloader.preloadForUpcomingGames(games, ageGroup);
 *   await MediaPreloader.preloadForGame(gameConfig);
 */

import GameAssetService from './GameAssetService';
import MediaCacheManager from './MediaCacheManager';
import TTSManager from './TTSManager';

import {logger} from '../../../../utils/logger';
import {getCachedMusic} from '../kidsLearningApi';

// ── Pregeneration request (uses same endpoint as RN) ─────────────────────────

let _requestPregeneration = null;

/**
 * Lazy-import the pregeneration endpoint.
 * We use dynamic import to keep the module boundary clean; the function
 * is only needed when the user is online and we want to warm the server cache.
 */
const getRequestPregeneration = async () => {
  if (_requestPregeneration) return _requestPregeneration;
  try {
    // The kidsLearningApi exports this as a named export
    const mod = await import('../kidsLearningApi');
    // Try the dedicated endpoint if it exists; otherwise use a no-op
    if (typeof mod.requestPregeneration === 'function') {
      _requestPregeneration = mod.requestPregeneration;
    } else if (
      typeof mod.kidsLearningApi?.requestPregeneration === 'function'
    ) {
      _requestPregeneration = mod.kidsLearningApi.requestPregeneration;
    } else {
      _requestPregeneration = () => Promise.resolve();
    }
  } catch (err) {
    logger.error(err);
    _requestPregeneration = () => Promise.resolve();
  }
  return _requestPregeneration;
};

// ── Text extraction helpers ─────────────────────────────────────────────────

/**
 * Extract ALL TTS-worthy texts from a game config.
 * Walks every content shape to find text that should be spoken.
 *
 * @param {Object} gameConfig
 * @returns {string[]} Array of unique text strings
 */
const _extractAllTexts = (gameConfig) => {
  if (!gameConfig) return [];

  const texts = new Set();
  const add = (t) => {
    if (t && typeof t === 'string' && t.trim()) texts.add(t.trim());
  };

  // Game intro
  add(`Let's play ${gameConfig.title}!`);

  // Helper for array fields
  const arr = (field) => {
    const src = gameConfig.content || gameConfig;
    return Array.isArray(src[field])
      ? src[field]
      : Array.isArray(gameConfig[field])
        ? gameConfig[field]
        : [];
  };

  // questions[] — question text, options text, hints, explanations
  arr('questions').forEach((q) => {
    add(q.question);
    add(q.text);
    add(q.hint);
    add(q.explanation);
    add(q.word);
    if (Array.isArray(q.options)) {
      q.options.forEach((opt) => {
        if (typeof opt === 'string') add(opt);
        else if (opt) {
          add(opt.text);
          add(opt.label);
        }
      });
    }
    // Cards inside questions (memory flip)
    if (Array.isArray(q.cards)) {
      q.cards.forEach((card) => {
        add(card?.text);
        add(card?.word);
        add(card?.label);
      });
    }
  });

  // words[] — word, hint
  arr('words').forEach((w) => {
    add(w?.word);
    add(w?.hint);
    add(w?.text);
  });

  // pairs[] — left/right labels
  arr('pairs').forEach((p) => {
    add(p?.left);
    add(p?.right);
    add(p?.leftText);
    add(p?.rightText);
  });

  // statements[] — statement text
  arr('statements').forEach((s) => {
    add(s?.statement);
    add(s?.text);
  });

  // sentences[] (fill-in-the-blank)
  arr('sentences').forEach((s) => {
    add(s?.text);
    add(s?.sentence);
  });

  // Story scenes
  if (gameConfig.content?.story?.scenes) {
    Object.values(gameConfig.content.story.scenes).forEach((scene) => {
      add(scene?.text);
      add(scene?.narration);
    });
  }

  return Array.from(texts);
};

// ── MediaPreloader ───────────────────────────────────────────────────────────

const MediaPreloader = {
  /**
   * Pre-load media for upcoming games (called from KidsHub when online).
   * Priority: Images (largest impact) > TTS (fast/small) > Music.
   *
   * @param {Array} games - list of game objects with { title, category, content, ... }
   * @param {string} [ageGroup] - e.g. '4-6', '6-8'
   */
  preloadForUpcomingGames: async (games, ageGroup) => {
    if (!Array.isArray(games) || games.length === 0) return;

    const imagePromises = [];
    const ttsPromises = [];
    const musicPromises = [];

    for (const game of games) {
      // Pre-cache images for all game content items
      imagePromises.push(
        GameAssetService.preloadImages(game, 'cartoon').catch(() => {})
      );

      // Pre-cache TTS for game intro + all spoken content
      const texts = _extractAllTexts(game);
      if (texts.length > 0) {
        ttsPromises.push(TTSManager.preCache(texts).catch(() => {}));
      }

      // Pre-cache category BGM via agent pipeline (AceStep-generated)
      const category = game.category || 'general';
      musicPromises.push(
        GameAssetService.getMusic(category, 'happy', 60).catch(() => {})
      );

      // Fallback: also try legacy getCachedMusic endpoint
      const musicParams = {
        category,
        mood: 'happy',
        duration: 60,
      };
      musicPromises.push(
        (async () => {
          try {
            if (MediaCacheManager.has('music', musicParams)) return;
            const result = await getCachedMusic(musicParams);
            const url = result?.data?.url || result?.url;
            if (url) {
              await MediaCacheManager.download('music', musicParams, url);
            }
          } catch (err) {
            logger.error(err);
          }
        })()
      );
    }

    // All media types in parallel — no sequential blocking
    await Promise.allSettled([
      ...imagePromises,
      ...ttsPromises,
      ...musicPromises,
    ]);
  },

  /**
   * Pre-load media for a specific game about to be played.
   * Runs image, TTS, and music pre-caching in parallel.
   *
   * @param {Object} gameConfig - { id, title, category, template, content, ... }
   * @param {Function} [onProgress] - Called with (completed, total) for image progress
   * @returns {Promise<Map<string, string|null>>} imageMap from GameAssetService.preloadImages
   */
  preloadForGame: async (gameConfig, onProgress) => {
    if (!gameConfig) return new Map();

    const promises = [];
    let imageMap = new Map();

    // ── Images: batch pre-fetch all imagePrompts via agent pipeline ──
    promises.push(
      GameAssetService.preloadImages(gameConfig, 'cartoon', onProgress)
        .then((map) => {
          imageMap = map;
        })
        .catch(() => {})
    );

    // ── TTS: pre-cache all spoken text via server-side VibeVoice/Piper ──
    const allTexts = _extractAllTexts(gameConfig);
    if (allTexts.length > 0) {
      promises.push(TTSManager.preCache(allTexts).catch(() => {}));
    }

    // ── Music: category BGM via AceStep (agent pipeline) ──
    const category = gameConfig.category || 'general';
    promises.push(
      GameAssetService.getMusic(category, 'happy', 60).catch(() => {})
    );

    // Fallback: also try legacy getCachedMusic endpoint
    const musicParams = {
      category,
      mood: 'happy',
      duration: 60,
    };
    promises.push(
      (async () => {
        try {
          if (MediaCacheManager.has('music', musicParams)) return;
          const result = await getCachedMusic(musicParams);
          const url = result?.data?.url || result?.url;
          if (url) {
            await MediaCacheManager.download('music', musicParams, url);
          }
        } catch (err) {
          logger.error(err);
        }
      })()
    );

    // ── Server-side pre-generation request (image + tts + music) ──
    promises.push(
      (async () => {
        try {
          const fn = await getRequestPregeneration();
          await fn({
            gameIds: [gameConfig.id],
            mediaTypes: ['image', 'tts', 'music'],
          });
        } catch (err) {
          logger.error(err);
        }
      })()
    );

    await Promise.allSettled(promises);

    return imageMap;
  },

  /**
   * Pre-load commonly used phrases (greetings, transitions, feedback).
   * Call once on app startup when online.
   *
   * @param {Object} [opts]
   * @param {string} [opts.voice]
   */
  preloadCommonPhrases: async ({voice} = {}) => {
    const phrases = [
      'Great job!',
      'Well done!',
      'Try again!',
      'Almost there!',
      'You got it!',
      'Fantastic!',
      'Keep going!',
      'Oops, try again!',
      "Let's play!",
      "Ready? Let's go!",
      "Time's up!",
      "You're a star!",
      'Perfect score!',
    ];

    try {
      await TTSManager.preCache(phrases, {voice});
    } catch (err) {
      logger.error(err);
      // Best-effort
    }
  },

  /**
   * Check what pre-loaded media is available for a game.
   *
   * @param {Object} gameConfig
   * @returns {Promise<Object>} { sfxReady, bgmReady, ttsReady, imagesReady }
   */
  getPreloadStatus: async (gameConfig) => {
    if (!gameConfig)
      return {
        sfxReady: true,
        bgmReady: false,
        ttsReady: false,
        imagesReady: false,
      };

    const musicParams = {
      category: gameConfig.category || 'general',
      mood: 'happy',
      duration: 60,
    };
    let bgmReady = false;
    try {
      bgmReady = MediaCacheManager.has('music', musicParams);
    } catch (err) {
      logger.error(err);
    }

    // Check if any image prompts have cached data
    let imagesReady = false;
    try {
      const prompts = GameAssetService._extractPrompts(gameConfig);
      if (prompts.length === 0) {
        imagesReady = true; // No images needed
      } else {
        // Spot-check first prompt
        const first = prompts[0];
        const cached = await MediaCacheManager.getAsync('image', {
          prompt: first.prompt,
          style: 'cartoon',
          classification: 'public_educational',
        });
        imagesReady = !!cached;
      }
    } catch (err) {
      logger.error(err);
    }

    return {
      sfxReady: true, // Web SFX are procedurally generated - always available
      bgmReady,
      ttsReady: false, // Would need to check each text individually
      imagesReady,
    };
  },

  // Expose text extraction for external use
  _extractAllTexts,
};

export default MediaPreloader;
