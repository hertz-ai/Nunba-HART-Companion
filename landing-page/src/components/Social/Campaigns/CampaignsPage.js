import {useSocial} from '../../../contexts/SocialContext';
import {campaignsApi} from '../../../services/socialApi';

import AddIcon from '@mui/icons-material/Add';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Chip,
  Card,
  CardContent,
  CardActions,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  CircularProgress,
  Fab,
  Avatar,
  Tooltip,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';


const STATUS_COLORS = {
  draft: 'default',
  active: 'success',
  paused: 'warning',
  completed: 'info',
};

export default function CampaignsPage() {
  const navigate = useNavigate();
  const {currentUser} = useSocial();
  const [tab, setTab] = useState(0);

  // My campaigns state
  const [myCampaigns, setMyCampaigns] = useState([]);
  const [myLoading, setMyLoading] = useState(false);

  // Browse all state
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [allLoading, setAllLoading] = useState(false);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);

  const loadMyCampaigns = useCallback(async () => {
    setMyLoading(true);
    try {
      const res = await campaignsApi.list({mine: true});
      setMyCampaigns(res.data || []);
    } catch {
      /* silent */
    }
    setMyLoading(false);
  }, []);

  const loadAllCampaigns = useCallback(async () => {
    setAllLoading(true);
    try {
      const res = await campaignsApi.list();
      setAllCampaigns(res.data || []);
    } catch {
      /* silent */
    }
    setAllLoading(false);
  }, []);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    try {
      const res = await campaignsApi.leaderboard();
      setLeaderboard(res.data || []);
    } catch {
      /* silent */
    }
    setLbLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 0) loadMyCampaigns();
    else if (tab === 1) loadAllCampaigns();
    else loadLeaderboard();
  }, [tab, loadMyCampaigns, loadAllCampaigns, loadLeaderboard]);

  const renderMyCampaigns = () => {
    if (myLoading)
      return (
        <Box sx={{textAlign: 'center', py: 4}}>
          <CircularProgress />
        </Box>
      );
    if (myCampaigns.length === 0) {
      return (
        <Box sx={{textAlign: 'center', py: 6}}>
          <Typography variant="h6" color="text.secondary">
            No campaigns yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{mb: 2}}>
            Create your first campaign to start promoting your agent.
          </Typography>
          <Button
            variant="contained"
            onClick={() => navigate('/social/campaigns/create')}
          >
            Create Campaign
          </Button>
        </Box>
      );
    }
    return (
      <Box sx={{display: 'flex', flexDirection: 'column', gap: 2}}>
        {myCampaigns.map((c) => (
          <Card
            key={c.id}
            sx={{
              cursor: 'pointer',
              '&:hover': {boxShadow: 4},
              transition: 'box-shadow 0.2s',
            }}
            onClick={() => navigate(`/social/campaigns/${c.id}`)}
          >
            <CardContent
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: {xs: 1.5, md: 2},
              }}
            >
              <Box sx={{flex: 1}}>
                <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                  {c.name}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{mt: 0.5}}
                >
                  {c.goal_type || 'General'} &middot; Budget:{' '}
                  {c.budget_spark || 0} Spark
                </Typography>
              </Box>
              <Chip
                label={c.status || 'draft'}
                color={STATUS_COLORS[c.status] || 'default'}
                size="small"
              />
            </CardContent>
            <CardActions sx={{px: 2, pb: 1.5, pt: 0}}>
              <Typography variant="caption" color="text.secondary">
                {c.total_impressions || 0} impressions &middot;{' '}
                {c.total_clicks || 0} clicks
              </Typography>
            </CardActions>
          </Card>
        ))}
      </Box>
    );
  };

  const renderBrowseAll = () => {
    if (allLoading)
      return (
        <Box sx={{textAlign: 'center', py: 4}}>
          <CircularProgress />
        </Box>
      );
    if (allCampaigns.length === 0) {
      return (
        <Box sx={{textAlign: 'center', py: 6}}>
          <Typography variant="h6" color="text.secondary">
            No campaigns found
          </Typography>
        </Box>
      );
    }
    return (
      <Grid container spacing={2}>
        {allCampaigns.map((c) => (
          <Grid item xs={12} sm={6} key={c.id}>
            <Card
              sx={{
                height: '100%',
                cursor: 'pointer',
                '&:hover': {boxShadow: 4},
                transition: 'box-shadow 0.2s',
              }}
              onClick={() => navigate(`/social/campaigns/${c.id}`)}
            >
              <CardContent sx={{p: {xs: 1.5, md: 2}}}>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    mb: 1,
                  }}
                >
                  <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                    {c.name}
                  </Typography>
                  <Chip
                    label={c.status || 'draft'}
                    color={STATUS_COLORS[c.status] || 'default'}
                    size="small"
                  />
                </Box>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {c.description || 'No description'}
                </Typography>
                <Box
                  sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 1.5}}
                >
                  <Avatar sx={{width: 20, height: 20, fontSize: 10}}>
                    {(c.owner_name || 'U')[0]}
                  </Avatar>
                  <Typography variant="caption" color="text.secondary">
                    {c.owner_name || 'Unknown'} &middot;{' '}
                    {c.goal_type || 'General'}
                  </Typography>
                </Box>
              </CardContent>
              <CardActions sx={{px: 2, pb: 1.5, pt: 0}}>
                <Tooltip title="View Campaign">
                  <Button size="small" startIcon={<VisibilityIcon />}>
                    View
                  </Button>
                </Tooltip>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    );
  };

  const renderLeaderboard = () => {
    if (lbLoading)
      return (
        <Box sx={{textAlign: 'center', py: 4}}>
          <CircularProgress />
        </Box>
      );
    if (leaderboard.length === 0) {
      return (
        <Box sx={{textAlign: 'center', py: 6}}>
          <Typography variant="h6" color="text.secondary">
            No leaderboard data yet
          </Typography>
        </Box>
      );
    }
    return (
      <TableContainer component={Paper} sx={{borderRadius: 2}}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{fontWeight: 700}}>Rank</TableCell>
              <TableCell sx={{fontWeight: 700}}>Campaign</TableCell>
              <TableCell sx={{fontWeight: 700}}>Owner</TableCell>
              <TableCell align="right" sx={{fontWeight: 700}}>
                ROI
              </TableCell>
              <TableCell align="right" sx={{fontWeight: 700}}>
                Impressions
              </TableCell>
              <TableCell align="right" sx={{fontWeight: 700}}>
                Conversions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {leaderboard.map((entry, idx) => (
              <TableRow
                key={entry.campaign_id || idx}
                hover
                sx={{cursor: 'pointer'}}
                onClick={() =>
                  navigate(`/social/campaigns/${entry.campaign_id}`)
                }
              >
                <TableCell>
                  <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
                    {idx < 3 && (
                      <EmojiEventsIcon
                        sx={{
                          fontSize: 18,
                          color: ['#FFD700', '#C0C0C0', '#CD7F32'][idx],
                        }}
                      />
                    )}
                    {idx + 1}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{fontWeight: 600}}>
                    {entry.campaign_name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {entry.owner_name || 'Unknown'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Chip
                    label={`${(entry.roi || 0).toFixed(1)}%`}
                    color={entry.roi > 0 ? 'success' : 'default'}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  {entry.total_impressions || 0}
                </TableCell>
                <TableCell align="right">
                  {entry.total_conversions || 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Box sx={{p: {xs: 1.5, md: 2}}}>
      <Typography variant="h5" sx={{fontWeight: 700, mb: 2}}>
        Campaign Studio
      </Typography>

      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        sx={{mb: 3, '& .MuiTab-root': {textTransform: 'none', fontWeight: 600}}}
      >
        <Tab label="My Campaigns" />
        <Tab label="Browse All" />
        <Tab label="Leaderboard" />
      </Tabs>

      {tab === 0 && renderMyCampaigns()}
      {tab === 1 && renderBrowseAll()}
      {tab === 2 && renderLeaderboard()}

      <Fab
        color="primary"
        aria-label="Create Campaign"
        onClick={() => navigate('/social/campaigns/create')}
        sx={{
          position: 'fixed',
          bottom: {xs: 80, md: 32},
          right: {xs: 16, md: 32},
          background: 'linear-gradient(135deg, #00e89d, #0078ff)',
          '&:hover': {background: 'linear-gradient(135deg, #00d48e, #006ae0)'},
        }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
