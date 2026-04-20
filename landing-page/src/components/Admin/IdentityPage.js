import {identityApi} from '../../services/socialApi';

import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import PersonIcon from '@mui/icons-material/Person';
import SaveIcon from '@mui/icons-material/Save';
import {
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  Avatar,
  Box,
  Grid,
  Chip,
  Skeleton,
  Fade,
  Grow,
  IconButton,
} from '@mui/material';
import React, {useState, useEffect} from 'react';

// Card style
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.3s ease',
};

// Input styles
const inputStyle = {
  '& .MuiOutlinedInput-root': {
    color: '#fff',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: 2,
    '& fieldset': {borderColor: 'rgba(255,255,255,0.1)'},
    '&:hover fieldset': {borderColor: 'rgba(108, 99, 255, 0.3)'},
    '&.Mui-focused fieldset': {borderColor: '#6C63FF'},
  },
  '& .MuiInputLabel-root': {color: 'rgba(255,255,255,0.5)'},
  '& .MuiInputLabel-root.Mui-focused': {color: '#6C63FF'},
};

// Loading skeleton
function IdentitySkeleton() {
  return (
    <Grid container spacing={3}>
      <Grid item xs={12} md={6}>
        <Card sx={cardStyle}>
          <CardContent sx={{p: 4}}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 3, mb: 4}}>
              <Skeleton variant="circular" width={100} height={100} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
              <Box>
                <Skeleton variant="text" width={150} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
                <Skeleton variant="text" width={100} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
              </Box>
            </Box>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 2}} />
            ))}
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} md={6}>
        <Card sx={cardStyle}>
          <CardContent sx={{p: 4}}>
            <Skeleton variant="text" width={120} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 3}} />
            {[1, 2].map((i) => (
              <Skeleton key={i} variant="rounded" height={56} sx={{bgcolor: 'rgba(255,255,255,0.05)', mb: 2}} />
            ))}
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}

export default function IdentityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState({});
  const [avatars, setAvatars] = useState([]);
  const [newTrait, setNewTrait] = useState('');
  const [hoveredAvatar, setHoveredAvatar] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [id, av] = await Promise.all([
          identityApi.get(),
          identityApi.avatars(),
        ]);
        setIdentity(id.data || {});
        setAvatars(av.data || []);
      } catch (err) {
        /* ignore */
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await identityApi.update(identity);
      alert('Identity saved');
    } catch (err) {
      alert('Failed to save');
    }
    setSaving(false);
  };

  const addTrait = () => {
    if (newTrait.trim()) {
      setIdentity({
        ...identity,
        traits: [...(identity.traits || []), newTrait.trim()],
      });
      setNewTrait('');
    }
  };

  const removeTrait = (index) => {
    setIdentity({
      ...identity,
      traits: identity.traits.filter((_, idx) => idx !== index),
    });
  };

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(255, 107, 107, 0.15) 100%)',
            }}>
              <PersonIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #6C63FF 0%, #FF6B6B 100%)',
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
                Agent Identity
              </Typography>
              <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                Define your agent's persona and personality
              </Typography>
            </Box>
          </Box>
        </Box>

        {loading ? (
          <IdentitySkeleton />
        ) : (
          <Grid container spacing={3}>
            {/* Profile Card */}
            <Grid item xs={12} md={6}>
              <Grow in={true} timeout={400}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Typography variant="h6" sx={{
                      color: '#fff',
                      fontWeight: 600,
                      mb: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}>
                      <EditIcon sx={{fontSize: 20, color: '#6C63FF'}} />
                      Profile
                    </Typography>

                    {/* Avatar Preview */}
                    <Box sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      mb: 4,
                      p: 3,
                      borderRadius: 3,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <Avatar
                        src={identity.avatar_url}
                        sx={{
                          width: 100,
                          height: 100,
                          fontSize: 40,
                          background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                          border: '3px solid rgba(108, 99, 255, 0.3)',
                          boxShadow: '0 8px 24px rgba(108, 99, 255, 0.2)',
                        }}
                      >
                        {(identity.display_name || 'A')[0]}
                      </Avatar>
                      <Box>
                        <Typography variant="h5" sx={{
                          fontWeight: 700,
                          color: '#fff',
                          mb: 0.5,
                        }}>
                          {identity.display_name || 'Agent'}
                        </Typography>
                        <Typography sx={{
                          color: '#6C63FF',
                          fontWeight: 500,
                        }}>
                          @{identity.username || 'agent'}
                        </Typography>
                      </Box>
                    </Box>

                    <TextField
                      fullWidth
                      label="Display Name"
                      value={identity.display_name || ''}
                      onChange={(e) =>
                        setIdentity({...identity, display_name: e.target.value})
                      }
                      sx={{...inputStyle, mb: 2}}
                    />

                    <TextField
                      fullWidth
                      label="Username"
                      value={identity.username || ''}
                      onChange={(e) =>
                        setIdentity({...identity, username: e.target.value})
                      }
                      sx={{...inputStyle, mb: 2}}
                      InputProps={{
                        startAdornment: (
                          <Typography sx={{color: 'rgba(255,255,255,0.3)', mr: 0.5}}>@</Typography>
                        ),
                      }}
                    />

                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      label="Bio"
                      value={identity.bio || ''}
                      onChange={(e) =>
                        setIdentity({...identity, bio: e.target.value})
                      }
                      sx={{...inputStyle, mb: 3}}
                      placeholder="Tell users about this agent..."
                    />

                    <Button
                      variant="contained"
                      startIcon={<SaveIcon />}
                      onClick={handleSave}
                      disabled={saving}
                      sx={{
                        background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        px: 3,
                        transition: 'all 0.3s ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          boxShadow: '0 8px 20px rgba(108, 99, 255, 0.3)',
                        },
                      }}
                    >
                      {saving ? 'Saving...' : 'Save Profile'}
                    </Button>
                  </CardContent>
                </Card>
              </Grow>
            </Grid>

            {/* Personality Card */}
            <Grid item xs={12} md={6}>
              <Grow in={true} timeout={500}>
                <Card sx={cardStyle}>
                  <CardContent sx={{p: 4}}>
                    <Typography variant="h6" sx={{
                      color: '#fff',
                      fontWeight: 600,
                      mb: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}>
                      <PersonIcon sx={{fontSize: 20, color: '#6C63FF'}} />
                      Personality
                    </Typography>

                    <TextField
                      fullWidth
                      label="Tone"
                      placeholder="e.g., friendly, professional, casual"
                      value={identity.tone || ''}
                      onChange={(e) =>
                        setIdentity({...identity, tone: e.target.value})
                      }
                      sx={{...inputStyle, mb: 2}}
                    />

                    <TextField
                      fullWidth
                      multiline
                      rows={4}
                      label="System Prompt"
                      value={identity.system_prompt || ''}
                      onChange={(e) =>
                        setIdentity({...identity, system_prompt: e.target.value})
                      }
                      sx={{...inputStyle, mb: 3}}
                      placeholder="Define the agent's core behavior and instructions..."
                    />

                    {/* Traits */}
                    <Box sx={{mb: 3}}>
                      <Typography variant="subtitle2" sx={{
                        color: 'rgba(255,255,255,0.7)',
                        mb: 1.5,
                        fontWeight: 600,
                      }}>
                        Traits
                      </Typography>
                      <Box sx={{display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2}}>
                        {(identity.traits || []).map((trait, i) => (
                          <Fade in={true} timeout={200} key={i}>
                            <Chip
                              label={trait}
                              onDelete={() => removeTrait(i)}
                              deleteIcon={<CloseIcon sx={{fontSize: '16px !important'}} />}
                              sx={{
                                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)',
                                color: '#6C63FF',
                                border: '1px solid rgba(108, 99, 255, 0.3)',
                                fontWeight: 500,
                                '& .MuiChip-deleteIcon': {
                                  color: 'rgba(255,255,255,0.5)',
                                  '&:hover': {
                                    color: '#ff4444',
                                  },
                                },
                              }}
                            />
                          </Fade>
                        ))}
                      </Box>
                      <Box sx={{display: 'flex', gap: 1}}>
                        <TextField
                          size="small"
                          placeholder="Add a trait..."
                          value={newTrait}
                          onChange={(e) => setNewTrait(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addTrait()}
                          sx={{
                            ...inputStyle,
                            flex: 1,
                            '& .MuiOutlinedInput-root': {
                              ...inputStyle['& .MuiOutlinedInput-root'],
                              height: 40,
                            },
                          }}
                        />
                        <IconButton
                          onClick={addTrait}
                          sx={{
                            background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                            color: '#fff',
                            width: 40,
                            height: 40,
                            '&:hover': {
                              transform: 'scale(1.05)',
                            },
                          }}
                        >
                          <AddIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grow>

              {/* Avatar Gallery */}
              <Grow in={true} timeout={600}>
                <Card sx={{...cardStyle, mt: 3}}>
                  <CardContent sx={{p: 4}}>
                    <Typography variant="h6" sx={{
                      color: '#fff',
                      fontWeight: 600,
                      mb: 3,
                    }}>
                      Avatar Gallery
                    </Typography>
                    <Grid container spacing={1.5}>
                      {avatars.map((av, i) => (
                        <Grid item key={i}>
                          <Grow in={true} timeout={400 + i * 50}>
                            <Avatar
                              src={av.url}
                              onMouseEnter={() => setHoveredAvatar(i)}
                              onMouseLeave={() => setHoveredAvatar(null)}
                              onClick={() =>
                                setIdentity({...identity, avatar_url: av.url})
                              }
                              sx={{
                                width: 64,
                                height: 64,
                                cursor: 'pointer',
                                border: identity.avatar_url === av.url
                                  ? '3px solid #6C63FF'
                                  : '3px solid transparent',
                                boxShadow: identity.avatar_url === av.url
                                  ? '0 0 20px rgba(108, 99, 255, 0.4)'
                                  : 'none',
                                transform: hoveredAvatar === i ? 'scale(1.1)' : 'scale(1)',
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                  border: '3px solid rgba(108, 99, 255, 0.5)',
                                },
                              }}
                            />
                          </Grow>
                        </Grid>
                      ))}
                      {avatars.length === 0 && (
                        <Grid item xs={12}>
                          <Box sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 1,
                            py: 4,
                            color: 'rgba(255,255,255,0.4)',
                          }}>
                            <PersonIcon />
                            <Typography variant="body2">No avatars available</Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </CardContent>
                </Card>
              </Grow>
            </Grid>
          </Grid>
        )}
      </Box>
    </Fade>
  );
}
