import { useQuery } from "@tanstack/react-query";

import {
  getBuildTimeline,
  getDeployments,
  listPipelineRuns,
  listPipelines,
} from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

export function usePipelines(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.pipelines(credentialId, projectId),
    queryFn: () => listPipelines(credentialId, projectId),
    retry: retryUnlessClientError,
  });
}

export function usePipelineRuns(credentialId: string, projectId: string, pipelineId: number | null) {
  return useQuery({
    queryKey: azureKeys.pipelineRuns(credentialId, projectId, pipelineId ?? 0),
    queryFn: () => listPipelineRuns(credentialId, projectId, pipelineId ?? 0),
    retry: retryUnlessClientError,
    enabled: pipelineId !== null,
  });
}

export function useBuildTimeline(credentialId: string, projectId: string, buildId: number | null) {
  return useQuery({
    queryKey: azureKeys.timeline(credentialId, projectId, buildId ?? 0),
    queryFn: () => getBuildTimeline(credentialId, projectId, buildId ?? 0),
    retry: retryUnlessClientError,
    enabled: buildId !== null,
  });
}

export function useDeployments(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.deployments(credentialId, projectId),
    queryFn: () => getDeployments(credentialId, projectId),
    retry: retryUnlessClientError,
  });
}
