import {adApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';

import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useRef} from 'react';

/**
 * AdCard - Compact ad card for sidebar, interstitial, and region placements.
 *
 * Props:
 *   placement - string: 'feed_top' | 'sidebar' | 'post_interstitial' | 'region_page'
 *   regionId  - optional number: region id for region_page placement
 *   sx        - optional: additional sx overrides
 */
export default function AdCard({placement, regionId, sx = {}}) {
  const theme = useTheme();
  const [ad, setAd] = useState(null);
  const impressionRecorded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const params = {};
    if (regionId) params.region_id = regionId;

    adApi
      .serve(placement, params)
      .then((res) => {
        if (!cancelled && res && res.data) {
          setAd(res.data);
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

  if (!ad) return null;

  const handleClick = () => {
    adApi.click(ad.id);
    if (ad.target_url) {
      window.open(ad.target_url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card
      sx={{
        position: 'relative',
        borderRadius: RADIUS.md,
        ...socialTokens.glass.subtle(theme),
        overflow: 'hidden',
        cursor: 'pointer',
        // Subtle gradient border to distinguish from organic content
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          borderRadius: RADIUS.md,
          padding: '1px',
          background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.3)}, ${alpha('#FF6B6B', 0.2)}, transparent)`,
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
      {/* Optional media */}
      {ad.media_url && (
        <Box
          component="img"
          src={ad.media_url}
          alt={ad.title || 'Sponsored'}
          sx={{
            width: '100%',
            height: 140,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      )}

      <CardContent sx={{p: 2, '&:last-child': {pb: 2}}}>
        {/* Sponsored label */}
        <Typography
          variant="caption"
          sx={{
            color: alpha(theme.palette.text.secondary, 0.6),
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            mb: 0.5,
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
              fontSize: '0.88rem',
              lineHeight: 1.3,
              color: theme.palette.text.primary,
              mb: 0.5,
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
              fontSize: '0.78rem',
              lineHeight: 1.5,
              mb: 1.5,
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
            endIcon={<OpenInNewIcon sx={{fontSize: '0.85rem !important'}} />}
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            sx={{
              background: GRADIENTS.primary,
              color: '#fff',
              fontWeight: 600,
              fontSize: '0.72rem',
              textTransform: 'none',
              borderRadius: RADIUS.sm,
              px: 2,
              py: 0.5,
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
      </CardContent>
    </Card>
  );
}
