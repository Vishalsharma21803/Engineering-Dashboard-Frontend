import { useQuery } from "@tanstack/react-query";

import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getCatalog, getProfile, getTimer, listConnections } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";

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

export function useTimer(credentialId: string | null) {
  return useQuery({
    queryKey: solidtimeKeys.timer(credentialId ?? ""),
    queryFn: ({ signal }) => getTimer(credentialId ?? "", signal),
    enabled: Boolean(credentialId),
    retry: retryUnlessClientError,
    // A running timer's duration is shown live; the server state is re-read now and then.
    refetchInterval: 60_000,
  });
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
