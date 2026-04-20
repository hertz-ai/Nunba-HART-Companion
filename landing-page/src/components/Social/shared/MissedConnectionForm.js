import AutoSuggestInput from './AutoSuggestInput';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import React, {useState, useEffect, useRef} from 'react';

export default function MissedConnectionForm({open, onClose, onCreated}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const markerRef = useRef(null);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [wasAt, setWasAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
      },
      () => {
        setLat(28.6139);
        setLon(77.209);
      },
      {timeout: 5000}
    );
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setWasAt(now.toISOString().slice(0, 16));
  }, [open]);

  useEffect(() => {
    if (!open || lat === null || !mapRef.current) return;
    const initMap = async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (mapInstance.current) {
          mapInstance.current.remove();
          mapInstance.current = null;
        }
        const map = L.map(mapRef.current).setView([lat, lon], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
        }).addTo(map);
        const marker = L.marker([lat, lon], {draggable: true}).addTo(map);
        marker.on('dragend', () => {
          const p = marker.getLatLng();
          setLat(p.lat);
          setLon(p.lng);
        });
        map.on('click', (e) => {
          setLat(e.latlng.lat);
          setLon(e.latlng.lng);
          marker.setLatLng(e.latlng);
        });
        mapInstance.current = map;
        markerRef.current = marker;
        setTimeout(() => map.invalidateSize(), 100);
      } catch {
        /* leaflet not available */
      }
    };
    initMap();
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [open, lat !== null]);

  useEffect(() => {
    if (markerRef.current && lat !== null) {
      markerRef.current.setLatLng([lat, lon]);
      mapInstance.current?.panTo([lat, lon]);
    }
  }, [lat, lon]);

  const handleSubmit = async () => {
    if (!locationName.trim()) {
      setError('Location name is required');
      return;
    }
    if (!wasAt) {
      setError('Please select when you were there');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const {encountersApi: api} = await import('../../../services/socialApi');
      const res = await api.createMissed({
        lat,
        lon,
        location_name: locationName,
        description,
        was_at: wasAt,
      });
      onCreated?.(res.data || res);
      onClose();
      setLocationName('');
      setDescription('');
      setError('');
    } catch (e) {
      setError(e?.error || 'Failed to create');
    }
    setSubmitting(false);
  };

  const maxDate = new Date().toISOString().slice(0, 16);
  const minDate = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .slice(0, 16);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={isMobile}
    >
      <DialogTitle>Post a Missed Connection</DialogTitle>
      <DialogContent>
        <Box
          ref={mapRef}
          sx={{
            width: '100%',
            height: {xs: 200, sm: 250},
            borderRadius: 2,
            mb: 2,
            overflow: 'hidden',
          }}
        />
        <AutoSuggestInput
          value={locationName}
          onChange={setLocationName}
          onSelect={(s) => {
            if (s.lat) {
              setLat(s.lat);
              setLon(s.lon);
            }
          }}
          lat={lat}
          lon={lon}
          label="Where were you?"
        />
        <Box sx={{mt: 2}}>
          <TextField
            fullWidth
            type="datetime-local"
            label="When were you there?"
            value={wasAt}
            onChange={(e) => setWasAt(e.target.value)}
            InputLabelProps={{shrink: true}}
            inputProps={{min: minDate, max: maxDate}}
            variant="outlined"
            size="small"
          />
        </Box>
        <Box sx={{mt: 2}}>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="What happened?"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 500))}
            helperText={`${description.length}/500`}
            variant="outlined"
            size="small"
          />
        </Box>
        {error && (
          <Typography
            color="error"
            variant="caption"
            sx={{mt: 1, display: 'block'}}
          >
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={submitting}
        >
          {submitting ? 'Posting...' : 'Post'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
