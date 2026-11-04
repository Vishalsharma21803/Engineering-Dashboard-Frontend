import { keepPreviousData, useQuery } from "@tanstack/react-query";

import {
  getBuildTimeline,
  getDeployments,
  listPipelineRuns,
  listPipelines,
} from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

/** One page of pipelines; with no page chosen, `build` opens the page holding that run's pipeline. */
export function usePipelines(credentialId: string, projectId: string, input: { page: number | undefined; build: number | undefined }) {
  return useQuery({
    queryKey: [...azureKeys.pipelines(credentialId, projectId), input],
    queryFn: ({ signal }) => listPipelines(credentialId, projectId, input, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

export function usePipelineRuns(credentialId: string, projectId: string, pipelineId: number | null) {
  return useQuery({
    queryKey: azureKeys.pipelineRuns(credentialId, projectId, pipelineId ?? 0),
    queryFn: ({ signal }) => listPipelineRuns(credentialId, projectId, pipelineId ?? 0, signal),
    retry: retryUnlessClientError,
    enabled: pipelineId !== null,
  });
}

export function useBuildTimeline(credentialId: string, projectId: string, buildId: number | null) {
  return useQuery({
    queryKey: azureKeys.timeline(credentialId, projectId, buildId ?? 0),
    queryFn: ({ signal }) => getBuildTimeline(credentialId, projectId, buildId ?? 0, signal),
    retry: retryUnlessClientError,
    enabled: buildId !== null,
  });
}

export function useDeployments(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.deployments(credentialId, projectId),
    queryFn: ({ signal }) => getDeployments(credentialId, projectId, signal),
    retry: retryUnlessClientError,
  });
}
