import React, { useRef, useEffect, useCallback } from 'react';

/**
 * VoiceVisualizer — Smooth sine-wave circular amplitude with neon glow.
 *
 * Design:
 * - 3 energy bands (bass/mid/treble) drive sine harmonics around the circle
 * - Peaks only go outward (smooth rectifier, never below base radius)
 * - Gradient fill: transparent at base → glowy at peak tips
 * - Neon glow via 3-pass stroke (bloom + mid + sharp)
 * - 60fps, zero shadowBlur, zero canvas filter
 */
var PTS = 180;

var VoiceVisualizer = function({ audioRef, isActive, size, style }) {
  size = size || 200;
  var canvasRef = useRef(null);
  var animRef = useRef(null);
  var analyserRef = useRef(null);
  var sourceRef = useRef(null);
  var audioCtxRef = useRef(null);
  var stateRef = useRef({ bass: 0, mid: 0, treble: 0, bassCur: 0, midCur: 0, trebleCur: 0, time: 0, dir: 1, wasQuiet: false });
  var outerR = useRef(new Float32Array(PTS + 1));

  var connectAnalyser = useCallback(function() {
    if (!audioRef || !audioRef.current || sourceRef.current) return;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      var source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch(e) { /* synthetic fallback */ }
  }, [audioRef]);

  useEffect(function() {
    var canvas = canvasRef.current;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2;
    var baseR = W * 0.25;
    var freqData = new Uint8Array(256);
    var s = stateRef.current;
    var oR = outerR.current;

    if (isActive) connectAnalyser();

    function render() {
      animRef.current = requestAnimationFrame(render);
      s.time += 0.02;
      var an = analyserRef.current;

      if (isActive && an) {
        an.getByteFrequencyData(freqData);
        var bS = 0, mS = 0, tS = 0, len = freqData.length;
        for (var i = 0; i < len; i++) {
          if (i < len * 0.15) bS += freqData[i];
          else if (i < len * 0.5) mS += freqData[i];
          else tS += freqData[i];
        }
        s.bass = bS / (len * 0.15) / 255;
        s.mid = mS / (len * 0.35) / 255;
        s.treble = tS / (len * 0.5) / 255;
      } else {
        s.bass *= 0.95; s.mid *= 0.95; s.treble *= 0.95;
      }

      s.bassCur += (s.bass - s.bassCur) * 0.12;
      s.midCur += (s.mid - s.midCur) * 0.10;
      s.trebleCur += (s.treble - s.trebleCur) * 0.08;
      var energy = s.bassCur * 0.5 + s.midCur * 0.35 + s.trebleCur * 0.15;

      // Flip wave direction on natural speech pauses
      if (isActive) {
        if (energy < 0.03) { s.wasQuiet = true; }
        else if (s.wasQuiet && energy > 0.08) { s.wasQuiet = false; s.dir = -s.dir; }
      }

      var t = s.time;
      var d = s.dir;

      ctx.fillStyle = '#0A0914';
      ctx.fillRect(0, 0, W, H);

      // Background glow
      var bg = ctx.createRadialGradient(cx, cy, baseR - 10, cx, cy, baseR + 70);
      bg.addColorStop(0, 'rgba(108,99,255,' + (0.02 + energy * 0.06).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(10,9,20,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(cx, cy, baseR + 70, 0, Math.PI * 2); ctx.fill();

      // Compute outer ring — peaks only outward
      var maxPeakR = baseR;
      for (var i = 0; i <= PTS; i++) {
        var a = (i / PTS) * Math.PI * 2;
        // Idle breathing — visible but calm
        var idle =
          6 * Math.sin(2 * a + t * 0.6) +
          4 * Math.sin(3 * a - t * 0.45) +
          3 * Math.sin(5 * a + t * 0.7);
        var wave = idle +
          s.bassCur * 55 * Math.sin(2 * a + t * 1.5 * d) +
          s.bassCur * 32 * Math.sin(3 * a - t * 0.8 * d) +
          s.midCur * 40 * Math.sin(4 * a + t * 2.2 * d) +
          s.midCur * 24 * Math.sin(6 * a - t * 1.3 * d) +
          s.trebleCur * 28 * Math.sin(8 * a + t * 3.0 * d) +
          s.trebleCur * 16 * Math.sin(11 * a - t * 1.8 * d);
        var soft = 8;
        var rectified = (wave * wave) / (Math.abs(wave) + soft);
        // Scale amplitude relative to canvas size
        oR[i] = baseR + rectified * (baseR / 100);
        if (oR[i] > maxPeakR) maxPeakR = oR[i];
      }

      // Fill area between base and outer
      ctx.beginPath();
      for (var i = 0; i <= PTS; i++) {
        var a = (i / PTS) * Math.PI * 2;
        var x = cx + Math.cos(a) * oR[i], y = cy + Math.sin(a) * oR[i];
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (var i = PTS; i >= 0; i--) {
        var a = (i / PTS) * Math.PI * 2;
        ctx.lineTo(cx + Math.cos(a) * baseR, cy + Math.sin(a) * baseR);
      }
      ctx.closePath();

      if (maxPeakR > baseR + 1) {
        var fg = ctx.createRadialGradient(cx, cy, baseR, cx, cy, maxPeakR);
        fg.addColorStop(0, 'rgba(10,9,20,0)');
        fg.addColorStop(0.3, 'rgba(80,60,220,' + (0.08 + energy * 0.15).toFixed(3) + ')');
        fg.addColorStop(0.7, 'rgba(108,99,255,' + (0.15 + energy * 0.25).toFixed(3) + ')');
        fg.addColorStop(1, 'rgba(150,140,255,' + (0.25 + energy * 0.4).toFixed(3) + ')');
        ctx.fillStyle = fg;
      } else {
        ctx.fillStyle = 'rgba(108,99,255,0.05)';
      }
      ctx.fill();

      // Neon ring — 3 passes
      ctx.globalCompositeOperation = 'lighter';

      drawRing(ctx, cx, cy, oR, 'rgba(108,99,255,' + (0.04 + energy * 0.05).toFixed(3) + ')', 14);
      drawRing(ctx, cx, cy, oR, 'rgba(108,99,255,' + (0.08 + energy * 0.1).toFixed(3) + ')', 6);
      drawRing(ctx, cx, cy, oR, 'rgba(170,165,255,' + (0.5 + energy * 0.5).toFixed(3) + ')', 1.8);

      ctx.globalCompositeOperation = 'source-over';

      // Core — breathing glow + pulsing dot
      var breathe1 = Math.sin(t * 1.2) * 0.3 + Math.sin(t * 1.9) * 0.15;
      var breathe2 = Math.sin(t * 0.8) * 0.2 + Math.cos(t * 1.4) * 0.1;

      var glowR = (8 + energy * 12 + breathe1 * 4) * 3;
      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      cg.addColorStop(0, 'rgba(200,195,255,' + (0.15 + energy * 0.5 + breathe1 * 0.08).toFixed(3) + ')');
      cg.addColorStop(0.3, 'rgba(108,99,255,' + (0.08 + energy * 0.2 + breathe2 * 0.04).toFixed(3) + ')');
      cg.addColorStop(0.6, 'rgba(80,60,200,' + (0.03 + energy * 0.08 + breathe1 * 0.02).toFixed(3) + ')');
      cg.addColorStop(1, 'rgba(108,99,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, Math.PI * 2); ctx.fill();

      var coreR = 3 + energy * 6 + breathe1 * 1.5;
      var cg2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      cg2.addColorStop(0, 'rgba(220,215,255,' + (0.3 + energy * 0.5 + breathe2 * 0.1).toFixed(3) + ')');
      cg2.addColorStop(0.5, 'rgba(108,99,255,' + (0.1 + energy * 0.3 + breathe1 * 0.05).toFixed(3) + ')');
      cg2.addColorStop(1, 'rgba(108,99,255,0)');
      ctx.fillStyle = cg2;
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill();

      var dotR = 1.5 + energy * 2.5 + Math.sin(t * 2.5) * 0.6;
      ctx.fillStyle = 'rgba(255,255,255,' + (0.15 + energy * 0.7 + breathe2 * 0.1).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI * 2); ctx.fill();
    }

    render();
    return function() { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isActive, connectAnalyser]);

  useEffect(function() {
    return function() {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch(e) {}
      }
    };
  }, []);

  return React.createElement('div', {
    style: Object.assign({
      width: size, height: size, position: 'relative',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }, style || {}),
  },
    React.createElement('canvas', {
      ref: canvasRef,
      width: size * 2, height: size * 2,
      style: { width: size, height: size, borderRadius: '50%' },
    }),
    isActive ? React.createElement('div', {
      style: {
        position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)',
        fontSize: 8, letterSpacing: 4, textTransform: 'uppercase', fontWeight: 700,
        background: 'linear-gradient(90deg,#6C63FF,#00D2FF)', WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent', backgroundClip: 'text', opacity: 0.7,
      },
    }, 'Speaking') : null
  );
};

function drawRing(ctx, cx, cy, oR, color, lw) {
  ctx.beginPath();
  for (var i = 0; i <= PTS; i++) {
    var a = (i / PTS) * Math.PI * 2;
    var x = cx + Math.cos(a) * oR[i], y = cy + Math.sin(a) * oR[i];
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.stroke();
}

export default VoiceVisualizer;
