import {Box, Slider, Typography} from '@mui/material';
import React, {useEffect, useRef} from 'react';

const RADIUS_MARKS = [
  {value: 100, label: '100m'},
  {value: 500, label: '500m'},
  {value: 1000, label: '1km'},
  {value: 5000, label: '5km'},
];

export default function MissedConnectionMapView({
  missedConnections,
  lat,
  lon,
  radius,
  onRadiusChange,
  onSelect,
}) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const circleRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!mapRef.current || lat === null) return;
    const initMap = async () => {
      try {
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');
        if (mapInstance.current) mapInstance.current.remove();
        const map = L.map(mapRef.current).setView([lat, lon], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OSM',
        }).addTo(map);
        L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: '#0078ff',
          fillOpacity: 0.8,
          stroke: true,
          color: '#fff',
          weight: 2,
        }).addTo(map);
        circleRef.current = L.circle([lat, lon], {
          radius,
          fillColor: '#0078ff',
          fillOpacity: 0.05,
          color: '#0078ff',
          weight: 1,
        }).addTo(map);
        mapInstance.current = map;
        setTimeout(() => map.invalidateSize(), 100);
      } catch {
        /* leaflet not loaded */
      }
    };
    initMap();
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [lat, lon]);

  useEffect(() => {
    circleRef.current?.setRadius(radius);
  }, [radius]);

  useEffect(() => {
    if (!mapInstance.current) return;
    const load = async () => {
      const L = await import('leaflet');
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      (missedConnections || []).forEach((mc) => {
        const color = mc.response_count > 0 ? '#00e89d' : '#888';
        const marker = L.circleMarker(
          [mc._approx_lat || lat, mc._approx_lon || lon],
          {
            radius: 6,
            fillColor: color,
            fillOpacity: 0.8,
            stroke: true,
            color: '#fff',
            weight: 1,
          }
        ).addTo(mapInstance.current);
        marker.bindPopup(
          `<b>${mc.location_name}</b><br/>${mc.response_count || 0} people`
        );
        marker.on('click', () => onSelect?.(mc));
        markersRef.current.push(marker);
      });
    };
    load();
  }, [missedConnections, lat, lon, onSelect]);

  return (
    <Box>
      <Box
        ref={mapRef}
        sx={{
          width: '100%',
          height: {xs: 'calc(100vh - 280px)', sm: '60vh'},
          borderRadius: {xs: 0, sm: 3},
          overflow: 'hidden',
        }}
      />
      <Box
        sx={{
          position: 'relative',
          mt: -8,
          mx: 2,
          zIndex: 1000,
          bgcolor: 'rgba(26,26,46,0.9)',
          borderRadius: 3,
          p: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Typography
          variant="caption"
          sx={{color: '#fff', whiteSpace: 'nowrap'}}
        >
          Radius
        </Typography>
        <Slider
          value={radius}
          onChange={(e, v) => onRadiusChange(v)}
          min={100}
          max={5000}
          step={100}
          marks={RADIUS_MARKS}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => (v >= 1000 ? `${v / 1000}km` : `${v}m`)}
          sx={{flex: 1, color: '#00e89d'}}
        />
      </Box>
    </Box>
  );
}
