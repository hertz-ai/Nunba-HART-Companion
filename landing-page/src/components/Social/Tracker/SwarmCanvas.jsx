/**
 * SwarmCanvas - Canvas 2D particle visualization of the agent hive.
 *
 * Each dot = one agent. Clustering by experiment_post_id via spring forces.
 * Encounter lines between agents that share bonds.
 * Click detection, hover tooltips, performance cap at 500 particles.
 */

import { Box, Typography, useTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';

// ---- Physics constants ----
const SPRING_K = 0.003;     // attraction to cluster center
const DAMPING = 0.95;       // velocity decay
const REPULSION = 50;       // min distance between particles
const REPULSION_FORCE = 0.5;
const MAX_PARTICLES = 500;
const MAX_ENCOUNTER_LINES = 300;
const PARTICLE_RADIUS = 8;
const HIT_RADIUS = 20;

// ---- Stage colors ----
const STAGE_COLORS = {
  creation: '#8BC34A',
  review: '#4CAF50',
  completed: '#00BCD4',
  evaluation: '#6C63FF',
  reuse: '#7B1FA2',
};

function getStageKey(status) {
  if (!status) return 'creation';
  const s = status.toLowerCase();
  if (s.includes('creation')) return 'creation';
  if (s.includes('review')) return 'review';
  if (s === 'completed' || s.includes('complete')) return 'completed';
  if (s.includes('evaluation')) return 'evaluation';
  if (s.includes('reuse')) return 'reuse';
  return 'creation';
}

/** Hash a string to a number for seeding positions */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function SwarmCanvas({ agents = [], encounters = [], onAgentSelect }) {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animFrameRef = useRef(null);
  const hoveredRef = useRef(null);
  const theme = useTheme();

  const [tooltip, setTooltip] = useState(null);

  // Build encounter lookup: agent_id -> set of connected agent_ids + bond_level
  const encounterMap = useMemo(() => {
    const map = {};
    encounters.forEach((enc) => {
      const a = enc.agent_id_a || enc.agent_a;
      const b = enc.agent_id_b || enc.agent_b;
      if (!a || !b) return;
      if (!map[a]) map[a] = [];
      if (!map[b]) map[b] = [];
      map[a].push({ target: b, bond: enc.bond_level ?? 0.5 });
      map[b].push({ target: a, bond: enc.bond_level ?? 0.5 });
    });
    return map;
  }, [encounters]);

  // Initialize particles when agents change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const capped = agents.slice(0, MAX_PARTICLES);

    // Compute experiment centroids (deterministic from experiment_post_id hash)
    const centroids = {};
    capped.forEach((a) => {
      const key = a.experiment_post_id || 'none';
      if (!centroids[key]) {
        const seed = hashStr(key);
        centroids[key] = {
          x: 60 + (seed % (w - 120)),
          y: 60 + ((seed * 7) % (h - 120)),
        };
      }
    });

    // Reuse existing positions if count matches
    const existing = particlesRef.current;
    const particles = capped.map((agent, i) => {
      const key = agent.experiment_post_id || 'none';
      const centroid = centroids[key];
      const prev = existing[i];
      const color = STAGE_COLORS[getStageKey(agent.agent_status)] || '#6C63FF';
      return {
        agent,
        x: prev?.x ?? centroid.x + (Math.random() - 0.5) * 80,
        y: prev?.y ?? centroid.y + (Math.random() - 0.5) * 80,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        color,
        centroidX: centroid.x,
        centroidY: centroid.y,
        radius: PARTICLE_RADIUS,
      };
    });
    particlesRef.current = particles;
  }, [agents]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let running = true;

    // Handle DPR for crisp rendering
    const resizeCanvas = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);
    };
    resizeCanvas();

    const resizeObs = new ResizeObserver(resizeCanvas);
    resizeObs.observe(canvas.parentElement);

    function tick() {
      if (!running) return;
      const particles = particlesRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;

      // --- Physics step ---
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Spring toward centroid
        const dx = p.centroidX - p.x;
        const dy = p.centroidY - p.y;
        p.vx += dx * SPRING_K;
        p.vy += dy * SPRING_K;

        // Repulsion from nearby particles
        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const rx = p.x - q.x;
          const ry = p.y - q.y;
          const dist = Math.sqrt(rx * rx + ry * ry) || 1;
          if (dist < REPULSION) {
            const force = REPULSION_FORCE * (1 - dist / REPULSION);
            const nx = (rx / dist) * force;
            const ny = (ry / dist) * force;
            p.vx += nx;
            p.vy += ny;
            q.vx -= nx;
            q.vy -= ny;
          }
        }

        // Damping
        p.vx *= DAMPING;
        p.vy *= DAMPING;

        // Integrate
        p.x += p.vx;
        p.y += p.vy;

        // Boundary clamp
        p.x = Math.max(p.radius, Math.min(w - p.radius, p.x));
        p.y = Math.max(p.radius, Math.min(h - p.radius, p.y));
      }

      // --- Draw ---
      ctx.clearRect(0, 0, w, h);

      // Encounter lines (only if particle count is manageable)
      if (particles.length <= MAX_ENCOUNTER_LINES) {
        const idToIdx = {};
        particles.forEach((p, idx) => {
          const id = p.agent.id || p.agent.title;
          if (id) idToIdx[id] = idx;
        });

        ctx.lineWidth = 1;
        const drawn = new Set();
        particles.forEach((p) => {
          const pId = p.agent.id || p.agent.title;
          const bonds = encounterMap[pId] || [];
          bonds.forEach(({ target, bond }) => {
            const key = [pId, target].sort().join(':');
            if (drawn.has(key)) return;
            drawn.add(key);
            const tIdx = idToIdx[target];
            if (tIdx == null) return;
            const q = particles[tIdx];
            ctx.strokeStyle = `rgba(108, 99, 255, ${Math.min(0.5, bond * 0.6)})`;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          });
        });
      }

      // Particles
      const hovered = hoveredRef.current;
      particles.forEach((p) => {
        const isHover = hovered === p;
        const r = isHover ? p.radius * 1.5 : p.radius;

        // Glow
        if (isHover) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = `${p.color}33`;
          ctx.fill();
        }

        // Main dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();

        // Border
        ctx.strokeStyle = isHover ? '#fff' : 'rgba(255,255,255,0.15)';
        ctx.lineWidth = isHover ? 2 : 1;
        ctx.stroke();
      });

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
      resizeObs.disconnect();
    };
  }, [encounterMap]);

  // Mouse handlers
  const findNearest = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    let best = null;
    let bestDist = HIT_RADIUS;
    particlesRef.current.forEach((p) => {
      const dx = p.x - mx;
      const dy = p.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    });
    return best;
  }, []);

  const handleMouseMove = useCallback((e) => {
    const p = findNearest(e.clientX, e.clientY);
    hoveredRef.current = p;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = p ? 'pointer' : 'default';

    if (p) {
      const rect = canvas.getBoundingClientRect();
      setTooltip({
        text: p.agent.title || 'Unnamed Agent',
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 24,
      });
    } else {
      setTooltip(null);
    }
  }, [findNearest]);

  const handleClick = useCallback((e) => {
    const p = findNearest(e.clientX, e.clientY);
    if (p && onAgentSelect) {
      onAgentSelect(p.agent);
    }
  }, [findNearest, onAgentSelect]);

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { hoveredRef.current = null; setTooltip(null); }}
        onClick={handleClick}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* Tooltip overlay */}
      {tooltip && (
        <Box sx={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateX(-50%)',
          pointerEvents: 'none',
          px: 1, py: 0.5,
          bgcolor: alpha('#0F0E17', 0.9),
          borderRadius: '6px',
          border: `1px solid ${alpha('#6C63FF', 0.3)}`,
          zIndex: 10,
        }}>
          <Typography variant="caption" sx={{ color: '#fff', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
            {tooltip.text}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
