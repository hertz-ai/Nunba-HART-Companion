/**
 * VoiceBalloonPopTemplate - Voice-Activated Balloon Pop Game
 *
 * Balloons float up with words on them. The child must say the word
 * on the correct balloon to pop it. Uses speech recognition to detect
 * the spoken word. Differs from the touch BalloonPopTemplate which uses
 * tap input.
 *
 * Config shape (matches mobile balloonPopGames.js):
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
import React, {useState, useEffect, useRef, useCallback} from 'react';


const FEEDBACK_DELAY = 1600;
const BALLOON_COLORS = ['#FF6B6B', '#6C63FF', '#4ECDC4', '#FF9F43', '#E040FB', '#2ECC71'];
const FLOAT_SPEED = 0.3; // px per frame

export default function VoiceBalloonPopTemplate({config, onAnswer, onComplete}) {
  const questions = config?.questions || config?.content?.questions || [];
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [popped, setPopped] = useState(false);
  const [balloonY, setBalloonY] = useState(300);
  const [balloonScale, setBalloonScale] = useState(1);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());
  const rafRef = useRef(null);

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

  const currentQuestion = questions[currentIndex];

  // Float balloon upward
  useEffect(() => {
    if (popped || showFeedback) return;
    const animate = () => {
      setBalloonY((y) => {
        if (y < -80) return 300; // Reset if floated off screen
        return y - FLOAT_SPEED;
      });
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [popped, showFeedback, currentIndex]);

  const handleSpeechResult = useCallback(
    (text) => {
      if (!currentQuestion || showFeedback || popped) return;
      const spoken = text.toLowerCase().trim();
      const target = currentQuestion.word.toLowerCase().trim();
      const isCorrect = spoken.includes(target) || target.includes(spoken);

      const responseTime = Date.now() - startTimeRef.current;

      if (isCorrect) {
        // Pop animation
        setPopped(true);
        setBalloonScale(1.5);
        setTimeout(() => setBalloonScale(0), 150);
      }

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

      const concept = `balloon-pop:${currentQuestion.word}`;
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
          setPopped(false);
          setBalloonY(300);
          setBalloonScale(1);
          resetTranscript();
          startTimeRef.current = Date.now();
        }
      }, FEEDBACK_DELAY);
    },
    [currentQuestion, showFeedback, popped, currentIndex, total, score, results, bestStreak,
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

  useEffect(() => {
    if (currentQuestion) {
      try { GameSounds.speakText(currentQuestion.word); } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  if (!currentQuestion) return null;

  const color = BALLOON_COLORS[currentIndex % BALLOON_COLORS.length];

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2, minHeight: 400, position: 'relative'}}>
      <InlineCelebration type={celebType} gameTemplate="voiceballoonpop" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Hint */}
      <Typography variant="body1" sx={{color: kidsColors.textSecondary, textAlign: 'center', maxWidth: 300}}>
        {currentQuestion.hint}
      </Typography>

      {/* Balloon area */}
      <Box sx={{position: 'relative', width: 200, height: 300, overflow: 'hidden'}}>
        {!popped && (
          <Box sx={{
            position: 'absolute',
            left: '50%',
            top: balloonY,
            transform: `translateX(-50%) scale(${balloonScale})`,
            transition: 'transform 0.15s',
            textAlign: 'center',
          }}>
            {/* Balloon shape */}
            <Box sx={{
              width: 120, height: 140,
              borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%',
              bgcolor: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 8px 24px ${color}40`,
              position: 'relative',
            }}>
              <Typography variant="h5" sx={{fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.2)'}}>
                {currentQuestion.word}
              </Typography>
              {/* Balloon string */}
              <Box sx={{
                position: 'absolute', bottom: -30, left: '50%',
                width: 2, height: 30, bgcolor: '#999',
                transform: 'translateX(-50%)',
              }} />
            </Box>
          </Box>
        )}

        {/* Pop particles */}
        {popped && (
          <Box sx={{position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%, -50%)'}}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Box key={i} sx={{
                position: 'absolute',
                width: 12, height: 12,
                borderRadius: '50%',
                bgcolor: BALLOON_COLORS[i],
                transform: `rotate(${i * 60}deg) translateY(-40px)`,
                animation: 'kidsConfettiFall 0.8s ease-out forwards',
              }} />
            ))}
          </Box>
        )}
      </Box>

      {/* Listen to word button */}
      <IconButton onClick={handleSpeak} sx={{color: kidsColors.blue}}>
        <VolumeUpIcon sx={{fontSize: 28}} />
      </IconButton>

      {/* Instruction */}
      <Typography variant="h6" sx={{fontWeight: 700, color: kidsColors.textPrimary}}>
        Say "{currentQuestion.word}" to pop the balloon!
      </Typography>

      {/* Mic button */}
      <Box sx={{position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <Box sx={{
          position: 'absolute',
          width: 72 + amplitude * 30,
          height: 72 + amplitude * 30,
          borderRadius: '50%',
          bgcolor: isListening ? 'rgba(108,99,255,0.12)' : 'transparent',
          transition: 'all 0.1s',
        }} />
        <IconButton
          onClick={handleMicToggle}
          disabled={showFeedback}
          sx={{
            width: 64, height: 64,
            bgcolor: isListening ? kidsColors.primary : kidsColors.blue,
            color: '#fff',
            '&:hover': {bgcolor: isListening ? '#5A52D5' : '#0770C4'},
            '&.Mui-disabled': {bgcolor: '#ccc'},
            zIndex: 1,
          }}
        >
          {isListening ? <MicIcon sx={{fontSize: 32}} /> : <MicOffIcon sx={{fontSize: 32}} />}
        </IconButton>
      </Box>

      {/* Transcript */}
      {transcript && (
        <Typography variant="body2" sx={{color: kidsColors.textSecondary, fontStyle: 'italic'}}>
          Heard: "{transcript}"
        </Typography>
      )}

      {/* Feedback */}
      {showFeedback && (
        <Grow in>
          <Typography variant="h5" sx={{
            fontWeight: 700,
            color: feedbackCorrect ? kidsColors.green : '#E74C3C',
          }}>
            {feedbackCorrect ? 'POP! Great job!' : `Try saying "${currentQuestion.word}"`}
          </Typography>
        </Grow>
      )}
    </Box>
  );
}
