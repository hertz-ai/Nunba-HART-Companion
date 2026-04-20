import {challengesApi} from '../../../services/socialApi';
import ChallengeCard, {ChallengeCardSkeleton} from '../shared/ChallengeCard';
import EmptyState from '../shared/EmptyState';

import FlagIcon from '@mui/icons-material/Flag';
import {
  Typography,
  Box,
  Tabs,
  Tab,
  Chip,
  Stack,
  Grid,
  Alert,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';

const TYPE_FILTERS = ['all', 'daily', 'weekly', 'seasonal', 'community'];

// Filter chip styles
const filterChipStyle = (isActive) => ({
  fontWeight: 600,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  background: isActive
    ? 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)'
    : 'rgba(255,255,255,0.05)',
  color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
  border: isActive ? 'none' : '1px solid rgba(255,255,255,0.1)',
  '&:hover': {
    background: isActive
      ? 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)'
      : 'rgba(255,255,255,0.1)',
    transform: 'scale(1.05)',
  },
});

// Loading skeleton grid
function ChallengesLoadingSkeleton() {
  return (
    <Grid container spacing={2}>
      {[1, 2, 3, 4].map((i) => (
        <Grid item xs={12} sm={6} key={i}>
          <ChallengeCardSkeleton />
        </Grid>
      ))}
    </Grid>
  );
}

export default function ChallengesPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0); // 0=Active, 1=Upcoming, 2=Completed
  const [typeFilter, setTypeFilter] = useState('all');
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const statusForTab = useCallback((t) => {
    if (t === 0) return 'active';
    if (t === 1) return 'upcoming';
    return 'completed';
  }, []);

  const fetchChallenges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {status: statusForTab(tab)};
      if (typeFilter !== 'all') params.type = typeFilter;
      const res = await challengesApi.list(params);
      setChallenges(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load challenges');
      setChallenges([]);
    } finally {
      setLoading(false);
    }
  }, [tab, typeFilter, statusForTab]);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const handleCardClick = (challenge) => {
    navigate(`/social/challenges/${challenge.id}`);
  };

  return (
    <Fade in={true} timeout={400}>
      <Box>
        {/* Page header */}
        <Box sx={{mb: 3}}>
          <Typography
            variant="h4"
            sx={{
              fontWeight: 700,
              background:
                'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              mb: 1,
            }}
          >
            Challenges
          </Typography>
          <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
            Complete challenges to earn rewards and climb the leaderboard
          </Typography>
        </Box>

        {/* Tabs */}
        <Tabs
          value={tab}
          onChange={(e, v) => setTab(v)}
          sx={{
            mb: 2,
            '& .MuiTab-root': {
              color: 'rgba(255,255,255,0.5)',
              fontWeight: 600,
              transition: 'color 0.3s ease',
              '&.Mui-selected': {
                color: '#6C63FF',
              },
            },
            '& .MuiTabs-indicator': {
              background: 'linear-gradient(90deg, #6C63FF 0%, #9B94FF 100%)',
              height: 3,
              borderRadius: 1.5,
            },
          }}
        >
          <Tab label="Active" />
          <Tab label="Upcoming" />
          <Tab label="Completed" />
        </Tabs>

        {/* Type filters */}
        <Stack
          direction="row"
          spacing={1}
          sx={{mb: 3, flexWrap: 'wrap'}}
          useFlexGap
        >
          {TYPE_FILTERS.map((type) => (
            <Chip
              key={type}
              label={type.charAt(0).toUpperCase() + type.slice(1)}
              onClick={() => setTypeFilter(type)}
              size="small"
              sx={filterChipStyle(typeFilter === type)}
            />
          ))}
        </Stack>

        {/* Error state */}
        {error && (
          <Fade in={true} timeout={300}>
            <Alert
              severity="error"
              sx={{
                mb: 2,
                background:
                  'linear-gradient(135deg, rgba(231, 76, 60, 0.15) 0%, rgba(231, 76, 60, 0.05) 100%)',
                border: '1px solid rgba(231, 76, 60, 0.3)',
                color: '#fff',
                '& .MuiAlert-icon': {
                  color: '#e74c3c',
                },
              }}
            >
              {error}
            </Alert>
          </Fade>
        )}

        {/* Content */}
        {loading ? (
          <ChallengesLoadingSkeleton />
        ) : challenges.length === 0 ? (
          <EmptyState
            message={`No ${statusForTab(tab)} challenges found.`}
            icon={FlagIcon}
          />
        ) : (
          <Grid container spacing={2}>
            {challenges.map((challenge, index) => (
              <Grow in={true} timeout={300 + index * 50} key={challenge.id}>
                <Grid item xs={12} sm={6}>
                  <ChallengeCard
                    challenge={challenge}
                    onClick={handleCardClick}
                  />
                </Grid>
              </Grow>
            ))}
          </Grid>
        )}
      </Box>
    </Fade>
  );
}
