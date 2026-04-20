/**
 * VoicePaintTemplate - Voice-Controlled Drawing Game
 *
 * The child uses their voice volume to control a drawing cursor on a canvas.
 * Louder voice = thicker/larger strokes. The cursor moves automatically
 * and the child must modulate volume to trace target shapes.
 *
 * Config shape:
 *   {
 *     content: {
 *       shapes: [{
 *         shape: string,       // 'circle' | 'triangle' | 'square' | 'star' | letter
 *         label: string,
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
import {kidsColors} from '../kidsTheme';
import InlineCelebration from '../shared/InlineCelebration';
import {GameSounds} from '../shared/SoundManager';
import useCelebration from '../shared/useCelebration';

import MicIcon from '@mui/icons-material/Mic';
import PaletteIcon from '@mui/icons-material/Palette';
import {Box, Typography, Button, Card, Fade, Grow, IconButton} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const CANVAS_SIZE = 300;
const DRAW_DURATION = 5000; // 5 seconds to draw
const COLORS = ['#6C63FF', '#FF6B6B', '#4ECDC4', '#FF9F43', '#E040FB'];

// Generate target shape points for guide overlay
function getShapePoints(shape) {
  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;
  const r = 80;

  switch (shape) {
    case 'circle':
      return Array.from({length: 36}, (_, i) => ({
        x: cx + r * Math.cos((i / 36) * Math.PI * 2),
        y: cy + r * Math.sin((i / 36) * Math.PI * 2),
      }));
    case 'triangle':
      return [
        {x: cx, y: cy - r},
        {x: cx + r * 0.87, y: cy + r * 0.5},
        {x: cx - r * 0.87, y: cy + r * 0.5},
        {x: cx, y: cy - r},
      ];
    case 'square':
      return [
        {x: cx - r, y: cy - r},
        {x: cx + r, y: cy - r},
        {x: cx + r, y: cy + r},
        {x: cx - r, y: cy + r},
        {x: cx - r, y: cy - r},
      ];
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rad = i % 2 === 0 ? r : r * 0.4;
        pts.push({x: cx + rad * Math.cos(angle), y: cy + rad * Math.sin(angle)});
      }
      pts.push(pts[0]);
      return pts;
    }
    default:
      // Letter shapes: just use a circle as guide
      return Array.from({length: 36}, (_, i) => ({
        x: cx + r * Math.cos((i / 36) * Math.PI * 2),
        y: cy + r * Math.sin((i / 36) * Math.PI * 2),
      }));
  }
}

export default function VoicePaintTemplate({config, onAnswer, onComplete}) {
  const shapes = config?.content?.shapes ?? [];
  const total = shapes.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackCorrect, setFeedbackCorrect] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [painting, setPainting] = useState(false);
  const [coverage, setCoverage] = useState(0);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const canvasRef = useRef(null);
  const guideCanvasRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const angleRef = useRef(0);
  const paintPointsRef = useRef([]);
  const rafRef = useRef(null);
  const colorRef = useRef(COLORS[0]);

  const {amplitude, isListening, startListening, stopListening} = useMicAmplitude(2.5);
  const amplitudeRef = useRef(0);
  amplitudeRef.current = amplitude;

  const currentShape = shapes[currentIndex];

  // Draw guide shape
  useEffect(() => {
    if (!currentShape) return;
    const canvas = guideCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const points = getShapePoints(currentShape.shape);
    ctx.strokeStyle = 'rgba(108,99,255,0.2)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    colorRef.current = COLORS[currentIndex % COLORS.length];
  }, [currentIndex, currentShape]);

  const paintLoop = useCallback(() => {
    if (!painting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const amp = amplitudeRef.current;
    if (amp > 0.05) {
      // Move cursor along a spiral/circular path
      angleRef.current += 0.04;
      const cx = CANVAS_SIZE / 2;
      const cy = CANVAS_SIZE / 2;
      const r = 60 + 40 * Math.sin(angleRef.current * 0.5);
      const x = cx + r * Math.cos(angleRef.current);
      const y = cy + r * Math.sin(angleRef.current);

      const radius = 3 + amp * 20;
      ctx.fillStyle = colorRef.current;
      ctx.globalAlpha = 0.6 + amp * 0.4;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      paintPointsRef.current.push({x, y});
    }

    rafRef.current = requestAnimationFrame(paintLoop);
  }, [painting]);

  useEffect(() => {
    if (painting) {
      rafRef.current = requestAnimationFrame(paintLoop);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [painting, paintLoop]);

  const handleStartPainting = useCallback(async () => {
    // Clear paint canvas
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    paintPointsRef.current = [];
    angleRef.current = 0;
    setPainting(true);
    startTimeRef.current = Date.now();
    await startListening();

    // Auto-stop after duration
    setTimeout(() => {
      stopListening();
      setPainting(false);
      evaluatePainting();
    }, DRAW_DURATION);
  }, [startListening, stopListening]);

  const evaluatePainting = useCallback(() => {
    const points = paintPointsRef.current;
    // Simple scoring: did they paint enough points?
    const isCorrect = points.length > 20;
    const responseTime = Date.now() - startTimeRef.current;
    const coveragePct = Math.min(100, Math.round(points.length / 1.5));
    setCoverage(coveragePct);

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

    const concept = currentShape?.concept || `voice-paint:${currentShape?.shape || currentIndex}`;
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
    }, 2000);
  }, [currentShape, currentIndex, total, score, results, bestStreak, onAnswer, onComplete, triggerCorrect, triggerComplete]);

  if (!currentShape) return null;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2}}>
      <InlineCelebration type={celebType} gameTemplate="voicepaint" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {/* Instruction */}
      <Typography variant="h6" sx={{fontWeight: 700, color: kidsColors.textPrimary, textAlign: 'center'}}>
        {currentShape.label}
      </Typography>

      <Typography variant="body2" sx={{color: kidsColors.textSecondary, textAlign: 'center'}}>
        Use your voice to paint! Louder = bigger brush
      </Typography>

      {/* Canvas stack */}
      <Box sx={{position: 'relative', width: CANVAS_SIZE, height: CANVAS_SIZE, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', bgcolor: '#FAFAFA'}}>
        {/* Guide canvas (behind) */}
        <canvas
          ref={guideCanvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{position: 'absolute', top: 0, left: 0}}
        />
        {/* Paint canvas (front) */}
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          style={{position: 'absolute', top: 0, left: 0}}
        />
      </Box>

      {/* Volume meter */}
      {painting && (
        <Box sx={{width: '80%', maxWidth: 280, height: 12, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 6, overflow: 'hidden'}}>
          <Box sx={{
            width: `${amplitude * 100}%`,
            height: '100%',
            bgcolor: colorRef.current,
            borderRadius: 6,
            transition: 'width 0.05s',
          }} />
        </Box>
      )}

      {/* Start button */}
      {!painting && !showFeedback && (
        <Button
          variant="contained"
          startIcon={<MicIcon />}
          onClick={handleStartPainting}
          sx={{
            bgcolor: kidsColors.primary,
            borderRadius: '24px',
            px: 4, py: 1.5,
            fontWeight: 700,
            textTransform: 'none',
            '&:hover': {bgcolor: '#5A52D5'},
          }}
        >
          Start Painting!
        </Button>
      )}

      {painting && (
        <Typography variant="body1" sx={{color: kidsColors.orange, fontWeight: 700}}>
          Make sounds to paint!
        </Typography>
      )}

      {/* Feedback */}
      {showFeedback && (
        <Grow in>
          <Box sx={{textAlign: 'center'}}>
            <Typography variant="h5" sx={{
              fontWeight: 700,
              color: feedbackCorrect ? kidsColors.green : '#E74C3C',
            }}>
              {feedbackCorrect ? 'Beautiful artwork!' : 'Try being louder next time!'}
            </Typography>
            <Typography variant="body2" sx={{color: kidsColors.textSecondary, mt: 0.5}}>
              Coverage: {coverage}%
            </Typography>
          </Box>
        </Grow>
      )}
    </Box>
  );
}
