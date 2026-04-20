import {Box, Typography, useTheme} from '@mui/material';
import React from 'react';

const STAGES = [
  {key: 'seed', label: 'Seed', icon: '\u{1F331}', color: '#8BC34A'},
  {key: 'sprout', label: 'Sprout', icon: '\u{1F33F}', color: '#4CAF50'},
  {key: 'sapling', label: 'Sapling', icon: '\u{1FAB4}', color: '#00BCD4'},
  {key: 'tree', label: 'Tree', icon: '\u{1F333}', color: '#0078ff'},
  {key: 'ancient', label: 'Ancient', icon: '\u{1F332}', color: '#7B1FA2'},
];

function getStageIndex(stage) {
  const idx = STAGES.findIndex((s) => s.key === (stage || '').toLowerCase());
  return idx >= 0 ? idx : 0;
}

export default function EvolutionTimeline({evolution = {}, compact = false}) {
  const theme = useTheme();
  const currentIdx = getStageIndex(evolution.stage || evolution.current_stage);
  const progress = evolution.progress ?? 0;

  if (compact) {
    return (
      <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
        {STAGES.map((s, i) => (
          <Box key={s.key} sx={{display: 'flex', alignItems: 'center'}}>
            <Box
              sx={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                bgcolor:
                  i <= currentIdx ? s.color : 'action.disabledBackground',
                opacity: i <= currentIdx ? 1 : 0.4,
                transition: 'all 0.3s',
              }}
            >
              {s.icon}
            </Box>
            {i < STAGES.length - 1 && (
              <Box
                sx={{
                  width: 16,
                  height: 2,
                  mx: 0.25,
                  bgcolor:
                    i < currentIdx
                      ? STAGES[i + 1].color
                      : 'action.disabledBackground',
                  transition: 'all 0.3s',
                }}
              />
            )}
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{py: 1}}>
      {STAGES.map((s, i) => {
        const isActive = i === currentIdx;
        const isPast = i < currentIdx;
        const isFuture = i > currentIdx;

        return (
          <Box key={s.key} sx={{display: 'flex', gap: 2, position: 'relative'}}>
            {/* Vertical connector */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: 40,
                flexShrink: 0,
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  bgcolor: isFuture ? 'action.disabledBackground' : s.color,
                  opacity: isFuture ? 0.4 : 1,
                  border: isActive ? `2px solid ${s.color}` : 'none',
                  boxShadow: isActive ? `0 0 12px ${s.color}40` : 'none',
                  transition: 'all 0.3s',
                }}
              >
                {s.icon}
              </Box>
              {i < STAGES.length - 1 && (
                <Box
                  sx={{
                    width: 2,
                    flexGrow: 1,
                    minHeight: 24,
                    bgcolor: isPast
                      ? STAGES[i + 1].color
                      : 'action.disabledBackground',
                    transition: 'all 0.3s',
                  }}
                />
              )}
            </Box>

            {/* Label and detail */}
            <Box sx={{pb: i < STAGES.length - 1 ? 2 : 0, pt: 0.5}}>
              <Typography
                variant="subtitle2"
                sx={{
                  fontWeight: isActive ? 700 : 500,
                  color: isFuture ? 'text.disabled' : 'text.primary',
                }}
              >
                {s.label}
                {isActive && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ml: 1, color: s.color}}
                  >
                    (Current - {progress}%)
                  </Typography>
                )}
                {isPast && (
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ml: 1, color: 'success.main'}}
                  >
                    Completed
                  </Typography>
                )}
              </Typography>
              {isActive && progress > 0 && (
                <Box
                  sx={{
                    mt: 0.5,
                    height: 4,
                    borderRadius: 2,
                    bgcolor: 'action.hover',
                    width: {xs: 120, md: 200},
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      borderRadius: 2,
                      width: `${progress}%`,
                      background: `linear-gradient(to right, ${s.color}, ${STAGES[Math.min(i + 1, STAGES.length - 1)].color})`,
                      transition: 'width 0.5s',
                    }}
                  />
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
