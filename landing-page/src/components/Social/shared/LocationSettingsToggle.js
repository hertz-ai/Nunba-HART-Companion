import {encountersApi} from '../../../services/socialApi';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import {Switch, Typography, Box} from '@mui/material';
import React, {useState, useEffect} from 'react';


export default function LocationSettingsToggle({onChange}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    encountersApi
      .getLocationSettings()
      .then((res) => {
        setEnabled(res.data?.location_sharing_enabled || false);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleToggle = async () => {
    const newVal = !enabled;
    if (newVal && navigator.geolocation) {
      try {
        await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            timeout: 5000,
          });
        });
      } catch {
        return;
      }
    }
    setEnabled(newVal);
    try {
      await encountersApi.updateLocationSettings({
        location_sharing_enabled: newVal,
      });
    } catch {
      setEnabled(!newVal);
    }
    if (onChange) onChange(newVal);
  };

  if (loading) return null;

  return (
    <Box sx={{display: 'flex', alignItems: 'center', gap: 1, py: 1}}>
      <LocationOnIcon color={enabled ? 'primary' : 'disabled'} />
      <Box sx={{flex: 1}}>
        <Typography variant="body2" sx={{fontWeight: 600}}>
          Location Sharing
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Your exact location is never shared. Only approximate distance is
          shown.
        </Typography>
      </Box>
      <Switch checked={enabled} onChange={handleToggle} color="primary" />
    </Box>
  );
}
