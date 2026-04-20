/**
 * StoryBuilderTemplate - Dynamic Liquid Agentic UI
 *
 * Interactive branching story with typewriter effect for narrative text,
 * choice cards with icons, decision tracking, and moral feedback.
 * Empty choices array = story end, shows summary.
 *
 * Props:
 *   config     - { content: { story: {
 *                   start: string,
 *                   scenes: { [id]: { text, icon, choices: [{ text, nextScene, isGood, concept }] } }
 *                 } } }
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import {logger} from '../../../../utils/logger';
import {kidsColors, kidsAnimations} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import ProgressStars from '../shared/ProgressStars';
import {GameSounds} from '../shared/SoundManager';
import TTSManager from '../shared/TTSManager';
import useCelebration from '../shared/useCelebration';

import {Box, Typography, Button, Card, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';

const TYPEWRITER_SPEED = 35; // ms per character
const CHOICE_COLORS = [
  kidsColors.blue,
  kidsColors.pink,
  kidsColors.orange,
  kidsColors.purple,
  kidsColors.teal,
];

export default function StoryBuilderTemplate({config, onAnswer, onComplete}) {
  const story = config?.content?.story ?? {};
  const scenes = story.scenes ?? {};
  const startScene = story.start ?? Object.keys(scenes)[0] ?? '';

  const [currentSceneId, setCurrentSceneId] = useState(startScene);
  const [decisions, setDecisions] = useState([]);
  const [score, setScore] = useState(0);
  const [totalChoices, setTotalChoices] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [results, setResults] = useState([]);

  const {
    celebType,
    celebVisible,
    celebStreak,
    celebScore,
    starsEarned,
    triggerCorrect,
    triggerStreak,
    triggerComplete,
    handleCelebDone,
  } = useCelebration();

  // Typewriter state
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [showChoices, setShowChoices] = useState(false);
  const [choiceFeedback, setChoiceFeedback] = useState(null); // { index, isGood }
  const [storyEnded, setStoryEnded] = useState(false);

  const startTimeRef = useRef(Date.now());
  const typewriterRef = useRef(null);

  const scene = scenes[currentSceneId] ?? null;
  const sceneText = scene?.text ?? '';
  const sceneChoices = scene?.choices ?? [];

  // ── Stop TTS on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        TTSManager.stop();
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }
    };
  }, []);

  // ── parallel typewriter + TTS ─────────────────────────────────
  const ttsCompleteRef = useRef(false);
  const typewriterDoneRef = useRef(false);

  useEffect(() => {
    if (!sceneText) return;

    // Stop any ongoing TTS from the previous scene
    try {
      TTSManager.stop();
    } catch (err) {
      logger.error(err); /* Game asset load — non-critical */
    }

    setDisplayedText('');
    setIsTyping(true);
    setShowChoices(false);
    setChoiceFeedback(null);
    startTimeRef.current = Date.now();
    ttsCompleteRef.current = false;
    typewriterDoneRef.current = false;

    // Start TTS immediately — runs in parallel with typewriter
    try {
      TTSManager.speak(sceneText, {
        onEnd: () => {
          ttsCompleteRef.current = true;
          // Show choices once BOTH typewriter and TTS are done
          if (typewriterDoneRef.current) {
            setTimeout(() => setShowChoices(true), 200);
          }
        },
      });
    } catch (err) {
      logger.error(err); /* non-critical */
    }

    // Estimate TTS duration to adapt typewriter speed
    const wordCount = sceneText.split(/\s+/).length;
    const estimatedTTSDurationMs = Math.max((wordCount / 150) * 60000, 1500);
    // Adapt typewriter speed so text and speech finish roughly together
    const adaptedSpeed = Math.max(
      Math.floor(estimatedTTSDurationMs / sceneText.length),
      15 // minimum 15ms per char to remain readable
    );

    let charIdx = 0;
    typewriterRef.current = setInterval(() => {
      charIdx++;
      setDisplayedText(sceneText.slice(0, charIdx));
      if (charIdx >= sceneText.length) {
        clearInterval(typewriterRef.current);
        setIsTyping(false);
        typewriterDoneRef.current = true;
        // Show choices once BOTH typewriter and TTS are done
        if (ttsCompleteRef.current) {
          setTimeout(() => setShowChoices(true), 200);
        } else {
          // TTS still playing — show choices when it finishes (handled in onEnd above)
          // Safety: if TTS never fires onEnd (e.g. silent/error), show after timeout
          setTimeout(() => {
            if (!ttsCompleteRef.current) setShowChoices(true);
          }, 3000);
        }
      }
    }, adaptedSpeed);

    return () => clearInterval(typewriterRef.current);
  }, [currentSceneId, sceneText]);

  // Skip typewriter on tap
  const handleSkipTypewriter = useCallback(() => {
    if (isTyping) {
      clearInterval(typewriterRef.current);
      setDisplayedText(sceneText);
      setIsTyping(false);
      setTimeout(() => setShowChoices(true), 200);
    }
  }, [isTyping, sceneText]);

  // ── check if story end ─────────────────────────────────────────
  useEffect(() => {
    if (!scene) return;
    if (sceneChoices.length === 0 && !isTyping && displayedText === sceneText) {
      setStoryEnded(true);
      triggerComplete(score, Math.max(totalChoices, 1));
      // Compile results and complete
      setTimeout(() => {
        if (onComplete) {
          const goodCount = decisions.filter((d) => d.isGood).length;
          onComplete({
            score,
            correct: goodCount,
            total: totalChoices,
            results,
            bestStreak,
          });
        }
      }, 2000);
    }
  }, [
    scene,
    sceneChoices.length,
    isTyping,
    displayedText,
    sceneText,
    decisions,
    score,
    totalChoices,
    results,
    bestStreak,
    onComplete,
    triggerComplete,
  ]);

  // ── handle choice ──────────────────────────────────────────────
  const handleChoice = useCallback(
    (choiceIdx) => {
      if (choiceFeedback !== null) return;
      if (isTyping) return;

      const choice = sceneChoices[choiceIdx];
      if (!choice) return;

      const elapsed = Date.now() - startTimeRef.current;
      const isGood = choice.isGood ?? true;

      setChoiceFeedback({index: choiceIdx, isGood});

      try {
        if (isGood) {
          GameSounds.correct();
        } else {
          GameSounds.wrong();
        }
      } catch (err) {
        logger.error(err); /* Game asset load — non-critical */
      }

      const newScore = isGood ? score + 1 : score;
      const newTotal = totalChoices + 1;
      const newStreak = isGood ? streak + 1 : 0;
      const newBest = Math.max(bestStreak, newStreak);

      setScore(newScore);
      setTotalChoices(newTotal);
      setStreak(newStreak);
      setBestStreak(newBest);

      const decision = {
        sceneId: currentSceneId,
        choiceText: choice.text,
        isGood,
        concept: choice.concept ?? '',
      };
      const newDecisions = [...decisions, decision];
      setDecisions(newDecisions);

      const result = {
        sceneId: currentSceneId,
        choiceIndex: choiceIdx,
        isCorrect: isGood,
        concept: choice.concept ?? '',
        responseTimeMs: elapsed,
      };
      const newResults = [...results, result];
      setResults(newResults);

      if (isGood) triggerCorrect();
      if (isGood && (newStreak === 3 || newStreak === 5 || newStreak === 10))
        triggerStreak(newStreak);

      if (onAnswer) onAnswer(isGood, choice.concept ?? '', elapsed);

      // Navigate to next scene after brief feedback
      setTimeout(() => {
        if (choice.nextScene && scenes[choice.nextScene]) {
          setCurrentSceneId(choice.nextScene);
        } else {
          // End of story
          setStoryEnded(true);
          triggerComplete(newScore, Math.max(newTotal, 1));
          setTimeout(() => {
            if (onComplete) {
              const goodCount = newDecisions.filter((d) => d.isGood).length;
              onComplete({
                score: newScore,
                correct: goodCount,
                total: newTotal,
                results: newResults,
                bestStreak: newBest,
              });
            }
          }, 1500);
        }
      }, 1200);
    },
    [
      choiceFeedback,
      isTyping,
      sceneChoices,
      score,
      totalChoices,
      streak,
      bestStreak,
      decisions,
      results,
      currentSceneId,
      scenes,
      onAnswer,
      onComplete,
      triggerCorrect,
      triggerStreak,
      triggerComplete,
    ]
  );

  // ── guard ──────────────────────────────────────────────────────
  if (!scene) {
    return (
      <Box sx={{p: 4, textAlign: 'center'}}>
        <Typography color={kidsColors.textSecondary}>
          No story available.
        </Typography>
      </Box>
    );
  }

  // ── render story end summary ───────────────────────────────────
  if (storyEnded && !isTyping) {
    const goodCount = decisions.filter((d) => d.isGood).length;
    const totalDec = decisions.length;

    return (
      <Fade in timeout={600}>
        <Box
          sx={{
            width: '100%',
            maxWidth: 600,
            mx: 'auto',
            p: {xs: 2, sm: 3},
            ...kidsAnimations.fadeInUp,
            animation: 'fadeInUp 0.5s ease-out',
          }}
        >
          {/* Final scene text */}
          {displayedText && (
            <Card
              elevation={0}
              sx={{
                background: kidsColors.cardBg,
                backdropFilter: 'blur(16px)',
                border: `1px solid ${kidsColors.cardBorder}`,
                borderRadius: '20px',
                boxShadow: kidsColors.shadowCard,
                p: {xs: 2.5, sm: 3.5},
                mb: 3,
              }}
            >
              <Typography
                variant="body1"
                sx={{
                  color: kidsColors.textPrimary,
                  lineHeight: 1.8,
                  fontWeight: 500,
                }}
              >
                {displayedText}
              </Typography>
            </Card>
          )}

          {/* Summary card */}
          <Card
            elevation={0}
            sx={{
              background: kidsColors.cardBg,
              backdropFilter: 'blur(16px)',
              border: `1px solid ${kidsColors.cardBorder}`,
              borderRadius: '24px',
              boxShadow: kidsColors.shadowCard,
              p: 4,
              textAlign: 'center',
            }}
          >
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                background: kidsColors.gradientCelebration,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 2,
                animation: 'celebrate 0.8s ease-in-out',
                ...kidsAnimations.celebrate,
              }}
            >
              Story Complete!
            </Typography>

            <Typography
              variant="body1"
              sx={{color: kidsColors.textSecondary, mb: 2.5}}
            >
              You made {totalDec} choices in your journey
            </Typography>

            <Box
              sx={{
                display: 'inline-flex',
                gap: 3,
                px: 3,
                py: 2,
                borderRadius: '16px',
                background: kidsColors.surfaceLight,
                mb: 2,
              }}
            >
              <Box>
                <Typography
                  variant="h4"
                  sx={{color: kidsColors.correct, fontWeight: 800}}
                >
                  {goodCount}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{color: kidsColors.textMuted}}
                >
                  Good choices
                </Typography>
              </Box>
              <Box>
                <Typography
                  variant="h4"
                  sx={{color: kidsColors.textPrimary, fontWeight: 800}}
                >
                  {totalDec}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{color: kidsColors.textMuted}}
                >
                  Total
                </Typography>
              </Box>
            </Box>

            {/* Decision recap */}
            <Box sx={{mt: 2, textAlign: 'left'}}>
              {decisions.map((d, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    mb: 0.8,
                    px: 1.5,
                    py: 0.8,
                    borderRadius: '10px',
                    background: d.isGood
                      ? `${kidsColors.correct}10`
                      : `${kidsColors.incorrect}10`,
                  }}
                >
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: d.isGood
                        ? kidsColors.correct
                        : kidsColors.incorrect,
                      flexShrink: 0,
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      color: d.isGood
                        ? kidsColors.correct
                        : kidsColors.incorrect,
                      fontWeight: 500,
                      fontSize: '0.85rem',
                    }}
                  >
                    {d.choiceText}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Card>
        </Box>
      </Fade>
    );
  }

  // ── render active story ────────────────────────────────────────
  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 600,
        mx: 'auto',
        p: {xs: 2, sm: 3},
        ...kidsAnimations.fadeInUp,
      }}
    >
      {/* Decision counter */}
      <Box
        sx={{display: 'flex', justifyContent: 'space-between', mb: 2, px: 1}}
      >
        <Typography variant="caption" sx={{color: kidsColors.textMuted}}>
          Decisions: {decisions.length}
        </Typography>
        <ProgressStars
          current={score}
          total={Math.max(totalChoices, 1)}
          streak={streak}
        />
      </Box>

      {/* Narrative text card */}
      <Card
        elevation={0}
        onClick={handleSkipTypewriter}
        sx={{
          background: kidsColors.cardBg,
          backdropFilter: 'blur(16px)',
          border: `1px solid ${kidsColors.cardBorder}`,
          borderRadius: '24px',
          boxShadow: kidsColors.shadowCard,
          p: {xs: 3, sm: 4},
          mb: 3,
          cursor: isTyping ? 'pointer' : 'default',
          minHeight: 120,
          position: 'relative',
        }}
      >
        {/* Scene icon */}
        {scene.icon && (
          <Typography
            sx={{
              fontSize: '2rem',
              textAlign: 'center',
              mb: 1.5,
              animation: 'float 3s infinite ease-in-out',
              ...kidsAnimations.float,
            }}
          >
            {scene.icon}
          </Typography>
        )}

        {/* Typewriter text */}
        <Typography
          variant="body1"
          sx={{
            color: kidsColors.textPrimary,
            lineHeight: 1.9,
            fontWeight: 500,
            fontSize: {xs: '1rem', sm: '1.1rem'},
          }}
        >
          {displayedText}
          {isTyping && (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                bgcolor: kidsColors.primary,
                ml: 0.5,
                animation: 'blink 0.8s infinite',
                verticalAlign: 'text-bottom',
                '@keyframes blink': {
                  '0%, 50%': {opacity: 1},
                  '51%, 100%': {opacity: 0},
                },
              }}
            />
          )}
        </Typography>

        {/* Tap to skip hint */}
        {isTyping && (
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              bottom: 8,
              right: 16,
              color: kidsColors.textMuted,
              fontStyle: 'italic',
              fontSize: '0.7rem',
            }}
          >
            Tap to skip
          </Typography>
        )}
      </Card>

      {/* Choice buttons */}
      {showChoices && sceneChoices.length > 0 && (
        <Box
          role="radiogroup"
          aria-label="Story choices"
          sx={{display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2}}
        >
          {sceneChoices.map((choice, idx) => {
            const color = CHOICE_COLORS[idx % CHOICE_COLORS.length];
            const isFeedback = choiceFeedback?.index === idx;
            const isGood = choice.isGood ?? true;

            return (
              <Grow
                in
                key={`${currentSceneId}-${idx}`}
                timeout={400 + idx * 150}
              >
                <Button
                  fullWidth
                  variant="outlined"
                  role="radio"
                  aria-label={`Choice: ${choice.text}`}
                  aria-checked={choiceFeedback?.index === idx}
                  tabIndex={0}
                  onClick={() => handleChoice(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleChoice(idx);
                    }
                  }}
                  disabled={choiceFeedback !== null}
                  sx={{
                    borderRadius: '16px',
                    fontWeight: 600,
                    fontSize: {xs: '1rem', sm: '1.1rem'},
                    textTransform: 'none',
                    py: {xs: 2, sm: 2.5},
                    px: 2.5,
                    minHeight: 48,
                    border: `2px solid ${
                      isFeedback
                        ? isGood
                          ? kidsColors.correct
                          : kidsColors.incorrect
                        : `${color}80`
                    }`,
                    color: isFeedback
                      ? isGood
                        ? kidsColors.correct
                        : kidsColors.incorrect
                      : kidsColors.textPrimary,
                    background: isFeedback
                      ? isGood
                        ? kidsColors.correctBg
                        : kidsColors.incorrectBg
                      : `${color}25`,
                    boxShadow: isFeedback
                      ? isGood
                        ? kidsColors.glowCorrect
                        : kidsColors.glowIncorrect
                      : 'none',
                    transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    lineHeight: 1.4,
                    opacity: choiceFeedback !== null && !isFeedback ? 0.35 : 1,
                    '&:hover': choiceFeedback
                      ? {}
                      : {
                          background: `${color}25`,
                          borderColor: color,
                          transform: 'translateY(-2px)',
                          boxShadow: `0 6px 20px ${color}25`,
                        },
                  }}
                >
                  {choice.text}
                </Button>
              </Grow>
            );
          })}
        </Box>
      )}

      {/* Choice feedback text */}
      {choiceFeedback !== null && (
        <Fade in timeout={300}>
          <Box sx={{textAlign: 'center', mt: 1}}>
            {choiceFeedback.isGood ? (
              <Typography
                variant="body1"
                sx={{
                  color: kidsColors.correct,
                  fontWeight: 700,
                  animation: 'fadeInScale 0.3s ease-out',
                  ...kidsAnimations.fadeInScale,
                }}
              >
                Great choice!
              </Typography>
            ) : (
              <Typography
                variant="body1"
                sx={{
                  color: kidsColors.incorrect,
                  fontWeight: 700,
                }}
              >
                Hmm, that might not be the best choice...
              </Typography>
            )}
          </Box>
        </Fade>
      )}

      {/* Decision trail dots */}
      {decisions.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            gap: 0.8,
            mt: 2,
            flexWrap: 'wrap',
          }}
        >
          {decisions.map((d, idx) => (
            <Box
              key={idx}
              sx={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                bgcolor: d.isGood ? kidsColors.correct : kidsColors.incorrect,
                transition: 'all 0.4s ease',
              }}
            />
          ))}
          {/* Current dot */}
          <Box
            sx={{
              width: 22,
              height: 14,
              borderRadius: '5px',
              bgcolor: kidsColors.primary,
              boxShadow: kidsColors.glowPrimary,
            }}
          />
        </Box>
      )}

      <InlineCelebration type={celebType} gameTemplate="story_builder" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />
    </Box>
  );
}
