import { kidsColors } from '../data/kidsTheme';

import { Box, Typography } from '@mui/material';
import React, { useEffect, useState, useRef, useMemo } from 'react';

/**
 * InlineCelebration — per-game micro-celebration registry.
 *
 * Each of the 24 game templates (15 touch + 9 voice) gets a UNIQUE
 * celebration renderer with its own CSS animation, spoken phrase,
 * and wrong-answer variant. Renderers are small inline components
 * that use only CSS animations + minimal JS (no canvas).
 *
 * Props:
 *   type: 'correct' | 'streak' | 'perfect' | 'complete' | 'wrong'
 *   gameTemplate: string (voice_spell, balloon_pop, etc.)
 *   visible: boolean
 *   onDone: () => void
 *   streakCount?: number
 *   score?: { correct: number, total: number }
 *   position?: { x: number, y: number }
 */

// ── Shared constants ────────────────────────────────────────────

const STREAK_PHRASES = [
  '', 'Nice!', 'Awesome!', 'On fire!', 'Unstoppable!', 'Legendary!'
];

const WRONG_PHRASES = [
  'Try again!', 'Almost!', 'So close!', 'One more time!', 'Keep going!'
];

function pickWrong() {
  return WRONG_PHRASES[Math.floor(Math.random() * WRONG_PHRASES.length)];
}

// ── TTS helper ──────────────────────────────────────────────────

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1; u.pitch = 1.2; u.volume = 0.7;
    window.speechSynthesis?.speak(u);
  } catch (_) {}
}

// ── Shared wrapper (positioning + enter/exit + auto-dismiss) ────

function CelebrationShell({ type, visible, onDone, position, duration, children }) {
  const [animState, setAnimState] = useState('idle');
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible) { setAnimState('idle'); return; }
    setAnimState('enter');
    const d = type === 'wrong' ? 600 : duration || 900;
    timerRef.current = setTimeout(() => {
      setAnimState('exit');
      setTimeout(() => { setAnimState('idle'); onDone?.(); }, 300);
    }, d);
    return () => { clearTimeout(timerRef.current); try { window.speechSynthesis?.cancel(); } catch (_) {} };
  }, [visible, type, duration, onDone]);

  if (animState === 'idle') return null;

  return (
    <Box sx={{
      position: 'absolute',
      left: position?.x ?? '50%',
      top: position?.y ?? '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 50,
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 0.5,
      animation: animState === 'enter'
        ? 'icShellEnter 0.3s ease-out both'
        : 'icShellExit 0.3s ease-in both',
    }}>
      {children(animState, type)}
      <style>{`
        @keyframes icShellEnter {
          from { opacity: 0; transform: translate(-50%,-50%) scale(0.5); }
          to   { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
        @keyframes icShellExit {
          from { opacity: 1; transform: translate(-50%,-50%) scale(1); }
          to   { opacity: 0; transform: translate(-50%,-50%) scale(0.8) translateY(-20px); }
        }
      `}</style>
    </Box>
  );
}

// ── Phrase pill (reused by most renderers) ──────────────────────

function PhrasePill({ text, color }) {
  return (
    <Box sx={{
      background: color,
      color: '#fff',
      px: 2, py: 0.5,
      borderRadius: '20px',
      fontSize: '0.85rem',
      fontWeight: 700,
      letterSpacing: '0.03em',
      boxShadow: `0 0 16px ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {text}
    </Box>
  );
}

// ── Streak badge ────────────────────────────────────────────────

function StreakBadge({ type, streakCount }) {
  if (type !== 'streak' || streakCount <= 1) return null;
  return (
    <Box sx={{ fontSize: '0.7rem', color: '#FFD700', fontWeight: 700, mt: -0.5 }}>
      {streakCount}x streak!
    </Box>
  );
}

// ── Score display ───────────────────────────────────────────────

function ScoreDisplay({ type, score }) {
  if (type !== 'complete' || !score) return null;
  return (
    <Box sx={{ fontSize: '0.75rem', color: '#fff', opacity: 0.8 }}>
      {score.correct}/{score.total}
    </Box>
  );
}

// ── Resolve the spoken phrase ───────────────────────────────────

function resolvePhrase(type, defaultPhrase, streakCount, score) {
  if (type === 'wrong') return pickWrong();
  if (type === 'streak' && streakCount > 1)
    return STREAK_PHRASES[Math.min(streakCount, STREAK_PHRASES.length - 1)];
  if (type === 'perfect') return 'Perfect score!';
  if (type === 'complete') {
    const pct = score?.total > 0 ? score.correct / score.total : 0;
    return pct >= 0.9 ? 'Amazing!' : pct >= 0.7 ? 'Well done!' : 'Good try!';
  }
  return defaultPhrase;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PER-GAME CELEBRATION RENDERERS (24 unique animations)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── VOICE GAMES ─────────────────────────────────────────────────

// voice_spell: Letters scatter outward like sparkles then reassemble glowing
function VoiceSpellCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Perfect pronunciation!', streakCount, score);
  const isWrong = type === 'wrong';
  const letters = 'SPELL'.split('');
  return (
    <>
      {!isWrong && letters.map((l, i) => (
        <Box key={i} sx={{
          position: 'absolute',
          fontSize: 22, fontWeight: 800, color: '#6C63FF',
          animation: `icSpellScatter${i} 0.8s ease-out forwards`,
          textShadow: '0 0 8px #6C63FF88',
        }}>
          {l}
        </Box>
      ))}
      {isWrong && <Box sx={{ fontSize: 32, filter: 'grayscale(1)', animation: 'icShake 0.4s' }}>📝</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#6C63FF'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        ${letters.map((_, i) => {
          const angle = (i / letters.length) * 360;
          const rad = angle * Math.PI / 180;
          const x = Math.cos(rad) * 40;
          const y = Math.sin(rad) * 40;
          return `@keyframes icSpellScatter${i} {
            0% { transform: translate(0,0) scale(0.3); opacity: 0; }
            40% { transform: translate(${x}px,${y}px) scale(1.2); opacity: 1; }
            100% { transform: translate(${(i - 2) * 16}px, -8px) scale(1); opacity: 1; text-shadow: 0 0 12px #6C63FFCC; }
          }`;
        }).join('\n')}
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// voice_balloon_pop: Balloon burst with confetti particles from pop point
function VoiceBalloonPopCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Pop!', streakCount, score);
  const isWrong = type === 'wrong';
  const colors = ['#FF6B6B', '#6C63FF', '#4ECDC4', '#FF9F43', '#E040FB', '#2ECC71', '#FFD700', '#FF6B81'];
  return (
    <>
      {!isWrong && colors.map((c, i) => (
        <Box key={i} sx={{
          position: 'absolute',
          width: 8, height: 8,
          borderRadius: '50%',
          bgcolor: c,
          animation: `icBalloonParticle${i} 0.7s ease-out forwards`,
        }} />
      ))}
      {!isWrong && <Box sx={{ fontSize: 36, animation: 'icBalloonPop 0.3s ease-out forwards' }}>💥</Box>}
      {isWrong && <Box sx={{ fontSize: 32, animation: 'icBalloonDeflate 0.5s ease-in forwards' }}>🎈</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF6B6B'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        ${colors.map((_, i) => {
          const angle = (i / colors.length) * 360;
          const r = 50 + Math.random() * 20;
          const x = Math.cos(angle * Math.PI / 180) * r;
          const y = Math.sin(angle * Math.PI / 180) * r;
          return `@keyframes icBalloonParticle${i} {
            0% { transform: translate(0,0) scale(1); opacity: 1; }
            100% { transform: translate(${x}px,${y}px) scale(0); opacity: 0; }
          }`;
        }).join('\n')}
        @keyframes icBalloonPop { 0%{transform:scale(2);opacity:1} 100%{transform:scale(0.5);opacity:0.3} }
        @keyframes icBalloonDeflate { 0%{transform:scale(1)} 50%{transform:scale(1.1) rotate(5deg)} 100%{transform:scale(0.3);opacity:0.4} }
      `}</style>
    </>
  );
}

// beat_match: Concentric rhythm rings pulsing outward like a speaker
function BeatMatchCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'On beat!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      {!isWrong && [0, 1, 2].map(i => (
        <Box key={i} sx={{
          position: 'absolute',
          width: 40, height: 40,
          borderRadius: '50%',
          border: '3px solid #FF9F43',
          animation: `icBeatRing 0.8s ease-out ${i * 0.15}s forwards`,
          opacity: 0,
        }} />
      ))}
      <Box sx={{ fontSize: 36, animation: isWrong ? 'icShake 0.4s' : 'icBeatPulse 0.6s ease' }}>
        {isWrong ? '🎵' : '🥁'}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF9F43'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icBeatRing {
          0% { width:30px;height:30px;opacity:0.8;border-width:3px; }
          100% { width:120px;height:120px;opacity:0;border-width:1px; }
        }
        @keyframes icBeatPulse { 0%{transform:scale(0.8)} 30%{transform:scale(1.3)} 60%{transform:scale(0.95)} 100%{transform:scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// whisper_shout: Sound wave that crescendos (small to big amplitude)
function WhisperShoutCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Great control!', streakCount, score);
  const isWrong = type === 'wrong';
  const bars = 7;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '3px', height: 40, mb: 0.5 }}>
        {Array.from({ length: bars }).map((_, i) => {
          const maxH = isWrong ? 8 : 6 + (i / (bars - 1)) * 30;
          return (
            <Box key={i} sx={{
              width: 5,
              borderRadius: '3px',
              bgcolor: isWrong ? '#FF4444' : '#00D2D3',
              animation: `icWaveBar${i} 0.8s ease-out forwards`,
              height: 4,
            }} />
          );
        })}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#00D2D3'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        ${Array.from({ length: bars }).map((_, i) => {
          const maxH = isWrong ? 8 : 6 + (i / (bars - 1)) * 30;
          const delay = i * 0.06;
          return `@keyframes icWaveBar${i} {
            0% { height: 4px; }
            60% { height: ${maxH}px; }
            100% { height: ${maxH * 0.7}px; }
          }`;
        }).join('\n')}
      `}</style>
    </>
  );
}

// sound_charades: Emoji target spins + scales up with starburst behind
function SoundCharadesCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Nailed it!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      {!isWrong && (
        <Box sx={{
          position: 'absolute',
          width: 60, height: 60,
          animation: 'icStarburst 0.6s ease-out forwards',
          opacity: 0,
        }}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <Box key={i} sx={{
              position: 'absolute',
              top: '50%', left: '50%',
              width: 3, height: 20,
              bgcolor: '#A29BFE',
              borderRadius: '2px',
              transformOrigin: 'center bottom',
              transform: `translate(-50%, -100%) rotate(${i * 60}deg)`,
            }} />
          ))}
        </Box>
      )}
      <Box sx={{
        fontSize: 40,
        animation: isWrong ? 'icShake 0.4s' : 'icCharadeSpin 0.7s ease-out forwards',
      }}>
        🎭
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#A29BFE'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icCharadeSpin { 0%{transform:scale(0.3) rotate(0)} 50%{transform:scale(1.3) rotate(360deg)} 100%{transform:scale(1) rotate(360deg)} }
        @keyframes icStarburst { 0%{opacity:0;transform:scale(0.3) rotate(0)} 50%{opacity:0.8;transform:scale(1.2) rotate(30deg)} 100%{opacity:0;transform:scale(1.5) rotate(30deg)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// story_weaver: Page-turn with golden text appearing
function StoryWeaverCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Great storytelling!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{
        width: 70, height: 50,
        bgcolor: isWrong ? '#666' : '#FFF8DC',
        border: `2px solid ${isWrong ? '#999' : '#DAA520'}`,
        borderRadius: '4px 12px 12px 4px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: isWrong ? 'icShake 0.4s' : 'icPageTurn 0.8s ease-out forwards',
        transformOrigin: 'left center',
        boxShadow: isWrong ? 'none' : '2px 2px 8px rgba(218,165,32,0.3)',
        mb: 0.5,
      }}>
        <Box sx={{
          fontSize: 11, fontWeight: 800,
          color: isWrong ? '#999' : '#DAA520',
          animation: isWrong ? 'none' : 'icGoldenText 0.8s ease-out 0.3s both',
          opacity: 0,
          textAlign: 'center',
          lineHeight: 1.2,
        }}>
          {isWrong ? '...' : 'The End'}
        </Box>
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#2ECC71'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icPageTurn { 0%{transform:rotateY(-90deg);opacity:0} 60%{transform:rotateY(10deg)} 100%{transform:rotateY(0);opacity:1} }
        @keyframes icGoldenText { 0%{opacity:0;transform:scale(0.5)} 100%{opacity:1;transform:scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// voice_paint: Paint splatter — random colored blobs spread from center
function VoicePaintCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Beautiful!', streakCount, score);
  const isWrong = type === 'wrong';
  const splatColors = ['#FF6B81', '#6C63FF', '#00D2D3', '#FF9F43', '#2ECC71', '#E040FB'];
  return (
    <>
      {!isWrong && splatColors.map((c, i) => {
        const angle = (i / splatColors.length) * 360 + Math.random() * 30;
        const dist = 25 + Math.random() * 25;
        const size = 10 + Math.random() * 14;
        return (
          <Box key={i} sx={{
            position: 'absolute',
            width: size, height: size * 0.8,
            borderRadius: '50% 40% 60% 40%',
            bgcolor: c,
            animation: `icSplat${i} 0.6s ease-out forwards`,
            opacity: 0,
          }} />
        );
      })}
      {isWrong && <Box sx={{ fontSize: 32, filter: 'grayscale(0.8)', animation: 'icShake 0.4s' }}>🎨</Box>}
      {!isWrong && <Box sx={{ fontSize: 32, animation: 'icPaintPop 0.4s ease-out' }}>🎨</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF6B81'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        ${splatColors.map((_, i) => {
          const angle = (i / splatColors.length) * 360;
          const dist = 25 + (i % 3) * 10;
          const x = Math.cos(angle * Math.PI / 180) * dist;
          const y = Math.sin(angle * Math.PI / 180) * dist;
          return `@keyframes icSplat${i} {
            0% { transform: translate(0,0) scale(0); opacity: 0; }
            40% { opacity: 0.9; }
            100% { transform: translate(${x}px,${y}px) scale(1); opacity: 0.7; }
          }`;
        }).join('\n')}
        @keyframes icPaintPop { 0%{transform:scale(0.5)} 60%{transform:scale(1.3)} 100%{transform:scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// peekaboo: Character peeks from behind a curtain that slides open
function PeekabooCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'You found me!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{ position: 'relative', width: 70, height: 50, mb: 0.5, overflow: 'hidden' }}>
        {/* Character behind */}
        <Box sx={{
          position: 'absolute',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 32,
          animation: isWrong ? 'none' : 'icPeekChar 0.8s ease-out 0.2s both',
          opacity: isWrong ? 0.4 : 0,
        }}>
          {isWrong ? '🙈' : '👶'}
        </Box>
        {/* Left curtain */}
        <Box sx={{
          position: 'absolute', left: 0, top: 0,
          width: '50%', height: '100%',
          bgcolor: isWrong ? '#666' : '#FFD700',
          borderRadius: '4px 0 0 4px',
          animation: isWrong ? 'none' : 'icCurtainLeft 0.6s ease-out forwards',
        }} />
        {/* Right curtain */}
        <Box sx={{
          position: 'absolute', right: 0, top: 0,
          width: '50%', height: '100%',
          bgcolor: isWrong ? '#666' : '#FFD700',
          borderRadius: '0 4px 4px 0',
          animation: isWrong ? 'none' : 'icCurtainRight 0.6s ease-out forwards',
        }} />
      </Box>
      {isWrong && <Box sx={{ fontSize: 32, animation: 'icShake 0.4s' }}>🙈</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FFD700'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icCurtainLeft { 0%{transform:translateX(0)} 100%{transform:translateX(-100%)} }
        @keyframes icCurtainRight { 0%{transform:translateX(0)} 100%{transform:translateX(100%)} }
        @keyframes icPeekChar { 0%{opacity:0;transform:translate(-50%,-50%) scale(0.5)} 100%{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// speech_bubble: Bubble inflates then pops into letter fragments
function SpeechBubbleCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Bubble popped!', streakCount, score);
  const isWrong = type === 'wrong';
  const fragments = ['A', 'B', 'C', 'D', 'E'];
  return (
    <>
      {!isWrong && (
        <>
          {/* Inflating bubble */}
          <Box sx={{
            width: 50, height: 40,
            borderRadius: '50%',
            bgcolor: '#00D2D3',
            animation: 'icBubbleInflate 0.5s ease-out forwards',
            opacity: 0,
          }} />
          {/* Fragments after pop */}
          {fragments.map((f, i) => (
            <Box key={i} sx={{
              position: 'absolute',
              fontSize: 14, fontWeight: 800, color: '#00D2D3',
              animation: `icBubbleFrag${i} 0.7s ease-out 0.4s forwards`,
              opacity: 0,
            }}>
              {f}
            </Box>
          ))}
        </>
      )}
      {isWrong && <Box sx={{ fontSize: 32, animation: 'icShake 0.4s' }}>💬</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#00D2D3'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icBubbleInflate { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.3);opacity:0.8} 80%{transform:scale(1.4);opacity:0.3} 100%{transform:scale(0);opacity:0} }
        ${fragments.map((_, i) => {
          const angle = (i / fragments.length) * 360;
          const x = Math.cos(angle * Math.PI / 180) * 35;
          const y = Math.sin(angle * Math.PI / 180) * 35;
          return `@keyframes icBubbleFrag${i} {
            0% { transform: translate(0,0); opacity: 1; }
            100% { transform: translate(${x}px,${y}px); opacity: 0; }
          }`;
        }).join('\n')}
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// ── TOUCH GAMES ─────────────────────────────────────────────────

// multiple_choice: Correct answer card glows + pulses with checkmark stamp
function MultipleChoiceCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Right answer!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{
        width: 56, height: 56,
        borderRadius: '14px',
        bgcolor: isWrong ? '#FFE8E8' : '#D5F5E3',
        border: `2px solid ${isWrong ? '#E74C3C' : '#2ECC71'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: isWrong ? 'icShake 0.4s' : 'icChoicePulse 0.8s ease',
        boxShadow: isWrong ? 'none' : '0 0 20px #2ECC7166',
        mb: 0.5,
      }}>
        <Box sx={{
          fontSize: 28,
          animation: isWrong ? 'none' : 'icStamp 0.4s ease-out forwards',
        }}>
          {isWrong ? '✗' : '✓'}
        </Box>
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#2ECC71'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icChoicePulse { 0%{box-shadow:0 0 0 #2ECC7100} 50%{box-shadow:0 0 24px #2ECC7188} 100%{box-shadow:0 0 16px #2ECC7144} }
        @keyframes icStamp { 0%{transform:scale(2);opacity:0} 50%{transform:scale(0.8);opacity:1} 100%{transform:scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// drag_to_zone: Lock animation (keyhole turning)
function DragToZoneCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Perfect placement!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{
        position: 'relative',
        width: 50, height: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        mb: 0.5,
      }}>
        {/* Lock body */}
        <Box sx={{
          width: 36, height: 28,
          bgcolor: isWrong ? '#ccc' : '#6C63FF',
          borderRadius: '4px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Keyhole */}
          <Box sx={{
            width: 8, height: 12,
            bgcolor: isWrong ? '#999' : '#FFD700',
            borderRadius: '50% 50% 2px 2px',
            animation: isWrong ? 'none' : 'icKeyTurn 0.5s ease-out forwards',
          }} />
        </Box>
        {/* Lock shackle */}
        <Box sx={{
          position: 'absolute', top: -8,
          width: 22, height: 14,
          border: `3px solid ${isWrong ? '#ccc' : '#6C63FF'}`,
          borderBottom: 'none',
          borderRadius: '12px 12px 0 0',
          animation: isWrong ? 'icShake 0.4s' : 'icLockSnap 0.3s ease-out forwards',
        }} />
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#6C63FF'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icKeyTurn { 0%{transform:rotate(0)} 50%{transform:rotate(90deg)} 100%{transform:rotate(90deg) scale(1.1)} }
        @keyframes icLockSnap { 0%{transform:translateY(-6px)} 60%{transform:translateY(2px)} 100%{transform:translateY(0)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// match_pairs: Both matched cards flip and merge into one with flash
function MatchPairsCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Matched!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
        {/* Left card */}
        <Box sx={{
          width: 30, height: 38,
          borderRadius: '6px',
          bgcolor: isWrong ? '#ddd' : '#FF9F43',
          animation: isWrong ? 'icShake 0.4s' : 'icMergeLeft 0.7s ease-out forwards',
        }} />
        {/* Right card */}
        <Box sx={{
          width: 30, height: 38,
          borderRadius: '6px',
          bgcolor: isWrong ? '#ddd' : '#FF9F43',
          animation: isWrong ? 'icShake 0.4s' : 'icMergeRight 0.7s ease-out forwards',
        }} />
        {/* Flash overlay */}
        {!isWrong && <Box sx={{
          position: 'absolute',
          width: 60, height: 40,
          borderRadius: '8px',
          bgcolor: '#fff',
          animation: 'icMergeFlash 0.3s ease-out 0.5s both',
          opacity: 0,
        }} />}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF9F43'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icMergeLeft { 0%{transform:translateX(-10px) rotateY(0)} 40%{transform:translateX(-10px) rotateY(180deg)} 100%{transform:translateX(8px) rotateY(180deg)} }
        @keyframes icMergeRight { 0%{transform:translateX(10px) rotateY(0)} 40%{transform:translateX(10px) rotateY(-180deg)} 100%{transform:translateX(-8px) rotateY(-180deg)} }
        @keyframes icMergeFlash { 0%{opacity:0.8} 100%{opacity:0} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// sequence_order: Items chain together with connecting lines lighting up
function SequenceOrderCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'In order!', streakCount, score);
  const isWrong = type === 'wrong';
  const count = 4;
  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, mb: 0.5 }}>
        {Array.from({ length: count }).map((_, i) => (
          <React.Fragment key={i}>
            <Box sx={{
              width: 16, height: 16,
              borderRadius: '50%',
              bgcolor: isWrong ? '#ccc' : '#00D2D3',
              animation: isWrong ? 'none' : `icSeqDot 0.3s ease-out ${i * 0.15}s both`,
              opacity: 0,
            }} />
            {i < count - 1 && (
              <Box sx={{
                width: 14, height: 3,
                bgcolor: isWrong ? '#ddd' : '#00D2D3',
                animation: isWrong ? 'none' : `icSeqLine 0.2s ease-out ${i * 0.15 + 0.1}s both`,
                opacity: 0,
              }} />
            )}
          </React.Fragment>
        ))}
      </Box>
      {isWrong && <Box sx={{ fontSize: 28, animation: 'icShake 0.4s' }}>📋</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#00D2D3'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icSeqDot { 0%{opacity:0;transform:scale(0)} 100%{opacity:1;transform:scale(1)} }
        @keyframes icSeqLine { 0%{opacity:0;width:0} 100%{opacity:1;width:14px} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// word_build: Letters slam together like magnets and glow
function WordBuildCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Word complete!', streakCount, score);
  const isWrong = type === 'wrong';
  const letters = ['W', 'O', 'R', 'D'];
  return (
    <>
      <Box sx={{ display: 'flex', gap: 0, mb: 0.5 }}>
        {letters.map((l, i) => (
          <Box key={i} sx={{
            fontSize: 22, fontWeight: 800,
            color: isWrong ? '#ccc' : '#A29BFE',
            animation: isWrong ? 'icShake 0.4s' : `icWordSlam${i} 0.6s ease-out forwards`,
            textShadow: isWrong ? 'none' : '0 0 8px #A29BFE88',
          }}>
            {l}
          </Box>
        ))}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#A29BFE'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        ${letters.map((_, i) => {
          const startX = (i - 1.5) * 30;
          return `@keyframes icWordSlam${i} {
            0% { transform: translateX(${startX}px); opacity: 0.3; }
            60% { transform: translateX(0) scale(1.2); opacity: 1; }
            100% { transform: translateX(0) scale(1); text-shadow: 0 0 12px #A29BFECC; }
          }`;
        }).join('\n')}
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// fill_blank: Ink flows in from edges to fill a blank space
function FillBlankCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Filled in!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{
        width: 60, height: 24,
        borderRadius: '4px',
        border: `2px dashed ${isWrong ? '#ccc' : '#2ECC71'}`,
        position: 'relative',
        overflow: 'hidden',
        mb: 0.5,
      }}>
        {!isWrong && (
          <>
            <Box sx={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              bgcolor: '#2ECC71',
              animation: 'icFillLeft 0.5s ease-out forwards',
              width: 0,
            }} />
            <Box sx={{
              position: 'absolute', right: 0, top: 0, bottom: 0,
              bgcolor: '#2ECC71',
              animation: 'icFillRight 0.5s ease-out forwards',
              width: 0,
            }} />
          </>
        )}
        <Box sx={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%',
          fontSize: 12, fontWeight: 800,
          color: isWrong ? '#ccc' : '#fff',
          animation: isWrong ? 'none' : 'icFillText 0.3s ease-out 0.4s both',
          opacity: 0,
        }}>
          {isWrong ? '___' : '✓'}
        </Box>
      </Box>
      {isWrong && <Box sx={{ fontSize: 28, animation: 'icShake 0.4s' }}>✏️</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#2ECC71'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icFillLeft { 0%{width:0} 100%{width:50%} }
        @keyframes icFillRight { 0%{width:0} 100%{width:50%} }
        @keyframes icFillText { 0%{opacity:0;transform:scale(0.5)} 100%{opacity:1;transform:scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// memory_flip: Both cards do a synchronized backflip
function MemoryFlipCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Great memory!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.5, mb: 0.5, perspective: '400px' }}>
        <Box sx={{
          width: 28, height: 36,
          borderRadius: '6px',
          bgcolor: isWrong ? '#ddd' : '#FF6B81',
          animation: isWrong ? 'icShake 0.4s' : 'icFlipCard 0.7s ease-out forwards',
          backfaceVisibility: 'visible',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 14, color: '#fff', fontWeight: 800 }}>
            {isWrong ? '?' : '🧠'}
          </Box>
        </Box>
        <Box sx={{
          width: 28, height: 36,
          borderRadius: '6px',
          bgcolor: isWrong ? '#ddd' : '#FF6B81',
          animation: isWrong ? 'icShake 0.4s' : 'icFlipCard 0.7s ease-out 0.1s forwards',
          backfaceVisibility: 'visible',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 14, color: '#fff', fontWeight: 800 }}>
            {isWrong ? '?' : '🧠'}
          </Box>
        </Box>
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF6B81'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icFlipCard {
          0% { transform: rotateX(0); }
          50% { transform: rotateX(-180deg); }
          100% { transform: rotateX(-360deg); box-shadow: 0 0 12px #FF6B8166; }
        }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// true_false: Thumbs up/down stamps onto answer with ink splat
function TrueFalseCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'You know it!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      {/* Ink splat behind */}
      <Box sx={{
        position: 'absolute',
        width: 50, height: 50,
        borderRadius: '40% 60% 50% 50%',
        bgcolor: isWrong ? '#E74C3C22' : '#2ECC7122',
        animation: isWrong ? 'icSplatWrong 0.4s ease-out both' : 'icSplatCorrect 0.5s ease-out both',
      }} />
      <Box sx={{
        fontSize: 40,
        animation: isWrong ? 'icStampDown 0.3s ease-out' : 'icStampDown 0.3s ease-out',
      }}>
        {isWrong ? '👎' : '👍'}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#2ECC71'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icStampDown { 0%{transform:scale(2) translateY(-20px);opacity:0} 60%{transform:scale(0.9) translateY(2px);opacity:1} 100%{transform:scale(1) translateY(0)} }
        @keyframes icSplatCorrect { 0%{transform:scale(0);opacity:0} 50%{transform:scale(1.3);opacity:0.6} 100%{transform:scale(1);opacity:0.3} }
        @keyframes icSplatWrong { 0%{transform:scale(0);opacity:0} 100%{transform:scale(0.8);opacity:0.3} }
      `}</style>
    </>
  );
}

// counting: Numbers cascade and stack up like a counter rolling
function CountingCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Well counted!', streakCount, score);
  const isWrong = type === 'wrong';
  const nums = [1, 2, 3, 4, 5];
  return (
    <>
      <Box sx={{ display: 'flex', gap: '2px', mb: 0.5, height: 36, alignItems: 'flex-end' }}>
        {nums.map((n, i) => (
          <Box key={i} sx={{
            fontSize: 18, fontWeight: 800,
            color: isWrong ? '#ccc' : '#FF9F43',
            animation: isWrong ? 'icShake 0.4s' : `icCountCascade 0.4s ease-out ${i * 0.08}s both`,
            opacity: 0,
          }}>
            {n}
          </Box>
        ))}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF9F43'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icCountCascade {
          0% { transform: translateY(-30px); opacity: 0; }
          70% { transform: translateY(3px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// tracing: Golden trail with sparkle particles along path
function TracingCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Neat tracing!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      {!isWrong && (
        <Box sx={{ position: 'relative', width: 70, height: 30, mb: 0.5 }}>
          {/* Golden trail path */}
          <Box sx={{
            position: 'absolute', left: 0, top: '50%',
            width: '100%', height: 4,
            borderRadius: '2px',
            bgcolor: '#FFD700',
            transform: 'translateY(-50%)',
            animation: 'icTrailDraw 0.6s ease-out forwards',
            transformOrigin: 'left',
            boxShadow: '0 0 8px #FFD70088',
          }} />
          {/* Sparkle particles along path */}
          {[0, 1, 2, 3].map(i => (
            <Box key={i} sx={{
              position: 'absolute',
              left: `${(i / 3) * 100}%`,
              top: '50%',
              width: 6, height: 6,
              borderRadius: '50%',
              bgcolor: '#FFD700',
              transform: 'translate(-50%, -50%)',
              animation: `icSparkle 0.4s ease-out ${0.3 + i * 0.1}s both`,
              opacity: 0,
              boxShadow: '0 0 6px #FFD700',
            }} />
          ))}
        </Box>
      )}
      {isWrong && <Box sx={{ fontSize: 28, animation: 'icShake 0.4s' }}>✍️</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#6C63FF'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icTrailDraw { 0%{transform:translateY(-50%) scaleX(0)} 100%{transform:translateY(-50%) scaleX(1)} }
        @keyframes icSparkle { 0%{opacity:0;transform:translate(-50%,-50%) scale(0)} 50%{opacity:1;transform:translate(-50%,-50%) scale(1.5)} 100%{opacity:0.6;transform:translate(-50%,-50%) scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// timed_rush: Lightning bolt strike animation
function TimedRushCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Speed demon!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      {!isWrong && (
        <Box sx={{
          position: 'absolute',
          width: 60, height: 60,
          borderRadius: '50%',
          bgcolor: '#FFD70022',
          animation: 'icLightningFlash 0.3s ease-out both',
        }} />
      )}
      <Box sx={{
        fontSize: 44,
        animation: isWrong ? 'icShake 0.4s' : 'icLightningStrike 0.4s ease-out forwards',
      }}>
        {isWrong ? '🐢' : '⚡'}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FFD700'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icLightningStrike { 0%{transform:translateY(-30px) scale(1.5);opacity:0} 40%{transform:translateY(4px) scale(0.9);opacity:1} 100%{transform:translateY(0) scale(1)} }
        @keyframes icLightningFlash { 0%{opacity:0;transform:scale(0.5)} 30%{opacity:0.7;transform:scale(1.5)} 100%{opacity:0;transform:scale(2)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// puzzle_assemble: Piece clicks into place with jigsaw snap
function PuzzleAssembleCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Piece by piece!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{ position: 'relative', width: 50, height: 50, mb: 0.5 }}>
        {/* Base piece */}
        <Box sx={{
          position: 'absolute', left: 0, top: 0,
          width: 24, height: 24,
          bgcolor: isWrong ? '#ddd' : '#A29BFE',
          borderRadius: '3px',
        }} />
        {/* Snapping piece */}
        <Box sx={{
          position: 'absolute', left: 22, top: 0,
          width: 24, height: 24,
          bgcolor: isWrong ? '#ccc' : '#E040FB',
          borderRadius: '3px',
          animation: isWrong ? 'icShake 0.4s' : 'icPuzzleSnap 0.5s ease-out forwards',
        }}>
          {/* Tab */}
          <Box sx={{
            position: 'absolute', left: -6, top: 6,
            width: 8, height: 12,
            borderRadius: '50%',
            bgcolor: isWrong ? '#ccc' : '#E040FB',
          }} />
        </Box>
        {/* Snap flash */}
        {!isWrong && <Box sx={{
          position: 'absolute', left: 20, top: 6,
          width: 8, height: 12,
          bgcolor: '#fff',
          borderRadius: '50%',
          animation: 'icSnapFlash 0.3s ease-out 0.3s both',
          opacity: 0,
        }} />}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#A29BFE'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icPuzzleSnap { 0%{transform:translateX(15px)} 60%{transform:translateX(-2px)} 100%{transform:translateX(0)} }
        @keyframes icSnapFlash { 0%{opacity:0.9;transform:scale(1)} 100%{opacity:0;transform:scale(2)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// story_builder: Book pages fan out then close with golden clasp
function StoryBuilderCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Great story!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{ position: 'relative', width: 60, height: 44, mb: 0.5 }}>
        {/* Pages fanning */}
        {[0, 1, 2].map(i => (
          <Box key={i} sx={{
            position: 'absolute',
            left: '50%', bottom: 0,
            width: 36, height: 44,
            bgcolor: isWrong ? '#eee' : '#FFF8DC',
            border: `1px solid ${isWrong ? '#ddd' : '#DAA520'}`,
            borderRadius: '2px 6px 6px 2px',
            transformOrigin: 'left bottom',
            animation: isWrong ? 'none' : `icPageFan${i} 0.8s ease-out forwards`,
          }} />
        ))}
        {/* Golden clasp */}
        {!isWrong && <Box sx={{
          position: 'absolute',
          left: '50%', bottom: 16,
          width: 10, height: 10,
          borderRadius: '50%',
          bgcolor: '#DAA520',
          transform: 'translateX(-50%)',
          animation: 'icClasp 0.3s ease-out 0.6s both',
          opacity: 0,
          zIndex: 3,
          boxShadow: '0 0 6px #DAA520',
        }} />}
      </Box>
      {isWrong && <Box sx={{ fontSize: 28, animation: 'icShake 0.4s' }}>📚</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#2ECC71'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icPageFan0 { 0%{transform:translateX(-50%) rotate(-30deg)} 60%{transform:translateX(-50%) rotate(-30deg)} 100%{transform:translateX(-50%) rotate(0)} }
        @keyframes icPageFan1 { 0%{transform:translateX(-50%) rotate(0)} 100%{transform:translateX(-50%) rotate(0)} }
        @keyframes icPageFan2 { 0%{transform:translateX(-50%) rotate(30deg)} 60%{transform:translateX(-50%) rotate(30deg)} 100%{transform:translateX(-50%) rotate(0)} }
        @keyframes icClasp { 0%{opacity:0;transform:translateX(-50%) scale(0)} 100%{opacity:1;transform:translateX(-50%) scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// simulation: Gears turning animation
function SimulationCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Well played!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{ position: 'relative', width: 60, height: 50, mb: 0.5 }}>
        {/* Gear 1 */}
        <Box sx={{
          position: 'absolute', left: 4, top: 4,
          fontSize: 30,
          animation: isWrong ? 'none' : 'icGearCW 0.8s linear forwards',
        }}>
          ⚙️
        </Box>
        {/* Gear 2 (smaller, counter-rotate) */}
        <Box sx={{
          position: 'absolute', right: 4, bottom: 4,
          fontSize: 22,
          animation: isWrong ? 'none' : 'icGearCCW 0.8s linear forwards',
        }}>
          ⚙️
        </Box>
      </Box>
      {isWrong && <Box sx={{ fontSize: 28, animation: 'icShake 0.4s' }}>🎮</Box>}
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#00D2D3'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icGearCW { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
        @keyframes icGearCCW { 0%{transform:rotate(0)} 100%{transform:rotate(-360deg)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// spot_difference: Magnifying glass circles the found difference
function SpotDifferenceCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Sharp eyes!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{
        position: 'relative',
        width: 50, height: 50,
        mb: 0.5,
      }}>
        {/* Circle highlight */}
        {!isWrong && <Box sx={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: 36, height: 36,
          borderRadius: '50%',
          border: '3px solid #FF6B6B',
          transform: 'translate(-50%, -50%)',
          animation: 'icSpotCircle 0.6s ease-out forwards',
          opacity: 0,
        }} />}
        {/* Magnifying glass */}
        <Box sx={{
          position: 'absolute',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: 36,
          animation: isWrong ? 'icShake 0.4s' : 'icMagGlass 0.7s ease-out forwards',
        }}>
          🔍
        </Box>
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : '#FF6B6B'} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      <style>{`
        @keyframes icMagGlass { 0%{transform:translate(-50%,-50%) scale(0.5) rotate(-20deg)} 50%{transform:translate(-50%,-50%) scale(1.2) rotate(10deg)} 100%{transform:translate(-50%,-50%) scale(1) rotate(0)} }
        @keyframes icSpotCircle { 0%{opacity:0;transform:translate(-50%,-50%) scale(0.3)} 100%{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// ── Default fallback ────────────────────────────────────────────

function DefaultCelebration({ type, streakCount, score }) {
  const phrase = resolvePhrase(type, 'Correct!', streakCount, score);
  const isWrong = type === 'wrong';
  return (
    <>
      <Box sx={{
        fontSize: type === 'perfect' ? 48 : 36,
        animation: isWrong ? 'icShake 0.4s' : 'icDefaultBounce 0.5s ease',
        filter: isWrong ? 'grayscale(1)' : 'none',
      }}>
        {isWrong ? '😅' : (type === 'perfect' ? '🌟' : '⭐')}
      </Box>
      <PhrasePill text={phrase} color={isWrong ? '#FF4444' : (kidsColors?.primary || '#6C63FF')} />
      <StreakBadge type={type} streakCount={streakCount} />
      <ScoreDisplay type={type} score={score} />
      {!isWrong && <Box sx={{
        position: 'absolute',
        width: 80, height: 80,
        borderRadius: '50%',
        border: '2px solid #6C63FF',
        opacity: 0,
        animation: 'icDefaultRing 0.6s ease-out both',
        pointerEvents: 'none',
      }} />}
      <style>{`
        @keyframes icDefaultBounce { 0%{transform:scale(0.3) translateY(10px)} 50%{transform:scale(1.3) translateY(-8px)} 100%{transform:scale(1) translateY(0)} }
        @keyframes icDefaultRing { 0%{width:20px;height:20px;opacity:0.6} 100%{width:120px;height:120px;opacity:0} }
        @keyframes icShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REGISTRY — maps gameTemplate string to renderer + spoken phrase
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const GAME_REGISTRY = {
  // Voice games
  voice_spell:       { Renderer: VoiceSpellCelebration,    phrase: 'Perfect pronunciation!', duration: 1000 },
  voice_balloon_pop: { Renderer: VoiceBalloonPopCelebration, phrase: 'Pop!', duration: 900 },
  beat_match:        { Renderer: BeatMatchCelebration,     phrase: 'On beat!', duration: 1000 },
  whisper_shout:     { Renderer: WhisperShoutCelebration,  phrase: 'Great control!', duration: 1000 },
  sound_charades:    { Renderer: SoundCharadesCelebration, phrase: 'Nailed it!', duration: 900 },
  story_weaver:      { Renderer: StoryWeaverCelebration,   phrase: 'Great storytelling!', duration: 1100 },
  voice_paint:       { Renderer: VoicePaintCelebration,    phrase: 'Beautiful!', duration: 900 },
  peekaboo:          { Renderer: PeekabooCelebration,      phrase: 'You found me!', duration: 1000 },
  speech_bubble:     { Renderer: SpeechBubbleCelebration,  phrase: 'Bubble popped!', duration: 900 },
  // Touch games
  multiple_choice:   { Renderer: MultipleChoiceCelebration, phrase: 'Right answer!', duration: 900 },
  drag_to_zone:      { Renderer: DragToZoneCelebration,    phrase: 'Perfect placement!', duration: 900 },
  match_pairs:       { Renderer: MatchPairsCelebration,    phrase: 'Matched!', duration: 900 },
  sequence_order:    { Renderer: SequenceOrderCelebration, phrase: 'In order!', duration: 900 },
  word_build:        { Renderer: WordBuildCelebration,     phrase: 'Word complete!', duration: 900 },
  fill_blank:        { Renderer: FillBlankCelebration,     phrase: 'Filled in!', duration: 900 },
  memory_flip:       { Renderer: MemoryFlipCelebration,    phrase: 'Great memory!', duration: 900 },
  true_false:        { Renderer: TrueFalseCelebration,     phrase: 'You know it!', duration: 900 },
  counting:          { Renderer: CountingCelebration,      phrase: 'Well counted!', duration: 900 },
  tracing:           { Renderer: TracingCelebration,       phrase: 'Neat tracing!', duration: 1000 },
  timed_rush:        { Renderer: TimedRushCelebration,     phrase: 'Speed demon!', duration: 800 },
  puzzle_assemble:   { Renderer: PuzzleAssembleCelebration, phrase: 'Piece by piece!', duration: 900 },
  story_builder:     { Renderer: StoryBuilderCelebration,  phrase: 'Great story!', duration: 1100 },
  simulation:        { Renderer: SimulationCelebration,    phrase: 'Well played!', duration: 1000 },
  spot_difference:   { Renderer: SpotDifferenceCelebration, phrase: 'Sharp eyes!', duration: 900 },
};

// Aliases for templates that pass concatenated names (e.g. "voiceballoonpop" instead of "voice_balloon_pop")
GAME_REGISTRY.voiceballoonpop = GAME_REGISTRY.voice_balloon_pop;
GAME_REGISTRY.voicespell      = GAME_REGISTRY.voice_spell;
GAME_REGISTRY.beatmatch       = GAME_REGISTRY.beat_match;
GAME_REGISTRY.whispershout    = GAME_REGISTRY.whisper_shout;
GAME_REGISTRY.soundcharades   = GAME_REGISTRY.sound_charades;
GAME_REGISTRY.storyweaver     = GAME_REGISTRY.story_weaver;
GAME_REGISTRY.voicepaint      = GAME_REGISTRY.voice_paint;
GAME_REGISTRY.speechbubble    = GAME_REGISTRY.speech_bubble;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function InlineCelebration({
  type = 'correct',
  gameTemplate = '',
  visible = false,
  onDone,
  streakCount = 0,
  score,
  position,
}) {
  const entry = GAME_REGISTRY[gameTemplate];
  const Renderer = entry?.Renderer || DefaultCelebration;
  const defaultPhrase = entry?.phrase || 'Correct!';
  const duration = entry?.duration || 900;

  // Speak on correct (not wrong)
  useEffect(() => {
    if (!visible || type === 'wrong') return;
    const phrase = resolvePhrase(type, defaultPhrase, streakCount, score);
    speak(phrase);
  }, [visible, type, defaultPhrase, streakCount, score]);

  return (
    <CelebrationShell
      type={type}
      visible={visible}
      onDone={onDone}
      position={position}
      duration={duration}
    >
      {(animState, celebType) => (
        <Renderer type={celebType} streakCount={streakCount} score={score} />
      )}
    </CelebrationShell>
  );
}
