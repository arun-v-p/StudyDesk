import { useEffect, useState } from 'react';

/**
 * A ticking clock.
 *
 * The original computed `new Date()` inside render bodies, so an app left open
 * overnight kept showing yesterday's greeting, date and schedule — nothing
 * re-rendered at midnight. This also drives the deadline countdowns.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);

    // Re-render the moment the local day rolls over, without waiting for the tick.
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 50);
    const ms = Math.max(0, midnight.getTime() - Date.now());
    const tid = window.setTimeout(() => setNow(new Date()), ms);

    return () => {
      window.clearInterval(id);
      window.clearTimeout(tid);
    };
  }, [intervalMs]);

  return now;
}
