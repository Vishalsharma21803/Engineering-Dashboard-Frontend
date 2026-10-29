import { useQuery } from "@tanstack/react-query";

import { getWorkItem } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

/**
 * One ticket. The server always reads it fresh from Azure, so it is refetched
 * when the page is opened again or the window regains focus: a ticket moved in
 * Azure must never show its old state here. A few seconds of staleness spare
 * Azure a full re-read on every quick alt-tab; the Refresh button always reads.
 */
export function useWorkItem(credentialId: string, projectId: string, workItemId: number) {
  return useQuery({
    queryKey: azureKeys.workItem(credentialId, projectId, workItemId),
    queryFn: () => getWorkItem(credentialId, projectId, workItemId),
    retry: retryUnlessClientError,
    enabled: Number.isInteger(workItemId) && workItemId > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}
