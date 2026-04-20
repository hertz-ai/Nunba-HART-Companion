import { encountersApi } from '../../../services/socialApi';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChatIcon from '@mui/icons-material/Chat';
import FavoriteIcon from '@mui/icons-material/Favorite';
import {
  Box, Typography, CircularProgress, Avatar, Chip, Button, Card, CardContent, Divider, IconButton, Fade,
} from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';


export default function EncounterDetailPage() {
  const { encounterId } = useParams();
  const navigate = useNavigate();
  const [encounter, setEncounter] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchEncounter = useCallback(async () => {
    setLoading(true);
    try {
      const res = await encountersApi.getWith(encounterId);
      setEncounter(res.data || res);
    } catch {
      setEncounter(null);
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  useEffect(() => {
    fetchEncounter();
  }, [fetchEncounter]);

  if (loading) {
    return <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>;
  }
  if (!encounter) {
    return (
      <Fade in timeout={300}>
        <Box textAlign="center" py={8} sx={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '16px',
          p: 4,
        }}>
          <Typography variant="h6" sx={{
            background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontWeight: 700, mb: 1,
          }}>Encounter not found</Typography>
          <Typography variant="body2" color="text.secondary">
            This encounter may no longer be available.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', mt: 2 }}>
            <Button onClick={fetchEncounter} sx={{ color: '#6C63FF', textTransform: 'none' }}>
              Try Again
            </Button>
            <Button onClick={() => navigate(-1)} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>
              Go back
            </Button>
          </Box>
        </Box>
      </Fade>
    );
  }

  const compatibility = encounter.compatibility_pct ?? encounter.compatibility ?? 0;
  const bondLevel = encounter.bond_level ?? encounter.bond?.level ?? 0;
  const sharedInterests = encounter.shared_interests || encounter.interests || [];
  const starters = encounter.conversation_starters || [];
  const context = encounter.context || encounter.encounter_context || '';

  return (
    <>
      {/* Back button */}
      <IconButton onClick={() => navigate(-1)} sx={{ mb: 1, color: 'rgba(255,255,255,0.7)', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.06)' } }} aria-label="Go back">
        <ArrowBackIcon />
      </IconButton>

      {/* Header */}
      <Card sx={{ borderRadius: 3, mb: 2 }}>
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              src={encounter.avatar_url}
              sx={{
                width: { xs: 64, md: 80 }, height: { xs: 64, md: 80 },
                background: 'linear-gradient(to right, #6C63FF, #9B94FF)',
                fontSize: { xs: 24, md: 32 },
              }}
            >
              {(encounter.display_name || encounter.username || '?')[0].toUpperCase()}
            </Avatar>
            <Box sx={{ flex: 1 }}>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {encounter.display_name || encounter.username}
              </Typography>
              {encounter.username && (
                <Typography variant="body2" color="text.secondary">
                  @{encounter.username}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" sx={{
                    fontWeight: 700,
                    background: 'linear-gradient(to right, #6C63FF, #9B94FF)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}>
                    {compatibility}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">Compatibility</Typography>
                </Box>
                {bondLevel > 0 && (
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <FavoriteIcon sx={{ fontSize: 18, color: 'error.main' }} />
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {bondLevel}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">Bond Level</Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Context */}
      {context && (
        <Card sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
              How you crossed paths
            </Typography>
            <Typography variant="body2">{context}</Typography>
          </CardContent>
        </Card>
      )}

      {/* Shared Interests */}
      {sharedInterests.length > 0 && (
        <Card sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Shared Interests
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {sharedInterests.map((interest) => (
                <Chip
                  key={interest}
                  label={interest}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ borderRadius: 2 }}
                />
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Conversation Starters */}
      {starters.length > 0 && (
        <Card sx={{ borderRadius: 3, mb: 2 }}>
          <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Conversation Starters
            </Typography>
            {starters.map((starter, i) => (
              <React.Fragment key={i}>
                <Box sx={{
                  p: 1.5, bgcolor: 'action.hover', borderRadius: 2,
                  mb: i < starters.length - 1 ? 1 : 0,
                }}>
                  <Typography variant="body2">{starter}</Typography>
                </Box>
              </React.Fragment>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<ChatIcon />}
          fullWidth
          onClick={() => navigate(`/social/messages/${encounterId}`)}
          sx={{
            borderRadius: 2, py: 1.2,
            background: 'linear-gradient(to right, #6C63FF, #9B94FF)',
            '&:hover': { background: 'linear-gradient(to right, #5A52E0, #8A83F0)' },
          }}
        >
          Start Chat
        </Button>
        <Button
          variant="outlined"
          fullWidth
          onClick={() => navigate(`/social/profile/${encounterId}`)}
          sx={{ borderRadius: 2, py: 1.2 }}
        >
          View Profile
        </Button>
      </Box>
    </>
  );
}
