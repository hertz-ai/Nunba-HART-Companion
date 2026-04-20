import {useSocial} from '../../../contexts/SocialContext';
import {notificationsApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  SHADOWS,
  EASINGS,
  GRADIENTS,
} from '../../../theme/socialTokens';

import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import NotificationsIcon from '@mui/icons-material/Notifications';
import {
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Button,
  Box,
  CircularProgress,
  Fade,
  useTheme,
  keyframes,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';


/* Premium keyframes */
const unreadPulse = keyframes`
  0%, 100% { transform: scale(1); opacity: 1; box-shadow: 0 0 0 0 rgba(108,99,255,0.4); }
  50%      { transform: scale(1.3); opacity: 0.8; box-shadow: 0 0 0 6px rgba(108,99,255,0); }
`;

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

export default function NotificationsPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const {fetchUnread} = useSocial();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        // Fetch first 10 immediately for fast initial render
        const res = await notificationsApi.list({limit: 10});
        if (cancelled) return;
        const first = res.data || [];
        setNotifications(first);
        setLoading(false);

        // Then load remaining in background
        if (first.length >= 10) {
          setLoadingMore(true);
          try {
            const rest = await notificationsApi.list({limit: 50, offset: 10});
            if (cancelled) return;
            const remaining = rest.data || [];
            if (remaining.length > 0) {
              setNotifications((prev) => [...prev, ...remaining]);
            }
          } catch {
            /* ignore background load failure */
          }
          if (!cancelled) setLoadingMore(false);
        }
      } catch (err) {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({...n, is_read: true})));
      fetchUnread();
    } catch (err) {
      /* ignore */
    }
  };

  const handleClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await notificationsApi.markRead([notif.id]);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? {...n, is_read: true} : n))
        );
        fetchUnread();
      } catch (err) {
        /* ignore */
      }
    }
    if (notif.link) navigate(notif.link);
  };

  if (loading)
    return (
      <Box textAlign="center" py={6}>
        <CircularProgress sx={{ color: '#6C63FF' }} />
      </Box>
    );

  return (
    <Fade in timeout={400}>
      <Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.6)})`,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Notifications
          </Typography>
          <Button
            size="small"
            onClick={handleMarkAllRead}
            sx={{
              fontWeight: 600,
              background: GRADIENTS.primary,
              color: '#fff',
              borderRadius: RADIUS.sm,
              px: 2,
              py: 0.5,
              transition: `all 250ms ${EASINGS.smooth}`,
              '&:hover': {
                background: GRADIENTS.primaryHover,
                transform: 'translateY(-1px)',
                boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.3)}`,
              },
              '&:active': {
                transform: 'translateY(0) scale(0.98)',
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            Mark all read
          </Button>
        </Box>
        {notifications.length === 0 ? (
          <Box textAlign="center" py={6}>
            <NotificationsIcon
              sx={{
                fontSize: 48,
                color: alpha(theme.palette.common.white, 0.15),
                mb: 1,
              }}
            />
            <Typography variant="h6" color="text.secondary">
              No notifications
            </Typography>
          </Box>
        ) : (
          <>
            <List disablePadding>
              {notifications.map((n, idx) => (
                <Fade in key={n.id} timeout={300 + Math.min(idx * 50, 400)}>
                  <ListItem
                    sx={{
                      ...socialTokens.glass.subtle(theme),
                      borderRadius: RADIUS.lg,
                      mb: 1,
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: `transform 250ms ${EASINGS.smooth}, box-shadow 250ms ${EASINGS.smooth}, border-color 250ms ${EASINGS.smooth}`,
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: SHADOWS.cardHover,
                        borderColor: alpha(theme.palette.primary.main, 0.2),
                        '& .notif-shine': {
                          animation: `${shimmerSweep} 0.8s ease`,
                        },
                      },
                      '&:active': {
                        transform: 'translateY(0) scale(0.995)',
                      },
                      '&:focus-visible': {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                      ...(!n.is_read
                        ? {
                            borderLeft: `3px solid ${theme.palette.primary.main}`,
                            background: alpha(theme.palette.primary.main, 0.04),
                          }
                        : {}),
                    }}
                    onClick={() => handleClick(n)}
                  >
                    {/* Shine overlay */}
                    <Box
                      className="notif-shine"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        width: '50%',
                        left: '-75%',
                        background: GRADIENTS.shimmer,
                        transform: 'skewX(-15deg)',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }}
                    />
                    {!n.is_read && (
                      <ListItemIcon
                        sx={{
                          minWidth: 28,
                          position: 'relative',
                          zIndex: 2,
                        }}
                      >
                        <FiberManualRecordIcon
                          sx={{
                            fontSize: 10,
                            color: theme.palette.primary.main,
                            animation: `${unreadPulse} 2s ease-in-out infinite`,
                          }}
                        />
                      </ListItemIcon>
                    )}
                    <ListItemText
                      sx={{position: 'relative', zIndex: 2}}
                      primary={
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: n.is_read ? 400 : 600,
                            color: alpha(
                              theme.palette.common.white,
                              n.is_read ? 0.7 : 0.95
                            ),
                          }}
                        >
                          {n.message || n.content}
                        </Typography>
                      }
                      secondary={
                        n.created_at ? (
                          <Typography
                            variant="caption"
                            sx={{
                              color: alpha(theme.palette.common.white, 0.35),
                            }}
                          >
                            {new Date(n.created_at).toLocaleString()}
                          </Typography>
                        ) : (
                          ''
                        )
                      }
                    />
                  </ListItem>
                </Fade>
              ))}
            </List>
            {loadingMore && (
              <Box sx={{textAlign: 'center', py: 2}}>
                <CircularProgress
                  size={20}
                  sx={{color: alpha(theme.palette.primary.main, 0.5)}}
                />
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.5,
                    color: alpha(theme.palette.common.white, 0.35),
                  }}
                >
                  Loading more...
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>
    </Fade>
  );
}
