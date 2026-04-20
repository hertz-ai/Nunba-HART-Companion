import {encountersApi} from '../../../services/socialApi';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import PeopleIcon from '@mui/icons-material/People';
import {
  Typography,
  Box,
  Avatar,
  Button,
  TextField,
  Chip,
  CircularProgress,
  Divider,
} from '@mui/material';
import React, {useState, useEffect, useRef} from 'react';


export default function MissedConnectionDetail({missedId, onBack}) {
  const mapRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    setLoading(true);
    encountersApi
      .getMissed(missedId)
      .then((res) => {
        setData(res.data || res);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [missedId]);

  useEffect(() => {
    if (!data || !mapRef.current) return;
    const initMap = async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        const map = L.map(mapRef.current, {
          zoomControl: false,
          dragging: false,
          scrollWheelZoom: false,
        }).setView([28.6139, 77.209], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '',
        }).addTo(map);
        L.marker([28.6139, 77.209]).addTo(map);
        setTimeout(() => map.invalidateSize(), 100);
      } catch {
        /* ignore */
      }
    };
    initMap();
  }, [data]);

  const handleRespond = async () => {
    setResponding(true);
    try {
      await encountersApi.respondMissed(missedId, message);
      setMessage('');
      const res = await encountersApi.getMissed(missedId);
      setData(res.data || res);
    } catch {
      /* ignore */
    }
    setResponding(false);
  };

  const handleAccept = async (responseId) => {
    try {
      await encountersApi.acceptMissedResponse(missedId, responseId);
      const res = await encountersApi.getMissed(missedId);
      setData(res.data || res);
    } catch {
      /* ignore */
    }
  };

  if (loading)
    return (
      <Box sx={{textAlign: 'center', py: 6}}>
        <CircularProgress />
      </Box>
    );
  if (!data) return <Typography>Not found</Typography>;

  return (
    <Box>
      {onBack && (
        <Button onClick={onBack} size="small" sx={{mb: 1}}>
          &larr; Back
        </Button>
      )}
      <Box
        ref={mapRef}
        sx={{width: '100%', height: {xs: 140, sm: 180}, borderRadius: 3, mb: 2}}
      />
      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 1}}>
        <LocationOnIcon color="primary" />
        <Typography variant="h6" sx={{fontWeight: 700}}>
          {data.location_name}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {data.was_at && new Date(data.was_at).toLocaleString()}
      </Typography>
      {data.user && (
        <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mt: 1}}>
          <Avatar src={data.user.avatar_url} sx={{width: 28, height: 28}}>
            {(data.user.display_name || '?')[0]}
          </Avatar>
          <Typography variant="body2">
            {data.user.display_name || data.user.username}
          </Typography>
        </Box>
      )}
      {data.description && (
        <Typography variant="body1" sx={{mt: 1.5}}>
          {data.description}
        </Typography>
      )}

      <Divider sx={{my: 2}} />

      <Box sx={{display: 'flex', alignItems: 'center', gap: 1, mb: 2}}>
        <PeopleIcon color="primary" />
        <Typography variant="subtitle1" sx={{fontWeight: 600}}>
          {(data.responses || []).length}{' '}
          {(data.responses || []).length === 1 ? 'person' : 'people'} say they
          were here
        </Typography>
      </Box>

      {(data.responses || []).map((r) => (
        <Box
          key={r.id}
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            p: 1.5,
            borderRadius: 2,
            mb: 1,
            bgcolor: 'action.hover',
          }}
        >
          <Avatar src={r.responder?.avatar_url} sx={{width: 36, height: 36}}>
            {(r.responder?.display_name || '?')[0]}
          </Avatar>
          <Box sx={{flex: 1}}>
            <Typography variant="subtitle2">
              {r.responder?.display_name || 'Someone'}
            </Typography>
            {r.message && (
              <Typography variant="body2" color="text.secondary">
                {r.message}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {r.created_at && new Date(r.created_at).toLocaleString()}
            </Typography>
          </Box>
          {data.is_owner && r.status === 'pending' && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => handleAccept(r.id)}
            >
              Accept
            </Button>
          )}
          {r.status === 'accepted' && (
            <Chip
              label="Connected"
              size="small"
              sx={{bgcolor: '#00e89d', color: '#fff'}}
            />
          )}
        </Box>
      ))}

      {!data.is_owner && (
        <Box sx={{mt: 2, display: 'flex', gap: 1}}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            placeholder="I was there too! ..."
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 300))}
          />
          <Button
            variant="contained"
            onClick={handleRespond}
            disabled={responding}
          >
            {responding ? '...' : 'I was there'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
