import {useSocial} from '../../../contexts/SocialContext';
import {resonanceApi} from '../../../services/socialApi';
import {socialTokens, RADIUS} from '../../../theme/socialTokens';
import ResonanceWallet, {
  ResonanceWalletSkeleton,
} from '../shared/ResonanceWallet';

import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import {
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Skeleton,
  Fade,
  Grow,
  Avatar,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useMemo} from 'react';

// Loading skeleton for the entire dashboard
function DashboardSkeleton() {
  const theme = useTheme();

  // Polished card styles
  const cardStyle = {
    p: 3,
    borderRadius: RADIUS.lg,
    background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
  };

  const streakCardStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    p: 2.5,
    borderRadius: RADIUS.lg,
    mb: 2,
    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
    border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
    position: 'relative',
    overflow: 'hidden',
  };

  return (
    <Fade in={true} timeout={300}>
      <Box>
        <Box sx={cardStyle}>
          <Skeleton
            variant="text"
            width={120}
            height={36}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
          />
          <ResonanceWalletSkeleton />
        </Box>

        <Box sx={{...streakCardStyle, mt: 2}}>
          <Skeleton
            variant="circular"
            width={56}
            height={56}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
          />
          <Box sx={{flex: 1}}>
            <Skeleton
              variant="text"
              width={80}
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
            />
            <Skeleton
              variant="text"
              width={60}
              sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
            />
          </Box>
        </Box>

        <Box sx={{display: 'flex', gap: 2, mb: 2, mt: 2}}>
          <Skeleton
            variant="rounded"
            width={80}
            height={36}
            sx={{
              bgcolor: alpha(theme.palette.common.white, 0.05),
              borderRadius: 1,
            }}
          />
          <Skeleton
            variant="rounded"
            width={100}
            height={36}
            sx={{
              bgcolor: alpha(theme.palette.common.white, 0.05),
              borderRadius: 1,
            }}
          />
        </Box>

        <Box sx={cardStyle}>
          <Skeleton
            variant="text"
            width={160}
            sx={{bgcolor: alpha(theme.palette.common.white, 0.05), mb: 2}}
          />
          {[1, 2, 3, 4, 5].map((i) => (
            <Box
              key={i}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                py: 1.5,
                borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
              }}
            >
              <Skeleton
                variant="text"
                width="60%"
                sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
              />
              <Skeleton
                variant="text"
                width="20%"
                sx={{bgcolor: alpha(theme.palette.common.white, 0.05)}}
              />
            </Box>
          ))}
        </Box>
      </Box>
    </Fade>
  );
}

// Transaction row with hover effect
function TransactionRow({txn, index}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Fade in={true} timeout={200 + index * 50}>
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1.25,
          px: 1.5,
          mx: -1.5,
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
          borderRadius: 1,
          fontSize: '0.85rem',
          background: isHovered
            ? alpha(theme.palette.common.white, 0.03)
            : 'transparent',
          transition: 'all 0.2s ease',
        }}
      >
        <Typography
          variant="body2"
          sx={{color: alpha(theme.palette.common.white, 0.7)}}
        >
          {txn.description || txn.source_type}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            color:
              txn.amount > 0
                ? theme.palette.primary.main
                : theme.palette.error.main,
            textShadow: isHovered
              ? txn.amount > 0
                ? `0 0 8px ${alpha(theme.palette.primary.main, 0.5)}`
                : `0 0 8px ${alpha(theme.palette.error.main, 0.5)}`
              : 'none',
            transition: 'text-shadow 0.2s ease',
          }}
        >
          {txn.amount > 0 ? '+' : ''}
          {txn.amount} {txn.currency}
        </Typography>
      </Box>
    </Fade>
  );
}

// Leaderboard entry with hover effect
function LeaderboardEntry({entry, index, currency}) {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const isTopThree = index < 3;

  const getRankColor = () => {
    if (index === 0) return '#FFD700';
    if (index === 1) return '#C0C0C0';
    if (index === 2) return '#CD7F32';
    return alpha(theme.palette.common.white, 0.5);
  };

  return (
    <Grow in={true} timeout={300 + index * 50}>
      <Box
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          py: 1.25,
          px: 1.5,
          mx: -1.5,
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
          borderRadius: 1,
          background: isHovered
            ? `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, transparent 100%)`
            : isTopThree
              ? 'linear-gradient(90deg, rgba(255, 215, 0, 0.03) 0%, transparent 100%)'
              : 'transparent',
          transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <Typography
          sx={{
            width: 32,
            fontWeight: 800,
            textAlign: 'center',
            color: getRankColor(),
            fontSize: isTopThree ? '1rem' : '0.875rem',
          }}
        >
          {entry.rank || index + 1}
        </Typography>
        <Avatar
          src={entry.avatar_url}
          sx={{
            width: 28,
            height: 28,
            border: isHovered
              ? `2px solid ${alpha(theme.palette.primary.main, 0.5)}`
              : '2px solid transparent',
            transition: 'border 0.3s ease',
          }}
        >
          {(entry.display_name || entry.username || 'U')[0]}
        </Avatar>
        <Box sx={{flex: 1}}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              color: isHovered ? theme.palette.primary.main : '#fff',
              transition: 'color 0.3s ease',
            }}
          >
            {entry.display_name || entry.username}
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 700,
            color: isTopThree ? '#FFD700' : theme.palette.secondary.main,
            textShadow: isHovered
              ? `0 0 10px ${alpha(theme.palette.secondary.main, 0.5)}`
              : 'none',
            transition: 'text-shadow 0.3s ease',
          }}
        >
          {entry[currency] ?? entry.pulse ?? 0}
        </Typography>
      </Box>
    </Grow>
  );
}

export default function ResonanceDashboard() {
  const {resonance} = useSocial();
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [wallet, setWallet] = useState(resonance);
  const [transactions, setTransactions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streakInfo, setStreakInfo] = useState(null);
  const [lbCurrency, setLbCurrency] = useState('pulse');
  const [checkingIn, setCheckingIn] = useState(false);

  // Theme-dependent card styles
  const cardStyle = useMemo(
    () => ({
      p: 3,
      borderRadius: RADIUS.lg,
      background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`,
      backdropFilter: 'blur(20px)',
      border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
    }),
    [theme]
  );

  const streakCardStyle = useMemo(
    () => ({
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      p: 2.5,
      borderRadius: RADIUS.lg,
      mb: 2,
      background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
      border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
      position: 'relative',
      overflow: 'hidden',
    }),
    [theme]
  );

  useEffect(() => {
    Promise.all([
      resonanceApi.getWallet().catch(() => null),
      resonanceApi.getTransactions({limit: 50}).catch(() => null),
      resonanceApi
        .getLeaderboard({currency: 'pulse', limit: 20})
        .catch(() => null),
      resonanceApi.getStreak().catch(() => null),
    ]).then(([w, t, l, s]) => {
      if (w?.data) setWallet(w.data);
      if (t?.data) setTransactions(t.data);
      if (l?.data) setLeaderboard(l.data);
      if (s?.data) setStreakInfo(s.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    resonanceApi
      .getLeaderboard({currency: lbCurrency, limit: 20})
      .then((res) => {
        if (res?.data) setLeaderboard(res.data);
      })
      .catch(() => {});
  }, [lbCurrency]);

  const handleCheckin = async () => {
    setCheckingIn(true);
    try {
      const res = await resonanceApi.dailyCheckin();
      if (res.data) setStreakInfo(res.data);
      const w = await resonanceApi.getWallet();
      if (w?.data) setWallet(w.data);
    } catch {
      /* already checked in */
    }
    setCheckingIn(false);
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <Fade in={true} timeout={400}>
      <Box>
        {/* Wallet Section */}
        <Box sx={cardStyle}>
          <Typography
            variant="h5"
            gutterBottom
            sx={{
              fontWeight: 700,
              background: `linear-gradient(135deg, #fff 0%, ${alpha(theme.palette.common.white, 0.7)} 100%)`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Resonance
          </Typography>
          <ResonanceWallet wallet={wallet} />
        </Box>

        {/* Streak Section */}
        {streakInfo && (
          <Grow in={true} timeout={500}>
            <Box sx={streakCardStyle}>
              {/* Animated fire background */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -20,
                  right: -20,
                  width: 100,
                  height: 100,
                  background:
                    'radial-gradient(circle, rgba(255, 107, 0, 0.2) 0%, transparent 70%)',
                  borderRadius: '50%',
                  filter: 'blur(20px)',
                }}
              />

              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background:
                    'linear-gradient(135deg, rgba(255, 107, 0, 0.2) 0%, rgba(255, 165, 0, 0.2) 100%)',
                  position: 'relative',
                }}
              >
                <LocalFireDepartmentIcon
                  sx={{fontSize: 28, color: '#FF6B00'}}
                />
                <Typography
                  sx={{
                    position: 'absolute',
                    bottom: -4,
                    right: -4,
                    bgcolor: '#FF6B00',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(255, 107, 0, 0.5)',
                  }}
                >
                  {streakInfo.streak_days || 0}
                </Typography>
              </Box>
              <Box sx={{flex: 1}}>
                <Typography
                  variant="subtitle1"
                  sx={{fontWeight: 700, color: '#fff'}}
                >
                  Day Streak
                </Typography>
                <Typography
                  variant="caption"
                  sx={{color: alpha(theme.palette.common.white, 0.6)}}
                >
                  Best: {streakInfo.streak_best || 0} days
                </Typography>
              </Box>
              {!streakInfo.already_checked_in && (
                <Chip
                  label={checkingIn ? 'Checking in...' : 'Check In'}
                  color="primary"
                  clickable
                  disabled={checkingIn}
                  onClick={handleCheckin}
                  sx={{
                    fontWeight: 600,
                    background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      transform: 'scale(1.05)',
                      boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.4)}`,
                    },
                  }}
                />
              )}
            </Box>
          </Grow>
        )}

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(e, v) => setTab(v)}
          sx={{
            mb: 2,
            '& .MuiTab-root': {
              color: alpha(theme.palette.common.white, 0.5),
              fontWeight: 600,
              transition: 'color 0.3s ease',
              '&.Mui-selected': {
                color: theme.palette.primary.main,
              },
            },
            '& .MuiTabs-indicator': {
              background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
              height: 3,
              borderRadius: 1.5,
            },
          }}
        >
          <Tab label="History" />
          <Tab label="Leaderboard" />
        </Tabs>

        {/* History Tab */}
        {tab === 0 && (
          <Fade in={true} timeout={300}>
            <Box sx={cardStyle}>
              <Typography
                variant="subtitle1"
                gutterBottom
                sx={{fontWeight: 700, color: '#fff', mb: 2}}
              >
                Recent Transactions
              </Typography>
              {transactions.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.5),
                    py: 4,
                    textAlign: 'center',
                  }}
                >
                  No transactions yet.
                </Typography>
              ) : (
                transactions.map((txn, i) => (
                  <TransactionRow key={i} txn={txn} index={i} />
                ))
              )}
            </Box>
          </Fade>
        )}

        {/* Leaderboard Tab */}
        {tab === 1 && (
          <Fade in={true} timeout={300}>
            <Box sx={cardStyle}>
              <Box sx={{display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap'}}>
                {['pulse', 'spark', 'signal', 'level'].map((c) => (
                  <Chip
                    key={c}
                    label={c.charAt(0).toUpperCase() + c.slice(1)}
                    clickable
                    onClick={() => setLbCurrency(c)}
                    size="small"
                    sx={{
                      fontWeight: 600,
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      background:
                        lbCurrency === c
                          ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
                          : alpha(theme.palette.common.white, 0.05),
                      color:
                        lbCurrency === c
                          ? '#fff'
                          : alpha(theme.palette.common.white, 0.6),
                      border:
                        lbCurrency === c
                          ? 'none'
                          : `1px solid ${alpha(theme.palette.common.white, 0.1)}`,
                      '&:hover': {
                        background:
                          lbCurrency === c
                            ? `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`
                            : alpha(theme.palette.common.white, 0.1),
                        transform: 'scale(1.05)',
                      },
                    }}
                  />
                ))}
              </Box>
              {leaderboard.length === 0 ? (
                <Typography
                  variant="body2"
                  sx={{
                    color: alpha(theme.palette.common.white, 0.5),
                    py: 4,
                    textAlign: 'center',
                  }}
                >
                  No leaderboard data yet.
                </Typography>
              ) : (
                leaderboard.map((entry, i) => (
                  <LeaderboardEntry
                    key={i}
                    entry={entry}
                    index={i}
                    currency={lbCurrency}
                  />
                ))
              )}
            </Box>
          </Fade>
        )}
      </Box>
    </Fade>
  );
}
