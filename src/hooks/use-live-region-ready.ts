import { useEffect, useState } from "react";

/**
 * False until the region has been on screen for a frame, then true. Screen readers
 * announce text that appears in a live region (role="status") already in the
 * accessibility tree; a region that arrives with its text, or whose text lands in the
 * same frame, is often not announced at all. The animation frame fires before the next
 * paint and the timeout after it, so the change comes once the region was painted.
 */
export function useLiveRegionReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timeout = setTimeout(() => setReady(true), 0);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };
  }, []);

  return ready;
}
