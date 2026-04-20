import {encountersApi} from '../../../services/socialApi';

import {useState, useEffect, useRef, useCallback} from 'react';

export default function useLocationPing() {
  const [isTracking, setIsTracking] = useState(false);
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [matches, setMatches] = useState([]);
  const watchRef = useRef(null);
  const intervalRef = useRef(null);

  const sendPing = useCallback(async (latitude, longitude) => {
    try {
      const res = await encountersApi.locationPing(latitude, longitude, 0);
      if (res?.data) setNearbyCount(res.data.nearby_count || 0);
    } catch {
      /* silent */
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      const res = await encountersApi.proximityMatches();
      setMatches(res.data || []);
    } catch {
      /* silent */
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) return;
    setIsTracking(true);
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLon(pos.coords.longitude);
        sendPing(pos.coords.latitude, pos.coords.longitude);
      },
      () => {},
      {enableHighAccuracy: true, timeout: 10000, maximumAge: 30000}
    );
    intervalRef.current = setInterval(fetchMatches, 15000);
    fetchMatches();
  }, [sendPing, fetchMatches]);

  const stopTracking = useCallback(() => {
    setIsTracking(false);
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (watchRef.current !== null)
        navigator.geolocation.clearWatch(watchRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    []
  );

  return {
    lat,
    lon,
    nearbyCount,
    matches,
    isTracking,
    startTracking,
    stopTracking,
    fetchMatches,
  };
}
