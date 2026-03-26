import {useSocial} from '../../../contexts/SocialContext';
import {ratingsApi} from '../../../services/socialApi';
import StarRating from '../shared/StarRating';
import TrustScore from '../shared/TrustScore';

import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Button,
  Divider,
  Avatar,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';

export default function RatingsPanel({userId, isOwnProfile = false}) {
  const {currentUser} = useSocial();
  const [trust, setTrust] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ratingValues, setRatingValues] = useState({
    skill: 0,
    usefulness: 0,
    reliability: 0,
    creativity: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [trustRes, receivedRes] = await Promise.all([
        ratingsApi.trust(userId),
        ratingsApi.received(userId, {limit: 5}),
      ]);
      setTrust(trustRes.data || trustRes);
      setRecent(receivedRes.data || []);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await ratingsApi.submit({target_user_id: userId, ...ratingValues});
      setSubmitted(true);
      loadData();
    } catch {
      /* silent */
    }
    setSubmitting(false);
  };

  const canRate =
    currentUser && currentUser.id !== userId && !isOwnProfile && !submitted;

  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 4}}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Card sx={{borderRadius: 3, mb: 2}}>
      <CardContent sx={{p: {xs: 1.5, md: 2}}}>
        <Typography variant="subtitle1" sx={{fontWeight: 700, mb: 1.5}}>
          Trust & Ratings
        </Typography>

        {/* Trust Score Chart */}
        {trust && (
          <Box sx={{mb: 2}}>
            <TrustScore
              scores={trust}
              size={isOwnProfile ? 'full' : 'compact'}
            />
          </Box>
        )}

        <Divider sx={{my: 1.5}} />

        {/* Rate this user */}
        {canRate && (
          <Box sx={{mb: 2}}>
            <Typography variant="subtitle2" color="text.secondary" sx={{mb: 1}}>
              Rate this user
            </Typography>
            <StarRating values={ratingValues} onChange={setRatingValues} />
            <Button
              variant="contained"
              size="small"
              onClick={handleSubmit}
              disabled={submitting}
              sx={{
                mt: 1.5,
                borderRadius: 2,
                background: 'linear-gradient(to right, #00e89d, #0078ff)',
                '&:hover': {
                  background: 'linear-gradient(to right, #00d48e, #006ae0)',
                },
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Rating'}
            </Button>
          </Box>
        )}
        {submitted && (
          <Typography variant="body2" color="success.main" sx={{mb: 1.5}}>
            Rating submitted. Thank you!
          </Typography>
        )}

        {/* Recent ratings */}
        {recent.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{mb: 1}}>
              Recent Ratings
            </Typography>
            {recent.map((r, i) => (
              <Box
                key={r.id || i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 1,
                  borderBottom: i < recent.length - 1 ? 1 : 0,
                  borderColor: 'divider',
                }}
              >
                <Avatar
                  src={r.rater_avatar}
                  sx={{width: 28, height: 28, fontSize: 12}}
                >
                  {(r.rater_name || '?')[0].toUpperCase()}
                </Avatar>
                <Box sx={{flex: 1, minWidth: 0}}>
                  <Typography variant="caption" sx={{fontWeight: 600}} noWrap>
                    {r.rater_name || 'Anonymous'}
                  </Typography>
                  <StarRating
                    values={{
                      skill: r.skill,
                      usefulness: r.usefulness,
                      reliability: r.reliability,
                      creativity: r.creativity,
                    }}
                    readOnly
                  />
                </Box>
              </Box>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
