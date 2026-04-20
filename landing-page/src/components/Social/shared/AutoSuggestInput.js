import {encountersApi} from '../../../services/socialApi';

import LocationOnIcon from '@mui/icons-material/LocationOn';
import {
  TextField,
  Paper,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import React, {useState, useRef, useEffect} from 'react';


export default function AutoSuggestInput({
  value,
  onChange,
  onSelect,
  lat,
  lon,
  label,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!value || value.length < 2) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = [];
      if (lat && lon) {
        try {
          const res = await encountersApi.suggestLocations(lat, lon);
          (res.data || res || []).forEach((s) =>
            results.push({name: s.name, count: s.count, source: 'local'})
          );
        } catch {
          /* ignore */
        }
      }
      try {
        const resp = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(value)}&format=json&limit=5`,
          {headers: {'Accept-Language': 'en'}}
        );
        const data = await resp.json();
        data.forEach((r) =>
          results.push({
            name: r.display_name.split(',').slice(0, 3).join(', '),
            lat: parseFloat(r.lat),
            lon: parseFloat(r.lon),
            source: 'nominatim',
          })
        );
      } catch {
        /* ignore */
      }
      setSuggestions(results);
      setOpen(results.length > 0);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, lat, lon]);

  return (
    <div style={{position: 'relative'}}>
      <TextField
        fullWidth
        label={label || 'Location name'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        variant="outlined"
        size="small"
      />
      {open && suggestions.length > 0 && (
        <Paper
          sx={{
            position: 'absolute',
            zIndex: 10,
            width: '100%',
            maxHeight: 200,
            overflow: 'auto',
          }}
          elevation={4}
        >
          <List dense>
            {suggestions.map((s, i) => (
              <ListItemButton
                key={i}
                onClick={() => {
                  onChange(s.name);
                  onSelect?.(s);
                  setOpen(false);
                }}
              >
                <ListItemIcon sx={{minWidth: 32}}>
                  <LocationOnIcon
                    fontSize="small"
                    color={s.source === 'local' ? 'primary' : 'action'}
                  />
                </ListItemIcon>
                <ListItemText
                  primary={s.name}
                  secondary={
                    s.count
                      ? `${s.count} posts nearby`
                      : s.source === 'nominatim'
                        ? 'Address'
                        : undefined
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}
    </div>
  );
}
