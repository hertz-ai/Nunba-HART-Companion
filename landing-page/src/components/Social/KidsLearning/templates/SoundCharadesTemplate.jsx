/**
 * SoundCharadesTemplate - Voice-Activated Sound Imitation Game
 *
 * Shows an emoji and asks the child to make the associated sound.
 * Uses mic amplitude pattern matching (spike, sustained, rising, etc.)
 * to detect if the child made the right type of sound.
 *
 * Config shape:
 *   {
 *     content: {
 *       charades: [{
 *         emoji: string,
 *         sound: string,
 *         pattern: 'spike' | 'sustained' | 'rising' | 'rising-falling' | 'wave',
 *         label: string,
 *       }]
 *     }
 *   }
 *
 * Props:
 *   config     - see above
 *   onAnswer   - (isCorrect, concept, responseTimeMs) => void
 *   onComplete - ({ score, correct, total, results, bestStreak }) => void
 */

import useMicAmplitude from '../../../../hooks/useMicAmplitude';
import {kidsColors} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import {GameSounds} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import {Box, Typography, Button, Card, Fade, Grow, IconButton} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const FEEDBACK_DELAY = 1600;
const LISTEN_DURATION = 3000; // 3 seconds to make the sound
const AMPLITUDE_THRESHOLD = 0.15;

// Pattern detection from amplitude history
function detectPattern(history) {
  if (!history || history.length < 5) return 'none';
  const peaks = history.filter((v) => v > AMPLITUDE_THRESHOLD);
  if (peaks.length < 2) return 'none';

  const max = Math.max(...history);
  const maxIdx = history.indexOf(max);
  const firstHalf = history.slice(0, Math.floor(history.length / 2));
  const secondHalf = history.slice(Math.floor(history.length / 2));
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  // Spike: short burst then silence
  if (peaks.length < history.length * 0.3 && max > 0.4) return 'spike';
  // Rising: second half louder than first
  if (avgSecond > avgFirst * 1.5) return 'rising';
  // Rising-falling: peak in the middle
  if (maxIdx > history.length * 0.3 && maxIdx < history.length * 0.7) return 'rising-falling';
  // Wave: alternating amplitude
  let changes = 0;
  for (let i = 1; i < history.length; i++) {
    if (Math.abs(history[i] - history[i - 1]) > 0.1) changes++;
  }
  if (changes > history.length * 0.4) return 'wave';
  // Sustained: mostly above threshold
  if (peaks.length > history.length * 0.5) return 'sustained';

  return 'sustained'; // default
}

export default function SoundCharadesTemplate({config, onAnswer, onComplete}) {
  const charades = config?.content?.charades ?? [];
  const total = charades.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [recording, setRecording] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());
  const amplitudeHistoryRef = useRef([]);
  const timerRef = useRef(null);
  const sampleRef = useRef(null);

  const {amplitude, isListening, startListening, stopListening} = useMicAmplitude(2.0);

  const currentCharade = charades[currentIndex];

  // Sample amplitude while recording
  useEffect(() => {
    if (recording && isListening) {
      sampleRef.current = setInterval(() => {
        amplitudeHistoryRef.current.push(amplitude);
      }, 100);
    }
    return () => {
      if (sampleRef.current) clearInterval(sampleRef.current);
    };
  }, [recording, isListening, amplitude]);

  const evaluateSound = useCallback(() => {
    const history = amplitudeHistoryRef.current;
    const detected = detectPattern(history);
    const expected = currentCharade?.pattern || 'sustained';

    // Lenient matching: any significant sound is accepted, with bonus for pattern match
    const madeSound = history.some((v) => v > AMPLITUDE_THRESHOLD);
    const patternMatch = detected === expected;
    const isCorrect = madeSound && (patternMatch || history.filter((v) => v > AMPLITUDE_THRESHOLD).length > 3);

    const responseTime = Date.now() - startTimeRef.current;

    setShowFeedback(true);
    setFeedbackCorrect(isCorrect);

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

    const concept = `charades:${currentCharade?.label || currentIndex}`;
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
        setRecording(false);
        amplitudeHistoryRef.current = [];
        startTimeRef.current = Date.now();
      }
    }, FEEDBACK_DELAY);
  }, [currentCharade, currentIndex, total, score, results, bestStreak, onAnswer, onComplete, triggerCorrect, triggerComplete]);

  const handleRecord = useCallback(async () => {
    if (recording || showFeedback) return;
    amplitudeHistoryRef.current = [];
    setRecording(true);
    setTimeLeft(LISTEN_DURATION / 1000);
    startTimeRef.current = Date.now();

    await startListening();

    let remaining = LISTEN_DURATION / 1000;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        stopListening();
        setRecording(false);
        evaluateSound();
      }
    }, 1000);
  }, [recording, showFeedback, startListening, stopListening, evaluateSound]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (sampleRef.current) clearInterval(sampleRef.current);
    };
  }, []);

  if (!currentCharade) return null;

  const ringSize = 100 + amplitude * 60;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="soundcharades" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Instruction */}
      <Typography variant="h6" sx={{color: kidsColors.textPrimary, fontWeight: 700, textAlign: 'center'}}>
        Make the sound of this:
      </Typography>

      {/* Emoji display */}
      <Fade in timeout={400}>
        <Box sx={{textAlign: 'center'}}>
          <Typography sx={{fontSize: 100}}>{currentCharade.emoji}</Typography>
          <Typography variant="h5" sx={{fontWeight: 700, color: kidsColors.textPrimary, mt: 1}}>
            {currentCharade.label}
          </Typography>
          <Typography variant="body2" sx={{color: kidsColors.textSecondary, mt: 0.5}}>
            Sound: "{currentCharade.sound}"
          </Typography>
        </Box>
      </Fade>

      {/* Pattern hint */}
      <Card sx={{px: 3, py: 1.5, borderRadius: '12px', bgcolor: kidsColors.surfaceLight}}>
        <Typography variant="body2" sx={{color: kidsColors.textSecondary, textAlign: 'center'}}>
          {currentCharade.pattern === 'spike' && 'Make a quick, sharp sound!'}
          {currentCharade.pattern === 'sustained' && 'Hold the sound steady!'}
          {currentCharade.pattern === 'rising' && 'Start quiet, get louder!'}
          {currentCharade.pattern === 'rising-falling' && 'Get louder then quieter!'}
          {currentCharade.pattern === 'wave' && 'Make a wavy up-and-down sound!'}
        </Typography>
      </Card>

      {/* Mic button with amplitude ring */}
      <Box sx={{position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', my: 2}}>
        <Box sx={{
          position: 'absolute',
          width: ringSize, height: ringSize,
          borderRadius: '50%',
          bgcolor: recording ? 'rgba(255,107,53,0.15)' : 'transparent',
          transition: 'all 0.1s',
        }} />
        <IconButton
          onClick={handleRecord}
          disabled={recording || showFeedback}
          sx={{
            width: 80, height: 80,
            bgcolor: recording ? '#FF6B35' : kidsColors.blue,
            color: '#fff',
            '&:hover': {bgcolor: recording ? '#E55A25' : '#0770C4'},
            '&.Mui-disabled': {bgcolor: '#ccc'},
            zIndex: 1,
          }}
        >
          {recording ? <MicIcon sx={{fontSize: 40}} /> : <MicOffIcon sx={{fontSize: 40}} />}
        </IconButton>
      </Box>

      {/* Timer */}
      {recording && (
        <Typography variant="h4" sx={{fontWeight: 700, color: kidsColors.orange}}>
          {timeLeft}s
        </Typography>
      )}

      {/* Feedback */}
      {showFeedback && (
        <Grow in>
          <Typography variant="h5" sx={{
            fontWeight: 700,
            color: feedbackCorrect ? kidsColors.green : '#E74C3C',
            textAlign: 'center',
          }}>
            {feedbackCorrect ? 'Great sound!' : 'Try making a louder sound!'}
          </Typography>
        </Grow>
      )}

      {!recording && !showFeedback && (
        <Typography variant="body2" sx={{color: kidsColors.textMuted}}>
          Tap the microphone to start!
        </Typography>
      )}
    </Box>
  );
}
