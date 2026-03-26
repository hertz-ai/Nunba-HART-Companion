import realtimeService from '../services/realtimeService';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';

const RealtimeContext = createContext();

export function RealtimeProvider({children}) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      realtimeService.connect(token);
    }

    const unsubConnect = realtimeService.on('connected', () =>
      setConnected(true)
    );
    const unsubDisconnect = realtimeService.on('disconnected', () =>
      setConnected(false)
    );
    const unsubAll = realtimeService.on('*', (event) => setLastEvent(event));

    return () => {
      unsubConnect();
      unsubDisconnect();
      unsubAll();
      realtimeService.disconnect();
    };
  }, []);

  const subscribe = useCallback((eventType, callback) => {
    return realtimeService.on(eventType, callback);
  }, []);

  return (
    <RealtimeContext.Provider value={{connected, lastEvent, subscribe}}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  return useContext(RealtimeContext);
}

export default RealtimeContext;
