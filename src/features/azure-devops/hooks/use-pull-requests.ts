import { useQuery } from "@tanstack/react-query";

import { getPullRequest } from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

export function usePullRequest(
  credentialId: string,
  projectId: string,
  repositoryId: string,
  pullRequestId: number
) {
  return useQuery({
    queryKey: azureKeys.pullRequest(credentialId, repositoryId, pullRequestId),
    queryFn: () => getPullRequest(credentialId, projectId, repositoryId, pullRequestId),
    retry: retryUnlessClientError,
    enabled: Number.isInteger(pullRequestId) && pullRequestId > 0,
  });
}
