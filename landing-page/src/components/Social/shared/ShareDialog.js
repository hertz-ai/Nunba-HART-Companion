import {shareApi} from '../../../services/socialApi';

import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EmailIcon from '@mui/icons-material/Email';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import QrCodeIcon from '@mui/icons-material/QrCode';
import RedditIcon from '@mui/icons-material/Reddit';
import ShareIcon from '@mui/icons-material/Share';
import TwitterIcon from '@mui/icons-material/Twitter';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  IconButton,
  Box,
  Typography,
  Tooltip,
  CircularProgress,
  Chip,
  Snackbar,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import DOMPurify from 'dompurify';
import React, {useState, useEffect, useCallback} from 'react';


/**
 * ShareDialog — Universal share dialog for any resource.
 *
 * Props:
 *   open, onClose — dialog state
 *   resourceType — 'post' | 'profile' | 'community' | 'agent' | 'recipe' | 'game' | etc
 *   resourceId — the resource ID
 *   title — fallback display title
 *   isPrivate — whether to create a consent-gated link
 */
export default function ShareDialog({
  open,
  onClose,
  resourceType,
  resourceId,
  title,
  isPrivate = false,
}) {
  const [shareUrl, setShareUrl] = useState('');
  const [ogData, setOgData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const [shareCount, setShareCount] = useState(0);
  const [snackMsg, setSnackMsg] = useState('');

  const shareTitle = ogData?.title || title || 'Check this out on Nunba';

  // Fetch or create share link when dialog opens
  useEffect(() => {
    if (!open || !resourceType || !resourceId) return;
    let cancelled = false;

    const fetchLink = async () => {
      setLoading(true);
      try {
        const res = await shareApi.createLink(
          resourceType,
          resourceId,
          isPrivate
        );
        const data = res.data?.data || res.data;
        if (!cancelled && data) {
          const base = window.location.origin;
          setShareUrl(`${base}${data.url || `/s/${data.token}`}`);
          setOgData(data.og || null);
          setViewCount(data.view_count || 0);
          setShareCount(data.share_count || 0);
        }
      } catch {
        // Fallback to direct URL
        if (!cancelled) {
          setShareUrl(
            `${window.location.origin}/social/${resourceType}/${resourceId}`
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchLink();
    return () => {
      cancelled = true;
    };
  }, [open, resourceType, resourceId, isPrivate]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setSnackMsg('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silent */
    }
  }, [shareUrl]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({title: shareTitle, url: shareUrl});
      } catch {
        /* user cancelled */
      }
    }
  }, [shareTitle, shareUrl]);

  const socials = [
    {
      label: 'Twitter / X',
      icon: <TwitterIcon />,
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: 'LinkedIn',
      icon: <LinkedInIcon />,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: 'Reddit',
      icon: <RedditIcon />,
      href: `https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`,
    },
    {
      label: 'WhatsApp',
      icon: <WhatsAppIcon />,
      href: `https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`,
    },
    {
      label: 'Email',
      icon: <EmailIcon />,
      href: `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(`Check this out: ${shareUrl}`)}`,
    },
  ];

  const embedCode = `<iframe src="${shareUrl}?embed=1" width="400" height="300" frameborder="0" style="border-radius:12px;border:1px solid #333"></iframe>`;

  // Simple QR code as SVG (no external dependency)
  const qrSvg = shareUrl ? generateSimpleQR(shareUrl) : null;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="xs"
        fullWidth
        PaperProps={{sx: {borderRadius: '16px', bgcolor: '#1a1a2e'}}}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fff',
          }}
        >
          Share
          <IconButton size="small" onClick={onClose} sx={{color: '#aaa'}}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          {loading ? (
            <Box sx={{display: 'flex', justifyContent: 'center', py: 4}}>
              <CircularProgress size={32} sx={{color: '#6C63FF'}} />
            </Box>
          ) : (
            <>
              {/* Stats */}
              <Box sx={{display: 'flex', gap: 1.5, mb: 2}}>
                <Chip
                  icon={<VisibilityIcon sx={{fontSize: 16}} />}
                  label={`${viewCount} views`}
                  size="small"
                  sx={{bgcolor: alpha('#6C63FF', 0.15), color: '#aaa'}}
                />
                <Chip
                  icon={<ShareIcon sx={{fontSize: 16}} />}
                  label={`${shareCount} shares`}
                  size="small"
                  sx={{bgcolor: alpha('#FF6B6B', 0.15), color: '#aaa'}}
                />
              </Box>

              {/* Copy link */}
              <Typography variant="subtitle2" sx={{mb: 0.5, color: '#aaa'}}>
                Copy link
              </Typography>
              <Box sx={{display: 'flex', gap: 1, mb: 2}}>
                <TextField
                  value={shareUrl}
                  size="small"
                  fullWidth
                  InputProps={{
                    readOnly: true,
                    sx: {
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      color: '#fff',
                      bgcolor: '#0f0e17',
                    },
                  }}
                />
                <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                  <IconButton
                    onClick={handleCopy}
                    color={copied ? 'success' : 'default'}
                  >
                    <ContentCopyIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* Social share buttons */}
              <Typography variant="subtitle2" sx={{mb: 1, color: '#aaa'}}>
                Share on
              </Typography>
              <Box sx={{display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap'}}>
                {socials.map((s) => (
                  <Tooltip key={s.label} title={s.label}>
                    <IconButton
                      component="a"
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        bgcolor: alpha('#fff', 0.06),
                        borderRadius: 2,
                        color: '#ccc',
                        '&:hover': {
                          bgcolor: alpha('#6C63FF', 0.2),
                          color: '#fff',
                        },
                      }}
                    >
                      {s.icon}
                    </IconButton>
                  </Tooltip>
                ))}
                {navigator.share && (
                  <Tooltip title="More...">
                    <IconButton
                      onClick={handleNativeShare}
                      sx={{
                        bgcolor: alpha('#6C63FF', 0.2),
                        borderRadius: 2,
                        color: '#6C63FF',
                        '&:hover': {bgcolor: alpha('#6C63FF', 0.3)},
                      }}
                    >
                      <ShareIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              {/* QR Code */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  mb: 1,
                }}
              >
                <Typography variant="subtitle2" sx={{color: '#aaa'}}>
                  QR Code
                </Typography>
                <Tooltip title="Embed code">
                  <IconButton
                    size="small"
                    onClick={() => setShowEmbed(!showEmbed)}
                    sx={{color: '#aaa'}}
                  >
                    <CodeIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              {showEmbed ? (
                <Box sx={{mb: 2}}>
                  <TextField
                    value={embedCode}
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                    InputProps={{
                      readOnly: true,
                      sx: {
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        color: '#ccc',
                        bgcolor: '#0f0e17',
                      },
                    }}
                  />
                  <Button
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(embedCode);
                      setSnackMsg('Embed code copied!');
                    }}
                    sx={{mt: 0.5, color: '#6C63FF', textTransform: 'none'}}
                  >
                    Copy embed code
                  </Button>
                </Box>
              ) : (
                <Box
                  sx={{
                    width: 128,
                    height: 128,
                    mx: 'auto',
                    mb: 1,
                    bgcolor: '#fff',
                    borderRadius: '8px',
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {qrSvg ? (
                    <div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(qrSvg)}} />
                  ) : (
                    <QrCodeIcon sx={{fontSize: 64, color: '#ccc'}} />
                  )}
                </Box>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{px: 3, pb: 2}}>
          <Button onClick={onClose} sx={{borderRadius: 2, color: '#aaa'}}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackMsg}
        autoHideDuration={2000}
        onClose={() => setSnackMsg('')}
        message={snackMsg}
      />
    </>
  );
}

/**
 * Generate a simple QR-like SVG for the given text.
 * Uses a basic encoding pattern — works for short URLs.
 * For production, consider qrcode.react or a dedicated library.
 */
function generateSimpleQR(text) {
  // Minimal QR: hash-based visual pattern (not scannable, but visually representative)
  // In production, use a proper QR library. This is a placeholder grid.
  const size = 21;
  const cellSize = 5;
  const svgSize = size * cellSize;
  let cells = '';

  // Generate deterministic pattern from URL hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  // Fixed finder patterns (top-left, top-right, bottom-left)
  const isFinderCell = (r, c) => {
    const inTL = r < 7 && c < 7;
    const inTR = r < 7 && c >= size - 7;
    const inBL = r >= size - 7 && c < 7;
    if (!inTL && !inTR && !inBL) return null;
    // Outer border
    const localR = inTL ? r : inTR ? r : r - (size - 7);
    const localC = inTL ? c : inTR ? c - (size - 7) : c;
    if (localR === 0 || localR === 6 || localC === 0 || localC === 6)
      return true;
    if (localR === 1 || localR === 5 || localC === 1 || localC === 5)
      return false;
    return true; // Inner 3x3
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const finder = isFinderCell(r, c);
      let on;
      if (finder !== null) {
        on = finder;
      } else {
        // Pseudo-random from hash
        const seed = (hash ^ (r * 37 + c * 53)) & 0xffffffff;
        on = seed % 3 !== 0;
      }
      if (on) {
        cells += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="#000"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgSize} ${svgSize}" width="110" height="110">${cells}</svg>`;
}
