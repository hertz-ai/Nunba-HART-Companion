import {contentGenApi} from '../../services/socialApi';

import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import {
  Typography,
  Card,
  CardContent,
  Box,
  Chip,
  LinearProgress,
  Skeleton,
  IconButton,
  Tooltip,
  Button,
  Grid,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';


const cardStyle = {
  background:
    'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.3s ease',
};

const STATUS_COLORS = {
  complete: '#4CAF50',
  generating: '#2196F3',
  slow: '#FF9800',
  stuck: '#F44336',
  pending: '#9E9E9E',
  paused: '#607D8B',
};

function StatusDot({status}) {
  const color = STATUS_COLORS[status] || '#666';
  return <FiberManualRecordIcon sx={{fontSize: 10, color, mr: 0.5}} />;
}

export default function ContentTasksPage() {
  const [games, setGames] = useState([]);
  const [services, setServices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [gamesRes, svcRes] = await Promise.all([
        contentGenApi.getGames(),
        contentGenApi.getServices(),
      ]);
      if (gamesRes?.success) setGames(gamesRes.data || []);
      if (svcRes?.success) setServices(svcRes.data || null);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  const handleRetry = async (gameId, taskType = null) => {
    setRetrying(gameId);
    try {
      await contentGenApi.retry(gameId, taskType);
      await fetchData();
    } catch {
      // ignore
    } finally {
      setRetrying(null);
    }
  };

  const stuckCount = games.filter((g) => g.status === 'stuck').length;
  const activeCount = games.filter((g) => g.status === 'generating').length;
  const completeCount = games.filter((g) => g.status === 'complete').length;

  return (
    <Box>
      <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 3}}>
        <Typography variant="h5" sx={{fontWeight: 700, color: '#fff', flex: 1}}>
          Content Generation Tasks
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} sx={{color: '#aaa'}}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Summary cards */}
      <Grid container spacing={2} sx={{mb: 3}}>
        {[
          {label: 'Active', count: activeCount, color: '#2196F3'},
          {label: 'Stuck', count: stuckCount, color: '#F44336'},
          {label: 'Complete', count: completeCount, color: '#4CAF50'},
          {label: 'Total', count: games.length, color: '#9E9E9E'},
        ].map((s) => (
          <Grid item xs={6} sm={3} key={s.label}>
            <Card sx={{...cardStyle, p: 2, textAlign: 'center'}}>
              <Typography variant="h4" sx={{color: s.color, fontWeight: 800}}>
                {loading ? <Skeleton width={40} sx={{mx: 'auto'}} /> : s.count}
              </Typography>
              <Typography variant="caption" sx={{color: '#888'}}>
                {s.label}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Services health */}
      {services && (
        <Card sx={{...cardStyle, p: 2, mb: 3}}>
          <Typography
            variant="subtitle2"
            sx={{color: '#aaa', mb: 1, fontWeight: 700}}
          >
            Media Services
          </Typography>
          <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap'}}>
            {Object.entries(services.services || {}).map(([name, status]) => (
              <Chip
                key={name}
                icon={
                  <FiberManualRecordIcon
                    sx={{
                      fontSize: '10px !important',
                      color: `${status === 'running' ? '#4CAF50' : '#F44336'} !important`,
                    }}
                  />
                }
                label={name}
                size="small"
                sx={{
                  bgcolor:
                    status === 'running'
                      ? 'rgba(76,175,80,0.1)'
                      : 'rgba(244,67,54,0.1)',
                  color: status === 'running' ? '#4CAF50' : '#F44336',
                  border: `1px solid ${status === 'running' ? '#4CAF5033' : '#F4433633'}`,
                  fontWeight: 600,
                  fontSize: '0.75rem',
                }}
              />
            ))}
          </Box>
        </Card>
      )}

      {/* Game list */}
      {loading ? (
        <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={120}
              sx={{borderRadius: 3}}
            />
          ))}
        </Box>
      ) : games.length === 0 ? (
        <Card sx={{...cardStyle, p: 4, textAlign: 'center'}}>
          <Typography variant="body1" sx={{color: '#888'}}>
            No content generation tasks registered yet.
          </Typography>
        </Card>
      ) : (
        <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
          {games.map((game) => (
            <Card key={game.game_id} sx={{...cardStyle, overflow: 'hidden'}}>
              {/* Status color bar */}
              <Box
                sx={{
                  height: 3,
                  bgcolor: STATUS_COLORS[game.status] || '#666',
                  width: '100%',
                }}
              />

              <CardContent sx={{p: 2}}>
                {/* Header */}
                <Box
                  sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}
                >
                  <StatusDot status={game.status} />
                  <Typography
                    variant="subtitle1"
                    sx={{fontWeight: 700, color: '#fff', flex: 1}}
                  >
                    {game.game_title || game.game_id}
                  </Typography>
                  <Chip
                    label={`${Math.round(game.progress_pct || 0)}%`}
                    size="small"
                    sx={{
                      bgcolor: `${STATUS_COLORS[game.status] || '#666'}22`,
                      color: STATUS_COLORS[game.status] || '#666',
                      fontWeight: 700,
                    }}
                  />
                  {game.delta_24h !== undefined && (
                    <Typography
                      variant="caption"
                      sx={{
                        color:
                          game.delta_24h > 0
                            ? '#4CAF50'
                            : game.delta_24h < 0
                              ? '#F44336'
                              : '#888',
                        fontWeight: 600,
                      }}
                    >
                      {game.delta_24h > 0 ? '+' : ''}
                      {game.delta_24h}% / 24h
                    </Typography>
                  )}
                  {game.status === 'stuck' && (
                    <Button
                      size="small"
                      startIcon={<ReplayIcon />}
                      onClick={() => handleRetry(game.game_id)}
                      disabled={retrying === game.game_id}
                      sx={{
                        color: '#FF9800',
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                      }}
                    >
                      Retry
                    </Button>
                  )}
                </Box>

                {/* Progress bar */}
                <LinearProgress
                  variant="determinate"
                  value={game.progress_pct || 0}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    mb: 1.5,
                    bgcolor: 'rgba(255,255,255,0.05)',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: STATUS_COLORS[game.status] || '#666',
                      borderRadius: 3,
                    },
                  }}
                />

                {/* Task breakdown */}
                {game.tasks && game.tasks.length > 0 && (
                  <Box sx={{display: 'flex', gap: 2, flexWrap: 'wrap'}}>
                    {game.tasks.map((task) => (
                      <Box
                        key={task.task_type}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          p: 0.5,
                          px: 1,
                          bgcolor: 'rgba(255,255,255,0.03)',
                          borderRadius: 1,
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}
                      >
                        <StatusDot status={task.status} />
                        <Typography
                          variant="caption"
                          sx={{
                            color: '#ccc',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            fontSize: 10,
                          }}
                        >
                          {task.task_type}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{color: '#888', fontSize: 10}}
                        >
                          {task.completed}/{task.required}
                        </Typography>
                        {task.job_id && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#555',
                              fontSize: 9,
                              fontFamily: 'monospace',
                            }}
                          >
                            {task.job_id}
                          </Typography>
                        )}
                        {task.status === 'stuck' || task.status === 'failed' ? (
                          <Tooltip title={`Retry ${task.task_type}`}>
                            <IconButton
                              size="small"
                              onClick={() =>
                                handleRetry(game.game_id, task.task_type)
                              }
                              disabled={retrying === game.game_id}
                              sx={{p: 0.25, color: '#FF9800'}}
                            >
                              <ReplayIcon sx={{fontSize: 14}} />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {task.error && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: '#F44336',
                              fontSize: 9,
                              ml: 0.5,
                            }}
                          >
                            {task.error}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}

                {/* Meta */}
                <Box sx={{display: 'flex', gap: 2, mt: 1}}>
                  <Typography
                    variant="caption"
                    sx={{color: '#555', fontSize: 10}}
                  >
                    ID: {game.game_id}
                  </Typography>
                  {game.goal_id && (
                    <Typography
                      variant="caption"
                      sx={{color: '#555', fontSize: 10}}
                    >
                      Goal: {game.goal_id}
                    </Typography>
                  )}
                  {game.created_at && (
                    <Typography
                      variant="caption"
                      sx={{color: '#555', fontSize: 10}}
                    >
                      Created: {new Date(game.created_at).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
