import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { getDashboard } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

export function useDashboard(credentialId: string, projectId: string | undefined) {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const query = useQuery({
    queryKey: azureKeys.dashboard(credentialId, projectId),
    queryFn: () => getDashboard(credentialId, projectId),
    retry: retryUnlessClientError,
  });

  /** Bypasses the backend's short-lived Azure cache. */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      await queryClient.fetchQuery({
        queryKey: azureKeys.dashboard(credentialId, projectId),
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
