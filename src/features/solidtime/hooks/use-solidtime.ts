import { useQuery } from "@tanstack/react-query";

import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { getCatalog, getProfile, getTimer, listConnections } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";

export function useSolidtimeConnections() {
  return useQuery({ queryKey: solidtimeKeys.connections, queryFn: listConnections, retry: retryUnlessClientError, staleTime: 60_000 });
}

/** The Solidtime connection linked to this Azure organization (with its organization chosen), if any; the oldest, as on the server. */
export function useLinkedSolidtime(azureCredentialId: string) {
  const connections = useSolidtimeConnections();
  // The list is newest first.
  const linked = (connections.data ?? []).filter((connection) => connection.azureCredentialId === azureCredentialId && connection.organizationId !== null).at(-1) ?? null;
  return { connection: linked, isLoading: connections.isLoading };
}

export function useTimer(credentialId: string | null) {
  return useQuery({
    queryKey: solidtimeKeys.timer(credentialId ?? ""),
    queryFn: () => getTimer(credentialId ?? ""),
    enabled: Boolean(credentialId),
    retry: retryUnlessClientError,
    // A running timer's duration is shown live; the server state is re-read now and then.
    refetchInterval: 60_000,
  });
}

/** My Solidtime time zone; days in the time views follow it (not the browser's). */
export function useSolidtimeTimeZone(credentialId: string) {
  const profile = useQuery({ queryKey: solidtimeKeys.profile(credentialId), queryFn: () => getProfile(credentialId), retry: retryUnlessClientError, staleTime: 10 * 60_000 });
  return profile.data?.timeZone ?? null;
}

export function useCatalog(credentialId: string | null) {
  return useQuery({
    queryKey: solidtimeKeys.catalog(credentialId ?? ""),
    queryFn: () => getCatalog(credentialId ?? ""),
    enabled: Boolean(credentialId),
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}
