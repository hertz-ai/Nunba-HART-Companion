import {RADIUS} from '../../../../theme/socialTokens';

import {
  Box,
  Typography,
  Button,
  LinearProgress,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect, useCallback, useRef} from 'react';

// ── Colors ──
const COLOR_CORRECT = '#2ECC71';
const COLOR_INCORRECT = '#FF6B6B';
const COLOR_PRIMARY = '#6C63FF';
const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

// ── Default config ──
const DEFAULT_TIME_PER_QUESTION = 15; // seconds

export default function TriviaEngine({multiplayer, catalogEntry, onComplete}) {
  const engineConfig = catalogEntry?.engine_config || {};
  const timePerQuestion =
    engineConfig.timePerQuestion ||
    engineConfig.time_per_question ||
    DEFAULT_TIME_PER_QUESTION;

  // ── State ──
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answerState, setAnswerState] = useState('waiting'); // waiting | correct | incorrect
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(timePerQuestion);
  const [streak, setStreak] = useState(0);

  const timerRef = useRef(null);
  const advanceTimeoutRef = useRef(null);

  const currentQuestion = questions[currentIdx] || null;
  const totalQuestions = questions.length;
  const isLastQuestion = currentIdx >= totalQuestions - 1;
  const timerPercent =
    totalQuestions > 0 ? (timeLeft / timePerQuestion) * 100 : 100;

  // ── Load questions from multiplayer session state or catalog ──
  useEffect(() => {
    // Try multiplayer session state first
    const sessionQuestions =
      multiplayer?.sessionState?.questions ||
      multiplayer?.gameState?.questions ||
      catalogEntry?.engine_config?.questions ||
      catalogEntry?.questions ||
      [];

    if (sessionQuestions.length > 0) {
      setQuestions(sessionQuestions);
    }
  }, [multiplayer?.sessionState, multiplayer?.gameState, catalogEntry]);

  // ── Countdown timer ──
  useEffect(() => {
    if (questions.length === 0 || answerState !== 'waiting') return;

    setTimeLeft(timePerQuestion);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(timerRef.current);
    };
  }, [currentIdx, questions.length, answerState, timePerQuestion]);

  // ── Auto-skip when timer reaches 0 ──
  useEffect(() => {
    if (timeLeft === 0 && answerState === 'waiting' && questions.length > 0) {
      handleTimerExpired();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, answerState, questions.length]);

  // ── Clean up on unmount ──
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      clearTimeout(advanceTimeoutRef.current);
    };
  }, []);

  // ── Handle timer expiry (no answer selected) ──
  const handleTimerExpired = useCallback(() => {
    clearInterval(timerRef.current);
    setAnswerState('incorrect');
    setStreak(0);

    // Submit a timed-out move
    if (multiplayer?.submitMove) {
      multiplayer.submitMove({
        answer: null,
        time_ms: timePerQuestion * 1000,
        timed_out: true,
      });
    }

    advanceTimeoutRef.current = setTimeout(() => {
      advanceToNext();
    }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, timePerQuestion, multiplayer]);

  // ── Handle answer selection ──
  const handleSelectAnswer = useCallback(
    (answer) => {
      if (answerState !== 'waiting' || selectedAnswer !== null) return;

      clearInterval(timerRef.current);
      setSelectedAnswer(answer);

      const correctAnswer =
        currentQuestion?.a ||
        currentQuestion?.answer ||
        currentQuestion?.correct_answer;
      const isCorrect = answer === correctAnswer;
      const elapsedMs = (timePerQuestion - timeLeft) * 1000;

      if (isCorrect) {
        setAnswerState('correct');
        setScore((prev) => prev + 1);
        setStreak((prev) => prev + 1);
      } else {
        setAnswerState('incorrect');
        setStreak(0);
      }

      // Submit move to multiplayer
      if (multiplayer?.submitMove) {
        multiplayer.submitMove({
          answer,
          time_ms: elapsedMs,
          correct: isCorrect,
        });
      }

      // Advance after feedback delay
      advanceTimeoutRef.current = setTimeout(() => {
        advanceToNext();
      }, 1500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      answerState,
      selectedAnswer,
      currentQuestion,
      timePerQuestion,
      timeLeft,
      multiplayer,
    ]
  );

  // ── Advance to next question or complete ──
  const advanceToNext = useCallback(() => {
    if (isLastQuestion) {
      // Game over — submit final score
      if (multiplayer?.submitFinalScore) {
        multiplayer.submitFinalScore({correct: score, total: totalQuestions});
      }
      if (onComplete) onComplete();
    } else {
      setCurrentIdx((prev) => prev + 1);
      setSelectedAnswer(null);
      setAnswerState('waiting');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLastQuestion, score, totalQuestions, multiplayer, onComplete]);

  // ── No questions loaded yet ──
  if (questions.length === 0) {
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
          Waiting for questions...
        </Typography>
      </Box>
    );
  }

  // ── Derive option list ──
  const options = currentQuestion?.options || currentQuestion?.choices || [];
  const correctAnswer =
    currentQuestion?.a ||
    currentQuestion?.answer ||
    currentQuestion?.correct_answer;

  // ── Determine button color for each option ──
  const getOptionSx = (option) => {
    const base = {
      borderRadius: RADIUS.md,
      textTransform: 'none',
      fontSize: '1rem',
      fontWeight: 600,
      py: 2,
      px: 3,
      justifyContent: 'flex-start',
      border: '2px solid',
      borderColor: 'rgba(108,99,255,0.25)',
      color: '#fff',
      bgcolor: 'rgba(108,99,255,0.08)',
      transition: 'all 0.2s ease',
      '&:hover': {
        bgcolor: 'rgba(108,99,255,0.18)',
        borderColor: COLOR_PRIMARY,
      },
    };

    if (answerState === 'waiting') return base;

    // After answer is revealed
    if (option === correctAnswer) {
      return {
        ...base,
        bgcolor: COLOR_CORRECT,
        borderColor: COLOR_CORRECT,
        color: '#fff',
        '&:hover': {},
      };
    }
    if (option === selectedAnswer && answerState === 'incorrect') {
      return {
        ...base,
        bgcolor: COLOR_INCORRECT,
        borderColor: COLOR_INCORRECT,
        color: '#fff',
        '&:hover': {},
      };
    }
    return {...base, opacity: 0.4, '&:hover': {}};
  };

  return (
    <Box sx={{maxWidth: 640, mx: 'auto', py: 2}}>
      {/* ── Header: score + streak ── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="body2" sx={{color: '#aaa'}}>
          Question {currentIdx + 1} / {totalQuestions}
        </Typography>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
          {streak >= 3 && (
            <Fade in>
              <Typography
                variant="body2"
                sx={{
                  color: '#FFD700',
                  fontWeight: 700,
                  bgcolor: 'rgba(255,215,0,0.12)',
                  px: 1.5,
                  py: 0.5,
                  borderRadius: RADIUS.sm,
                }}
              >
                {streak} streak!
              </Typography>
            </Fade>
          )}
          <Typography
            variant="body1"
            sx={{color: COLOR_PRIMARY, fontWeight: 700}}
          >
            Score: {score}
          </Typography>
        </Box>
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
            bgcolor: timeLeft <= 5 ? COLOR_INCORRECT : COLOR_PRIMARY,
            transition: 'transform 1s linear, background-color 0.3s ease',
          },
        }}
      />

      {/* ── Question text ── */}
      <Fade in key={currentIdx} timeout={400}>
        <Box sx={{textAlign: 'center', mb: 4}}>
          <Typography
            variant="h5"
            sx={{
              color: '#fff',
              fontWeight: 700,
              lineHeight: 1.4,
              px: 2,
            }}
          >
            {currentQuestion?.q ||
              currentQuestion?.question ||
              currentQuestion?.text ||
              ''}
          </Typography>
          {currentQuestion?.difficulty && (
            <Typography
              variant="caption"
              sx={{color: '#888', mt: 1, display: 'block'}}
            >
              Difficulty: {currentQuestion.difficulty}
            </Typography>
          )}
        </Box>
      </Fade>

      {/* ── Options 2x2 grid ── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {xs: '1fr', sm: '1fr 1fr'},
          gap: 2,
        }}
      >
        {options.map((option, idx) => (
          <Grow in key={`${currentIdx}-${idx}`} timeout={300 + idx * 100}>
            <Button
              fullWidth
              variant="outlined"
              disabled={answerState !== 'waiting'}
              onClick={() => handleSelectAnswer(option)}
              sx={getOptionSx(option)}
            >
              <Box
                component="span"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.1)',
                  mr: 1.5,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {OPTION_LETTERS[idx] || idx + 1}
              </Box>
              {option}
            </Button>
          </Grow>
        ))}
      </Box>

      {/* ── Time left text ── */}
      <Typography
        variant="body2"
        sx={{
          textAlign: 'center',
          mt: 3,
          color: timeLeft <= 5 ? COLOR_INCORRECT : '#888',
          fontWeight: timeLeft <= 5 ? 700 : 400,
          transition: 'color 0.3s ease',
        }}
      >
        {timeLeft}s remaining
      </Typography>
    </Box>
  );
}
