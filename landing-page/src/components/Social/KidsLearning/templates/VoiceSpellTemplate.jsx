/**
 * VoiceSpellTemplate - Voice-Activated Spelling Game
 *
 * Shows a word with a hint and image. The child says the word aloud,
 * and speech recognition checks if they pronounced it correctly.
 * Builds pronunciation, vocabulary, and spelling skills.
 *
 * Config shape:
 *   {
 *     content: {
 *       words: [{
 *         word: string,
 *         hint: string,
 *         image?: string (emoji),
 *         concept?: string,
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
import useSpeechRecognition from '../../../../hooks/useSpeechRecognition';
import {kidsColors} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import {GameSounds, GameCommentary} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import {Box, Typography, Button, Card, Fade, Grow, IconButton} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const FEEDBACK_DELAY = 1800;
const SIMILARITY_THRESHOLD = 0.7;

function similarity(a, b) {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  if (!la || !lb) return 0;
  const longer = la.length > lb.length ? la : lb;
  const shorter = la.length > lb.length ? lb : la;
  if (longer.length === 0) return 1;
  // Levenshtein-based similarity
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastVal = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) { costs[j] = j; }
      else if (j > 0) {
        let newVal = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newVal = Math.min(Math.min(newVal, lastVal), costs[j]) + 1;
        }
        costs[j - 1] = lastVal;
        lastVal = newVal;
      }
    }
    if (i > 0) costs[shorter.length] = lastVal;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

export default function VoiceSpellTemplate({config, onAnswer, onComplete}) {
  const words = config?.content?.words ?? [];
  const total = words.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [attempts, setAttempts] = useState(0);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());

  const {amplitude, isListening: micActive} = useMicAmplitude(2.0);
  const {
    transcript,
    isListening,
    startListening,
    stopListening,
    resetTranscript,
    error: sttError,
  } = useSpeechRecognition({
    language: 'en',
    onResult: (text) => handleSpeechResult(text),
  });

  const currentWord = words[currentIndex];

  const handleSpeechResult = useCallback(
    (text) => {
      if (!currentWord || showFeedback) return;
      const sim = similarity(text, currentWord.word);
      const isCorrect = sim >= SIMILARITY_THRESHOLD;
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

      setResults((r) => [...r, {concept: currentWord.concept, correct: isCorrect, responseTime}]);
      if (onAnswer) onAnswer(isCorrect, currentWord.concept, responseTime);
      setAttempts(0);

      setTimeout(() => {
        if (currentIndex + 1 >= total) {
          const finalScore = isCorrect ? score + 1 : score;
          triggerComplete();
          if (onComplete) {
            onComplete({score: finalScore, correct: finalScore, total, results: [...results, {concept: currentWord.concept, correct: isCorrect, responseTime}], bestStreak});
          }
        } else {
          setCurrentIndex((i) => i + 1);
          setShowFeedback(false);
          resetTranscript();
          startTimeRef.current = Date.now();
        }
      }, FEEDBACK_DELAY);
    },
    [currentWord, showFeedback, currentIndex, total, score, results, bestStreak, onAnswer, onComplete, triggerCorrect, triggerComplete, resetTranscript]
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
    if (currentWord) {
      try { GameSounds.speakText(currentWord.word); } catch (_) {}
    }
  }, [currentWord]);

  // Speak word on new question
  useEffect(() => {
    if (currentWord) {
      try { GameSounds.speakText(currentWord.word); } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  if (!currentWord) return null;

  const micSize = 80 + amplitude * 40;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="voicespell" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Word image/emoji */}
      <Fade in timeout={400}>
        <Typography sx={{fontSize: 80, textAlign: 'center'}}>
          {currentWord.image || ''}
        </Typography>
      </Fade>

      {/* Hint */}
      <Typography variant="body1" sx={{color: kidsColors.textSecondary, textAlign: 'center', maxWidth: 320}}>
        {currentWord.hint}
      </Typography>

      {/* Word to say */}
      <Card sx={{
        px: 4, py: 2, borderRadius: '16px',
        bgcolor: showFeedback ? (feedbackCorrect ? '#E8F5E9' : '#FFEBEE') : kidsColors.card,
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        transition: 'background 0.3s',
      }}>
        <Typography variant="h3" sx={{fontWeight: 800, color: kidsColors.textPrimary, textAlign: 'center', letterSpacing: 4}}>
          {currentWord.word.toUpperCase()}
        </Typography>
      </Card>

      {/* Listen button */}
      <IconButton onClick={handleSpeak} sx={{color: kidsColors.blue}}>
        <VolumeUpIcon sx={{fontSize: 32}} />
      </IconButton>

      {/* Mic amplitude ring */}
      <Box sx={{position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', my: 2}}>
        <Box sx={{
          position: 'absolute',
          width: micSize,
          height: micSize,
          borderRadius: '50%',
          bgcolor: isListening ? 'rgba(108,99,255,0.15)' : 'transparent',
          transition: 'all 0.1s',
        }} />
        <IconButton
          onClick={handleMicToggle}
          disabled={showFeedback}
          sx={{
            width: 72, height: 72,
            bgcolor: isListening ? kidsColors.primary : kidsColors.blue,
            color: '#fff',
            '&:hover': {bgcolor: isListening ? '#5A52D5' : '#0770C4'},
            '&.Mui-disabled': {bgcolor: '#ccc'},
            zIndex: 1,
          }}
        >
          {isListening ? <MicIcon sx={{fontSize: 36}} /> : <MicOffIcon sx={{fontSize: 36}} />}
        </IconButton>
      </Box>

      {/* Transcript display */}
      {transcript && (
        <Typography variant="h6" sx={{color: kidsColors.textPrimary, fontStyle: 'italic'}}>
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
            {feedbackCorrect ? 'Great pronunciation!' : `The word is "${currentWord.word}"`}
          </Typography>
        </Grow>
      )}

      {/* Error display */}
      {sttError && (
        <Typography variant="caption" sx={{color: '#E74C3C'}}>
          {sttError}
        </Typography>
      )}

      {/* Try again hint */}
      {!showFeedback && !isListening && (
        <Typography variant="body2" sx={{color: kidsColors.textMuted}}>
          Tap the microphone and say the word!
        </Typography>
      )}
    </Box>
  );
}
