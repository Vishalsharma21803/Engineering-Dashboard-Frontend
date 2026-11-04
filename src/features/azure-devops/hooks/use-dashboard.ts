import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { getDashboard } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

/** `enabled: false` only reads what is cached (the command palette loads it only when nothing is). */
export function useDashboard(credentialId: string, projectId: string | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const query = useQuery({
    queryKey: azureKeys.dashboard(credentialId, projectId),
    queryFn: () => getDashboard(credentialId, projectId),
    retry: retryUnlessClientError,
    enabled,
  });

  /** Bypasses the backend's short-lived Azure cache. */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const queryKey = azureKeys.dashboard(credentialId, projectId);
      // A load already running would be handed back as is (without refresh=true): cancel it first.
      // The cancelled request still finishes on the server; only its answer is ignored.
      await queryClient.cancelQueries({ queryKey, exact: true });
      await queryClient.fetchQuery({
        queryKey,
        queryFn: () => getDashboard(credentialId, projectId, { refresh: true }),
        staleTime: 0,
      });
    } catch {
      // The query's error state already reflects the failure.
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient, credentialId, projectId]);

  return { ...query, refresh, isRefreshing };
}
