import {useSocial} from '../../../contexts/SocialContext';
import {referralsApi} from '../../../services/socialApi';
import ReferralCard from '../shared/ReferralCard';

import {Box, Typography, CircularProgress} from '@mui/material';
import React, {useState, useEffect} from 'react';

export default function ReferralSection({userId}) {
  const {currentUser} = useSocial();
  const [code, setCode] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const isOwn =
    currentUser &&
    (currentUser.id === userId || currentUser.username === userId);

  useEffect(() => {
    if (!isOwn) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([referralsApi.getCode(), referralsApi.stats()])
      .then(([codeRes, statsRes]) => {
        if (!cancelled) {
          setCode(codeRes.data?.code || codeRes.code || codeRes.data || null);
          setStats(statsRes.data || statsRes || {});
        }
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, isOwn]);

  if (!isOwn) return null;

  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 3}}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{mb: 2}}>
      <Typography variant="subtitle1" sx={{fontWeight: 700, mb: 1}}>
        Referral Program
      </Typography>
      <ReferralCard code={code} stats={stats} />
    </Box>
  );
}
