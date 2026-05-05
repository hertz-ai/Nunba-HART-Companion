import BleMatchCard from './shared/BleMatchCard';
import DiscoverableTogglePanel from './shared/DiscoverableTogglePanel';
import IcebreakerDraftSheet from './shared/IcebreakerDraftSheet';

import { useSocial } from '../../../contexts/SocialContext';
import { subscribeEncounterMatch } from '../../../services/realtimeService';
import { bleEncounterApi, encountersApi } from '../../../services/socialApi';
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
  const { currentUser } = useSocial();
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

  // --- BLE Matches (Tab 4) ---
  // Consumes bleEncounterApi.listMatches (was dead code per
  // master-orchestrator backfill run aa3ead1; F2 IcebreakerDraftSheet
  // wires onto the "Send icebreaker" callback below).
  const [bleMatches, setBleMatches] = useState([]);
  const [bleMatchesLoading, setBleMatchesLoading] = useState(false);

  const loadBleMatches = useCallback(async () => {
    setBleMatchesLoading(true);
    try {
      const res = await bleEncounterApi.listMatches();
      // Axios envelope: res.data === {success, data: {matches, count}}
      const payload = res?.data?.data || res?.data || {};
      setBleMatches(Array.isArray(payload.matches) ? payload.matches : []);
    } catch {
      /* silent — tab will show empty state */
    }
    setBleMatchesLoading(false);
  }, []);

  // Auto-load on mount AND on encounter-match WAMP events.  Subscription
  // lives at the page level (not gated on tab) so a fresh match badge
  // can be surfaced even while the user is on another tab.
  useEffect(() => {
    loadBleMatches();
    const unsubscribe = subscribeEncounterMatch(() => {
      loadBleMatches();
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [loadBleMatches]);

  // F2 IcebreakerDraftSheet — single modal instance lifted to this
  // page (Option b from the F2 brief): one DOM modal, one WAMP
  // subscription (the modal subscribes itself), per-match dismiss
  // filtered server-side by match.id.  See
  // components/Social/Encounters/shared/IcebreakerDraftSheet.jsx for
  // mission-anchor enforcement (AI never sends, edit-before-send,
  // WAMP filter by match_id, 24h expiry surface).
  const [currentIcebreakerMatch, setCurrentIcebreakerMatch] = useState(null);

  const handleSendIcebreaker = (match) => {
    setCurrentIcebreakerMatch(match);
  };

  const handleIcebreakerClose = useCallback(() => {
    setCurrentIcebreakerMatch(null);
  }, []);

  const handleIcebreakerSent = useCallback(() => {
    // After the user approves, refresh the BLE match list so
    // BleMatchCard re-renders with the updated icebreaker_*_status
    // (the WAMP echo also refreshes via the subscribeEncounterMatch
    // path above; this is a belt-and-suspenders fetch).
    loadBleMatches();
  }, [loadBleMatches]);

  const handleHideMatch = (match) => {
    // F2 follow-up will call /encounter/map-pins toggle.  Placeholder
    // for now; declining the match itself is a separate verb.
    if (typeof window !== 'undefined' && window.console) {
      // eslint-disable-next-line no-console
      console.log('[encounters] hide-from-map requested for match', match?.id);
    }
  };

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

      {/* F1 GREENLIT (master-orchestrator aa3ead1) — discoverable consent
          surface mounts ABOVE the tab bar so it's visible across every tab,
          including BLE Matches.  See
          components/Social/Encounters/shared/DiscoverableTogglePanel.jsx
          for mission-anchor documentation. */}
      <Box sx={{ mb: 2 }}>
        <DiscoverableTogglePanel />
      </Box>

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
        <Tab label="BLE Matches" />
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

      {/* ---- Tab 4: BLE Matches ---- */}
      {tab === 4 && (
        <Box sx={{ ...animFadeInUp(0) }} data-testid="ble-matches-tab">
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Connections from nearby — both of you said yes.
          </Typography>
          {bleMatchesLoading ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          ) : bleMatches.length === 0 ? (
            <EmptyState message="No mutual encounters yet. They appear once both sides say yes." />
          ) : (
            bleMatches.map((m, i) => (
              <Box key={m.id} sx={{ ...animFadeInScale(i * 100) }}>
                <BleMatchCard
                  match={m}
                  currentUserId={currentUser?.id}
                  onIcebreaker={handleSendIcebreaker}
                  onHide={handleHideMatch}
                />
              </Box>
            ))
          )}
        </Box>
      )}

      {/* F2 IcebreakerDraftSheet — single modal instance for the page.
          Opened via BleMatchCard.onIcebreaker -> handleSendIcebreaker
          which sets currentIcebreakerMatch state.  The modal owns the
          WAMP subscription (filtered by match.id) and the
          draft/approve/decline flow.  Mounted outside any tab branch
          so the modal stays visible if the user switches tabs while a
          draft is open. */}
      <IcebreakerDraftSheet
        open={!!currentIcebreakerMatch}
        match={currentIcebreakerMatch}
        viewer={currentUser}
        onClose={handleIcebreakerClose}
        onSent={handleIcebreakerSent}
      />
    </>
  );
}
