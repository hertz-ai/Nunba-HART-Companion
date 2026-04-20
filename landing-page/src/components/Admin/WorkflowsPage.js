import {workflowsApi} from '../../services/socialApi';

import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import {
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Box,
  Grid,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Skeleton,
  Fade,
  Grow,
} from '@mui/material';
import React, {useState, useEffect} from 'react';

const NODE_TYPES = [
  {type: 'trigger', label: 'Trigger', color: '#6C63FF'},
  {type: 'condition', label: 'Condition', color: '#ff9800'},
  {type: 'action', label: 'Action', color: '#9B94FF'},
  {type: 'delay', label: 'Delay', color: '#9c27b0'},
];

// Card style
const cardStyle = {
  background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.9) 0%, rgba(15, 15, 26, 0.95) 100%)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.05)',
  borderRadius: 3,
  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(108, 99, 255, 0.2)',
  },
};

// Loading skeleton
function WorkflowSkeleton() {
  return (
    <Card sx={{...cardStyle, '&:hover': {}}}>
      <CardContent sx={{p: 3}}>
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}>
          <Skeleton variant="rounded" width={32} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          <Skeleton variant="text" width={150} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
        <Skeleton variant="text" width={100} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        <Skeleton variant="rounded" width={60} height={24} sx={{bgcolor: 'rgba(255,255,255,0.05)', mt: 1}} />
        <Box sx={{display: 'flex', gap: 1, mt: 2}}>
          <Skeleton variant="circular" width={32} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          <Skeleton variant="circular" width={32} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
          <Skeleton variant="circular" width={32} height={32} sx={{bgcolor: 'rgba(255,255,255,0.05)'}} />
        </Box>
      </CardContent>
    </Card>
  );
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await workflowsApi.list();
        setWorkflows(res.data || []);
      } catch (err) {
        console.error('[WorkflowsPage] Failed to load workflows:', err);
        const msg = err?.error || err?.message || '';
        if (msg.includes('Authorization') || msg.includes('token')) {
          setError('Authentication required. Please log in with an admin account.');
        }
        setWorkflows([]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setActionLoading('create');
    setError(null);
    try {
      const res = await workflowsApi.create({name: newName, nodes: [], edges: []});
      setWorkflows((prev) => [...prev, res.data || {
        id: Date.now().toString(),
        name: newName,
        nodes: [],
        edges: [],
        active: false,
      }]);
      setDialogOpen(false);
      setNewName('');
    } catch (err) {
      console.error('[WorkflowsPage] Failed to create workflow:', err);
      const msg = err?.error || err?.message || 'Failed to create workflow';
      setError(msg.includes('Authorization') || msg.includes('token')
        ? 'Authentication required. Please log in with an admin account.'
        : msg);
    }
    setActionLoading(null);
  };

  const handleDelete = async (id) => {
    setConfirmDelete(id);
  };

  const confirmDeleteAction = async () => {
    const id = confirmDelete;
    setConfirmDelete(null);
    if (!id) return;
    setActionLoading(`delete-${id}`);
    try {
      await workflowsApi.delete(id);
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      console.error('[WorkflowsPage] Failed to delete workflow:', err);
      setError(`Failed to delete workflow. ${err?.message || ''}`);
    }
    setActionLoading(null);
  };

  const handleTest = async (id) => {
    setActionLoading(`test-${id}`);
    setSuccessMsg(null);
    try {
      const res = await workflowsApi.test(id);
      setSuccessMsg(res.data?.message || 'Workflow test completed');
    } catch (err) {
      console.error('[WorkflowsPage] Workflow test failed:', err);
      setError('Workflow test failed. ' + (err?.message || ''));
    }
    setActionLoading(null);
  };

  return (
    <Fade in={true} timeout={300}>
      <Box>
        {/* Page Header */}
        <Box sx={{mb: 4}}>
          <Box sx={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2}}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
              <Box sx={{
                width: 48,
                height: 48,
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(155, 148, 255, 0.15) 100%)',
              }}>
                <AccountTreeIcon sx={{
                  fontSize: 24,
                  background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
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
                  Workflows
                </Typography>
                <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)'}}>
                  Automate agent behaviors with visual workflows
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              sx={{
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 20px rgba(108, 99, 255, 0.3)',
                },
              }}
            >
              New Workflow
            </Button>
          </Box>
        </Box>

        {/* Error Banner */}
        {error && (
          <Fade in={true} timeout={200}>
            <Box sx={{
              mb: 3, p: 2, borderRadius: 2,
              background: 'linear-gradient(135deg, rgba(255,152,0,0.1) 0%, rgba(255,200,0,0.1) 100%)',
              border: '1px solid rgba(255,152,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Typography variant="body2" sx={{color: '#ff9800'}}>{error}</Typography>
              <IconButton size="small" onClick={() => setError(null)} sx={{color: 'rgba(255,152,0,0.7)'}}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Fade>
        )}

        {/* Success Banner */}
        {successMsg && (
          <Fade in={true} timeout={200}>
            <Box sx={{
              mb: 3, p: 2, borderRadius: 2,
              background: 'linear-gradient(135deg, rgba(108,99,255,0.1) 0%, rgba(155,148,255,0.1) 100%)',
              border: '1px solid rgba(108,99,255,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <Typography variant="body2" sx={{color: '#6C63FF'}}>{successMsg}</Typography>
              <IconButton size="small" onClick={() => setSuccessMsg(null)} sx={{color: 'rgba(108,99,255,0.7)'}}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Fade>
        )}

        {/* Node Types Legend */}
        <Grow in={true} timeout={400}>
          <Box sx={{mb: 3}}>
            <Typography variant="subtitle2" sx={{color: 'rgba(255,255,255,0.5)', mb: 1.5}}>
              Node Types
            </Typography>
            <Box sx={{display: 'flex', gap: 1.5, flexWrap: 'wrap'}}>
              {NODE_TYPES.map((node, index) => (
                <Fade in={true} timeout={400 + index * 50} key={node.type}>
                  <Chip
                    label={node.label}
                    size="small"
                    sx={{
                      background: `${node.color}20`,
                      color: node.color,
                      border: `1px solid ${node.color}40`,
                      fontWeight: 500,
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        background: `${node.color}30`,
                        transform: 'scale(1.05)',
                      },
                    }}
                  />
                </Fade>
              ))}
            </Box>
          </Box>
        </Grow>

        {/* Workflows Grid */}
        {loading ? (
          <Grid container spacing={3}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} md={6} lg={4} key={i}>
                <WorkflowSkeleton />
              </Grid>
            ))}
          </Grid>
        ) : workflows.length === 0 ? (
          <Grow in={true} timeout={500}>
            <Box sx={{
              textAlign: 'center',
              py: 8,
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.6) 0%, rgba(15, 15, 26, 0.6) 100%)',
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              <AccountTreeIcon sx={{
                fontSize: 64,
                color: 'rgba(255,255,255,0.2)',
                mb: 2,
              }} />
              <Typography variant="h6" sx={{color: '#fff', fontWeight: 600, mb: 1}}>
                No Workflows Yet
              </Typography>
              <Typography sx={{color: 'rgba(255,255,255,0.5)', mb: 3}}>
                Create your first workflow to automate agent behaviors
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setDialogOpen(true)}
                sx={{
                  background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  px: 3,
                }}
              >
                Create Workflow
              </Button>
            </Box>
          </Grow>
        ) : (
          <Grid container spacing={3}>
            {workflows.map((wf, index) => (
              <Grid item xs={12} md={6} lg={4} key={wf.id}>
                <Grow in={true} timeout={400 + index * 100}>
                  <Card sx={cardStyle}>
                    <CardContent sx={{p: 3}}>
                      <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 2}}>
                        <Box sx={{
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2) 0%, rgba(155, 148, 255, 0.2) 100%)',
                        }}>
                          <AccountTreeIcon sx={{fontSize: 20, color: '#6C63FF'}} />
                        </Box>
                        <Typography variant="subtitle1" sx={{fontWeight: 600, color: '#fff'}}>
                          {wf.name}
                        </Typography>
                      </Box>

                      <Typography variant="body2" sx={{color: 'rgba(255,255,255,0.5)', mb: 2}}>
                        {wf.nodes?.length || 0} nodes, {wf.edges?.length || 0} connections
                      </Typography>

                      <Chip
                        size="small"
                        label={wf.active ? 'Active' : 'Inactive'}
                        sx={{
                          background: wf.active
                            ? 'linear-gradient(135deg, rgba(0, 232, 157, 0.2) 0%, rgba(0, 180, 120, 0.2) 100%)'
                            : 'rgba(255,255,255,0.1)',
                          color: wf.active ? '#00e89d' : 'rgba(255,255,255,0.5)',
                          border: wf.active ? '1px solid rgba(0, 232, 157, 0.3)' : '1px solid rgba(255,255,255,0.1)',
                          fontWeight: 500,
                        }}
                      />

                      <Box sx={{
                        display: 'flex',
                        gap: 1,
                        mt: 2,
                        pt: 2,
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <IconButton
                          size="small"
                          onClick={() => handleTest(wf.id)}
                          disabled={actionLoading === `test-${wf.id}`}
                          sx={{
                            background: 'rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.7)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                              background: 'rgba(108, 99, 255, 0.1)',
                              color: '#6C63FF',
                              transform: 'scale(1.1)',
                            },
                          }}
                        >
                          <PlayArrowIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          sx={{
                            background: 'rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.7)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                              background: 'rgba(155, 148, 255, 0.1)',
                              color: '#9B94FF',
                              transform: 'scale(1.1)',
                            },
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => handleDelete(wf.id)}
                          disabled={actionLoading === `delete-${wf.id}`}
                          sx={{
                            background: 'rgba(255,255,255,0.05)',
                            color: 'rgba(255,255,255,0.7)',
                            transition: 'all 0.3s ease',
                            '&:hover': {
                              background: 'rgba(255, 68, 68, 0.1)',
                              color: '#ff4444',
                              transform: 'scale(1.1)',
                            },
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                </Grow>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Create Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          PaperProps={{
            sx: {
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(15, 15, 26, 0.98) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              minWidth: 400,
            },
          }}
        >
          <DialogTitle sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fff',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5}}>
              <AccountTreeIcon sx={{color: '#6C63FF'}} />
              Create Workflow
            </Box>
            <IconButton
              size="small"
              onClick={() => setDialogOpen(false)}
              sx={{color: 'rgba(255,255,255,0.5)'}}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent sx={{pt: 3, pb: 1}}>
            <TextField
              autoFocus
              fullWidth
              label="Workflow Name"
              placeholder="e.g. Auto-respond to mentions"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) handleCreate(); }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  color: '#fff',
                  '& fieldset': {borderColor: 'rgba(255,255,255,0.2)'},
                  '&:hover fieldset': {borderColor: 'rgba(108, 99, 255, 0.5)'},
                  '&.Mui-focused fieldset': {borderColor: '#6C63FF'},
                },
                '& .MuiInputLabel-root': {color: 'rgba(255,255,255,0.5)'},
                '& .MuiInputLabel-root.Mui-focused': {color: '#6C63FF'},
              }}
            />
          </DialogContent>
          <DialogActions sx={{p: 3, borderTop: '1px solid rgba(255,255,255,0.05)'}}>
            <Button
              onClick={() => setDialogOpen(false)}
              sx={{
                color: 'rgba(255,255,255,0.7)',
                textTransform: 'none',
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={actionLoading === 'create' || !newName.trim()}
              sx={{
                background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              {actionLoading === 'create' ? 'Creating...' : 'Create'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog
          open={!!confirmDelete}
          onClose={() => setConfirmDelete(null)}
          PaperProps={{
            sx: {
              background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98) 0%, rgba(15, 15, 26, 0.98) 100%)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 3,
              minWidth: 360,
            },
          }}
        >
          <DialogTitle sx={{color: '#fff'}}>Delete Workflow</DialogTitle>
          <DialogContent>
            <Typography sx={{color: 'rgba(255,255,255,0.7)'}}>
              Are you sure you want to delete this workflow? This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions sx={{p: 2}}>
            <Button onClick={() => setConfirmDelete(null)} sx={{color: 'rgba(255,255,255,0.7)', textTransform: 'none'}}>
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteAction}
              variant="contained"
              sx={{
                background: 'linear-gradient(135deg, #ff4444 0%, #ff6666 100%)',
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Fade>
  );
}
