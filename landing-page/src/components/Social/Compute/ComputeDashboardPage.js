import {useSocial} from '../../../contexts/SocialContext';
import {computeApi, resonanceApi} from '../../../services/socialApi';
import {socialTokens, RADIUS} from '../../../theme/socialTokens';
import {animFadeInUp, animSlideInUp} from '../../../utils/animations';

import BoltIcon from '@mui/icons-material/Bolt';
import FavoriteIcon from '@mui/icons-material/Favorite';
import GroupsIcon from '@mui/icons-material/Groups';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import {
  Typography,
  Box,
  Grid,
  Switch,
  Chip,
  Button,
  Skeleton,
  Fade,
  LinearProgress,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';

export default function ComputeDashboardPage() {
  const theme = useTheme();
  const {currentUser} = useSocial();

  const [status, setStatus] = useState(null);
  const [impact, setImpact] = useState(null);
  const [communityImpact, setCommunityImpact] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [statusRes, impactRes, communityRes] = await Promise.allSettled([
        computeApi.status(),
        computeApi.impact(),
        computeApi.communityImpact(),
      ]);
      if (statusRes.status === 'fulfilled')
        setStatus(statusRes.value?.data?.data || {});
      if (impactRes.status === 'fulfilled')
        setImpact(impactRes.value?.data?.data || {});
      if (communityRes.status === 'fulfilled')
        setCommunityImpact(communityRes.value?.data?.data || {});
    } catch (e) {
      /* graceful */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async () => {
    try {
      if (status?.opted_in) {
        await computeApi.optOut();
      } else {
        await computeApi.optIn();
      }
      fetchData();
    } catch (e) {
      /* fallback */
    }
  };

  const cardSx = {
    p: 3,
    borderRadius: RADIUS.lg,
    background: `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(theme.palette.background.default, 0.95)} 100%)`,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${alpha(theme.palette.common.white, 0.05)}`,
  };

  const statBox = (label, value, icon) => (
    <Box sx={{textAlign: 'center', minWidth: 100}}>
      {icon}
      <Typography variant="h5" sx={{fontWeight: 700, mt: 0.5}}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{color: theme.palette.text.secondary}}>
        {label}
      </Typography>
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{p: 3}}>
        <Skeleton
          variant="text"
          width={250}
          height={40}
          sx={{mb: 3, bgcolor: alpha(theme.palette.common.white, 0.05)}}
        />
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            variant="rounded"
            height={180}
            sx={{
              mb: 2,
              borderRadius: RADIUS.lg,
              bgcolor: alpha(theme.palette.common.white, 0.05),
            }}
          />
        ))}
      </Box>
    );
  }

  return (
    <Fade in timeout={400}>
      <Box sx={{p: {xs: 2, md: 3}, maxWidth: 900, mx: 'auto'}}>
        <Box
          sx={{
            ...animSlideInUp(0),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Box>
            <Typography variant="h5" sx={{fontWeight: 700}}>
              Compute Dashboard
            </Typography>
            <Typography
              variant="body2"
              sx={{color: theme.palette.text.secondary}}
            >
              Your contribution to the Nunba hive
            </Typography>
          </Box>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            <Typography
              variant="body2"
              sx={{
                color: status?.opted_in
                  ? theme.palette.success.main
                  : theme.palette.text.secondary,
              }}
            >
              {status?.opted_in ? 'Active' : 'Off'}
            </Typography>
            <Switch
              checked={!!status?.opted_in}
              onChange={handleToggle}
              color="success"
            />
          </Box>
        </Box>

        {/* Status Banner */}
        {!status?.opted_in ? (
          <Box
            sx={{
              ...cardSx,
              mb: 3,
              borderLeft: `4px solid ${theme.palette.info.main}`,
            }}
          >
            <Box sx={{display: 'flex', alignItems: 'flex-start', gap: 2}}>
              <InfoOutlinedIcon
                sx={{color: theme.palette.info.main, mt: 0.5}}
              />
              <Box>
                <Typography variant="body1" sx={{fontWeight: 600, mb: 1}}>
                  Share your idle compute with the hive
                </Typography>
                <Typography
                  variant="body2"
                  sx={{color: theme.palette.text.secondary, mb: 2}}
                >
                  When your device is idle, Nunba runs small AI tasks in the
                  background. You earn Spark tokens. The community gets smarter.
                  You can stop anytime.
                </Typography>
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleToggle}
                  startIcon={<MemoryIcon />}
                  sx={{borderRadius: RADIUS.md, textTransform: 'none'}}
                >
                  Enable compute sharing
                </Button>
              </Box>
            </Box>
          </Box>
        ) : (
          <Box
            sx={{
              ...cardSx,
              mb: 3,
              background: `linear-gradient(135deg, ${alpha(theme.palette.success.main, 0.1)} 0%, ${alpha(theme.palette.background.paper, 0.9)} 100%)`,
            }}
          >
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  bgcolor: theme.palette.success.main,
                  boxShadow: `0 0 10px ${theme.palette.success.main}`,
                }}
              />
              <Typography
                variant="body1"
                sx={{fontWeight: 600, color: theme.palette.success.light}}
              >
                Compute sharing active
              </Typography>
              <Chip
                size="small"
                label={status?.visibility_tier || 'standard'}
                color="success"
                variant="outlined"
              />
            </Box>
            <Typography
              variant="body2"
              sx={{color: theme.palette.text.secondary}}
            >
              Your device is contributing to the hive. Contribution score:{' '}
              {status?.contribution_score || 0}
            </Typography>
          </Box>
        )}

        {/* Personal Stats */}
        <Box sx={{...cardSx, ...animFadeInUp(60), mb: 3}}>
          <Typography variant="h6" sx={{fontWeight: 600, mb: 2}}>
            Your Impact
          </Typography>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-around',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            {statBox(
              'GPU Hours',
              (impact?.gpu_hours || 0).toFixed(1),
              <BoltIcon sx={{color: theme.palette.warning.main}} />
            )}
            {statBox(
              'Inferences',
              impact?.inferences || 0,
              <MemoryIcon sx={{color: theme.palette.primary.main}} />
            )}
            {statBox(
              'Spark Earned',
              impact?.spark_earned || 0,
              <FavoriteIcon sx={{color: '#FF6B6B'}} />
            )}
            {statBox(
              'Agents Hosted',
              impact?.agent_count || 0,
              <GroupsIcon sx={{color: theme.palette.info.main}} />
            )}
          </Box>
        </Box>

        {/* Community Impact */}
        <Box sx={{...cardSx, ...animFadeInUp(120), mb: 3}}>
          <Typography variant="h6" sx={{fontWeight: 600, mb: 2}}>
            Hive Impact
          </Typography>
          <Typography
            variant="body2"
            sx={{color: theme.palette.text.secondary, mb: 2}}
          >
            The Nunba hive is powered by {communityImpact?.active_nodes || 0}{' '}
            contributors worldwide.
          </Typography>
          <Grid container spacing={2}>
            {[
              {
                label: 'Active Nodes',
                value: communityImpact?.active_nodes || 0,
              },
              {
                label: 'Total GPU Hours',
                value: (communityImpact?.total_gpu_hours || 0).toFixed(0),
              },
              {
                label: 'Total Inferences',
                value: (
                  communityImpact?.total_inferences || 0
                ).toLocaleString(),
              },
              {
                label: 'Agents Hosted',
                value: communityImpact?.total_agents_hosted || 0,
              },
            ].map(({label, value}) => (
              <Grid item xs={6} sm={3} key={label}>
                <Box
                  sx={{
                    textAlign: 'center',
                    p: 1.5,
                    borderRadius: RADIUS.sm,
                    bgcolor: alpha(theme.palette.common.white, 0.03),
                  }}
                >
                  <Typography variant="h6" sx={{fontWeight: 700}}>
                    {value}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{color: theme.palette.text.secondary}}
                  >
                    {label}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Transparency */}
        <Box sx={{...cardSx, ...animFadeInUp(180)}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
            <InfoOutlinedIcon
              fontSize="small"
              sx={{color: theme.palette.text.secondary}}
            />
            <Typography
              variant="subtitle2"
              sx={{color: theme.palette.text.secondary}}
            >
              Transparency
            </Typography>
          </Box>
          <Typography
            variant="body2"
            sx={{color: theme.palette.text.secondary}}
          >
            All compute tasks are logged. You can see exactly what ran, when,
            and how much energy was used. Your device only processes tasks when
            idle. Nunba never accesses personal data. You can disable sharing
            anytime with the toggle above.
          </Typography>
        </Box>
      </Box>
    </Fade>
  );
}
