import { useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * A tab kept in the URL (?tab=…, absent for the default one) that switches at
 * once. Changing the URL is a router navigation, which lands only after the new
 * tab has rendered; until then the old tab would stay on screen (and
 * clickable). So the tab shown is held in state, set on click, while links and
 * Back still change it through the URL.
 */
export function useUrlTab<T extends string>(
  isTab: (value: string | null) => value is T,
  fallback: T,
  options: { replace?: boolean } = {}
): [T, (next: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const fromUrl: T = isTab(requested) ? requested : fallback;
  const [tab, setTab] = useState<T>(fromUrl);
  const [lastFromUrl, setLastFromUrl] = useState<T>(fromUrl);

  // The URL changed by itself (a link, Back): follow it.
  if (fromUrl !== lastFromUrl) {
    setLastFromUrl(fromUrl);
    setTab(fromUrl);
  }

  function select(next: T) {
    setTab(next);
    setSearchParams(next === fallback ? {} : { tab: next }, options.replace ? { replace: true } : undefined);
  }

  return [tab, select];
}
