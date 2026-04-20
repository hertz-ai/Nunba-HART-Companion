import CreateProposalDialog from './CreateProposalDialog';

import {useSocial} from '../../../contexts/SocialContext';
import {regionsApi} from '../../../services/socialApi';
import ProposalCard from '../shared/ProposalCard';
import RegionBadge from '../shared/RegionBadge';

import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GavelIcon from '@mui/icons-material/Gavel';
import PeopleIcon from '@mui/icons-material/People';
import PublicIcon from '@mui/icons-material/Public';
import {
  Typography,
  Box,
  CircularProgress,
  Button,
  Paper,
  Stack,
  Chip,
  Tabs,
  Tab,
  Divider,
  Alert,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Grid,
  Fade,
} from '@mui/material';
import React, {useState, useEffect, useCallback} from 'react';
import {useParams, useNavigate} from 'react-router-dom';



export default function RegionDetailPage() {
  const {regionId} = useParams();
  const navigate = useNavigate();
  const {currentUser} = useSocial();

  const [region, setRegion] = useState(null);
  const [members, setMembers] = useState([]);
  const [governance, setGovernance] = useState(null);
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [joining, setJoining] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);

  const fetchRegion = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await regionsApi.get(regionId);
      setRegion(res.data || res);
    } catch (err) {
      setError(err.message || 'Failed to load region');
    } finally {
      setLoading(false);
    }
  }, [regionId]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await regionsApi.members(regionId, {limit: 50});
      setMembers(res.data || []);
    } catch {
      setMembers([]);
    }
  }, [regionId]);

  const fetchGovernance = useCallback(async () => {
    try {
      const res = await regionsApi.governance(regionId);
      setGovernance(res.data || res);
    } catch {
      setGovernance(null);
    }
  }, [regionId]);

  const fetchFeed = useCallback(async () => {
    try {
      const res = await regionsApi.feed(regionId, {limit: 20});
      setFeed(res.data || []);
    } catch {
      setFeed([]);
    }
  }, [regionId]);

  useEffect(() => {
    fetchRegion();
  }, [fetchRegion]);

  useEffect(() => {
    if (tab === 0) fetchFeed();
    else if (tab === 1) fetchGovernance();
    else if (tab === 2) fetchGovernance();
    else if (tab === 3) fetchMembers();
  }, [tab, fetchFeed, fetchGovernance, fetchMembers]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      await regionsApi.join(regionId);
      await fetchRegion();
    } catch (err) {
      setError(err.message || 'Failed to join region');
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    try {
      await regionsApi.leave(regionId);
      await fetchRegion();
    } catch (err) {
      setError(err.message || 'Failed to leave region');
    }
  };

  const handleVote = async (proposalId, vote) => {
    try {
      await regionsApi.proposalVote(regionId, proposalId, {vote});
      fetchGovernance();
    } catch {
      // silent
    }
  };

  const handleProposalCreated = () => {
    setProposalOpen(false);
    fetchGovernance();
  };

  if (loading) {
    return (
      <Box sx={{textAlign: 'center', py: 6}}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !region) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/social/regions')}
          sx={{mb: 2}}
        >
          Back
        </Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!region)
    return (
      <Fade in timeout={300}>
        <Box
          textAlign="center"
          py={8}
          sx={{
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '16px',
            p: 4,
          }}
        >
          <Typography
            variant="h6"
            sx={{
              background: 'linear-gradient(135deg, #6C63FF, #9B94FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 700,
              mb: 1,
            }}
          >
            Region not found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This region may have been removed or does not exist.
          </Typography>
          <Button
            onClick={() => navigate(-1)}
            sx={{mt: 2, color: '#6C63FF', textTransform: 'none'}}
          >
            Go back
          </Button>
        </Box>
      </Fade>
    );

  const isMember = region.is_member || region.joined;
  const proposals = governance?.proposals || [];
  const council = governance?.council || [];

  return (
    <>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/social/regions')}
        sx={{mb: 2}}
      >
        Back to Regions
      </Button>

      {error && (
        <Alert severity="error" sx={{mb: 2}}>
          {error}
        </Alert>
      )}

      {/* Stats Header */}
      <Paper
        elevation={0}
        sx={{
          p: {xs: 2.5, md: 3.5},
          borderRadius: 3,
          background: 'linear-gradient(135deg, #0078ff 0%, #00e89d 100%)',
          color: '#fff',
          mb: 3,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{mb: 1.5}}>
          <PublicIcon sx={{fontSize: 28}} />
          <Typography variant="h5" sx={{fontWeight: 800}}>
            {region.name}
          </Typography>
          <RegionBadge region={region} />
        </Stack>

        {region.description && (
          <Typography variant="body1" sx={{opacity: 0.9, mb: 2}}>
            {region.description}
          </Typography>
        )}

        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <PeopleIcon sx={{fontSize: 18}} />
            <Typography variant="body2">
              {region.member_count ?? 0} members
            </Typography>
          </Stack>
          {region.type && (
            <Chip
              label={region.type}
              size="small"
              sx={{
                bgcolor: 'rgba(255,255,255,0.2)',
                color: '#fff',
                fontSize: '0.7rem',
              }}
            />
          )}
          {region.created_at && (
            <Typography variant="body2" sx={{opacity: 0.8}}>
              Est. {new Date(region.created_at).toLocaleDateString()}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" spacing={1.5} sx={{mt: 2}}>
          {currentUser && !isMember && (
            <Button
              variant="contained"
              color="inherit"
              onClick={handleJoin}
              disabled={joining}
              sx={{color: '#0078ff', fontWeight: 600}}
            >
              {joining ? 'Joining...' : 'Join Region'}
            </Button>
          )}
          {currentUser && isMember && (
            <Button
              variant="outlined"
              color="inherit"
              onClick={handleLeave}
              sx={{borderColor: 'rgba(255,255,255,0.5)'}}
            >
              Leave
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(e, v) => setTab(v)}
        indicatorColor="primary"
        textColor="primary"
        variant="scrollable"
        scrollButtons="auto"
        sx={{mb: 2}}
      >
        <Tab label="Overview" />
        <Tab label="Proposals" />
        <Tab label="Council" />
        <Tab label="Members" />
      </Tabs>

      {/* Tab: Overview */}
      {tab === 0 && (
        <Box>
          {feed.length === 0 ? (
            <Box sx={{textAlign: 'center', py: 4}}>
              <Typography color="text.secondary">
                No recent activity in this region.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {feed.map((item, i) => (
                <Paper
                  key={item.id || i}
                  elevation={0}
                  sx={{p: 2, borderRadius: 2, bgcolor: 'background.paper'}}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{mb: 0.5}}
                  >
                    <Avatar
                      src={item.author?.avatar_url}
                      sx={{width: 24, height: 24, fontSize: 11}}
                    >
                      {(item.author?.display_name || 'U')[0]}
                    </Avatar>
                    <Typography variant="body2" sx={{fontWeight: 600}}>
                      {item.author?.display_name || 'User'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString()
                        : ''}
                    </Typography>
                  </Stack>
                  <Typography variant="body2">
                    {item.content || item.title}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* Tab: Proposals */}
      {tab === 1 && (
        <Box>
          {isMember && (
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              onClick={() => setProposalOpen(true)}
              sx={{mb: 2}}
            >
              New Proposal
            </Button>
          )}
          {proposals.length === 0 ? (
            <Box sx={{textAlign: 'center', py: 4}}>
              <Typography color="text.secondary">No proposals yet.</Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {proposals.map((proposal) => (
                <Grid item xs={12} key={proposal.id}>
                  <ProposalCard
                    proposal={proposal}
                    onVote={isMember ? handleVote : undefined}
                  />
                </Grid>
              ))}
            </Grid>
          )}
          <CreateProposalDialog
            open={proposalOpen}
            onClose={() => setProposalOpen(false)}
            regionId={regionId}
            onCreated={handleProposalCreated}
          />
        </Box>
      )}

      {/* Tab: Council */}
      {tab === 2 && (
        <Box>
          {council.length === 0 ? (
            <Box sx={{textAlign: 'center', py: 4}}>
              <Typography color="text.secondary">
                No council members listed.
              </Typography>
            </Box>
          ) : (
            <Paper
              elevation={0}
              sx={{borderRadius: 3, bgcolor: 'background.paper'}}
            >
              <List disablePadding>
                {council.map((member, i) => (
                  <ListItem
                    key={member.user_id || i}
                    divider={i < council.length - 1}
                  >
                    <ListItemAvatar>
                      <Avatar
                        src={member.avatar_url}
                        sx={{width: 36, height: 36, fontSize: 14}}
                      >
                        {(member.display_name || 'U')[0]}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={member.display_name || member.username}
                      secondary={member.role || member.tier}
                      primaryTypographyProps={{
                        fontWeight: 600,
                        variant: 'body2',
                      }}
                    />
                    <Chip
                      label={member.role || member.tier || 'member'}
                      size="small"
                      color={
                        member.role === 'steward'
                          ? 'warning'
                          : member.role === 'admin'
                            ? 'secondary'
                            : 'default'
                      }
                      sx={{fontSize: '0.65rem'}}
                    />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      )}

      {/* Tab: Members */}
      {tab === 3 && (
        <Box>
          {members.length === 0 ? (
            <Box sx={{textAlign: 'center', py: 4}}>
              <Typography color="text.secondary">No members found.</Typography>
            </Box>
          ) : (
            <Paper
              elevation={0}
              sx={{borderRadius: 3, bgcolor: 'background.paper'}}
            >
              <List disablePadding>
                {members.map((member, i) => (
                  <ListItem
                    key={member.user_id || member.id || i}
                    divider={i < members.length - 1}
                    sx={{cursor: 'pointer'}}
                    onClick={() =>
                      member.user_id &&
                      navigate(`/social/profile/${member.user_id}`)
                    }
                  >
                    <ListItemAvatar>
                      <Avatar
                        src={member.avatar_url}
                        sx={{width: 36, height: 36, fontSize: 14}}
                      >
                        {(member.display_name || 'U')[0]}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={member.display_name || member.username}
                      secondary={
                        member.joined_at
                          ? `Joined ${new Date(member.joined_at).toLocaleDateString()}`
                          : undefined
                      }
                      primaryTypographyProps={{
                        fontWeight: 600,
                        variant: 'body2',
                      }}
                    />
                    {member.tier && (
                      <Chip
                        label={member.tier}
                        size="small"
                        variant="outlined"
                        sx={{fontSize: '0.65rem'}}
                      />
                    )}
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}
        </Box>
      )}
    </>
  );
}
