import {Box, Typography, Tooltip, Skeleton, Fade} from '@mui/material';
import React, {useState, useEffect} from 'react';

function getLevelColor(level) {
  if (level >= 26) return 'linear-gradient(135deg, #FFD700, #FFA500)';
  if (level >= 11) return 'linear-gradient(135deg, #0078ff, #6c3bff)';
  return 'linear-gradient(135deg, #00e89d, #0078ff)';
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n || 0);
}

// Polished metric card styles
const metricCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  borderRadius: 2,
  background:
    'linear-gradient(135deg, rgba(26, 26, 46, 0.6) 0%, rgba(15, 15, 26, 0.7) 100%)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.05)',
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'default',
  '&:hover': {
    transform: 'translateY(-2px) scale(1.02)',
    border: '1px solid rgba(0, 232, 157, 0.2)',
    boxShadow: '0 8px 24px rgba(0, 232, 157, 0.1)',
  },
};

// Skeleton loader for wallet
export function ResonanceWalletSkeleton({compact = false}) {
  return (
    <Box
      sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center'}}
    >
      <Skeleton
        variant="circular"
        width={36}
        height={36}
        sx={{bgcolor: 'rgba(255,255,255,0.05)'}}
      />
      {[1, 2, 3].map((i) => (
        <Skeleton
          key={i}
          variant="rounded"
          width={compact ? 48 : 60}
          height={compact ? 40 : 48}
          sx={{bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2}}
        />
      ))}
      <Skeleton
        variant="rounded"
        width={120}
        height={8}
        sx={{bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, flexGrow: 1}}
      />
    </Box>
  );
}

// Animated XP progress bar
function XPProgressBar({xpPct}) {
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(xpPct), 100);
    return () => clearTimeout(timer);
  }, [xpPct]);

  return (
    <Box
      sx={{
        height: 8,
        borderRadius: 4,
        background: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${animatedPct}%`,
          borderRadius: 4,
          background: 'linear-gradient(90deg, #00e89d 0%, #0078ff 100%)',
          transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: '0 0 16px rgba(0, 232, 157, 0.4)',
        }}
      />
    </Box>
  );
}

export default function ResonanceWallet({
  wallet,
  compact = false,
  loading = false,
}) {
  const [hoveredLevel, setHoveredLevel] = useState(false);

  if (loading) return <ResonanceWalletSkeleton compact={compact} />;
  if (!wallet) return null;

  const xpPct =
    wallet.xp_next_level > 0
      ? Math.min(100, (wallet.xp / wallet.xp_next_level) * 100)
      : 0;
  const pad = compact ? {px: 1, py: 0.5} : {px: 1.5, py: 0.75};

  return (
    <Fade in={true} timeout={400}>
      <Box
        sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center'}}
      >
        <Tooltip
          title={`Level ${wallet.level} - ${wallet.level_title || 'Newcomer'}`}
          arrow
        >
          <Box
            onMouseEnter={() => setHoveredLevel(true)}
            onMouseLeave={() => setHoveredLevel(false)}
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.85rem',
              color: '#fff',
              flexShrink: 0,
              background: getLevelColor(wallet.level || 1),
              boxShadow: hoveredLevel
                ? '0 0 20px rgba(0, 232, 157, 0.5), 0 4px 12px rgba(0,0,0,0.3)'
                : '0 4px 12px rgba(0,0,0,0.2)',
              transform: hoveredLevel ? 'scale(1.1)' : 'scale(1)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}
          >
            {wallet.level || 1}
          </Box>
        </Tooltip>
        {[
          {
            label: 'Pulse',
            value: formatNumber(wallet.pulse),
            color: '#e74c3c',
            glow: 'rgba(231, 76, 60, 0.3)',
          },
          {
            label: 'Spark',
            value: formatNumber(wallet.spark),
            color: '#f39c12',
            glow: 'rgba(243, 156, 18, 0.3)',
          },
          {
            label: 'Signal',
            value:
              typeof wallet.signal === 'number'
                ? wallet.signal.toFixed(2)
                : '0.00',
            color: '#3498db',
            glow: 'rgba(52, 152, 219, 0.3)',
          },
        ].map((m, index) => (
          <Fade in={true} timeout={300 + index * 100} key={m.label}>
            <Box
              sx={{
                ...metricCardStyle,
                ...pad,
                minWidth: compact ? 48 : 60,
                '&:hover': {
                  ...metricCardStyle['&:hover'],
                  boxShadow: `0 8px 24px ${m.glow}`,
                },
              }}
            >
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: compact ? '0.85rem' : '1rem',
                  color: m.color,
                  lineHeight: 1.2,
                  textShadow: `0 0 10px ${m.glow}`,
                }}
              >
                {m.value}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.5)',
                  letterSpacing: 0.5,
                  fontWeight: 500,
                }}
              >
                {m.label}
              </Typography>
            </Box>
          </Fade>
        ))}
        <Tooltip
          title={`${wallet.xp || 0} / ${wallet.xp_next_level || 100} XP`}
          arrow
        >
          <Box sx={{flexGrow: 1, minWidth: 80, maxWidth: 160}}>
            <XPProgressBar xpPct={xpPct} />
          </Box>
        </Tooltip>
      </Box>
    </Fade>
  );
}
