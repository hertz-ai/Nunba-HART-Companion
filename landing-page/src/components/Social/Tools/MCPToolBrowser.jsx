/**
 * MCPToolBrowser - Browse and discover MCP (Model Context Protocol) servers and tools.
 *
 * Follows the CommunityListPage pattern: GlassCard grid, search bar, infinite-style loading.
 * Each server card shows name, description, tool count, and owner.
 * Expanding a card reveals individual tools with "Use in Chat" action.
 */

import {mcpApi} from '../../../services/socialApi';
import {
  socialTokens,
  RADIUS,
  GRADIENTS,
  SHADOWS,
} from '../../../theme/socialTokens';

import BuildIcon from '@mui/icons-material/Build';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PersonIcon from '@mui/icons-material/Person';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Button,
  Collapse,
  CircularProgress,
  Grid,
  IconButton,
  keyframes,
  useTheme,
} from '@mui/material';
import {alpha} from '@mui/material/styles';
import React, {useState, useEffect, useMemo} from 'react';


/* -- Keyframes -- */
const cardReveal = keyframes`
  0%   { opacity: 0; transform: translateY(16px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
`;

const shimmerSweep = keyframes`
  0%   { left: -75%; }
  100% { left: 125%; }
`;

export default function MCPToolBrowser() {
  const theme = useTheme();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [toolsMap, setToolsMap] = useState({}); // serverId -> tools[]
  const [toolsLoading, setToolsLoading] = useState({});

  // Load servers on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await mcpApi.servers();
        if (!cancelled) setServers(res.data || []);
      } catch {
        if (!cancelled) setServers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filter servers by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return servers;
    const q = search.toLowerCase();
    return servers.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.owner?.toLowerCase().includes(q)
    );
  }, [servers, search]);

  // Load tools for a server when expanded
  const handleToggle = async (serverId) => {
    if (expandedId === serverId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(serverId);
    if (!toolsMap[serverId]) {
      setToolsLoading((prev) => ({...prev, [serverId]: true}));
      try {
        const res = await mcpApi.tools(serverId);
        setToolsMap((prev) => ({...prev, [serverId]: res.data || []}));
      } catch {
        setToolsMap((prev) => ({...prev, [serverId]: []}));
      } finally {
        setToolsLoading((prev) => ({...prev, [serverId]: false}));
      }
    }
  };

  // Dispatch "Use in Chat" event
  const handleUseInChat = (server, tool) => {
    window.dispatchEvent(
      new CustomEvent('nunba:selectAgent', {
        detail: {
          type: 'mcp_tool',
          serverId: server.id,
          serverName: server.name,
          toolName: tool.name,
          toolDescription: tool.description,
        },
      })
    );
  };

  return (
    <>
      {/* Premium heading */}
      <Typography
        variant="h5"
        sx={{
          fontWeight: 700,
          mb: 2,
          background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.6)})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        MCP Tool Browser
      </Typography>

      {/* Search bar */}
      <TextField
        fullWidth
        placeholder="Search servers, tools, or owners..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{
          mb: 2.5,
          '& .MuiOutlinedInput-root': {
            ...socialTokens.glass.subtle(theme),
            borderRadius: RADIUS.md,
            color: theme.palette.common.white,
            '& fieldset': {borderColor: alpha(theme.palette.common.white, 0.1)},
            '&:hover fieldset': {
              borderColor: alpha(theme.palette.primary.main, 0.3),
            },
            '&.Mui-focused fieldset': {borderColor: theme.palette.primary.main},
          },
          '& .MuiInputBase-input::placeholder': {
            color: alpha(theme.palette.common.white, 0.4),
          },
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon
                sx={{color: alpha(theme.palette.common.white, 0.4)}}
              />
            </InputAdornment>
          ),
        }}
      />

      {/* Loading state */}
      {loading && (
        <Box textAlign="center" py={6}>
          <CircularProgress size={32} />
        </Box>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 8,
            ...socialTokens.glass.subtle(theme),
            borderRadius: RADIUS.lg,
          }}
        >
          <BuildIcon
            sx={{
              fontSize: 48,
              color: alpha(theme.palette.common.white, 0.2),
              mb: 2,
            }}
          />
          <Typography
            variant="h6"
            sx={{color: alpha(theme.palette.common.white, 0.5), mb: 1}}
          >
            {search
              ? 'No servers match your search'
              : 'No MCP servers registered yet'}
          </Typography>
          <Typography
            variant="body2"
            sx={{color: alpha(theme.palette.common.white, 0.35)}}
          >
            {search
              ? 'Try a different search term.'
              : 'Register an MCP server to share tools with the community.'}
          </Typography>
        </Box>
      )}

      {/* Server cards grid */}
      {!loading && filtered.length > 0 && (
        <Grid container spacing={2}>
          {filtered.map((server, idx) => {
            const isExpanded = expandedId === server.id;
            const tools = toolsMap[server.id] || [];
            const isLoadingTools = toolsLoading[server.id];

            return (
              <Grid item xs={12} sm={6} md={4} key={server.id}>
                <Card
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden',
                    ...socialTokens.glass.subtle(theme),
                    borderRadius: RADIUS.lg,
                    animation: `${cardReveal} 400ms cubic-bezier(0.16, 1, 0.3, 1) ${Math.min(idx * 60, 360)}ms both`,
                    transition:
                      'box-shadow 250ms ease, border-color 250ms ease, transform 250ms ease',
                    '&:hover': {
                      borderColor: alpha(theme.palette.primary.main, 0.2),
                      boxShadow: `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${alpha(theme.palette.primary.main, 0.08)}, ${SHADOWS.inset}`,
                      transform: 'translateY(-2px)',
                      '& .mcp-shine': {
                        animation: `${shimmerSweep} 0.8s ease`,
                      },
                    },
                    '&:active': {
                      transform: 'translateY(0) scale(0.995)',
                    },
                  }}
                >
                  {/* Shine overlay */}
                  <Box
                    className="mcp-shine"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      width: '50%',
                      left: '-75%',
                      background:
                        'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
                      transform: 'skewX(-15deg)',
                      pointerEvents: 'none',
                      zIndex: 1,
                    }}
                  />

                  <CardContent
                    sx={{
                      position: 'relative',
                      zIndex: 2,
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      p: 2,
                      '&:last-child': {pb: 2},
                    }}
                  >
                    {/* Server name */}
                    <Typography
                      variant="subtitle1"
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        background: `linear-gradient(to right, ${alpha(theme.palette.common.white, 0.95)}, ${alpha(theme.palette.common.white, 0.7)})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        mb: 0.5,
                      }}
                    >
                      {server.name}
                    </Typography>

                    {/* Description */}
                    {server.description && (
                      <Typography
                        variant="body2"
                        sx={{
                          color: alpha(theme.palette.common.white, 0.5),
                          fontSize: '0.8rem',
                          lineHeight: 1.5,
                          mb: 1,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {server.description}
                      </Typography>
                    )}

                    {/* Meta chips: tool count + owner */}
                    <Box
                      sx={{display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5}}
                    >
                      <Chip
                        icon={<BuildIcon sx={{fontSize: 14}} />}
                        label={`${server.tool_count || 0} tools`}
                        size="small"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          background: alpha(theme.palette.primary.main, 0.1),
                          color: alpha(theme.palette.common.white, 0.6),
                          border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                        }}
                      />
                      {server.owner && (
                        <Chip
                          icon={<PersonIcon sx={{fontSize: 14}} />}
                          label={server.owner}
                          size="small"
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            background: alpha(theme.palette.common.white, 0.04),
                            color: alpha(theme.palette.common.white, 0.5),
                          }}
                        />
                      )}
                    </Box>

                    {/* Expand/collapse toggle */}
                    <Box sx={{mt: 'auto'}}>
                      <Button
                        size="small"
                        onClick={() => handleToggle(server.id)}
                        endIcon={
                          isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />
                        }
                        sx={{
                          color: alpha(theme.palette.primary.light, 0.8),
                          textTransform: 'none',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          '&:hover': {
                            background: alpha(theme.palette.primary.main, 0.08),
                          },
                        }}
                      >
                        {isExpanded ? 'Hide Tools' : 'View Tools'}
                      </Button>
                    </Box>

                    {/* Expanded tools list */}
                    <Collapse in={isExpanded} timeout={250}>
                      <Box
                        sx={{
                          mt: 1.5,
                          pt: 1.5,
                          borderTop: `1px solid ${alpha(theme.palette.common.white, 0.06)}`,
                        }}
                      >
                        {isLoadingTools && (
                          <Box textAlign="center" py={2}>
                            <CircularProgress size={20} />
                          </Box>
                        )}
                        {!isLoadingTools && tools.length === 0 && (
                          <Typography
                            variant="body2"
                            sx={{
                              color: alpha(theme.palette.common.white, 0.35),
                              fontSize: '0.78rem',
                            }}
                          >
                            No tools available.
                          </Typography>
                        )}
                        {!isLoadingTools &&
                          tools.map((tool) => (
                            <Box
                              key={tool.name}
                              sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                justifyContent: 'space-between',
                                gap: 1,
                                py: 1,
                                '&:not(:last-child)': {
                                  borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.04)}`,
                                },
                              }}
                            >
                              <Box sx={{flex: 1, minWidth: 0}}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 600,
                                    color: alpha(
                                      theme.palette.common.white,
                                      0.8
                                    ),
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  {tool.name}
                                </Typography>
                                {tool.description && (
                                  <Typography
                                    variant="caption"
                                    sx={{
                                      color: alpha(
                                        theme.palette.common.white,
                                        0.4
                                      ),
                                      display: 'block',
                                      lineHeight: 1.4,
                                    }}
                                  >
                                    {tool.description}
                                  </Typography>
                                )}
                              </Box>
                              <IconButton
                                size="small"
                                onClick={() => handleUseInChat(server, tool)}
                                title="Use in Chat"
                                sx={{
                                  color: alpha(
                                    theme.palette.primary.light,
                                    0.7
                                  ),
                                  '&:hover': {
                                    background: alpha(
                                      theme.palette.primary.main,
                                      0.12
                                    ),
                                    color: theme.palette.primary.light,
                                  },
                                }}
                              >
                                <ChatBubbleOutlineIcon sx={{fontSize: 18}} />
                              </IconButton>
                            </Box>
                          ))}
                      </Box>
                    </Collapse>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}
    </>
  );
}
