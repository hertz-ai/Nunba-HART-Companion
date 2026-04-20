import {adApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';

import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Box,
  Card,
  Typography,
  Button,
  IconButton,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useRef, useCallback} from 'react';

const DISMISSED_KEY = 'nunba_dismissed_ads';

function getDismissedAds() {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function dismissAd(adId) {
  try {
    const dismissed = getDismissedAds();
    if (!dismissed.includes(adId)) {
      dismissed.push(adId);
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    }
  } catch {
    // sessionStorage unavailable — silently ignore
  }
}

/**
 * AdBanner - Horizontal banner for feed_top placement.
 *
 * Props:
 *   placement - string: ad placement name (default 'feed_top')
 *   regionId  - optional number: region id
 *   sx        - optional: additional sx overrides
 */
export default function AdBanner({placement = 'feed_top', regionId, sx = {}}) {
  const theme = useTheme();
  const [ad, setAd] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const impressionRecorded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (regionId) params.region_id = regionId;

    adApi
      .serve(placement, params)
      .then((res) => {
        if (!cancelled && res && res.data) {
          // Check if this ad was already dismissed in this session
          const dismissedIds = getDismissedAds();
          if (dismissedIds.includes(res.data.id)) {
            setDismissed(true);
          } else {
            setAd(res.data);
          }
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [placement, regionId]);

  // Record impression once when ad is loaded
  useEffect(() => {
    if (ad && ad.id && !impressionRecorded.current) {
      impressionRecorded.current = true;
      adApi.impression(ad.id);
    }
  }, [ad]);

  const handleClick = useCallback(() => {
    if (!ad) return;
    adApi.click(ad.id);
    if (ad.target_url) {
      window.open(ad.target_url, '_blank', 'noopener,noreferrer');
    }
  }, [ad]);

  const handleDismiss = useCallback(
    (e) => {
      e.stopPropagation();
      if (ad) {
        dismissAd(ad.id);
      }
      setDismissed(true);
    },
    [ad]
  );

  if (!ad || dismissed) return null;

  return (
    <Card
      sx={{
        position: 'relative',
        borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        overflow: 'hidden',
        mb: 2,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: {xs: 'column', sm: 'row'},
        alignItems: {sm: 'center'},
        // Subtle gradient border
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          borderRadius: RADIUS.md,
          padding: '1px',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.25)}, ${alpha('#FF6B6B', 0.15)}, transparent)`,
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          pointerEvents: 'none',
        },
        transition: `transform 200ms ${EASINGS.smooth}, box-shadow 200ms ${EASINGS.smooth}`,
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow: SHADOWS.cardHover,
        },
        ...sx,
      }}
      onClick={handleClick}
    >
      {/* Dismiss button */}
      <IconButton
        size="small"
        onClick={handleDismiss}
        sx={{
          position: 'absolute',
          top: 6,
          right: 6,
          zIndex: 2,
          color: alpha(theme.palette.text.secondary, 0.5),
          bgcolor: alpha(theme.palette.background.paper, 0.6),
          backdropFilter: 'blur(8px)',
          width: 26,
          height: 26,
          '&:hover': {
            bgcolor: alpha(theme.palette.background.paper, 0.85),
            color: theme.palette.text.primary,
          },
        }}
      >
        <CloseIcon sx={{fontSize: 14}} />
      </IconButton>

      {/* Image section (left on desktop, top on mobile) */}
      {ad.media_url && (
        <Box
          component="img"
          src={ad.media_url}
          alt={ad.title || 'Sponsored'}
          sx={{
            width: {xs: '100%', sm: 180},
            height: {xs: 120, sm: 'auto'},
            minHeight: {sm: 100},
            objectFit: 'cover',
            flexShrink: 0,
            display: 'block',
          }}
        />
      )}

      {/* Text section (right on desktop, bottom on mobile) */}
      <Box sx={{p: 2, flex: 1, minWidth: 0, pr: {xs: 2, sm: 5}}}>
        {/* Sponsored label */}
        <Typography
          variant="caption"
          sx={{
            color: alpha(theme.palette.text.secondary, 0.6),
            fontSize: '0.62rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            mb: 0.25,
            display: 'block',
          }}
        >
          Sponsored
        </Typography>

        {/* Title */}
        {ad.title && (
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              fontSize: '0.9rem',
              lineHeight: 1.3,
              color: theme.palette.text.primary,
              mb: 0.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: {sm: 'nowrap'},
            }}
          >
            {ad.title}
          </Typography>
        )}

        {/* Description */}
        {ad.description && (
          <Typography
            variant="body2"
            sx={{
              color: theme.palette.text.secondary,
              fontSize: '0.76rem',
              lineHeight: 1.5,
              mb: 1,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {ad.description}
          </Typography>
        )}

        {/* CTA button */}
        {ad.cta_text && (
          <Button
            size="small"
            variant="contained"
            endIcon={<OpenInNewIcon sx={{fontSize: '0.82rem !important'}} />}
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            sx={{
              background: GRADIENTS.primary,
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.7rem',
              textTransform: 'none',
              borderRadius: RADIUS.sm,
              px: 2,
              py: 0.4,
              boxShadow: 'none',
              '&:hover': {
                background: GRADIENTS.primaryHover,
                boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.3)}`,
              },
            }}
          >
            {ad.cta_text}
          </Button>
        )}
      </Box>
    </Card>
  );
}
