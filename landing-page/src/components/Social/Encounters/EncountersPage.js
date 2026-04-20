import { encountersApi } from '../../../services/socialApi';
import { socialTokens } from '../../../theme/socialTokens';
import { animFadeInUp, animFadeInScale } from '../../../utils/animations';
import EmptyState from '../shared/EmptyState';
import EncounterCard from '../shared/EncounterCard';
import LocationSettingsToggle from '../shared/LocationSettingsToggle';
import MissedConnectionCard from '../shared/MissedConnectionCard';
import MissedConnectionDetail from '../shared/MissedConnectionDetail';
import MissedConnectionForm from '../shared/MissedConnectionForm';
import MissedConnectionMapView from '../shared/MissedConnectionMapView';
import ProximityBanner from '../shared/ProximityBanner';
import ProximityMatchCard from '../shared/ProximityMatchCard';
import useLocationPing from '../shared/useLocationPing';

import AddIcon from '@mui/icons-material/Add';
import MapIcon from '@mui/icons-material/Map';
import ListIcon from '@mui/icons-material/ViewList';
import {
  Tabs, Tab, Box, Typography, CircularProgress, Chip, Avatar,
  Fab, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export default function EncountersPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  // --- Nearby Now ---
  const {
    lat, lon, nearbyCount, matches, isTracking, startTracking, stopTracking, fetchMatches,
  } = useLocationPing();

  const handleLocationToggle = (enabled) => {
    if (enabled) startTracking();
    else stopTracking();
  };

  const handleReveal = async (matchId) => {
    try {
      await encountersApi.revealMatch(matchId);
      fetchMatches();
    } catch { /* silent */ }
  };

  const handleChat = (match) => {
    const other = match.user_a || match.user_b;
    if (other?.id) navigate(`/social/encounters/${other.id}`);
  };

  // --- Missed Connections ---
  const [missedList, setMissedList] = useState([]);
  const [missedLoading, setMissedLoading] = useState(false);
  const [missedView, setMissedView] = useState('list');
  const [missedRadius, setMissedRadius] = useState(1000);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedMissedId, setSelectedMissedId] = useState(null);

  const loadMissed = useCallback(async () => {
    setMissedLoading(true);
    try {
      const params = {};
      if (lat && lon) { params.lat = lat; params.lon = lon; params.radius = missedRadius; }
      const res = await encountersApi.searchMissed(params);
      setMissedList(res.data || []);
    } catch { /* silent */ }
    setMissedLoading(false);
  }, [lat, lon, missedRadius]);

  useEffect(() => {
    if (tab === 1) loadMissed();
  }, [tab, loadMissed]);

  const handleMissedCreated = () => {
    loadMissed();
  };

  // --- Discovery ---
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const res = await encountersApi.suggestions();
      setSuggestions(res.data || []);
    } catch { /* silent */ }
    setSuggestionsLoading(false);
  }, []);

  // --- History ---
  const [history, setHistory] = useState([]);
  const [bonds, setBonds] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [encRes, bondRes] = await Promise.all([
        encountersApi.list({ acknowledged: true }),
        encountersApi.bonds(),
      ]);
      setHistory(encRes.data || []);
      setBonds(bondRes.data || []);
    } catch { /* silent */ }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 2) loadSuggestions();
    else if (tab === 3) loadHistory();
  }, [tab, loadSuggestions, loadHistory]);

  const handleAccept = async (encounter) => {
    try {
      await encountersApi.acknowledge(encounter.id);
      setSuggestions((prev) => prev.filter((e) => e.id !== encounter.id));
    } catch { /* silent */ }
  };

  const handleSkip = (encounter) => {
    setSuggestions((prev) => prev.filter((e) => e.id !== encounter.id));
  };

  const handleViewDetail = (encounter) => {
    const targetId = encounter.user_id || encounter.id;
    navigate(`/social/encounters/${targetId}`);
  };

  const bondLevelColor = (level) => {
    if (level >= 4) return 'success';
    if (level >= 2) return 'primary';
    return 'default';
  };

  return (
    <>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
        Encounters
      </Typography>

      <Tabs
        value={tab}
        onChange={(e, v) => { setTab(v); setSelectedMissedId(null); }}
        indicatorColor="primary"
        textColor="primary"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 2, bgcolor: 'background.paper', borderRadius: 2 }}
      >
        <Tab label="Nearby Now" />
        <Tab label="Missed Connections" />
        <Tab label="Discovery" />
        <Tab label="History" />
      </Tabs>

      {/* ---- Tab 0: Nearby Now ---- */}
      {tab === 0 && (
        <Box sx={{ ...animFadeInUp(0) }}>
          <LocationSettingsToggle onChange={handleLocationToggle} />
          <ProximityBanner nearbyCount={nearbyCount} isTracking={isTracking} />

          {!isTracking ? (
            <EmptyState message="Enable location sharing above to see who is nearby right now." />
          ) : matches.length === 0 ? (
            <EmptyState message="No proximity matches yet. Stay in the area and keep exploring!" />
          ) : (
            matches.map((m) => (
              <ProximityMatchCard
                key={m.id}
                match={m}
                onReveal={handleReveal}
                onChat={handleChat}
              />
            ))
          )}
        </Box>
      )}

      {/* ---- Tab 1: Missed Connections ---- */}
      {tab === 1 && (
        <Box sx={{ position: 'relative' }}>
          {selectedMissedId ? (
            <MissedConnectionDetail
              missedId={selectedMissedId}
              onBack={() => setSelectedMissedId(null)}
            />
          ) : (
            <>
              <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                mb: 2, flexDirection: { xs: 'column', sm: 'row' }, gap: 1,
              }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {missedList.length} missed {missedList.length === 1 ? 'connection' : 'connections'} nearby
                </Typography>
                <ToggleButtonGroup
                  value={missedView}
                  exclusive
                  onChange={(e, v) => { if (v) setMissedView(v); }}
                  size="small"
                >
                  <ToggleButton value="list"><ListIcon fontSize="small" /></ToggleButton>
                  <ToggleButton value="map"><MapIcon fontSize="small" /></ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {missedLoading ? (
                <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
              ) : missedView === 'map' ? (
                <MissedConnectionMapView
                  missedConnections={missedList}
                  lat={lat || 28.6139}
                  lon={lon || 77.209}
                  radius={missedRadius}
                  onRadiusChange={setMissedRadius}
                  onSelect={(mc) => setSelectedMissedId(mc.id)}
                />
              ) : missedList.length === 0 ? (
                <EmptyState message="No missed connections nearby. Be the first to post one!" />
              ) : (
                missedList.map((mc) => (
                  <MissedConnectionCard
                    key={mc.id}
                    missed={mc}
                    onClick={() => setSelectedMissedId(mc.id)}
                  />
                ))
              )}

              <Fab
                color="primary"
                onClick={() => setFormOpen(true)}
                sx={{ ...socialTokens.fabPosition }}
              >
                <AddIcon />
              </Fab>

              <MissedConnectionForm
                open={formOpen}
                onClose={() => setFormOpen(false)}
                onCreated={handleMissedCreated}
              />
            </>
          )}
        </Box>
      )}

      {/* ---- Tab 2: Discovery ---- */}
      {tab === 2 && (
        <Box sx={{ ...animFadeInUp(0) }}>
          {suggestionsLoading ? (
            <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
          ) : suggestions.length === 0 ? (
            <EmptyState message="No new encounters right now. Check back later!" />
          ) : (
            suggestions.map((enc, i) => (
              <Box key={enc.id} sx={{ ...animFadeInScale(i * 100) }}>
                <EncounterCard
                  encounter={enc}
                  onAccept={handleAccept}
                  onSkip={handleSkip}
                />
              </Box>
            ))
          )}
        </Box>
      )}

      {/* ---- Tab 3: History ---- */}
      {tab === 3 && (
        <Box sx={{ ...animFadeInUp(0) }}>
          {historyLoading ? (
            <Box sx={{ textAlign: 'center', py: 6 }}><CircularProgress /></Box>
          ) : history.length === 0 ? (
            <EmptyState message="No encounters yet. Start exploring!" />
          ) : (
            history.map((enc) => {
              const bond = bonds.find(
                (b) => b.user_id === enc.user_id || b.id === enc.id
              );
              return (
                <Box
                  key={enc.id}
                  onClick={() => handleViewDetail(enc)}
                  sx={{
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    p: { xs: 1.5, md: 2 }, mb: 1,
                    bgcolor: 'background.paper', borderRadius: 3,
                    cursor: 'pointer', transition: 'box-shadow 0.2s',
                    '&:hover': { boxShadow: 3 },
                  }}
                >
                  <Avatar
                    src={enc.avatar_url}
                    sx={{
                      width: 44, height: 44,
                      background: 'linear-gradient(to right, #6C63FF, #9B94FF)',
                    }}
                  >
                    {(enc.display_name || enc.username || '?')[0].toUpperCase()}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>
                      {enc.display_name || enc.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {enc.crossed_paths ?? enc.encounter_count ?? 0} encounters
                    </Typography>
                  </Box>
                  {bond && (
                    <Chip
                      label={`Bond Lvl ${bond.level ?? 1}`}
                      size="small"
                      color={bondLevelColor(bond.level ?? 1)}
                      sx={{ borderRadius: 2 }}
                    />
                  )}
                </Box>
              );
            })
          )}
        </Box>
      )}
    </>
  );
}
