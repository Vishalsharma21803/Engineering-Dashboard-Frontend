import { useQuery } from "@tanstack/react-query";

import { getWorkItem } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

export function useWorkItem(credentialId: string, projectId: string, workItemId: number) {
  return useQuery({
    queryKey: azureKeys.workItem(credentialId, projectId, workItemId),
    queryFn: () => getWorkItem(credentialId, projectId, workItemId),
    retry: retryUnlessClientError,
    enabled: Number.isInteger(workItemId) && workItemId > 0,
  });
}
