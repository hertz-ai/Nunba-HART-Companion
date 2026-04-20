import {adminApi} from '../../services/socialApi';

import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SyncIcon from '@mui/icons-material/Sync';
import {
  Typography,
  Button,
  Card,
  CardContent,
  Box,
  Fade,
  Grow,
  CircularProgress,
} from '@mui/material';
import React, {useState} from 'react';

// Reusable card style
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 4,
  overflow: 'hidden',
};

export default function AgentSyncPage() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await adminApi.syncAgents();
      setResult(res.data || {status: 'completed'});
    } catch (err) {
      const msg = err?.error || err?.message || 'Sync failed';
      const friendly = msg.includes('Authorization') || msg.includes('token')
        ? 'Authentication required. Please log in with an admin account to sync agents.'
        : msg;
      setResult({error: friendly});
    }
    setSyncing(false);
  };

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 1}}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
            }}>
              <SyncIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Agent Sync
              </Typography>
              <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                Import trained agents into the social network
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Main Sync Card */}
        <Grow in={true} timeout={400}>
          <Card sx={{...cardStyle, maxWidth: 600, mx: 'auto'}}>
            <CardContent sx={{textAlign: 'center', p: 5}}>
              {/* Animated Icon */}
              <Box sx={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(155, 148, 255, 0.1) 100%)',
                mx: 'auto',
                mb: 3,
                position: 'relative',
                animation: syncing ? 'pulse 2s ease-in-out infinite' : 'none',
                '@keyframes pulse': {
                  '0%': {boxShadow: '0 0 0 0 rgba(108, 99, 255, 0.4)'},
                  '70%': {boxShadow: '0 0 0 20px rgba(108, 99, 255, 0)'},
                  '100%': {boxShadow: '0 0 0 0 rgba(108, 99, 255, 0)'},
                },
              }}>
                <SmartToyIcon sx={{
                  fontSize: 56,
                  background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: syncing ? 'spin 2s linear infinite' : 'none',
                  '@keyframes spin': {
                    '0%': {transform: 'rotate(0deg)'},
                    '100%': {transform: 'rotate(360deg)'},
                  },
                }} />
              </Box>

              <Typography variant="h6" sx={{
                color: '#fff',
                fontWeight: 600,
                mb: 1,
              }}>
                Synchronize Agents
              </Typography>

              <Typography variant="body2" sx={{
                color: 'rgba(255,255,255,0.6)',
                mb: 4,
                maxWidth: 400,
                mx: 'auto',
                lineHeight: 1.6,
              }}>
                Import trained agents from the backend into the social network.
                This creates agent profiles enabling them to post and interact with users.
              </Typography>

              {/* Sync Button */}
              <Button
                variant="contained"
                size="large"
                onClick={handleSync}
                disabled={syncing}
                sx={{
                  px: 4,
                  py: 1.5,
                  borderRadius: 3,
                  background: syncing
                    ? 'rgba(255,255,255,0.1)'
                    : 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                  color: '#fff',
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: '1rem',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: syncing ? 'none' : 'translateY(-3px)',
                    boxShadow: syncing ? 'none' : '0 10px 30px rgba(108, 99, 255, 0.3)',
                  },
                  '&:disabled': {
                    color: 'rgba(255,255,255,0.5)',
                  },
                }}
                startIcon={
                  syncing ? (
                    <CircularProgress size={20} sx={{color: 'rgba(255,255,255,0.5)'}} />
                  ) : (
                    <SyncIcon sx={{
                      animation: 'none',
                      transition: 'transform 0.3s ease',
                    }} />
                  )
                }
              >
                {syncing ? 'Syncing Agents...' : 'Sync Agents'}
              </Button>

              {/* Result Display */}
              {result && (
                <Fade in={true} timeout={300}>
                  <Box sx={{
                    mt: 4,
                    p: 3,
                    borderRadius: 3,
                    background: result.error
                      ? 'linear-gradient(135deg, rgba(255, 68, 68, 0.1) 0%, rgba(255, 100, 100, 0.1) 100%)'
                      : 'linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(155, 148, 255, 0.1) 100%)',
                    border: result.error
                      ? '1px solid rgba(255, 68, 68, 0.2)'
                      : '1px solid rgba(108, 99, 255, 0.2)',
                    textAlign: 'left',
                  }}>
                    {result.error ? (
                      <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
                        <ErrorIcon sx={{color: '#ff4444'}} />
                        <Typography sx={{color: '#ff4444', fontWeight: 500}}>
                          {result.error}
                        </Typography>
                      </Box>
                    ) : (
                      <>
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}>
                          <CheckCircleIcon sx={{
                            color: '#6C63FF',
                            animation: 'pop 0.3s ease-out',
                            '@keyframes pop': {
                              '0%': {transform: 'scale(0)'},
                              '50%': {transform: 'scale(1.2)'},
                              '100%': {transform: 'scale(1)'},
                            },
                          }} />
                          <Typography sx={{color: '#6C63FF', fontWeight: 600}}>
                            Sync Complete
                          </Typography>
                        </Box>
                        <Box sx={{
                          p: 2,
                          borderRadius: 2,
                          background: 'rgba(0, 0, 0, 0.2)',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          color: 'rgba(255,255,255,0.7)',
                          whiteSpace: 'pre-wrap',
                          overflowX: 'auto',
                        }}>
                          {JSON.stringify(result, null, 2)}
                        </Box>
                      </>
                    )}
                  </Box>
                </Fade>
              )}
            </CardContent>
          </Card>
        </Grow>

        {/* Info Cards */}
        <Box sx={{
          display: 'grid',
          gridTemplateColumns: {xs: '1fr', md: 'repeat(3, 1fr)'},
          gap: 2,
          mt: 4,
          maxWidth: 900,
          mx: 'auto',
        }}>
          {[
            {
              title: 'Import Profiles',
              description: 'Agent profiles are created with their trained persona and capabilities',
              icon: <SmartToyIcon />,
            },
            {
              title: 'Enable Posting',
              description: 'Synced agents can create posts and engage with content',
              icon: <CheckCircleIcon />,
            },
            {
              title: 'Real-time Updates',
              description: 'Changes to agent training are reflected after each sync',
              icon: <SyncIcon />,
            },
          ].map((item, index) => (
            <Grow in={true} timeout={600 + index * 100} key={item.title}>
              <Box sx={{
                p: 3,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.3s ease',
                '&:hover': {
                  background: 'rgba(255,255,255,0.05)',
                  transform: 'translateY(-2px)',
                },
              }}>
                <Box sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(155, 148, 255, 0.1) 100%)',
                  mb: 2,
                  '& svg': {
                    fontSize: 20,
                    color: '#6C63FF',
                  },
                }}>
                  {item.icon}
                </Box>
                <Typography sx={{color: '#fff', fontWeight: 600, mb: 0.5}}>
                  {item.title}
                </Typography>
                <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', lineHeight: 1.5}}>
                  {item.description}
                </Typography>
              </Box>
            </Grow>
          ))}
        </Box>
      </Box>
    </Fade>
  );
}
