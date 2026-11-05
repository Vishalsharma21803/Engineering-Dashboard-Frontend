import { useQuery, useQueryClient, type Query, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getCatalog, getProfile, getTimer, listConnections, readFreshSoon } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { Timer } from "../types/solidtime.types";

export function useSolidtimeConnections() {
  return useQuery({ queryKey: solidtimeKeys.connections, queryFn: ({ signal }) => listConnections(signal), retry: retryUnlessClientError, staleTime: 60_000 });
}

/**
 * The Solidtime connection linked to this Azure organization (with its organization chosen), if any; the oldest, as on the server.
 * `error` is set when the connections could not be read: with no `connection`, "not linked" is then unknown, not a fact.
 */
export function useLinkedSolidtime(azureCredentialId: string) {
  const connections = useSolidtimeConnections();
  // The list is newest first.
  const linked = (connections.data ?? []).filter((connection) => connection.azureCredentialId === azureCredentialId && connection.organizationId !== null).at(-1) ?? null;
  return { connection: linked, isLoading: connections.isLoading, error: connections.error, isFetching: connections.isFetching, refetch: connections.refetch };
}

/** While a timer runs (and the page is visible), it is checked this often, in case it is stopped in Solidtime. */
const TIMER_RECHECK_MS = 5 * 60_000;

/** Re-check only while a timer runs: with none running, nothing is read until I come back to the page or refresh. */
export function timerRecheckInterval(timer: Timer | null | undefined): number | false {
  return timer ? TIMER_RECHECK_MS : false;
}

/** Views whose numbers move with my timer (not the draft: re-reading it would replace my edits). */
const TIMER_VIEWS = new Set(["timesheet", "unlinked", "ticket", "ticket-times", "verification", "accuracy"]);

export const isTimerView = (credentialId: string) => (query: Query) =>
  query.queryKey[0] === "solidtime" && query.queryKey[1] === credentialId && TIMER_VIEWS.has(String(query.queryKey[2]));

/** Everything of this connection except the draft, read fresh from Solidtime. */
export function refreshSolidtime(queryClient: QueryClient, credentialId: string): Promise<void> {
  readFreshSoon(credentialId);
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "solidtime" && query.queryKey[1] === credentialId && query.queryKey[2] !== "draft" });
}

/** The last timer each connection's check saw ("none", or the running entry's id), shared by every timer on screen. */
const lastTimers = new WeakMap<QueryClient, Map<string, string>>();

function lastTimerOf(queryClient: QueryClient): Map<string, string> {
  const known = lastTimers.get(queryClient) ?? new Map<string, string>();
  lastTimers.set(queryClient, known);
  return known;
}

/**
 * My Solidtime timer: the check the time views follow. Read when a page needs it, when I come back to the page
 * or the network returns, and every few minutes while one runs; the clock in between is local.
 */
export function useTimer(credentialId: string | null) {
  const queryClient = useQueryClient();
  const timer = useQuery({
    queryKey: solidtimeKeys.timer(credentialId ?? ""),
    queryFn: ({ signal }) => getTimer(credentialId ?? "", signal),
    enabled: Boolean(credentialId),
    retry: retryUnlessClientError,
    // A start or stop made in Solidtime shows once I come back to the page, however recently it was read.
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    // Paused while the page is hidden (TanStack's default).
    refetchInterval: (query) => timerRecheckInterval(query.state.data),
  });
  const enabled = Boolean(credentialId);
  // TanStack re-checks when the tab becomes visible; coming back to the window from another app (the tab never
  // hidden, e.g. Solidtime's desktop app beside the browser) is a focus event, so it checks then too.
  useEffect(() => {
    if (!enabled) return undefined;
    const key = solidtimeKeys.timer(credentialId ?? "");
    const onFocus = () => void queryClient.refetchQueries({ queryKey: key, exact: true }, { cancelRefetch: false });
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, credentialId, queryClient]);

  const seen = timer.data === undefined ? undefined : (timer.data?.entry.id ?? "none");

  useEffect(() => {
    if (!credentialId || seen === undefined) return;
    const lastTimer = lastTimerOf(queryClient);
    const previous = lastTimer.get(credentialId);
    lastTimer.set(credentialId, seen);

    // Started, stopped or swapped since the last check: the views counting it are read again, fresh.
    if (previous !== undefined && previous !== seen) {
      readFreshSoon(credentialId);
      // A reload already running (after an approval) is kept, not restarted.
      void queryClient.invalidateQueries({ predicate: isTimerView(credentialId) }, { cancelRefetch: false });
    }
  }, [credentialId, seen, queryClient]);

  return timer;
}

/** My Solidtime profile (name and time zone). */
export function useSolidtimeProfile(credentialId: string) {
  return useQuery({ queryKey: solidtimeKeys.profile(credentialId), queryFn: ({ signal }) => getProfile(credentialId, signal), retry: retryUnlessClientError, staleTime: 10 * 60_000 });
}

/** My Solidtime time zone; days in the time views follow it (not the browser's). Null until (or unless) the profile loads. */
export function useSolidtimeTimeZone(credentialId: string) {
  return useSolidtimeProfile(credentialId).data?.timeZone ?? null;
}

export function useCatalog(credentialId: string | null) {
  return useQuery({
    queryKey: solidtimeKeys.catalog(credentialId ?? ""),
    queryFn: ({ signal }) => getCatalog(credentialId ?? "", signal),
    enabled: Boolean(credentialId),
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}
