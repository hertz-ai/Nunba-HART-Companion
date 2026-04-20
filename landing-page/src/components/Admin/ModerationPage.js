import {moderationApi} from '../../services/socialApi';

import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReportIcon from '@mui/icons-material/Report';
import WarningIcon from '@mui/icons-material/Warning';
import {
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Box,
  Skeleton,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect} from 'react';

// Reusable styles
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  cursor: 'pointer',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 152, 0, 0.2)',
  },
};

const STATUS_CONFIG = {
  pending: {
    color: '#ff9800',
    bg: 'linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(255, 200, 0, 0.2) 100%)',
    border: '1px solid rgba(255, 152, 0, 0.3)',
    icon: <WarningIcon sx={{fontSize: 16}} />,
  },
  resolved: {
    color: '#00e89d',
    bg: 'linear-gradient(135deg, rgba(0, 232, 157, 0.2) 0%, rgba(0, 180, 120, 0.2) 100%)',
    border: '1px solid rgba(0, 232, 157, 0.3)',
    icon: <CheckCircleIcon sx={{fontSize: 16}} />,
  },
  dismissed: {
    color: 'rgba(255,255,255,0.5)',
    bg: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.1)',
    icon: <CancelIcon sx={{fontSize: 16}} />,
  },
};

const actionButtonStyle = {
  borderRadius: 2,
  textTransform: 'none',
  fontWeight: 500,
  px: 2,
  transition: 'all 0.3s ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
};

// Loading skeleton
function ReportSkeleton() {
  return (
    <Card sx={{...cardStyle, cursor: 'default', '&:hover': {}}}>
      <CardContent sx={{p: 3}}>
        <Box sx={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2}}>
          <Box sx={{flex: 1}}>
            <Skeleton variant="text" width={200} height={28} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
            <Skeleton variant="text" width={300} sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 1}} />
          </Box>
          <Skeleton variant="rounded" width={80} height={24} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
        <Box sx={{display: 'flex', gap: 1}}>
          <Skeleton variant="rounded" width={100} height={36} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          <Skeleton variant="rounded" width={100} height={36} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
      </CardContent>
    </Card>
  );
}

export default function ModerationPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await moderationApi.reports({limit: 50});
        setReports(res.data || []);
      } catch (err) {
        /* ignore */
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleReview = async (reportId, action) => {
    setActionLoading(reportId);
    try {
      await moderationApi.resolveReport(reportId, {action});
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? {...r, status: action} : r))
      );
    } catch (err) {
      /* ignore */
    }
    setActionLoading(null);
  };

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', gap: 2, mb: 1}}>
            <Box sx={{
              width: 48,
              height: 48,
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.15) 0%, rgba(255, 100, 100, 0.15) 100%)',
            }}>
              <ReportIcon sx={{
                fontSize: 24,
                background: 'linear-gradient(135deg, #ff9800 0%, #ff6b6b 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }} />
            </Box>
            <Box>
              <Typography variant="h4" sx={{
                fontWeight: 700,
                background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.7) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Moderation Queue
              </Typography>
              <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                Review and manage reported content
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Stats Summary */}
        <Grow in={true} timeout={400}>
          <Box sx={{
            display: 'flex',
            gap: 2,
            mb: 3,
            flexWrap: 'wrap',
          }}>
            {['pending', 'resolved', 'dismissed'].map((status) => {
              const count = reports.filter(r => (r.status || 'pending') === status).length;
              const config = STATUS_CONFIG[status];
              return (
                <Box key={status} sx={{
                  px: 3,
                  py: 1.5,
                  borderRadius: 2,
                  background: config.bg,
                  border: config.border,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}>
                  <Typography sx={{color: config.color, fontWeight: 600, fontSize: '1.25rem'}}>
                    {count}
                  </Typography>
                  <Typography sx={{color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize'}}>
                    {status}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        </Grow>

        {/* Reports List */}
        {loading ? (
          <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
            {[1, 2, 3].map((i) => (
              <ReportSkeleton key={i} />
            ))}
          </Box>
        ) : reports.length === 0 ? (
          <Grow in={true} timeout={500}>
            <Box sx={{
              textAlign: 'center',
              py: 8,
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.6) 0%, rgba(15, 15, 26, 0.6) 100%)',
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <CheckCircleIcon sx={{
                fontSize: 64,
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 2,
              }} />
              <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 1}}>
                All Caught Up!
              </Typography>
              <Typography sx={{color: 'rgba(255,255,255,0.5)'}}>
                No reports to review at this time
              </Typography>
            </Box>
          </Grow>
        ) : (
          <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
            {reports.map((r, index) => {
              const statusConfig = STATUS_CONFIG[r.status || 'pending'];
              return (
                <Grow in={true} timeout={400 + index * 100} key={r.id}>
                  <Card sx={cardStyle}>
                    <CardContent sx={{p: 3}}>
                      <Box sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        flexWrap: 'wrap',
                        gap: 2,
                      }}>
                        <Box sx={{flex: 1, minWidth: 200}}>
                          <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}>
                            <Box sx={{
                              width: 32,
                              height: 32,
                              borderRadius: 2,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: 'rgba(255, 152, 0, 0.1)',
                            }}>
                              <ReportIcon sx={{fontSize: 18, color: '#ff9800'}} />
                            </Box>
                            <Typography variant="subtitle1" sx={{
                              fontWeight: 600,
                              color: '#fff',
                            }}>
                              {r.target_type}: {r.target_id}
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{
                            color: 'rgba(255,255,255,0.6)',
                            mb: 1,
                          }}>
                            Reported by{' '}
                            <Box component="span" sx={{color: '#6C63FF', fontWeight: 500}}>
                              {r.reporter_username || r.reporter_id}
                            </Box>
                          </Typography>
                          <Box sx={{
                            px: 2,
                            py: 1,
                            borderRadius: 2,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                          }}>
                            <Typography variant="body2" sx={{
                              color: 'rgba(255,255,255,0.8)',
                              fontStyle: 'italic',
                            }}>
                              "{r.reason}"
                            </Typography>
                          </Box>
                        </Box>

                        <Chip
                          size="small"
                          icon={statusConfig.icon}
                          label={r.status || 'pending'}
                          sx={{
                            background: statusConfig.bg,
                            color: statusConfig.color,
                            border: statusConfig.border,
                            fontWeight: 500,
                            textTransform: 'capitalize',
                            '& .MuiChip-icon': {
                              color: statusConfig.color,
                            },
                          }}
                        />
                      </Box>

                      {(r.status === 'pending' || !r.status) && (
                        <Box sx={{
                          display: 'flex',
                          gap: 1.5,
                          mt: 2,
                          pt: 2,
                          borderTop: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <Button
                            size="small"
                            onClick={() => handleReview(r.id, 'resolved')}
                            disabled={actionLoading === r.id}
                            startIcon={<CheckCircleIcon />}
                            sx={{
                              ...actionButtonStyle,
                              background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)',
                              color: '#6C63FF',
                              border: '1px solid rgba(108, 99, 255, 0.3)',
                              '&:hover': {
                                ...actionButtonStyle['&:hover'],
                                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.3) 0%, rgba(155, 148, 255, 0.3) 100%)',
                              },
                            }}
                          >
                            {actionLoading === r.id ? 'Processing...' : 'Resolve'}
                          </Button>
                          <Button
                            size="small"
                            onClick={() => handleReview(r.id, 'dismissed')}
                            disabled={actionLoading === r.id}
                            startIcon={<CancelIcon />}
                            sx={{
                              ...actionButtonStyle,
                              background: 'rgba(255,255,255,0.05)',
                              color: 'rgba(255,255,255,0.7)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              '&:hover': {
                                ...actionButtonStyle['&:hover'],
                                background: 'rgba(255,255,255,0.1)',
                              },
                            }}
                          >
                            Dismiss
                          </Button>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grow>
              );
            })}
          </Box>
        )}
      </Box>
    </Fade>
  );
}
