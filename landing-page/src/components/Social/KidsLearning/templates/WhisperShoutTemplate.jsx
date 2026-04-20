/**
 * WhisperShoutTemplate - Voice Volume Control Runner Game
 *
 * A side-scrolling runner where the character's vertical position is
 * controlled by mic volume. Whisper (low volume) to duck under obstacles,
 * shout (high volume) to jump over them. Teaches voice modulation.
 *
 * Config shape:
 *   {
 *     content: {
 *       obstacleCount: number,
 *       speed: number,
 *       description?: string,
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
import {Box, Typography, Button, Fade, Grow} from '@mui/material';
import React, {useState, useEffect, useRef, useCallback} from 'react';


const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 400;
const CHARACTER_SIZE = 40;
const OBSTACLE_WIDTH = 40;
const OBSTACLE_GAP = 120;
const GROUND_Y = CANVAS_HEIGHT - 60;

function generateObstacles(count, speed) {
  const obstacles = [];
  for (let i = 0; i < count; i++) {
    const isHigh = Math.random() > 0.5;
    obstacles.push({
      x: CANVAS_WIDTH + i * (CANVAS_WIDTH / speed + OBSTACLE_GAP),
      type: isHigh ? 'high' : 'low', // high = jump over, low = duck under
      passed: false,
    });
  }
  return obstacles;
}

export default function WhisperShoutTemplate({config, onAnswer, onComplete}) {
  const obstacleCount = config?.content?.obstacleCount || 8;
  const speed = config?.content?.speed || 2.0;

  const [phase, setPhase] = useState('ready'); // ready, playing, done
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [results, setResults] = useState([]);

  const {celebType, celebVisible, triggerCorrect, triggerComplete, handleCelebDone} =
    useCelebration();

  const canvasRef = useRef(null);
  const obstaclesRef = useRef([]);
  const characterYRef = useRef(GROUND_Y - CHARACTER_SIZE);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const startTimeRef = useRef(0);

  const {amplitude, isListening, startListening, stopListening} = useMicAmplitude(2.5);
  const amplitudeRef = useRef(0);
  amplitudeRef.current = amplitude;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
    skyGrad.addColorStop(0, '#87CEEB');
    skyGrad.addColorStop(1, '#E8F4FD');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Ground
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, GROUND_Y, w, h - GROUND_Y);
    ctx.fillStyle = '#6B8E23';
    ctx.fillRect(0, GROUND_Y, w, 3);

    // Character (circle with face)
    const charY = characterYRef.current;
    ctx.fillStyle = kidsColors.primary || '#6C63FF';
    ctx.beginPath();
    ctx.arc(60, charY + CHARACTER_SIZE / 2, CHARACTER_SIZE / 2, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(54, charY + CHARACTER_SIZE / 2 - 5, 5, 0, Math.PI * 2);
    ctx.arc(66, charY + CHARACTER_SIZE / 2 - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(55, charY + CHARACTER_SIZE / 2 - 5, 2.5, 0, Math.PI * 2);
    ctx.arc(67, charY + CHARACTER_SIZE / 2 - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Obstacles
    obstaclesRef.current.forEach((obs) => {
      if (obs.type === 'high') {
        // High obstacle: red bar near top - need to duck
        ctx.fillStyle = '#FF6B6B';
        ctx.fillRect(obs.x, GROUND_Y - 100, OBSTACLE_WIDTH, 50);
        ctx.fillStyle = '#E74C3C';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DUCK', obs.x + OBSTACLE_WIDTH / 2, GROUND_Y - 110);
      } else {
        // Low obstacle: orange bar on ground - need to jump
        ctx.fillStyle = '#FF9F43';
        ctx.fillRect(obs.x, GROUND_Y - 40, OBSTACLE_WIDTH, 40);
        ctx.fillStyle = '#E67E22';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('JUMP', obs.x + OBSTACLE_WIDTH / 2, GROUND_Y - 48);
      }
    });

    // Volume meter
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(w - 30, 20, 16, 100);
    ctx.fillStyle = amplitudeRef.current > 0.5 ? '#FF6B35' : '#6C63FF';
    const meterH = amplitudeRef.current * 100;
    ctx.fillRect(w - 30, 120 - meterH, 16, meterH);

    // Labels
    ctx.fillStyle = '#333';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOUD', w - 22, 15);
    ctx.fillText('QUIET', w - 22, 135);
  }, []);

  const gameLoop = useCallback((timestamp) => {
    if (phase !== 'playing') return;

    const dt = lastTimeRef.current ? (timestamp - lastTimeRef.current) / 1000 : 0.016;
    lastTimeRef.current = timestamp;

    // Map amplitude to character Y position
    // Low amplitude (whisper) = low position (duck), High amplitude (shout) = high (jump)
    const targetY = GROUND_Y - CHARACTER_SIZE - amplitude * 120;
    characterYRef.current += (targetY - characterYRef.current) * 0.15;
    characterYRef.current = Math.max(50, Math.min(GROUND_Y - CHARACTER_SIZE, characterYRef.current));

    // Move obstacles
    const pixelSpeed = speed * 80 * dt;
    let allPassed = true;
    let newHit = false;

    obstaclesRef.current.forEach((obs) => {
      obs.x -= pixelSpeed;

      if (!obs.passed && obs.x + OBSTACLE_WIDTH < 60) {
        obs.passed = true;
        // Check collision
        const charTop = characterYRef.current;
        const charBottom = charTop + CHARACTER_SIZE;

        let avoided;
        if (obs.type === 'high') {
          // Duck: character must be below the obstacle (charTop > GROUND_Y - 100 + 50)
          avoided = charTop > GROUND_Y - 60;
        } else {
          // Jump: character must be above the obstacle
          avoided = charBottom < GROUND_Y - 40;
        }

        if (avoided) {
          setScore((s) => s + 1);
          triggerCorrect();
          try { GameSounds.correct(); } catch (_) {}
        } else {
          setHits((h) => h + 1);
          newHit = true;
          try { GameSounds.wrong(); } catch (_) {}
        }

        const concept = `whisper-shout:${obs.type}`;
        setResults((r) => [...r, {concept, correct: avoided, responseTime: Date.now() - startTimeRef.current}]);
        if (onAnswer) onAnswer(avoided, concept, Date.now() - startTimeRef.current);
      }

      if (obs.x + OBSTACLE_WIDTH > -50) allPassed = false;
    });

    draw();

    if (allPassed && obstaclesRef.current.length > 0) {
      // Game over
      setPhase('done');
      stopListening();
      triggerComplete();
      return;
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [phase, amplitude, speed, draw, stopListening, onAnswer, triggerCorrect, triggerComplete]);

  // Start game loop when playing
  useEffect(() => {
    if (phase === 'playing') {
      lastTimeRef.current = 0;
      rafRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, gameLoop]);

  // Report completion
  useEffect(() => {
    if (phase === 'done' && onComplete) {
      onComplete({
        score,
        correct: score,
        total: obstacleCount,
        results,
        bestStreak: score,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleStart = useCallback(async () => {
    obstaclesRef.current = generateObstacles(obstacleCount, speed);
    characterYRef.current = GROUND_Y - CHARACTER_SIZE;
    setScore(0);
    setHits(0);
    setResults([]);
    startTimeRef.current = Date.now();
    await startListening();
    setPhase('playing');
  }, [obstacleCount, speed, startListening]);

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 1}}>
      <InlineCelebration type={celebType} gameTemplate="whispershout" visible={celebVisible} onDone={handleCelebDone} streakCount={celebStreak} score={celebScore} />

      {phase === 'ready' && (
        <Fade in>
          <Box sx={{textAlign: 'center'}}>
            <Typography sx={{fontSize: 64}}>🏃</Typography>
            <Typography variant="h5" sx={{fontWeight: 700, color: kidsColors.textPrimary, mb: 1}}>
              Whisper & Shout Runner
            </Typography>
            <Typography variant="body1" sx={{color: kidsColors.textSecondary, mb: 2, maxWidth: 300}}>
              Whisper to duck under obstacles, shout to jump over them!
            </Typography>
            <Button
              variant="contained"
              startIcon={<MicIcon />}
              onClick={handleStart}
              sx={{
                bgcolor: kidsColors.primary,
                borderRadius: '24px',
                px: 4, py: 1.5,
                fontWeight: 700,
                textTransform: 'none',
                '&:hover': {bgcolor: '#5A52D5'},
              }}
            >
              Start Running!
            </Button>
          </Box>
        </Fade>
      )}

      {(phase === 'playing' || phase === 'done') && (
        <>
          {/* Score HUD */}
          <Box sx={{display: 'flex', gap: 3, mb: 1}}>
            <Typography variant="body1" sx={{fontWeight: 700, color: kidsColors.green}}>
              Dodged: {score}
            </Typography>
            <Typography variant="body1" sx={{fontWeight: 700, color: '#E74C3C'}}>
              Hits: {hits}
            </Typography>
          </Box>

          {/* Game canvas */}
          <Box sx={{borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.1)'}}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              style={{display: 'block', maxWidth: '100%'}}
            />
          </Box>

          {phase === 'done' && (
            <Grow in>
              <Box sx={{textAlign: 'center', mt: 2}}>
                <Typography variant="h5" sx={{fontWeight: 700, color: kidsColors.textPrimary}}>
                  {score >= obstacleCount * 0.7 ? 'Amazing run!' : 'Good try!'}
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleStart}
                  sx={{
                    mt: 1, bgcolor: kidsColors.primary, borderRadius: '24px',
                    px: 4, fontWeight: 700, textTransform: 'none',
                    '&:hover': {bgcolor: '#5A52D5'},
                  }}
                >
                  Play Again
                </Button>
              </Box>
            </Grow>
          )}
        </>
      )}
    </Box>
  );
}
