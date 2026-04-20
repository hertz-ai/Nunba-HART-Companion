import {Box, Typography, useTheme} from '@mui/material';
import React from 'react';

const AXES = [
  {key: 'skill', label: 'Skill'},
  {key: 'usefulness', label: 'Usefulness'},
  {key: 'reliability', label: 'Reliability'},
  {key: 'creativity', label: 'Creativity'},
  {key: 'composite', label: 'Composite'},
];

function polarToCart(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad)};
}

function buildPolygon(cx, cy, r, values) {
  const step = 360 / AXES.length;
  return AXES.map((a, i) => {
    const val = Math.min((values[a.key] || 0) / 5, 1);
    const pt = polarToCart(cx, cy, r * val, step * i);
    return `${pt.x},${pt.y}`;
  }).join(' ');
}

export default function TrustScore({scores = {}, size = 'full'}) {
  const theme = useTheme();
  const dim = size === 'compact' ? 140 : 240;
  const cx = dim / 2;
  const cy = dim / 2;
  const maxR = dim / 2 - (size === 'compact' ? 24 : 36);
  const step = 360 / AXES.length;
  const rings = [0.2, 0.4, 0.6, 0.8, 1.0];
  const lineColor = theme.palette.divider;
  const fillColor =
    theme.palette.mode === 'dark'
      ? 'rgba(0,232,157,0.25)'
      : 'rgba(0,120,255,0.15)';
  const strokeColor = '#0078ff';
  const fontSize = size === 'compact' ? 8 : 11;

  return (
    <Box sx={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        {/* Grid rings */}
        {rings.map((pct) => {
          const pts = AXES.map((_, i) => {
            const pt = polarToCart(cx, cy, maxR * pct, step * i);
            return `${pt.x},${pt.y}`;
          }).join(' ');
          return (
            <polygon
              key={pct}
              points={pts}
              fill="none"
              stroke={lineColor}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const pt = polarToCart(cx, cy, maxR, step * i);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={pt.x}
              y2={pt.y}
              stroke={lineColor}
              strokeWidth={0.5}
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={buildPolygon(cx, cy, maxR, scores)}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2}
        />

        {/* Data points */}
        {AXES.map((a, i) => {
          const val = Math.min((scores[a.key] || 0) / 5, 1);
          const pt = polarToCart(cx, cy, maxR * val, step * i);
          return (
            <circle key={a.key} cx={pt.x} cy={pt.y} r={3} fill={strokeColor} />
          );
        })}

        {/* Labels */}
        {AXES.map((a, i) => {
          const pt = polarToCart(
            cx,
            cy,
            maxR + (size === 'compact' ? 14 : 22),
            step * i
          );
          return (
            <text
              key={a.key}
              x={pt.x}
              y={pt.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize}
              fill={theme.palette.text.secondary}
            >
              {a.label}
            </text>
          );
        })}
      </svg>
      {size === 'full' && scores.composite != null && (
        <Typography variant="body2" color="text.secondary" sx={{mt: 1}}>
          Composite Trust: <strong>{scores.composite.toFixed(1)} / 5.0</strong>
        </Typography>
      )}
    </Box>
  );
}
