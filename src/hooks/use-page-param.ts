import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";

/** Same rule as the server: only a plain positive integer is a page; anything else is page 1. */
export function parsePageParam(value: string | null): number {
  return value !== null && /^\d{1,6}$/.test(value) ? Math.max(1, Number(value)) : 1;
}

/**
 * A page number kept in the URL (?page=2) so it survives reloads and links.
 * Tampered values read as page 1; `syncServedPage` then rewrites the URL to
 * the page the server actually served (e.g. the last page when ?page=999).
 */
export function usePageParam(name = "page") {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(name);
  const page = parsePageParam(raw);

  const setPage = useCallback(
    (next: number, options: { replace?: boolean } = {}) => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);

          if (next <= 1) {
            params.delete(name);
          } else {
            params.set(name, String(next));
          }

          return params;
        },
        { replace: options.replace ?? false }
      );
    },
    [name, setSearchParams]
  );

  return { page, raw, setPage };
}

/**
 * Keeps the URL equal to the page the server served (replacing history, so
 * Back is not polluted). Pass `servedPage` only for data that answers the
 * current request, never for previous data shown while the next page loads.
 */
export function useSyncServedPage(pageParam: ReturnType<typeof usePageParam>, servedPage: number | undefined) {
  const { raw, setPage } = pageParam;

  useEffect(() => {
    if (servedPage === undefined) {
      return;
    }

    const canonical = servedPage <= 1 ? null : String(servedPage);

    if (raw !== canonical) {
      setPage(servedPage, { replace: true });
    }
  }, [raw, servedPage, setPage]);
}
