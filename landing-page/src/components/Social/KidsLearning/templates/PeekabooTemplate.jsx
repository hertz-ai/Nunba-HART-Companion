/**
 * PeekabooTemplate - Voice-Activated Peekaboo Game
 *
 * A character hides behind one of several hiding spots. The child
 * must say "peekaboo" or make a loud sound to reveal the character.
 * Then they tap or say where the character is hiding.
 * Builds voice control, observation, and hand-eye coordination.
 *
 * Config shape (matches mobile peekabooGames.js):
 *   {
 *     questions: [{
 *       hidingSpots: string[],   // emojis for hiding spots
 *       rounds: number,
 *       peekTimeout: number,     // 0 = no auto-reveal
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
import VisibilityIcon from '@mui/icons-material/Visibility';
import {Box, Typography, Button, Fade, Grow, IconButton} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const FEEDBACK_DELAY = 1400;
const PEEK_THRESHOLD = 0.35; // Amplitude to trigger reveal
const CHARACTER_EMOJIS = ['🐻', '🐱', '🐶', '🐸', '🦊', '🐼', '🐨', '🐰'];

export default function PeekabooTemplate({config, onAnswer, onComplete}) {
  const questionConfig = config?.questions?.[0] || config?.content?.questions?.[0] || {};
  const hidingSpots = questionConfig.hidingSpots || ['📦', '🛋️', '🪴'];
  const totalRounds = questionConfig.rounds || 8;

  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [phase, setPhase] = useState('hiding'); // hiding, peeking, guessing, feedback
  const [hideIndex, setHideIndex] = useState(0);
  const [peekRevealed, setPeekRevealed] = useState(false);
  const [characterEmoji, setCharacterEmoji] = useState('🐻');

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());

  const {amplitude, startListening: startMic, stopListening: stopMic} = useMicAmplitude(2.0);
  const {
    transcript,
    isListening,
    startListening: startSTT,
    stopListening: stopSTT,
    resetTranscript,
  } = useSpeechRecognition({language: 'en'});

  // Pick random hiding spot on new round
  useEffect(() => {
    const idx = Math.floor(Math.random() * hidingSpots.length);
    setHideIndex(idx);
    setCharacterEmoji(CHARACTER_EMOJIS[round % CHARACTER_EMOJIS.length]);
    setPeekRevealed(false);
    setPhase('hiding');
    startTimeRef.current = Date.now();
  }, [round, hidingSpots]);

  // Detect loud sound to reveal
  useEffect(() => {
    if (phase === 'hiding' && amplitude > PEEK_THRESHOLD) {
      setPeekRevealed(true);
      setPhase('peeking');
      try { GameSounds.correct(); } catch (_) {}

      // Brief peek then hide again for guessing
      setTimeout(() => {
        setPeekRevealed(false);
        setPhase('guessing');
      }, 1200);
    }
  }, [phase, amplitude]);

  const handlePeekaboo = useCallback(async () => {
    if (phase !== 'hiding') return;
    await startMic();
  }, [phase, startMic]);

  const handleGuess = useCallback((spotIdx) => {
    if (phase !== 'guessing' && phase !== 'peeking') return;
    const isCorrect = spotIdx === hideIndex;
    const responseTime = Date.now() - startTimeRef.current;

    setShowFeedback(true);
    setFeedbackCorrect(isCorrect);
    setPhase('feedback');
    stopMic();

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

    const concept = `peekaboo:round-${round}`;
    setResults((r) => [...r, {concept, correct: isCorrect, responseTime}]);
    if (onAnswer) onAnswer(isCorrect, concept, responseTime);

    setTimeout(() => {
      if (round + 1 >= totalRounds) {
        const finalScore = isCorrect ? score + 1 : score;
        triggerComplete();
        if (onComplete) {
          onComplete({score: finalScore, correct: finalScore, total: totalRounds, results: [...results, {concept, correct: isCorrect, responseTime}], bestStreak});
        }
      } else {
        setRound((r) => r + 1);
        setShowFeedback(false);
      }
    }, FEEDBACK_DELAY);
  }, [phase, hideIndex, round, totalRounds, score, results, bestStreak, stopMic, onAnswer, onComplete, triggerCorrect, triggerComplete]);

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="peekaboo" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Round counter */}
      <Typography variant="body2" sx={{color: kidsColors.textSecondary}}>
        Round {round + 1} of {totalRounds}
      </Typography>

      {/* Character */}
      <Fade in timeout={300}>
        <Typography sx={{fontSize: 48, opacity: peekRevealed ? 1 : 0, transition: 'opacity 0.3s'}}>
          {characterEmoji}
        </Typography>
      </Fade>

      {/* Instruction */}
      <Typography variant="h6" sx={{fontWeight: 700, color: kidsColors.textPrimary, textAlign: 'center'}}>
        {phase === 'hiding' && 'Say "Peekaboo!" loudly to find me!'}
        {phase === 'peeking' && 'I\'m here! Remember where I am!'}
        {phase === 'guessing' && 'Where was I hiding? Tap to guess!'}
        {phase === 'feedback' && (feedbackCorrect ? 'You found me!' : 'Not there! Try next time!')}
      </Typography>

      {/* Hiding spots */}
      <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', my: 2}}>
        {hidingSpots.map((spot, idx) => (
          <Box
            key={idx}
            onClick={() => handleGuess(idx)}
            sx={{
              width: 80, height: 80,
              borderRadius: '16px',
              bgcolor: showFeedback && idx === hideIndex ? '#E8F5E9' :
                       showFeedback && feedbackCorrect ? kidsColors.card :
                       kidsColors.card,
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: phase === 'guessing' ? 'pointer' : 'default',
              transform: (peekRevealed && idx === hideIndex) ? 'scale(1.15)' : 'scale(1)',
              transition: 'all 0.2s',
              border: showFeedback && idx === hideIndex ? `3px solid ${kidsColors.green}` : '3px solid transparent',
              '&:hover': phase === 'guessing' ? {transform: 'scale(1.1)', boxShadow: '0 6px 16px rgba(0,0,0,0.12)'} : {},
              position: 'relative',
            }}
          >
            <Typography sx={{fontSize: 40}}>{spot}</Typography>
            {/* Show character peeking */}
            {peekRevealed && idx === hideIndex && (
              <Typography sx={{position: 'absolute', top: -20, fontSize: 28}}>
                {characterEmoji}
              </Typography>
            )}
          </Box>
        ))}
      </Box>

      {/* Mic prompt for hiding phase */}
      {phase === 'hiding' && (
        <Box sx={{textAlign: 'center'}}>
          <IconButton
            onClick={handlePeekaboo}
            sx={{
              width: 72, height: 72,
              bgcolor: kidsColors.primary,
              color: '#fff',
              '&:hover': {bgcolor: '#5A52D5'},
              mb: 1,
            }}
          >
            <MicIcon sx={{fontSize: 36}} />
          </IconButton>
          <Box sx={{width: 120, height: 8, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden', mx: 'auto'}}>
            <Box sx={{width: `${amplitude * 100}%`, height: '100%', bgcolor: amplitude > PEEK_THRESHOLD ? kidsColors.orange : kidsColors.primary, transition: 'width 0.05s'}} />
          </Box>
        </Box>
      )}

      {/* Feedback */}
      {showFeedback && (
        <Grow in>
          <Typography variant="h5" sx={{fontWeight: 700, color: feedbackCorrect ? kidsColors.green : '#E74C3C'}}>
            {feedbackCorrect ? 'Found me!' : `I was behind ${hidingSpots[hideIndex]}`}
          </Typography>
        </Grow>
      )}
    </Box>
  );
}
