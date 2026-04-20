import ShareConsentDialog from '../components/Social/shared/ShareConsentDialog';
import {shareApi} from '../services/socialApi';

import {
  Box,
  CircularProgress,
  Typography,
  Card,
  CardContent,
} from '@mui/material';
import React, {useEffect, useState, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';

/**
 * ShareLandingPage — resolves /s/:token and redirects to the actual resource.
 * Shows consent dialog for private links, brief loading for public links.
 */
export default function ShareLandingPage() {
  const {token} = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [og, setOg] = useState(null);
  const [consentRequired, setConsentRequired] = useState(false);
  const [shareData, setShareData] = useState(null);

  useEffect(() => {
    if (!token) return;

    const resolve = async () => {
      try {
        // Track the view
        shareApi.trackView(token);

        const res = await shareApi.resolve(token);
        const data = res.data?.data || res.data;

        if (data?.requires_consent) {
          // Private link — show consent dialog
          setShareData(data);
          setConsentRequired(true);
          return;
        }

        if (data?.redirect_url) {
          setOg(data.og || null);
          setTimeout(() => {
            navigate(data.redirect_url, {replace: true});
          }, 300);
        } else {
          setError('Link not found or expired');
        }
      } catch {
        setError('Failed to resolve share link');
      }
    };
    resolve();
  }, [token, navigate]);

  const handleConsent = useCallback(
    (unlockedData) => {
      if (unlockedData?.redirect_url) {
        navigate(unlockedData.redirect_url, {replace: true});
      }
    },
    [navigate]
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0F0E17',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {error ? (
        <Card sx={{maxWidth: 400, bgcolor: '#1a1a2e', borderRadius: '16px'}}>
          <CardContent sx={{textAlign: 'center', py: 4}}>
            <Typography variant="h6" sx={{color: '#FF6B6B', mb: 1}}>
              Link unavailable
            </Typography>
            <Typography variant="body2" sx={{color: '#aaa'}}>
              {error}
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Box sx={{textAlign: 'center'}}>
          <CircularProgress size={32} sx={{color: '#6C63FF', mb: 2}} />
          {og?.title && (
            <Typography variant="body2" sx={{color: '#aaa', mt: 1}}>
              Loading: {og.title}
            </Typography>
          )}
        </Box>
      )}

      {/* Consent dialog for private share links */}
      <ShareConsentDialog
        open={consentRequired}
        onClose={() => {
          setConsentRequired(false);
          setError('Access declined');
        }}
        token={token}
        shareData={shareData}
        onConsent={handleConsent}
      />
    </Box>
  );
}
