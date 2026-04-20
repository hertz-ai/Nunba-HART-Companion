/**
 * BeatMatchTemplate - Rhythm Matching Game with Microphone
 *
 * Plays a rhythm pattern (visual + audio beats), then asks the child
 * to clap/tap the same rhythm back using the microphone. Detects beats
 * via amplitude spikes and compares timing to the original pattern.
 *
 * Config shape:
 *   {
 *     content: {
 *       patterns: [{
 *         beats: number[],    // timestamps in ms (e.g. [0, 600, 1200, 1800])
 *         tempo: string,      // 'slow' | 'medium' | 'fast'
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
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import ReplayIcon from '@mui/icons-material/Replay';
import {Box, Typography, Button, Card, Fade, Grow, IconButton} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const FEEDBACK_DELAY = 1800;
const BEAT_TOLERANCE_MS = 250; // How close the user's beat needs to be
const SPIKE_THRESHOLD = 0.25;
const SPIKE_COOLDOWN_MS = 150; // Minimum ms between detected beats

// Simple beep sound using Web Audio
function playBeep(audioCtx, time, freq = 440, duration = 0.08) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
  osc.start(time);
  osc.stop(time + duration);
}

export default function BeatMatchTemplate({config, onAnswer, onComplete}) {
  const patterns = config?.content?.patterns ?? [];
  const total = patterns.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [phase, setPhase] = useState('listen'); // listen, record, feedback
  const [activeBeat, setActiveBeat] = useState(-1);
  const [userBeats, setUserBeats] = useState([]);
  const [recording, setRecording] = useState(false);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const startTimeRef = useRef(Date.now());
  const recordStartRef = useRef(0);
  const lastSpikeRef = useRef(0);
  const audioCtxRef = useRef(null);
  const userBeatsRef = useRef([]);

  const {amplitude, isListening, startListening, stopListening} = useMicAmplitude(3.0);
  const prevAmplitudeRef = useRef(0);

  const currentPattern = patterns[currentIndex];

  // Detect amplitude spikes while recording
  useEffect(() => {
    if (!recording) return;
    const now = Date.now();
    const isSpike = amplitude > SPIKE_THRESHOLD && prevAmplitudeRef.current < SPIKE_THRESHOLD;
    prevAmplitudeRef.current = amplitude;

    if (isSpike && now - lastSpikeRef.current > SPIKE_COOLDOWN_MS) {
      lastSpikeRef.current = now;
      const beatTime = now - recordStartRef.current;
      userBeatsRef.current.push(beatTime);
      setUserBeats((b) => [...b, beatTime]);
    }
  }, [amplitude, recording]);

  // Play the pattern demo
  const playPattern = useCallback(() => {
    if (!currentPattern) return;
    const beats = currentPattern.beats;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    const now = ctx.currentTime;

    beats.forEach((t, i) => {
      playBeep(ctx, now + t / 1000, 520);
      setTimeout(() => setActiveBeat(i), t);
    });

    const lastBeat = beats[beats.length - 1] || 0;
    setTimeout(() => setActiveBeat(-1), lastBeat + 300);
  }, [currentPattern]);

  // Auto-play pattern on mount / index change
  useEffect(() => {
    setPhase('listen');
    setUserBeats([]);
    userBeatsRef.current = [];
    const timer = setTimeout(() => playPattern(), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  const handleStartRecording = useCallback(async () => {
    setPhase('record');
    setRecording(true);
    setUserBeats([]);
    userBeatsRef.current = [];
    recordStartRef.current = Date.now();
    lastSpikeRef.current = 0;
    prevAmplitudeRef.current = 0;
    await startListening();

    // Auto-stop after pattern duration + buffer
    const beats = currentPattern?.beats || [];
    const duration = (beats[beats.length - 1] || 2000) + 1500;
    setTimeout(() => {
      stopListening();
      setRecording(false);
      evaluateBeats();
    }, duration);
  }, [currentPattern, startListening, stopListening]);

  const evaluateBeats = useCallback(() => {
    const expected = currentPattern?.beats || [];
    const actual = userBeatsRef.current;

    // Score: count how many expected beats have a matching actual beat within tolerance
    let matched = 0;
    const usedActual = new Set();
    for (const expBeat of expected) {
      for (let i = 0; i < actual.length; i++) {
        if (!usedActual.has(i) && Math.abs(actual[i] - expBeat) < BEAT_TOLERANCE_MS) {
          matched++;
          usedActual.add(i);
          break;
        }
      }
    }

    const accuracy = expected.length > 0 ? matched / expected.length : 0;
    const isCorrect = accuracy >= 0.5;
    const responseTime = Date.now() - startTimeRef.current;

    setShowFeedback(true);
    setFeedbackCorrect(isCorrect);
    setPhase('feedback');

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

    const concept = `beat:${currentPattern?.label || currentIndex}`;
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
        startTimeRef.current = Date.now();
      }
    }, FEEDBACK_DELAY);
  }, [currentPattern, currentIndex, total, score, results, bestStreak, onAnswer, onComplete, triggerCorrect, triggerComplete]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch (_) {}
      }
    };
  }, []);

  if (!currentPattern) return null;

  const beats = currentPattern.beats;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="beatmatch" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      <Typography variant="h6" sx={{fontWeight: 700, color: kidsColors.textPrimary}}>
        {currentPattern.label}
      </Typography>

      {/* Beat visualization */}
      <Card sx={{px: 3, py: 2, borderRadius: '16px', bgcolor: kidsColors.surfaceLight, width: '100%', maxWidth: 340}}>
        <Typography variant="caption" sx={{color: kidsColors.textSecondary, mb: 1, display: 'block', textAlign: 'center'}}>
          {phase === 'listen' ? 'Listen to the rhythm:' : phase === 'record' ? 'Your turn! Clap along:' : 'Results:'}
        </Typography>

        {/* Pattern dots */}
        <Box sx={{display: 'flex', justifyContent: 'center', gap: 1.5, my: 2}}>
          {beats.map((_, i) => (
            <Box key={i} sx={{
              width: 32, height: 32, borderRadius: '50%',
              bgcolor: activeBeat === i ? kidsColors.primary :
                       (phase === 'record' && userBeats.length > i) ? kidsColors.orange :
                       'rgba(108,99,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transform: activeBeat === i ? 'scale(1.3)' : 'scale(1)',
              transition: 'all 0.15s',
            }}>
              <MusicNoteIcon sx={{fontSize: 16, color: activeBeat === i || (phase === 'record' && userBeats.length > i) ? '#fff' : kidsColors.textMuted}} />
            </Box>
          ))}
        </Box>

        {/* Amplitude bar during recording */}
        {recording && (
          <Box sx={{width: '100%', height: 8, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 4, overflow: 'hidden'}}>
            <Box sx={{
              width: `${amplitude * 100}%`,
              height: '100%',
              bgcolor: amplitude > SPIKE_THRESHOLD ? kidsColors.orange : kidsColors.primary,
              transition: 'width 0.05s',
            }} />
          </Box>
        )}
      </Card>

      {/* Action buttons */}
      {phase === 'listen' && (
        <Box sx={{display: 'flex', gap: 2}}>
          <Button
            variant="outlined"
            startIcon={<ReplayIcon />}
            onClick={playPattern}
            sx={{borderRadius: '12px', textTransform: 'none', fontWeight: 600, borderColor: kidsColors.primary, color: kidsColors.primary}}
          >
            Replay
          </Button>
          <Button
            variant="contained"
            startIcon={<MicIcon />}
            onClick={handleStartRecording}
            sx={{borderRadius: '12px', textTransform: 'none', fontWeight: 700, bgcolor: kidsColors.primary, '&:hover': {bgcolor: '#5A52D5'}}}
          >
            My Turn!
          </Button>
        </Box>
      )}

      {phase === 'record' && (
        <Typography variant="body1" sx={{color: kidsColors.orange, fontWeight: 700}}>
          Clap or make sounds to the beat!
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
            {feedbackCorrect ? 'Great rhythm!' : 'Try to match the beats more closely!'}
          </Typography>
        </Grow>
      )}
    </Box>
  );
}
