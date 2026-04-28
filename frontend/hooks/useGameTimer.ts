import { useState, useEffect, useRef } from 'react';

export function useGameTimer(endsAtIso: string | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!endsAtIso) {
      setSecondsLeft(0);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(endsAtIso).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
      if (diff <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [endsAtIso]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  return { secondsLeft, minutes, seconds, formatted };
}
