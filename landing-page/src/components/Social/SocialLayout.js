import {logActivity} from './Autopilot/autopilotStore';
import {
  NunbaChatProvider,
  NunbaChatPill,
  NunbaChatPanel,
} from './shared/NunbaChat';

import {useSocial} from '../../contexts/SocialContext';
import {useNunbaTheme} from '../../contexts/ThemeContext';
import {usePageObserver} from '../../hooks/useAgentObserver';
import {prefetchRoute} from '../../services/routePrefetcher';
import {evolutionApi} from '../../services/socialApi';
import {
  GRADIENTS,
  EASINGS,
  RADIUS,
  socialTokens,
} from '../../theme/socialTokens';
import {useRoleAccess} from '../RoleGuard';
import ErrorBoundary from '../shared/ErrorBoundary';

import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ExploreIcon from '@mui/icons-material/Explore';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import ScienceIcon from '@mui/icons-material/Science';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import BackupIcon from '@mui/icons-material/Backup';
import PaletteIcon from '@mui/icons-material/Palette';
import AutoModeIcon from '@mui/icons-material/AutoMode';
import DashboardIcon from '@mui/icons-material/Dashboard';
import MemoryIcon from '@mui/icons-material/Memory';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import BuildIcon from '@mui/icons-material/Build';
import StorefrontIcon from '@mui/icons-material/Storefront';
import CableIcon from '@mui/icons-material/Cable';
import HiveIcon from '@mui/icons-material/Hive';
import FavoriteIcon from '@mui/icons-material/Favorite';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CodeIcon from '@mui/icons-material/Code';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FlagIcon from '@mui/icons-material/Flag';
import GroupIcon from '@mui/icons-material/Group';
import HomeIcon from '@mui/icons-material/Home';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PublicIcon from '@mui/icons-material/Public';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  BottomNavigation,
  BottomNavigationAction,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Badge,
  Avatar,
  Box,
  Divider,
  Fade,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React from 'react';
import {useNavigate, useLocation} from 'react-router-dom';

const DRAWER_WIDTH = 260;

/* ── Keyframes ── */
const brandGlow = keyframes`
  0%, 100% { text-shadow: 0 0 20px rgba(108,99,255,0.3), 0 0 40px rgba(255,107,107,0.1); }
  50%      { text-shadow: 0 0 30px rgba(108,99,255,0.5), 0 0 60px rgba(255,107,107,0.2); }
`;

/* ── Grouped Navigation ── */
const navGroups = [
  {
    label: 'Hub',
    items: [
      {label: 'Agents', path: '/', icon: <SmartToyIcon />, minRole: null},
    ],
  },
  {
    label: 'Discover',
    items: [
      {label: 'Feed', path: '/social', icon: <HomeIcon />, minRole: null},
      {
        label: 'Activity Hub',
        path: '/social/hub',
        icon: <DashboardIcon />,
        minRole: null,
      },
      {
        label: 'Thought Experiments',
        path: '/social/experiments',
        icon: <ScienceIcon />,
        minRole: null,
      },
      {
        label: 'Trending',
        path: '/social?tab=trending',
        icon: <TrendingUpIcon />,
        minRole: null,
      },
      {
        label: 'Tools',
        path: '/social/tools',
        icon: <BuildIcon />,
        minRole: null,
      },
      {
        label: 'Marketplace',
        path: '/social/marketplace',
        icon: <StorefrontIcon />,
        minRole: null,
      },
      {
        label: 'Search',
        path: '/social/search',
        icon: <SearchIcon />,
        minRole: null,
      },
    ],
  },
  {
    label: 'Create',
    items: [
      {
        label: 'Communities',
        path: '/social/communities',
        icon: <GroupIcon />,
        minRole: null,
      },
      {
        label: 'Campaigns',
        path: '/social/campaigns',
        icon: <RocketLaunchIcon />,
        minRole: 'flat',
      },
      {
        label: 'Coding Agent',
        path: '/social/coding',
        icon: <CodeIcon />,
        minRole: 'flat',
      },
      {
        label: 'Tracker',
        path: '/social/tracker',
        icon: <ScienceIcon />,
        minRole: 'flat',
      },
      {
        label: 'Channels',
        path: '/social/channels',
        icon: <CableIcon />,
        minRole: 'flat',
      },
      {
        label: 'Hive',
        path: '/social/hive',
        icon: <HiveIcon />,
        minRole: 'flat',
      },
      {
        label: 'HARTs',
        path: '/social/agents',
        icon: <SmartToyIcon />,
        minRole: 'flat',
      },
    ],
  },
  {
    label: 'You',
    items: [
      {
        label: 'Resonance',
        path: '/social/resonance',
        icon: <AccountBalanceWalletIcon />,
        minRole: 'flat',
      },
      {
        label: 'Compute',
        path: '/social/compute',
        icon: <MemoryIcon />,
        minRole: 'flat',
      },
      {
        label: 'Regions',
        path: '/social/regions',
        icon: <PublicIcon />,
        minRole: 'flat',
      },
      {
        label: 'Encounters',
        path: '/social/encounters',
        icon: <ExploreIcon />,
        minRole: 'flat',
      },
      {
        label: 'Autopilot',
        path: '/social/autopilot',
        icon: <AutoModeIcon />,
        minRole: null,
      },
      {
        label: 'Backup',
        path: '/social/settings/backup',
        icon: <BackupIcon />,
        minRole: 'guest',
      },
      {
        label: 'Appearance',
        path: '/social/settings/appearance',
        icon: <PaletteIcon />,
        minRole: 'guest',
      },
    ],
  },
  {
    label: 'Explore',
    items: [
      {
        label: 'Recipes',
        path: '/social/recipes',
        icon: <CodeIcon />,
        minRole: null,
      },
      {
        label: 'Achievements',
        path: '/social/achievements',
        icon: <EmojiEventsIcon />,
        minRole: null,
      },
      {
        label: 'Challenges',
        path: '/social/challenges',
        icon: <FlagIcon />,
        minRole: null,
      },
      {
        label: 'Seasons',
        path: '/social/seasons',
        icon: <EmojiEventsIcon fontSize="small" />,
        minRole: 'anonymous',
      },
      {
        label: 'Kids Learning',
        path: '/social/kids',
        icon: <ChildCareIcon />,
        minRole: null,
      },
      {
        label: 'Games',
        path: '/social/games',
        icon: <SportsEsportsIcon />,
        minRole: null,
      },
      {
        label: 'Mindstory',
        path: '/social/mindstory',
        icon: <VideoLibraryIcon />,
        minRole: null,
      },
    ],
  },
  {
    label: 'Manage',
    items: [
      {
        label: 'Admin',
        path: '/admin',
        icon: <AdminPanelSettingsIcon />,
        minRole: 'regional',
      },
    ],
  },
];

const ROLE_LEVELS = {anonymous: 0, guest: 1, flat: 2, regional: 3, central: 4};

const ROLE_BADGE = {
  central: {label: 'CENTRAL', color: '#FF6B6B'},
  regional: {label: 'REGIONAL', color: '#6C63FF'},
  flat: {label: 'MEMBER', color: '#2ECC71'},
  guest: {label: 'GUEST', color: '#FFAB00'},
};

const bottomNavPaths = [
  '/social',
  '/social/communities',
  '/social/search',
  '/social/notifications',
  '/social/resonance',
];

export default function SocialLayout({children}) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const {currentUser, unreadCount, accessTier, resonance} = useSocial();
  const {canWrite} = useRoleAccess();
  const {isVisitorTheme, visitorUser, clearVisitorTheme} = useNunbaTheme();
  usePageObserver(); // Track page dwell time for agent self-critique
  const userResonanceLevel = resonance?.level || 0;

  const [topHarts, setTopHarts] = React.useState([]);

  // Log page visits for Autopilot pattern detection
  React.useEffect(() => {
    logActivity('page_visit', {path: location.pathname});
  }, [location.pathname]);

  // Fetch HART leaderboard for sidebar (refresh every 10min)
  React.useEffect(() => {
    const fetchLeaderboard = () => {
      evolutionApi
        .leaderboard({limit: 5})
        .then((res) => {
          if (res?.data)
            setTopHarts(
              Array.isArray(res.data) ? res.data : res.data.agents || []
            );
        })
        .catch(() => {});
    };
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 600_000);
    return () => clearInterval(interval);
  }, []);

  const userLevel = ROLE_LEVELS[accessTier] || 0;
  const badge = ROLE_BADGE[accessTier];

  const getBottomNavValue = () => {
    const path = location.pathname;
    if (path === '/social') return 0;
    if (path.startsWith('/social/communities') || path.startsWith('/social/h/'))
      return 1;
    if (path.startsWith('/social/search')) return 2;
    if (path.startsWith('/social/notifications')) return 3;
    if (path.startsWith('/social/resonance')) return 4;
    return 0;
  };

  const sidebar = (
    <Box sx={{height: '100%', display: 'flex', flexDirection: 'column'}}>
      {/* Brand header */}
      <Box sx={{p: 2.5, pb: 1.5}}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: '1.4rem',
            letterSpacing: '-0.02em',
            background: GRADIENTS.brand,
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: `${brandGlow} 4s ease-in-out infinite`,
          }}
        >
          Nunba
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: theme.palette.text.secondary,
            fontWeight: 500,
            display: 'block',
            mt: -0.25,
            letterSpacing: '0.02em',
          }}
        >
          Thought Experiments
        </Typography>
        {badge && (
          <Box
            sx={{
              mt: 1,
              px: 1.5,
              py: 0.4,
              borderRadius: RADIUS.sm,
              bgcolor: `${badge.color}12`,
              display: 'inline-block',
              border: `1px solid ${badge.color}22`,
              boxShadow: `0 0 12px ${badge.color}30`,
              transition: `box-shadow 0.3s ${EASINGS.smooth}`,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                color: badge.color,
                fontSize: '0.65rem',
                letterSpacing: '0.12em',
              }}
            >
              {badge.label}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Divider */}
      <Box
        sx={{
          mx: 2.5,
          mb: 0.5,
          height: '1px',
          background: `linear-gradient(90deg, transparent, ${theme.palette.divider}, transparent)`,
        }}
      />

      {/* Grouped nav items */}
      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1,
          scrollbarWidth: 'none' /* Firefox */,
          '&::-webkit-scrollbar': {display: 'none'} /* Chrome/Safari/Edge */,
        }}
      >
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => {
            if (!item.minRole) return true;
            return userLevel >= ROLE_LEVELS[item.minRole];
          });
          if (visibleItems.length === 0) return null;

          return (
            <List
              key={group.label}
              dense
              disablePadding
              subheader={
                <ListSubheader
                  disableSticky
                  sx={{
                    background: 'transparent',
                    color: theme.palette.text.secondary,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    lineHeight: 2.5,
                    mt: 1,
                  }}
                >
                  {group.label}
                </ListSubheader>
              }
            >
              {visibleItems.map((item) => {
                const basePath = item.path.split('?')[0];
                const isSelected = location.pathname === basePath;
                return (
                  <ListItemButton
                    key={item.label}
                    selected={isSelected}
                    onClick={() => navigate(item.path)}
                    onMouseEnter={() => prefetchRoute(basePath)}
                    sx={{
                      borderRadius: RADIUS.sm,
                      mx: 0.5,
                      my: 0.2,
                      position: 'relative',
                      overflow: 'hidden',
                      transition: `all 200ms ${EASINGS.smooth}`,
                      /* Active indicator bar */
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: isSelected
                          ? 'translateY(-50%) scaleY(1)'
                          : 'translateY(-50%) scaleY(0)',
                        width: 3,
                        height: '60%',
                        borderRadius: '0 4px 4px 0',
                        background: GRADIENTS.primary,
                        transition: `transform 250ms ${EASINGS.smooth}`,
                        boxShadow: isSelected
                          ? `0 0 8px ${theme.palette.primary.main}60`
                          : 'none',
                      },
                      '&.Mui-selected': {
                        bgcolor: `${theme.palette.primary.main}0A`,
                        '& .MuiListItemIcon-root': {
                          color: theme.palette.primary.main,
                        },
                        '& .MuiListItemText-primary': {
                          fontWeight: 600,
                          background: GRADIENTS.primary,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        },
                      },
                      '& .MuiListItemIcon-root': {
                        minWidth: 36,
                        transition: `transform 150ms ${EASINGS.smooth}, color 150ms ease`,
                        color: theme.palette.text.secondary,
                      },
                      '& .MuiListItemText-primary': {
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: theme.palette.text.secondary,
                        transition: 'color 150ms ease',
                      },
                      '&:hover': {
                        bgcolor: 'rgba(255,255,255,0.04)',
                        '& .MuiListItemIcon-root': {
                          transform: 'scale(1.1)',
                          color: theme.palette.text.primary,
                        },
                        '& .MuiListItemText-primary': {
                          color: theme.palette.text.primary,
                        },
                      },
                    }}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.label} />
                  </ListItemButton>
                );
              })}
            </List>
          );
        })}

        {/* Notifications (special — has badge) */}
        {canWrite && (
          <List dense disablePadding>
            <ListItemButton
              selected={location.pathname === '/social/notifications'}
              onClick={() => navigate('/social/notifications')}
              sx={{borderRadius: RADIUS.sm, mx: 0.5, my: 0.2}}
            >
              <ListItemIcon sx={{minWidth: 36}}>
                <Badge
                  badgeContent={unreadCount}
                  color="secondary"
                  sx={{
                    '& .MuiBadge-badge': {
                      boxShadow:
                        unreadCount > 0
                          ? `0 0 8px ${theme.palette.secondary.main}60`
                          : 'none',
                    },
                  }}
                >
                  <NotificationsIcon />
                </Badge>
              </ListItemIcon>
              <ListItemText
                primary="Notifications"
                primaryTypographyProps={{fontSize: '0.85rem'}}
              />
            </ListItemButton>
          </List>
        )}

        {/* ── Top HARTs Leaderboard ── */}
        {topHarts.length > 0 && (
          <Box sx={{mx: 1.5, mt: 2, mb: 1}}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: RADIUS.md,
                ...socialTokens.glass.subtle(theme),
                border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  mb: 1.5,
                  px: 0.5,
                }}
              >
                <FavoriteIcon sx={{fontSize: 16, color: '#FF6B6B'}} />
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: theme.palette.text.secondary,
                    fontSize: '0.65rem',
                  }}
                >
                  Top HARTs
                </Typography>
              </Box>
              {topHarts.slice(0, 5).map((hart, idx) => (
                <Box
                  key={hart.id || idx}
                  onClick={() =>
                    navigate(`/social/agents/${hart.id || hart.agent_id}`)
                  }
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.75,
                    px: 0.5,
                    borderRadius: RADIUS.sm,
                    cursor: 'pointer',
                    transition: `all 0.15s ${EASINGS.smooth}`,
                    '&:hover': {
                      bgcolor: alpha(theme.palette.common.white, 0.04),
                      transform: 'translateX(2px)',
                    },
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 700,
                      color:
                        idx === 0
                          ? '#FFAB00'
                          : idx === 1
                            ? '#C0C0C0'
                            : idx === 2
                              ? '#CD7F32'
                              : theme.palette.text.secondary,
                      fontSize: '0.7rem',
                      width: 16,
                      textAlign: 'center',
                    }}
                  >
                    {idx + 1}
                  </Typography>
                  <SmartToyIcon
                    sx={{fontSize: 18, color: theme.palette.primary.main}}
                  />
                  <Box sx={{flex: 1, minWidth: 0}}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        fontSize: '0.78rem',
                        color: theme.palette.text.primary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {hart.name ||
                        hart.display_name ||
                        hart.username ||
                        `HART #${hart.id}`}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('nunba:selectAgent', {
                          detail: {
                            agentId: hart.id || hart.agent_id,
                            agentName: hart.name || hart.display_name,
                          },
                        })
                      );
                    }}
                    sx={{
                      p: 0.5,
                      color: theme.palette.text.secondary,
                      '&:hover': {color: theme.palette.primary.main},
                    }}
                  >
                    <ChatBubbleOutlineIcon sx={{fontSize: 14}} />
                  </IconButton>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* User profile at bottom */}
      {currentUser && (
        <Box
          sx={{
            mx: 1.5,
            mb: 1.5,
            p: 1.5,
            borderRadius: RADIUS.md,
            ...socialTokens.glass.subtle(theme),
            cursor: 'pointer',
            transition: `all 200ms ${EASINGS.smooth}`,
            '&:hover': {
              background: 'rgba(255,255,255,0.05)',
              borderColor: `${theme.palette.primary.main}25`,
              '& .profile-avatar': {
                boxShadow: `0 0 0 2px ${theme.palette.primary.main}60, 0 0 12px ${theme.palette.primary.main}30`,
              },
            },
          }}
          onClick={() => navigate(`/social/profile/${currentUser.id}`)}
        >
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
            <Box sx={{...socialTokens.resonanceAvatar(userResonanceLevel)}}>
              <Avatar
                className="profile-avatar"
                src={currentUser.avatar_url}
                sx={{
                  width: 32,
                  height: 32,
                  fontSize: 13,
                  background: GRADIENTS.primary,
                  transition: `box-shadow 200ms ${EASINGS.smooth}`,
                }}
              >
                {(currentUser.display_name || 'U')[0]}
              </Avatar>
            </Box>
            <Box sx={{flex: 1, minWidth: 0}}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  color: theme.palette.text.primary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentUser.display_name || currentUser.username}
              </Typography>
              <Typography
                variant="caption"
                sx={{color: theme.palette.text.secondary, fontSize: '0.7rem'}}
              >
                @{currentUser.username}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
      {!currentUser && (
        <Box
          sx={{
            mx: 1.5,
            mb: 1.5,
            p: 1.5,
            borderRadius: RADIUS.md,
            ...socialTokens.glass.subtle(theme),
            cursor: 'pointer',
            transition: `all 200ms ${EASINGS.smooth}`,
            '&:hover': {background: 'rgba(255,255,255,0.05)'},
          }}
          onClick={() => navigate('/')}
        >
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontSize: 13,
                background: GRADIENTS.primary,
              }}
            >
              G
            </Avatar>
            <Box sx={{flex: 1, minWidth: 0}}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  color: theme.palette.text.primary,
                }}
              >
                {localStorage.getItem('guest_user_id') ? 'Guest' : 'Welcome!'}
              </Typography>
              <Typography
                variant="caption"
                sx={{color: theme.palette.text.secondary, fontSize: '0.7rem'}}
              >
                Tap to go to Agents
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        bgcolor: 'background.default',
        minHeight: '100dvh',
        overflow: 'clip',
        '@supports not (min-height: 100dvh)': {minHeight: '100vh'},
      }}
    >
      {/* Desktop sidebar */}
      <Box
        component="nav"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          display: {xs: 'none', md: 'block'},
        }}
      >
        <Drawer
          variant="permanent"
          sx={{
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              borderRight: 'none',
              overflow: 'hidden',
              background: `${theme.palette.background.default}E6`,
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: `2px 0 24px rgba(0,0,0,0.4), inset -1px 0 0 ${theme.palette.divider}`,
            },
          }}
        >
          {sidebar}
        </Drawer>
      </Box>

      {/* Mobile app bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: {xs: 'block', md: 'none'},
          background: `${theme.palette.background.default}CC`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 700,
              background: GRADIENTS.brand,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Nunba
          </Typography>
          <IconButton
            sx={{color: theme.palette.text.secondary}}
            onClick={() => navigate('/social/notifications')}
          >
            <Badge
              badgeContent={unreadCount}
              color="secondary"
              sx={{
                '& .MuiBadge-badge': {
                  boxShadow:
                    unreadCount > 0
                      ? `0 0 6px ${theme.palette.secondary.main}60`
                      : 'none',
                },
              }}
            >
              <NotificationsIcon />
            </Badge>
          </IconButton>
          {currentUser && (
            <IconButton
              sx={{color: theme.palette.text.secondary, ml: 0.5}}
              onClick={() => navigate(`/social/profile/${currentUser.id}`)}
            >
              <Avatar
                src={currentUser?.avatar_url}
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 12,
                  background: GRADIENTS.primary,
                }}
              >
                {(currentUser.display_name || 'U')[0]}
              </Avatar>
            </IconButton>
          )}
        </Toolbar>
      </AppBar>

      {/* Main content */}
      <Fade in timeout={350} key={location.pathname}>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: {xs: 2, md: 3},
            maxWidth: 800,
            mx: 'auto',
            width: '100%',
          }}
        >
          <Box sx={{display: {xs: 'block', md: 'none'}, height: 64}} />
          {isVisitorTheme && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                mb: 2,
                py: 1,
                px: 2,
                borderRadius: RADIUS.md,
                bgcolor: 'rgba(108,99,255,0.08)',
                border: '1px solid rgba(108,99,255,0.15)',
              }}
            >
              <Typography
                variant="caption"
                sx={{color: theme.palette.text.secondary}}
              >
                Viewing {visitorUser?.username || 'user'}'s theme
              </Typography>
              <Typography
                variant="caption"
                onClick={clearVisitorTheme}
                sx={{
                  color: theme.palette.primary.main,
                  cursor: 'pointer',
                  fontWeight: 600,
                  '&:hover': {textDecoration: 'underline'},
                }}
              >
                Reset
              </Typography>
            </Box>
          )}
          {children}
          <Box
            sx={{
              display: {xs: 'block', md: 'none'},
              height: 'calc(72px + env(safe-area-inset-bottom, 0px))',
            }}
          />
        </Box>
      </Fade>

      {/* Mobile bottom nav */}
      <BottomNavigation
        value={getBottomNavValue()}
        onChange={(e, val) => navigate(bottomNavPaths[val])}
        showLabels
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          display: {xs: 'flex', md: 'none'},
          background: `${theme.palette.background.default}E6`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: `1px solid ${theme.palette.divider}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          zIndex: 'appBar',
          '& .MuiBottomNavigationAction-root': {
            color: theme.palette.text.secondary,
            transition: `color 200ms ease, transform 200ms ${EASINGS.bounce}`,
            minWidth: 0,
            '&.Mui-selected': {
              color: theme.palette.primary.main,
              '& .MuiSvgIcon-root': {
                transform: 'scale(1.15)',
                filter: `drop-shadow(0 0 6px ${theme.palette.primary.main}60)`,
              },
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.65rem',
            '&.Mui-selected': {
              fontSize: '0.68rem',
              fontWeight: 600,
            },
          },
        }}
      >
        <BottomNavigationAction label="Feed" icon={<HomeIcon />} />
        <BottomNavigationAction label="Communities" icon={<GroupIcon />} />
        <BottomNavigationAction label="Search" icon={<SearchIcon />} />
        <BottomNavigationAction
          label="Alerts"
          icon={
            <Badge badgeContent={unreadCount} color="secondary">
              <NotificationsIcon />
            </Badge>
          }
        />
        <BottomNavigationAction
          label="Resonance"
          icon={<AccountBalanceWalletIcon />}
        />
      </BottomNavigation>

      {/* ── Floating NunbaChat widget — isolated so crash doesn't kill layout ── */}
      <ErrorBoundary variant="silent">
        <NunbaChatProvider>
          <NunbaChatPill />
          <NunbaChatPanel />
        </NunbaChatProvider>
      </ErrorBoundary>
    </Box>
  );
}
