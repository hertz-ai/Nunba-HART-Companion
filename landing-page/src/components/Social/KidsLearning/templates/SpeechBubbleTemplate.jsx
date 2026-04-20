/**
 * SpeechBubbleTemplate - Voice-Activated Spelling with Floating Bubbles
 *
 * Letter bubbles float on screen. The child says a word and the matching
 * letter bubbles pop in sequence, spelling out the word. Combines speech
 * recognition with visual letter-by-letter feedback.
 *
 * Config shape (matches mobile speechBubbleGames.js):
 *   {
 *     questions: [{
 *       word: string,
 *       hint: string,
 *     }]
 *   }
 *
 * Props:
 *   config     - see above
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import useMicAmplitude from '../../../../hooks/useMicAmplitude';
import useSpeechRecognition from '../../../../hooks/useSpeechRecognition';
import {kidsColors} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import {GameSounds} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import {Box, Typography, Button, Card, Fade, Grow, IconButton} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';


const FEEDBACK_DELAY = 1800;
const BUBBLE_COLORS = ['#6C63FF', '#FF6B6B', '#4ECDC4', '#FF9F43', '#E040FB', '#2ECC71', '#0984E3'];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function SpeechBubbleTemplate({config, onAnswer, onComplete}) {
  const questions = config?.questions || config?.content?.questions || [];
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [revealedLetters, setRevealedLetters] = useState([]);
  const [allRevealed, setAllRevealed] = useState(false);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());
  const currentQuestion = questions[currentIndex];
  const word = (currentQuestion?.word || '').toUpperCase();

  const {amplitude} = useMicAmplitude(1.5);
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
  } = useSpeechRecognition({
    language: 'en',
    onResult: (text) => handleSpeechResult(text),
  });

  // Create shuffled bubble positions
  const bubblePositions = useMemo(() => {
    if (!word) return [];
    const letters = word.split('');
    // Add some extra random letters
    const extras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => !letters.includes(l));
    const extraCount = Math.min(4, extras.length);
    const shuffledExtras = shuffleArray(extras).slice(0, extraCount);
    const allLetters = shuffleArray([...letters, ...shuffledExtras]);

    return allLetters.map((letter, i) => ({
      letter,
      id: `${letter}-${i}`,
      isTarget: letters.includes(letter),
      x: 20 + (i % 5) * 60 + Math.random() * 20,
      y: 20 + Math.floor(i / 5) * 70 + Math.random() * 20,
      color: BUBBLE_COLORS[i % BUBBLE_COLORS.length],
      popped: false,
    }));
  }, [word]);

  const handleSpeechResult = useCallback(
    (text) => {
      if (!currentQuestion || showFeedback) return;
      const spoken = text.toUpperCase().trim();
      const isCorrect = spoken.includes(word) || word.includes(spoken);

      if (isCorrect) {
        // Reveal letters one by one
        const letters = word.split('');
        letters.forEach((letter, i) => {
          setTimeout(() => {
            setRevealedLetters((prev) => [...prev, letter]);
            if (i === letters.length - 1) {
              setAllRevealed(true);
            }
          }, i * 200);
        });
      }

      const responseTime = Date.now() - startTimeRef.current;

      // Delay feedback to allow letter reveal animation
      setTimeout(() => {
        setShowFeedback(true);
        setFeedbackCorrect(isCorrect);
        stopListening();

        if (isCorrect) {
          setScore((s) => s + 1);
          setStreak((s) => {
            const ns = s + 1;
            setBestStreak((b) => Math.max(b, ns));
            return ns;
          });
          try { GameSounds.correct(); } catch (_) {}
          triggerCorrect();
        } else {
          setStreak(0);
          try { GameSounds.wrong(); } catch (_) {}
        }

        const concept = `speech-bubble:${currentQuestion.word}`;
        setResults((r) => [...r, {concept, correct: isCorrect, responseTime}]);
        if (onAnswer) onAnswer(isCorrect, concept, responseTime);

        setTimeout(() => {
          if (currentIndex + 1 >= total) {
            const finalScore = isCorrect ? score + 1 : score;
            triggerComplete();
            if (onComplete) {
              onComplete({score: finalScore, correct: finalScore, total, results: [...results, {concept, correct: isCorrect, responseTime}], bestStreak});
            }
          } else {
            setCurrentIndex((i) => i + 1);
            setShowFeedback(false);
            setRevealedLetters([]);
            setAllRevealed(false);
            resetTranscript();
            startTimeRef.current = Date.now();
          }
        }, FEEDBACK_DELAY);
      }, isCorrect ? word.length * 200 + 300 : 100);
    },
    [currentQuestion, word, showFeedback, currentIndex, total, score, results, bestStreak,
     stopListening, resetTranscript, onAnswer, onComplete, triggerCorrect, triggerComplete]
  );

  const handleMicToggle = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      resetTranscript();
      startListening({language: 'en'});
      startTimeRef.current = Date.now();
    }
  }, [isListening, startListening, stopListening, resetTranscript]);

  const handleSpeak = useCallback(() => {
    if (currentQuestion) {
      try { GameSounds.speakText(currentQuestion.word); } catch (_) {}
    }
  }, [currentQuestion]);

  if (!currentQuestion) return null;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="speechbubble" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Hint */}
      <Typography variant="body1" sx={{color: kidsColors.textSecondary, textAlign: 'center', maxWidth: 300}}>
        {currentQuestion.hint}
      </Typography>

      {/* Word slots */}
      <Box sx={{display: 'flex', gap: 1, mb: 1}}>
        {word.split('').map((letter, i) => {
          const revealed = revealedLetters.length > i;
          return (
            <Box key={i} sx={{
              width: 40, height: 48,
              borderRadius: '8px',
              border: `2px solid ${revealed ? kidsColors.green : kidsColors.textMuted}`,
              bgcolor: revealed ? '#E8F5E9' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.3s',
              transform: revealed ? 'scale(1.1)' : 'scale(1)',
            }}>
              <Typography variant="h6" sx={{fontWeight: 800, color: revealed ? kidsColors.green : 'transparent'}}>
                {letter}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Bubble field */}
      <Box sx={{
        position: 'relative',
        width: 320, height: 200,
        borderRadius: '16px',
        bgcolor: kidsColors.surfaceLight,
        overflow: 'hidden',
      }}>
        {bubblePositions.map((bubble) => {
          const isPopped = allRevealed && bubble.isTarget;
          return (
            <Box key={bubble.id} sx={{
              position: 'absolute',
              left: bubble.x, top: bubble.y,
              width: 44, height: 44,
              borderRadius: '50%',
              bgcolor: isPopped ? 'transparent' : bubble.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: isPopped ? 0 : 1,
              transform: isPopped ? 'scale(1.5)' : `scale(${1 + amplitude * 0.15})`,
              transition: 'all 0.3s',
              boxShadow: isPopped ? 'none' : `0 2px 8px ${bubble.color}40`,
            }}>
              <Typography sx={{fontWeight: 700, color: '#fff', fontSize: '1.1rem'}}>
                {bubble.letter}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Listen button */}
      <IconButton onClick={handleSpeak} sx={{color: kidsColors.blue}}>
        <VolumeUpIcon sx={{fontSize: 28}} />
      </IconButton>

      {/* Mic button */}
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
        <Box sx={{position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          <Box sx={{
            position: 'absolute',
            width: 64 + amplitude * 24,
            height: 64 + amplitude * 24,
            borderRadius: '50%',
            bgcolor: isListening ? 'rgba(108,99,255,0.12)' : 'transparent',
            transition: 'all 0.1s',
          }} />
          <IconButton
            onClick={handleMicToggle}
            disabled={showFeedback}
            sx={{
              width: 56, height: 56,
              bgcolor: isListening ? kidsColors.primary : kidsColors.blue,
              color: '#fff',
              '&:hover': {bgcolor: isListening ? '#5A52D5' : '#0770C4'},
              '&.Mui-disabled': {bgcolor: '#ccc'},
              zIndex: 1,
            }}
          >
            {isListening ? <MicIcon sx={{fontSize: 28}} /> : <MicOffIcon sx={{fontSize: 28}} />}
          </IconButton>
        </Box>
        <Typography variant="body2" sx={{color: kidsColors.textMuted}}>
          {isListening ? 'Say the word!' : 'Tap mic & say the word'}
        </Typography>
      </Box>

      {/* Transcript */}
      {transcript && (
        <Typography variant="body2" sx={{color: kidsColors.textSecondary, fontStyle: 'italic'}}>
          "{transcript}"
        </Typography>
      )}

      {/* Feedback */}
      {showFeedback && (
        <Grow in>
          <Typography variant="h5" sx={{
            fontWeight: 700,
            color: feedbackCorrect ? kidsColors.green : '#E74C3C',
          }}>
            {feedbackCorrect ? 'Bubbles popped!' : `The word is "${currentQuestion.word}"`}
          </Typography>
        </Grow>
      )}
    </Box>
  );
}
