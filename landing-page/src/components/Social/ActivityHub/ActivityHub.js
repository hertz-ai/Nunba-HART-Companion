import {useSocial} from '../../../contexts/SocialContext';
import {
  gamesApi,
  computeApi,
  challengesApi,
  resonanceApi,
} from '../../../services/socialApi';
import {socialTokens, RADIUS} from '../../../theme/socialTokens';
import {animFadeInUp} from '../../../utils/animations';

import BoltIcon from '@mui/icons-material/Bolt';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import GroupIcon from '@mui/icons-material/Group';
import MemoryIcon from '@mui/icons-material/Memory';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import {
  Typography,
  Box,
  Grid,
  Chip,
  Button,
  Skeleton,
  Fade,
  Switch,
  Avatar,
  LinearProgress,
  IconButton,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';

export default function ActivityHub() {
  const theme = useTheme();
  const navigate = useNavigate();
  const {currentUser} = useSocial();

  const [openGames, setOpenGames] = useState([]);
  const [computeStatus, setComputeStatus] = useState(null);
  const [communityImpact, setCommunityImpact] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [gamesRes, computeRes, impactRes, challengesRes, streakRes] =
          await Promise.allSettled([
            gamesApi.list(),
            computeApi.status(),
            computeApi.communityImpact(),
            challengesApi.list({status: 'active', limit: 3}),
            resonanceApi.getStreak(),
          ]);
        if (gamesRes.status === 'fulfilled')
          setOpenGames(gamesRes.value?.data?.data || []);
        if (computeRes.status === 'fulfilled')
          setComputeStatus(computeRes.value?.data?.data || {});
        if (impactRes.status === 'fulfilled')
          setCommunityImpact(impactRes.value?.data?.data || {});
        if (challengesRes.status === 'fulfilled')
          setChallenges(challengesRes.value?.data?.data || []);
        if (streakRes.status === 'fulfilled')
          setStreak(streakRes.value?.data?.data || {});
      } catch (e) {
        // Graceful degradation
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  const cardSx = {
    p: 3,
    borderRadius: RADIUS.lg,
    background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: `0 12px 40px ${alpha(theme.palette.primary.main, 0.15)}`,
    },
  };

  const handleQuickMatch = async (gameType = 'trivia') => {
    try {
      const res = await gamesApi.quickMatch({game_type: gameType});
      const session = res?.data?.data;
      if (session?.id) navigate(`/social/games/${session.id}`);
    } catch (e) {
      // fallback
    }
  };

  const handleComputeToggle = async () => {
    try {
      if (computeStatus?.opted_in) {
        await computeApi.optOut();
        setComputeStatus((prev) => ({...prev, opted_in: false}));
      } else {
        await computeApi.optIn();
        setComputeStatus((prev) => ({...prev, opted_in: true}));
      }
    } catch (e) {
      // fallback
    }
  };

  if (loading) {
    return (
      <Box sx={{p: 3}}>
        <Skeleton
          variant="text"
          width={200}
          height={40}
          sx={{mb: 3, bgcolor: alpha(theme.palette.common.white, 0.05)}}
        />
        <Grid container spacing={3}>
          {[0, 1, 2, 3].map((i) => (
            <Grid item xs={12} md={6} key={i}>
              <Skeleton
                variant="rounded"
                height={200}
                sx={{
                  borderRadius: RADIUS.lg,
                  bgcolor: alpha(theme.palette.common.white, 0.05),
                }}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Fade in timeout={400}>
      <Box sx={{p: {xs: 2, md: 3}, maxWidth: 1200, mx: 'auto'}}>
        <Typography
          variant="h5"
          sx={{fontWeight: 700, mb: 0.5, color: theme.palette.text.primary}}
        >
          Activity Hub
        </Typography>
        <Typography
          variant="body2"
          sx={{color: theme.palette.text.secondary, mb: 3}}
        >
          Discover, play, contribute, grow.
        </Typography>

        <Grid container spacing={3}>
          {/* ─── RIGHT NOW ─── */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                ...cardSx,
                ...animFadeInUp(0),
                borderTop: `3px solid ${theme.palette.primary.main}`,
              }}
            >
              <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
                <BoltIcon sx={{color: theme.palette.primary.main}} />
                <Typography variant="h6" sx={{fontWeight: 600}}>
                  Right Now
                </Typography>
              </Box>

              <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
                {openGames.length > 0 && (
                  <Chip
                    icon={<SportsEsportsIcon />}
                    label={`${openGames.length} open game${openGames.length > 1 ? 's' : ''} waiting`}
                    color="primary"
                    variant="outlined"
                    onClick={() => navigate('/social/games')}
                    sx={{cursor: 'pointer', justifyContent: 'flex-start'}}
                  />
                )}
                {streak?.streak_days > 0 && (
                  <Chip
                    icon={<WhatshotIcon />}
                    label={`${streak.streak_days}-day streak!`}
                    sx={{
                      bgcolor: alpha(theme.palette.warning.main, 0.15),
                      color: theme.palette.warning.light,
                      justifyContent: 'flex-start',
                    }}
                  />
                )}
                {computeStatus?.opted_in && (
                  <Chip
                    icon={<MemoryIcon />}
                    label={`Compute active — ${computeStatus.total_inferences || 0} inferences served`}
                    sx={{
                      bgcolor: alpha(theme.palette.success.main, 0.15),
                      color: theme.palette.success.light,
                      justifyContent: 'flex-start',
                    }}
                  />
                )}
                {challenges.length > 0 && (
                  <Chip
                    icon={<EmojiEventsIcon />}
                    label={`${challenges.length} active challenge${challenges.length > 1 ? 's' : ''}`}
                    variant="outlined"
                    onClick={() => navigate('/social/challenges')}
                    sx={{cursor: 'pointer', justifyContent: 'flex-start'}}
                  />
                )}
              </Box>
            </Box>
          </Grid>

          {/* ─── PLAY ─── */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                ...cardSx,
                ...animFadeInUp(80),
                borderTop: `3px solid ${socialTokens.INTENT_COLORS?.community || '#FF6B6B'}`,
              }}
            >
              <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
                <SportsEsportsIcon
                  sx={{
                    color: socialTokens.INTENT_COLORS?.community || '#FF6B6B',
                  }}
                />
                <Typography variant="h6" sx={{fontWeight: 600}}>
                  Play
                </Typography>
              </Box>

              <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2}}>
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => handleQuickMatch('trivia')}
                  sx={{borderRadius: RADIUS.md, textTransform: 'none'}}
                >
                  Quick Match
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleQuickMatch('word_chain')}
                  sx={{borderRadius: RADIUS.md, textTransform: 'none'}}
                >
                  Word Chain
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleQuickMatch('collab_puzzle')}
                  sx={{borderRadius: RADIUS.md, textTransform: 'none'}}
                >
                  Collab Puzzle
                </Button>
              </Box>

              {openGames.length > 0 ? (
                <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                  {openGames.slice(0, 3).map((game) => (
                    <Box
                      key={game.id}
                      onClick={() => navigate(`/social/games/${game.id}`)}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        p: 1.5,
                        borderRadius: RADIUS.sm,
                        cursor: 'pointer',
                        bgcolor: alpha(theme.palette.common.white, 0.03),
                        '&:hover': {
                          bgcolor: alpha(theme.palette.common.white, 0.06),
                        },
                      }}
                    >
                      <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                        <SportsEsportsIcon
                          fontSize="small"
                          sx={{opacity: 0.7}}
                        />
                        <Typography variant="body2">
                          {game.game_type}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        icon={<GroupIcon />}
                        label={`${game.player_count}/${game.max_players}`}
                      />
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{color: theme.palette.text.secondary}}
                >
                  No open games. Start one!
                </Typography>
              )}

              <Button
                size="small"
                onClick={() => navigate('/social/encounters')}
                sx={{mt: 1.5, textTransform: 'none'}}
              >
                Challenge a bond
              </Button>
            </Box>
          </Grid>

          {/* ─── CONTRIBUTE ─── */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                ...cardSx,
                ...animFadeInUp(160),
                borderTop: `3px solid ${theme.palette.success.main}`,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 2,
                }}
              >
                <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
                  <MemoryIcon sx={{color: theme.palette.success.main}} />
                  <Typography variant="h6" sx={{fontWeight: 600}}>
                    Contribute
                  </Typography>
                </Box>
                <Switch
                  checked={!!computeStatus?.opted_in}
                  onChange={handleComputeToggle}
                  color="success"
                  size="small"
                />
              </Box>

              {!computeStatus?.opted_in ? (
                <Box>
                  <Typography
                    variant="body2"
                    sx={{color: theme.palette.text.secondary, mb: 1.5}}
                  >
                    Your device runs small AI tasks when idle. You earn Spark.
                    The community gets smarter.
                  </Typography>
                  <Button
                    variant="outlined"
                    color="success"
                    size="small"
                    onClick={handleComputeToggle}
                    sx={{borderRadius: RADIUS.md, textTransform: 'none'}}
                  >
                    Start sharing compute
                  </Button>
                </Box>
              ) : (
                <Box>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 1.5,
                      p: 1,
                      borderRadius: RADIUS.sm,
                      bgcolor: alpha(theme.palette.success.main, 0.1),
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: theme.palette.success.main,
                        boxShadow: `0 0 8px ${theme.palette.success.main}`,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{color: theme.palette.success.light}}
                    >
                      Active — {computeStatus?.visibility_tier || 'standard'}{' '}
                      tier
                    </Typography>
                  </Box>
                  <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap'}}>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{color: theme.palette.text.secondary}}
                      >
                        GPU Hours
                      </Typography>
                      <Typography variant="body1" sx={{fontWeight: 600}}>
                        {computeStatus?.gpu_hours_served?.toFixed(1) || '0'}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{color: theme.palette.text.secondary}}
                      >
                        Inferences
                      </Typography>
                      <Typography variant="body1" sx={{fontWeight: 600}}>
                        {computeStatus?.total_inferences || 0}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              )}

              {communityImpact && (
                <Box
                  sx={{
                    mt: 2,
                    pt: 1.5,
                    borderTop: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{color: theme.palette.text.secondary}}
                  >
                    Hive: {communityImpact.active_nodes || 0} nodes,{' '}
                    {(communityImpact.total_gpu_hours || 0).toFixed(0)}{' '}
                    GPU-hours, {communityImpact.total_inferences || 0}{' '}
                    inferences
                  </Typography>
                </Box>
              )}

              <Button
                size="small"
                onClick={() => navigate('/social/compute')}
                sx={{mt: 1, textTransform: 'none'}}
              >
                View full dashboard
              </Button>
            </Box>
          </Grid>

          {/* ─── GROW ─── */}
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                ...cardSx,
                ...animFadeInUp(240),
                borderTop: `3px solid ${socialTokens.INTENT_COLORS?.technology || '#7C4DFF'}`,
              }}
            >
              <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
                <TrendingUpIcon
                  sx={{
                    color: socialTokens.INTENT_COLORS?.technology || '#7C4DFF',
                  }}
                />
                <Typography variant="h6" sx={{fontWeight: 600}}>
                  Grow
                </Typography>
              </Box>

              {challenges.length > 0 ? (
                <Box sx={{display: 'flex', flexDirection: 'column', gap: 1.5}}>
                  {challenges.map((ch) => (
                    <Box
                      key={ch.id}
                      sx={{cursor: 'pointer'}}
                      onClick={() => navigate(`/social/challenges/${ch.id}`)}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          mb: 0.5,
                        }}
                      >
                        <Typography variant="body2" sx={{fontWeight: 500}}>
                          {ch.name}
                        </Typography>
                        <Chip
                          size="small"
                          label={ch.challenge_type}
                          variant="outlined"
                        />
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(
                          ((ch.progress || 0) / (ch.target || 1)) * 100,
                          100
                        )}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: alpha(theme.palette.common.white, 0.05),
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            background:
                              socialTokens.GRADIENTS?.primary ||
                              theme.palette.primary.main,
                          },
                        }}
                      />
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography
                  variant="body2"
                  sx={{color: theme.palette.text.secondary}}
                >
                  No active challenges. Check back soon!
                </Typography>
              )}

              <Box sx={{display: 'flex', gap: 1, mt: 2}}>
                <Button
                  size="small"
                  onClick={() => navigate('/social/challenges')}
                  sx={{textTransform: 'none'}}
                >
                  All Challenges
                </Button>
                <Button
                  size="small"
                  onClick={() => navigate('/social/achievements')}
                  sx={{textTransform: 'none'}}
                >
                  Achievements
                </Button>
                <Button
                  size="small"
                  onClick={() => navigate('/social/resonance')}
                  sx={{textTransform: 'none'}}
                >
                  Resonance
                </Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Fade>
  );
}
