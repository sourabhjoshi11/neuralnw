import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const PING_URL = 'https://clients3.google.com/generate_204';
const INTERVAL_MS = 5000;

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = async () => {
    // On web, navigator.onLine is reliable and avoids CORS issues with cross-origin pings
    if (Platform.OS === 'web') {
      setIsOnline(navigator.onLine);
      return;
    }
    // On native (iOS / Android), ping Google's no-content endpoint
    try {
      await fetch(PING_URL, {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(3000),
      });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    check();
    intervalRef.current = setInterval(check, INTERVAL_MS);

    // On web, also listen to the browser's online/offline events for instant updates
    if (Platform.OS === 'web') {
      const handleOnline  = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
      window.addEventListener('online',  handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        window.removeEventListener('online',  handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return isOnline;
}
