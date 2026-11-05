import { useEffect, useState } from "react";

/**
 * The current time, updated every `everyMs` while `enabled` (a clock costs no requests). Right after it is enabled
 * it can be up to one interval old, so callers treat a time before their data as "no time has passed".
 */
export function useNow(enabled: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return undefined;
    const handle = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(handle);
  }, [enabled, everyMs]);

  return now;
}
