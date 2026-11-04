import { useEffect, useState } from "react";

import { readStored, writeStored } from "../utils/stored";

function readSession(key: string): number | null | undefined {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as number | null);
  } catch {
    return undefined;
  }
}

function writeSession(key: string, value: number | null): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Without session storage the baseline is per page load instead.
  }
}

/**
 * When I last visited before this browser session (ms), so tickets changed
 * since show a dot. The baseline stays the same for the whole session (going
 * to a ticket and back keeps the dots); the next session compares with now.
 */
export function useLastVisit(credentialId: string): number | null {
  const key = `cockpit:last-visit:${credentialId}`;
  const [previous] = useState(() => {
    const session = readSession(key);
    return session !== undefined ? session : readStored<number | null>(key, null);
  });

  useEffect(() => {
    if (readSession(key) === undefined) writeSession(key, previous);
    writeStored(key, Date.now());
  }, [key, previous]);

  return previous;
}
