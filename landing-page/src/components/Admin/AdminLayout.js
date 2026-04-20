import { useSocial } from '../../contexts/SocialContext';
import { useRoleAccess } from '../RoleGuard';
import ErrorBoundary from '../shared/ErrorBoundary';

import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BuildIcon from '@mui/icons-material/Build';
import CloudIcon from '@mui/icons-material/Cloud';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HubIcon from '@mui/icons-material/Hub';
import MemoryIcon from '@mui/icons-material/Memory';
import MenuIcon from '@mui/icons-material/Menu';
import MonetizationOnIcon from '@mui/icons-material/MonetizationOn';
import PeopleIcon from '@mui/icons-material/People';
import PersonIcon from '@mui/icons-material/Person';
import ReportIcon from '@mui/icons-material/Report';
import SettingsIcon from '@mui/icons-material/Settings';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import StorageIcon from '@mui/icons-material/Storage';
import SyncIcon from '@mui/icons-material/Sync';
import TerminalIcon from '@mui/icons-material/Terminal';
import {
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Avatar,
  Tooltip,
  Fade,
  CircularProgress,
} from '@mui/material';
import React, {useState, useEffect} from 'react';
import { Helmet } from 'react-helmet-async';
import {useNavigate, useLocation, Navigate} from 'react-router-dom';

const DRAWER_WIDTH = 260;

const adminNav = [
  {label: 'Dashboard', path: '/admin', icon: <DashboardIcon />},
  {label: 'Revenue', path: '/admin/revenue', icon: <MonetizationOnIcon />, minRole: 'central'},
  {label: 'Users', path: '/admin/users', icon: <PeopleIcon />, minRole: 'central'},
  {label: 'Moderation', path: '/admin/moderation', icon: <ReportIcon />, minRole: 'central'},
  {label: 'Agent Sync', path: '/admin/agents', icon: <SyncIcon />},
  {label: 'Channels', path: '/admin/channels', icon: <StorageIcon />},
  {label: 'Workflows', path: '/admin/workflows', icon: <AccountTreeIcon />},
  {label: 'Settings', path: '/admin/settings', icon: <SettingsIcon />},
  {label: 'Identity', path: '/admin/identity', icon: <PersonIcon />},
  {label: 'Agents Live', path: '/admin/agent-dashboard', icon: <SmartToyIcon />},
  {label: 'Content Tasks', path: '/admin/content-tasks', icon: <BuildIcon />},
  {label: 'Network Nodes', path: '/admin/network-nodes', icon: <HubIcon />, minRole: 'central'},
  {label: 'Models', path: '/admin/models', icon: <MemoryIcon />},
  {label: 'Providers', path: '/admin/providers', icon: <CloudIcon />},
  {label: 'Task Ledger', path: '/admin/task-ledger', icon: <BuildIcon />},
  {label: 'Claude Code', path: '/admin/integrations/claude-code', icon: <TerminalIcon />},
];

export default function AdminLayout({children}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [hoveredItem, setHoveredItem] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { currentUser, loading } = useSocial();
  const { canAdmin, canNetworkAdmin } = useRoleAccess();

  // Redirect to social if user isn't authenticated (instead of blank page).
  // Uses <Navigate> component instead of navigate() during render (React anti-pattern).
  if (!loading && !canAdmin) {
    return <Navigate to="/social" replace />;
  }

  // Filter nav items by role — hide central-only items for flat users
  const visibleNav = adminNav.filter(item =>
    !item.minRole || item.minRole !== 'central' || canNetworkAdmin
  );

  const sidebarContent = (
    <Box sx={{
      height: '100%',
      background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a2e 100%)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Logo Section */}
      <Box sx={{p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)'}}>
        <Typography sx={{
          fontWeight: 800,
          fontSize: '1.4rem',
          background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 50%, #6C63FF 100%)',
          backgroundSize: '200% auto',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'gradient 3s ease infinite',
          '@keyframes gradient': {
            '0%': {backgroundPosition: '0% 50%'},
            '50%': {backgroundPosition: '100% 50%'},
            '100%': {backgroundPosition: '0% 50%'},
          },
        }}>
          Admin Panel
        </Typography>
        <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.4)', mt: 0.5, display: 'block'}}>
          Nunba Management
        </Typography>
      </Box>

      {/* Navigation */}
      <List sx={{flex: 1, py: 2, px: 1.5}}>
        {visibleNav.map((item, index) => {
          const isSelected = location.pathname === item.path;
          const isHovered = hoveredItem === item.label;

          return (
            <Fade in={true} timeout={300 + index * 50} key={item.label}>
              <ListItemButton
                selected={isSelected}
                onClick={() => { navigate(item.path); setMobileOpen(false); }}
                onMouseEnter={() => setHoveredItem(item.label)}
                onMouseLeave={() => setHoveredItem(null)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  py: 1.5,
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: isHovered && !isSelected ? 'translateX(8px)' : 'translateX(0)',
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)'
                    : 'transparent',
                  borderLeft: isSelected ? '3px solid #6C63FF' : '3px solid transparent',
                  '&:hover': {
                    background: isSelected
                      ? 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)'
                      : 'rgba(255,255,255,0.05)',
                  },
                  '&.Mui-selected': {
                    background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
                  },
                }}
              >
                <ListItemIcon sx={{
                  color: isSelected ? '#6C63FF' : 'rgba(255,255,255,0.5)',
                  minWidth: 40,
                  transition: 'all 0.3s ease',
                  transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#fff' : 'rgba(255,255,255,0.7)',
                    fontSize: '0.95rem',
                  }}
                />
                {isSelected && (
                  <Box sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                    boxShadow: '0 0 10px rgba(108, 99, 255, 0.5)',
                  }} />
                )}
              </ListItemButton>
            </Fade>
          );
        })}
      </List>

      {/* Footer */}
      <Box sx={{p: 2, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.03)',
        }}>
          <Avatar sx={{
            width: 36,
            height: 36,
            background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
            fontSize: '0.9rem',
          }}>
            A
          </Avatar>
          <Box>
            <Typography variant="body2" sx={{color: '#fff', fontWeight: 500}}>
              Admin
            </Typography>
            <Typography variant="caption" sx={{color: 'rgba(255,255,255,0.4)'}}>
              Super Admin
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{
      display: 'flex',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)',
    }}>
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <title>Nunba Admin</title>
      </Helmet>
      {/* Sidebar — permanent on desktop, temporary drawer on mobile */}
      <Box
        component="nav"
        sx={{
          width: {md: DRAWER_WIDTH},
          flexShrink: {md: 0},
        }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: {xs: 'block', md: 'none'},
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              border: 'none',
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.3)',
            },
          }}
        >
          {sidebarContent}
        </Drawer>
        {/* Desktop permanent drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: {xs: 'none', md: 'block'},
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              boxSizing: 'border-box',
              border: 'none',
              boxShadow: '4px 0 24px rgba(0, 0, 0, 0.3)',
            },
          }}
        >
          {sidebarContent}
        </Drawer>
      </Box>

      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          background: 'rgba(15, 15, 26, 0.8)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          width: {md: `calc(100% - ${DRAWER_WIDTH}px)`},
          ml: {md: `${DRAWER_WIDTH}px`},
        }}
      >
        <Toolbar sx={{justifyContent: 'space-between'}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            <IconButton
              onClick={() => setMobileOpen(true)}
              sx={{
                display: {xs: 'inline-flex', md: 'none'},
                color: 'rgba(255,255,255,0.7)',
                '&:hover': { color: '#6C63FF' },
              }}
            >
              <MenuIcon />
            </IconButton>
            <Tooltip title="Back to Social" arrow>
              <IconButton
                onClick={() => navigate('/social')}
                sx={{
                  color: 'rgba(255,255,255,0.7)',
                  '&:hover': {
                    color: '#6C63FF',
                    background: 'rgba(108, 99, 255, 0.1)',
                  },
                  transition: 'all 0.3s ease',
                }}
              >
                <ArrowBackIcon />
              </IconButton>
            </Tooltip>
            <Typography variant="h6" sx={{
              fontWeight: 600,
              background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Nunba Admin
            </Typography>
          </Box>

          <Box sx={{display: 'flex', alignItems: 'center', gap: 1}}>
            <Box sx={{
              px: 2,
              py: 0.5,
              borderRadius: 2,
              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.1) 0%, rgba(155, 148, 255, 0.1) 100%)',
              border: '1px solid rgba(108, 99, 255, 0.2)',
            }}>
              <Typography variant="caption" sx={{color: '#6C63FF', fontWeight: 500}}>
                Production
              </Typography>
            </Box>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: '100%',
          mt: 8,
          minHeight: 'calc(100vh - 64px)',
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
            <CircularProgress sx={{ color: '#6C63FF' }} />
          </Box>
        ) : (
          <Fade in={true} timeout={500}>
            <Box>
              <ErrorBoundary variant="section">{children}</ErrorBoundary>
            </Box>
          </Fade>
        )}
      </Box>
    </Box>
  );
}
