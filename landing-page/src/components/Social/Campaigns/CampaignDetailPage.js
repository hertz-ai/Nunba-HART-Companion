import {useSocial} from '../../../contexts/SocialContext';
import {campaignsApi} from '../../../services/socialApi';
import {GRADIENTS} from '../../../theme/socialTokens';

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import DeleteIcon from '@mui/icons-material/Delete';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import TouchAppIcon from '@mui/icons-material/TouchApp';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  Button,
  LinearProgress,
  CircularProgress,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  useTheme,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';



const STATUS_COLORS = {
  draft: 'default',
  active: 'success',
  paused: 'warning',
  completed: 'info',
};

export default function CampaignDetailPage() {
  const {campaignId} = useParams();
  const navigate = useNavigate();
  const {currentUser} = useSocial();
  const theme = useTheme();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isOwner =
    currentUser &&
    campaign &&
    (currentUser.id === campaign.owner_id ||
      currentUser.id === campaign.user_id);

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    try {
      const res = await campaignsApi.get(campaignId);
      setCampaign(res.data || res);
    } catch (err) {
      setError('Failed to load campaign');
    }
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  const handleGenerateStrategy = async () => {
    setActionLoading('strategy');
    setError('');
    try {
      const res = await campaignsApi.generateStrategy(campaignId);
      setCampaign((prev) => ({
        ...prev,
        strategy_json: res.data?.strategy_json || res.strategy_json,
      }));
    } catch (err) {
      setError(err?.error || 'Failed to generate strategy');
    }
    setActionLoading('');
  };

  const handleExecuteStep = async () => {
    setActionLoading('execute');
    setError('');
    try {
      const res = await campaignsApi.executeStep(campaignId);
      setCampaign((prev) => ({
        ...prev,
        current_step: (prev.current_step || 0) + 1,
        ...(res.data || {}),
      }));
    } catch (err) {
      setError(err?.error || 'Failed to execute step');
    }
    setActionLoading('');
  };

  const handleTogglePause = async () => {
    const newStatus = campaign.status === 'paused' ? 'active' : 'paused';
    setActionLoading('toggle');
    setError('');
    try {
      await campaignsApi.update(campaignId, {status: newStatus});
      setCampaign((prev) => ({...prev, status: newStatus}));
    } catch (err) {
      setError(err?.error || 'Failed to update status');
    }
    setActionLoading('');
  };

  const handleDelete = async () => {
    setActionLoading('delete');
    setError('');
    try {
      await campaignsApi.delete(campaignId);
      navigate('/social/campaigns');
    } catch (err) {
      setError(err?.error || 'Failed to delete campaign');
    }
    setActionLoading('');
    setDeleteOpen(false);
  };

  if (loading) {
    return (
      <Box sx={{display: 'flex', justifyContent: 'center', py: 8}}>
        <CircularProgress />
      </Box>
    );
  }

  if (!campaign) {
    return (
      <Box sx={{textAlign: 'center', py: 8}}>
        <Typography variant="h6" color="text.secondary">
          Campaign not found
        </Typography>
        <Button onClick={() => navigate('/social/campaigns')} sx={{mt: 2}}>
          Back to Campaigns
        </Button>
      </Box>
    );
  }

  const budgetUsed = campaign.budget_used || 0;
  const budgetTotal = campaign.budget_spark || 0;
  const budgetPercent =
    budgetTotal > 0 ? Math.min((budgetUsed / budgetTotal) * 100, 100) : 0;

  const metrics = [
    {
      label: 'Impressions',
      value: campaign.total_impressions || 0,
      icon: <VisibilityIcon />,
      color: theme.palette.secondary.main,
    },
    {
      label: 'Clicks',
      value: campaign.total_clicks || 0,
      icon: <TouchAppIcon />,
      color: theme.palette.primary.main,
    },
    {
      label: 'Conversions',
      value: campaign.total_conversions || 0,
      icon: <SwapHorizIcon />,
      color: theme.palette.warning.main,
    },
    {
      label: 'Spark Spent',
      value: budgetUsed,
      icon: <LocalFireDepartmentIcon />,
      color: theme.palette.error.main,
    },
  ];

  const strategy = campaign.strategy_json;
  let strategyData = null;
  if (strategy) {
    try {
      strategyData =
        typeof strategy === 'string' ? JSON.parse(strategy) : strategy;
    } catch {
      /* silent */
    }
  }

  return (
    <Box sx={{p: {xs: 1.5, md: 2}}}>
      {/* Back button */}
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/social/campaigns')}
        sx={{textTransform: 'none', mb: 2}}
      >
        Back to Campaigns
      </Button>

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h5" sx={{fontWeight: 700}}>
          {campaign.name}
        </Typography>
        <Chip
          label={campaign.status || 'draft'}
          color={STATUS_COLORS[campaign.status] || 'default'}
          size="small"
        />
        <Chip
          label={(campaign.goal_type || 'general').replace(/_/g, ' ')}
          variant="outlined"
          size="small"
          sx={{textTransform: 'capitalize'}}
        />
      </Box>

      {campaign.description && (
        <Typography variant="body1" color="text.secondary" sx={{mb: 3}}>
          {campaign.description}
        </Typography>
      )}

      {error && (
        <Alert severity="error" sx={{mb: 2}} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Metric Cards */}
      <Grid container spacing={2} sx={{mb: 3}}>
        {metrics.map((m) => (
          <Grid item xs={6} sm={3} key={m.label}>
            <Card
              variant="outlined"
              sx={{textAlign: 'center', p: {xs: 1.5, md: 2}}}
            >
              <Box sx={{color: m.color, mb: 0.5}}>{m.icon}</Box>
              <Typography variant="h5" sx={{fontWeight: 700}}>
                {m.value.toLocaleString()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {m.label}
              </Typography>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Budget Progress */}
      <Card variant="outlined" sx={{p: {xs: 1.5, md: 2}, mb: 3}}>
        <Box sx={{display: 'flex', justifyContent: 'space-between', mb: 1}}>
          <Typography variant="subtitle2" sx={{fontWeight: 600}}>
            Budget Usage
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {budgetUsed} / {budgetTotal} Spark
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={budgetPercent}
          sx={{
            height: 10,
            borderRadius: 5,
            bgcolor: `${theme.palette.secondary.main}1A`,
            '& .MuiLinearProgress-bar': {
              borderRadius: 5,
              background: GRADIENTS.primary,
            },
          }}
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{mt: 0.5, display: 'block'}}
        >
          {budgetPercent.toFixed(1)}% used
        </Typography>
      </Card>

      {/* Strategy Display */}
      {strategyData && (
        <Card variant="outlined" sx={{p: {xs: 1.5, md: 2}, mb: 3}}>
          <Typography variant="subtitle2" sx={{fontWeight: 600, mb: 1.5}}>
            Strategy
          </Typography>
          {strategyData.steps && Array.isArray(strategyData.steps) ? (
            <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
              {strategyData.steps.map((step, idx) => (
                <Box
                  key={idx}
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-start',
                    p: 1.5,
                    bgcolor:
                      idx < (campaign.current_step || 0)
                        ? `${theme.palette.primary.main}14`
                        : 'transparent',
                    borderRadius: 1,
                    border: 1,
                    borderColor:
                      idx < (campaign.current_step || 0)
                        ? `${theme.palette.primary.main}4D`
                        : 'divider',
                  }}
                >
                  <Chip
                    label={idx + 1}
                    size="small"
                    color={
                      idx < (campaign.current_step || 0) ? 'success' : 'default'
                    }
                    sx={{minWidth: 32}}
                  />
                  <Box>
                    <Typography variant="body2" sx={{fontWeight: 600}}>
                      {step.title || step.action || `Step ${idx + 1}`}
                    </Typography>
                    {step.description && (
                      <Typography variant="caption" color="text.secondary">
                        {step.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{whiteSpace: 'pre-wrap'}}
            >
              {typeof strategyData === 'string'
                ? strategyData
                : JSON.stringify(strategyData, null, 2)}
            </Typography>
          )}
        </Card>
      )}

      {/* Owner Controls */}
      {isOwner && (
        <>
          <Divider sx={{my: 2}} />
          <Typography variant="subtitle2" sx={{fontWeight: 600, mb: 1.5}}>
            Campaign Controls
          </Typography>
          <Box sx={{display: 'flex', flexWrap: 'wrap', gap: 1.5}}>
            <Button
              variant="outlined"
              startIcon={<AutoFixHighIcon />}
              onClick={handleGenerateStrategy}
              disabled={actionLoading === 'strategy'}
              sx={{textTransform: 'none'}}
            >
              {actionLoading === 'strategy'
                ? 'Generating...'
                : 'Generate Strategy'}
            </Button>

            {strategyData && (
              <Button
                variant="contained"
                startIcon={<PlayArrowIcon />}
                onClick={handleExecuteStep}
                disabled={
                  actionLoading === 'execute' || campaign.status === 'paused'
                }
                sx={{
                  textTransform: 'none',
                  background: GRADIENTS.primary,
                  '&:hover': {background: GRADIENTS.primaryHover},
                }}
              >
                {actionLoading === 'execute'
                  ? 'Executing...'
                  : 'Execute Next Step'}
              </Button>
            )}

            {campaign.status !== 'draft' && campaign.status !== 'completed' && (
              <Button
                variant="outlined"
                color={campaign.status === 'paused' ? 'success' : 'warning'}
                startIcon={
                  campaign.status === 'paused' ? (
                    <PlayArrowIcon />
                  ) : (
                    <PauseIcon />
                  )
                }
                onClick={handleTogglePause}
                disabled={actionLoading === 'toggle'}
                sx={{textTransform: 'none'}}
              >
                {campaign.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
            )}

            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteOpen(true)}
              disabled={!!actionLoading}
              sx={{textTransform: 'none'}}
            >
              Delete
            </Button>
          </Box>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Campaign</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete "{campaign.name}"? This action
            cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setDeleteOpen(false)}
            sx={{textTransform: 'none'}}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            color="error"
            variant="contained"
            disabled={actionLoading === 'delete'}
            sx={{textTransform: 'none'}}
          >
            {actionLoading === 'delete' ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
