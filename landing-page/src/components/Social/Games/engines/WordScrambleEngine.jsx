import {RADIUS, GRADIENTS} from '../../../../theme/socialTokens';
import {animFadeInUp, animFadeInScale} from '../../../../utils/animations';

import {
  Box,
  Typography,
  Button,
  Grid,
  TextField,
  LinearProgress,
  Fade,
  Grow,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useCallback, useRef} from 'react';

// ── Colors ──
const COLOR_BG = '#0F0E17';
const COLOR_PRIMARY = '#6C63FF';
const COLOR_CORRECT = '#2ECC71';
const COLOR_INCORRECT = '#FF6B6B';
const COLOR_WARNING = '#FFAB00';
const COLOR_CELL_BG = '#1a1a2e';

// ── Built-in word list for local play ──
const BUILTIN_WORDS = [
  'PLANET',
  'STREAM',
  'GARDEN',
  'BRIDGE',
  'CASTLE',
  'FOREST',
  'MARKET',
  'ROCKET',
  'FROZEN',
  'SPIRIT',
  'BREEZE',
  'CANDLE',
  'PUZZLE',
  'SUNSET',
  'VOYAGE',
  'HARBOR',
  'MEADOW',
  'KNIGHT',
  'DRAGON',
  'FALCON',
  'GLIDER',
  'ISLAND',
  'JUNGLE',
  'KITTEN',
  'LEMON',
  'MANGO',
  'OLIVE',
  'PEACH',
  'RAVEN',
  'TIGER',
  'WHALE',
  'ZEBRA',
  'CORAL',
  'DELTA',
  'EMBER',
  'FLAME',
];

// ── Helpers ──
function scrambleWord(word) {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  // Ensure scrambled version is different from original
  if (letters.join('') === word && word.length > 1) {
    [letters[0], letters[1]] = [letters[1], letters[0]];
  }
  return letters.join('');
}

function generateLocalRounds(count = 5) {
  const shuffled = [...BUILTIN_WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((word) => ({
    word,
    scrambled: scrambleWord(word),
    solved_by: null,
  }));
}

// ── Jiggle animation keyframes ──
const jiggleKeyframes = {
  '@keyframes jiggle': {
    '0%, 100%': {transform: 'rotate(0deg) translateY(0)'},
    '25%': {transform: 'rotate(-3deg) translateY(-2px)'},
    '50%': {transform: 'rotate(2deg) translateY(1px)'},
    '75%': {transform: 'rotate(-1deg) translateY(-1px)'},
  },
};

const shakeKeyframes = {
  '@keyframes shake': {
    '0%, 100%': {transform: 'translateX(0)'},
    '20%': {transform: 'translateX(-8px)'},
    '40%': {transform: 'translateX(8px)'},
    '60%': {transform: 'translateX(-6px)'},
    '80%': {transform: 'translateX(6px)'},
  },
};

const successFlashKeyframes = {
  '@keyframes successFlash': {
    '0%': {boxShadow: `0 0 0 0 ${alpha(COLOR_CORRECT, 0.6)}`},
    '50%': {boxShadow: `0 0 30px 10px ${alpha(COLOR_CORRECT, 0.3)}`},
    '100%': {boxShadow: `0 0 0 0 ${alpha(COLOR_CORRECT, 0)}`},
  },
};

export default function WordScrambleEngine({
  multiplayer,
  catalogEntry,
  onComplete,
}) {
  const engineConfig = catalogEntry?.engine_config || {};
  const defaultRoundTime = engineConfig.round_time || 30;

  // ── State ──
  const [rounds, setRounds] = useState([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [guess, setGuess] = useState('');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(defaultRoundTime);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'incorrect' | null
  const [showHint, setShowHint] = useState(false);
  const [roundStartTime, setRoundStartTime] = useState(Date.now());
  const [gameFinished, setGameFinished] = useState(false);

  const timerRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const currentRound = rounds[currentRoundIdx] || null;
  const totalRounds = rounds.length;
  const roundTime =
    multiplayer?.gameState?.round_time ||
    multiplayer?.sessionState?.round_time ||
    defaultRoundTime;

  // ── Load rounds from multiplayer or generate locally ──
  useEffect(() => {
    const state = multiplayer?.gameState || multiplayer?.sessionState;
    if (state?.rounds && state.rounds.length > 0) {
      setRounds(state.rounds);
      if (state.current_round_idx != null) {
        setCurrentRoundIdx(state.current_round_idx);
      }
    } else {
      setRounds(generateLocalRounds(engineConfig.round_count || 5));
    }
  }, [
    multiplayer?.gameState,
    multiplayer?.sessionState,
    engineConfig.round_count,
  ]);

  // ── Countdown timer ──
  useEffect(() => {
    if (rounds.length === 0 || gameFinished) return;

    setTimeLeft(roundTime);
    setRoundStartTime(Date.now());
    setShowHint(false);
    setGuess('');
    setFeedback(null);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [currentRoundIdx, rounds.length, roundTime, gameFinished]);

  // ── Show hint after 15 seconds ──
  useEffect(() => {
    const elapsed = roundTime - timeLeft;
    if (elapsed >= 15 && !showHint && currentRound) {
      setShowHint(true);
    }
  }, [timeLeft, roundTime, showHint, currentRound]);

  // ── Auto-skip on timer expiry ──
  useEffect(() => {
    if (
      timeLeft === 0 &&
      rounds.length > 0 &&
      !gameFinished &&
      feedback === null
    ) {
      handleTimeUp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, rounds.length, gameFinished, feedback]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  // ── Handle time running out ──
  const handleTimeUp = useCallback(() => {
    clearInterval(timerRef.current);
    setFeedback('incorrect');

    if (multiplayer?.submitMove) {
      multiplayer.submitMove({
        word: null,
        time_ms: roundTime * 1000,
        timed_out: true,
      });
    }

    feedbackTimeoutRef.current = setTimeout(() => {
      advanceRound();
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoundIdx, roundTime, multiplayer]);

  // ── Submit guess ──
  const handleSubmit = useCallback(() => {
    if (!currentRound || feedback !== null || guess.trim() === '') return;

    const normalizedGuess = guess.trim().toUpperCase();
    const correctWord = (currentRound.word || '').toUpperCase();
    const elapsedMs = Date.now() - roundStartTime;
    const isCorrect = normalizedGuess === correctWord;

    if (isCorrect) {
      clearInterval(timerRef.current);
      const timeBonus = Math.max(0, Math.floor((timeLeft / roundTime) * 20));
      setScore((prev) => prev + 10 + timeBonus);
      setFeedback('correct');

      if (multiplayer?.submitMove) {
        multiplayer.submitMove({
          word: normalizedGuess,
          time_ms: elapsedMs,
          correct: true,
        });
      }

      feedbackTimeoutRef.current = setTimeout(() => {
        advanceRound();
      }, 1500);
    } else {
      setScore((prev) => Math.max(0, prev - 2));
      setFeedback('incorrect');

      if (multiplayer?.submitMove) {
        multiplayer.submitMove({
          word: normalizedGuess,
          time_ms: elapsedMs,
          correct: false,
        });
      }

      feedbackTimeoutRef.current = setTimeout(() => {
        setFeedback(null);
        setGuess('');
        if (inputRef.current) inputRef.current.focus();
      }, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    guess,
    currentRound,
    feedback,
    roundStartTime,
    timeLeft,
    roundTime,
    multiplayer,
  ]);

  // ── Advance to next round or finish ──
  const advanceRound = useCallback(() => {
    if (currentRoundIdx >= totalRounds - 1) {
      setGameFinished(true);
      if (multiplayer?.submitFinalScore) {
        multiplayer.submitFinalScore({score, total_rounds: totalRounds});
      }
      if (onComplete) onComplete();
    } else {
      setCurrentRoundIdx((prev) => prev + 1);
      setFeedback(null);
      setGuess('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoundIdx, totalRounds, score, multiplayer, onComplete]);

  // ── Key handler for Enter ──
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // ── No rounds yet ──
  if (rounds.length === 0) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 300,
        }}
      >
        <Typography variant="body1" sx={{color: '#aaa'}}>
          Preparing word scramble...
        </Typography>
      </Box>
    );
  }

  // ── Game finished ──
  if (gameFinished) {
    return (
      <Fade in timeout={500}>
        <Box
          sx={{
            maxWidth: 500,
            mx: 'auto',
            py: 4,
            textAlign: 'center',
            ...animFadeInScale(),
          }}
        >
          <Typography variant="h4" sx={{color: '#fff', fontWeight: 700, mb: 2}}>
            Game Over!
          </Typography>
          <Typography
            variant="h5"
            sx={{color: COLOR_PRIMARY, fontWeight: 700, mb: 3}}
          >
            Final Score: {score}
          </Typography>
          <Button
            variant="contained"
            onClick={onComplete}
            sx={{
              bgcolor: COLOR_PRIMARY,
              borderRadius: RADIUS.md,
              px: 4,
              py: 1.5,
              fontWeight: 700,
              '&:hover': {bgcolor: '#5A52E0'},
            }}
          >
            Back to Games
          </Button>
        </Box>
      </Fade>
    );
  }

  const scrambledLetters = (currentRound?.scrambled || '').split('');
  const timerPercent = (timeLeft / roundTime) * 100;

  return (
    <Box sx={{maxWidth: 640, mx: 'auto', py: 2}}>
      {/* ── Header: round indicator + score ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="body2" sx={{color: '#aaa'}}>
          Round {currentRoundIdx + 1} / {totalRounds}
        </Typography>
        <Typography
          variant="body1"
          sx={{color: COLOR_PRIMARY, fontWeight: 700}}
        >
          Score: {score}
        </Typography>
      </Box>

      {/* ── Timer bar ── */}
      <LinearProgress
        variant="determinate"
        value={timerPercent}
        sx={{
          height: 6,
          borderRadius: '3px',
          mb: 3,
          bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': {
            bgcolor:
              timeLeft <= 5
                ? COLOR_INCORRECT
                : timeLeft <= 10
                  ? COLOR_WARNING
                  : COLOR_PRIMARY,
            transition: 'transform 1s linear, background-color 0.3s ease',
          },
        }}
      />

      {/* ── Timer text ── */}
      <Typography
        variant="body2"
        sx={{
          textAlign: 'center',
          mb: 3,
          color:
            timeLeft <= 5
              ? COLOR_INCORRECT
              : timeLeft <= 10
                ? COLOR_WARNING
                : '#888',
          fontWeight: timeLeft <= 10 ? 700 : 400,
          transition: 'color 0.3s ease',
        }}
      >
        {timeLeft}s remaining
      </Typography>

      {/* ── Scrambled letters ── */}
      <Fade in key={currentRoundIdx} timeout={400}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 1.5,
            mb: 4,
            ...(feedback === 'correct' ? successFlashKeyframes : {}),
            animation:
              feedback === 'correct' ? 'successFlash 0.8s ease' : 'none',
          }}
        >
          {scrambledLetters.map((letter, idx) => (
            <Grow in key={`${currentRoundIdx}-${idx}`} timeout={200 + idx * 80}>
              <Box
                sx={{
                  width: {xs: 48, sm: 56},
                  height: {xs: 56, sm: 64},
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor:
                    feedback === 'correct'
                      ? alpha(COLOR_CORRECT, 0.2)
                      : COLOR_CELL_BG,
                  border: `2px solid ${
                    feedback === 'correct'
                      ? COLOR_CORRECT
                      : alpha(COLOR_PRIMARY, 0.3)
                  }`,
                  borderRadius: RADIUS.md,
                  ...jiggleKeyframes,
                  animation:
                    feedback === null
                      ? `jiggle ${1.5 + Math.random() * 0.5}s ease-in-out ${idx * 0.1}s infinite`
                      : 'none',
                  transition: 'all 0.3s ease',
                }}
              >
                <Typography
                  variant="h4"
                  sx={{
                    color: feedback === 'correct' ? COLOR_CORRECT : '#fff',
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    fontSize: {xs: '1.5rem', sm: '1.8rem'},
                    userSelect: 'none',
                  }}
                >
                  {letter}
                </Typography>
              </Box>
            </Grow>
          ))}
        </Box>
      </Fade>

      {/* ── Hint ── */}
      {showHint && currentRound && (
        <Fade in timeout={400}>
          <Typography
            variant="body2"
            sx={{
              textAlign: 'center',
              mb: 2,
              color: COLOR_WARNING,
              fontWeight: 600,
            }}
          >
            Hint: Starts with "{currentRound.word[0]}" and ends with "
            {currentRound.word[currentRound.word.length - 1]}"
          </Typography>
        </Fade>
      )}

      {/* ── Input area ── */}
      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          maxWidth: 400,
          mx: 'auto',
          ...shakeKeyframes,
          animation: feedback === 'incorrect' ? 'shake 0.5s ease' : 'none',
        }}
      >
        <TextField
          inputRef={inputRef}
          value={guess}
          onChange={(e) => setGuess(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          placeholder="Type your guess..."
          disabled={feedback === 'correct'}
          autoFocus
          fullWidth
          variant="outlined"
          sx={{
            '& .MuiOutlinedInput-root': {
              color: '#fff',
              fontWeight: 700,
              fontSize: '1.1rem',
              letterSpacing: '0.05em',
              fontFamily: 'monospace',
              bgcolor: alpha(COLOR_PRIMARY, 0.06),
              borderRadius: RADIUS.md,
              '& fieldset': {
                borderColor:
                  feedback === 'incorrect'
                    ? COLOR_INCORRECT
                    : feedback === 'correct'
                      ? COLOR_CORRECT
                      : alpha(COLOR_PRIMARY, 0.3),
                borderWidth: 2,
                transition: 'border-color 0.3s ease',
              },
              '&:hover fieldset': {
                borderColor: COLOR_PRIMARY,
              },
              '&.Mui-focused fieldset': {
                borderColor: COLOR_PRIMARY,
              },
            },
            '& .MuiInputBase-input::placeholder': {
              color: '#666',
              opacity: 1,
            },
          }}
        />
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={guess.trim() === '' || feedback === 'correct'}
          sx={{
            bgcolor: COLOR_PRIMARY,
            borderRadius: RADIUS.md,
            px: 3,
            fontWeight: 700,
            minWidth: 100,
            '&:hover': {bgcolor: '#5A52E0'},
            '&.Mui-disabled': {
              bgcolor: alpha(COLOR_PRIMARY, 0.3),
              color: alpha('#fff', 0.4),
            },
          }}
        >
          Submit
        </Button>
      </Box>

      {/* ── Feedback text ── */}
      {feedback === 'correct' && (
        <Fade in timeout={300}>
          <Typography
            variant="h6"
            sx={{
              textAlign: 'center',
              mt: 3,
              color: COLOR_CORRECT,
              fontWeight: 700,
              ...animFadeInUp(),
            }}
          >
            Correct! +
            {Math.max(0, Math.floor((timeLeft / roundTime) * 20)) + 10} points
          </Typography>
        </Fade>
      )}
      {feedback === 'incorrect' && timeLeft > 0 && (
        <Fade in timeout={300}>
          <Typography
            variant="body1"
            sx={{
              textAlign: 'center',
              mt: 2,
              color: COLOR_INCORRECT,
              fontWeight: 600,
            }}
          >
            Not quite! -2 points. Try again.
          </Typography>
        </Fade>
      )}
      {feedback === 'incorrect' && timeLeft === 0 && (
        <Fade in timeout={300}>
          <Typography
            variant="body1"
            sx={{
              textAlign: 'center',
              mt: 2,
              color: COLOR_INCORRECT,
              fontWeight: 600,
            }}
          >
            Time's up! The word was "{currentRound?.word}"
          </Typography>
        </Fade>
      )}
    </Box>
  );
}
