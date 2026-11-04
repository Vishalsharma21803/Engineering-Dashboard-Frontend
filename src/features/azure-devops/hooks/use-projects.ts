import { useQuery } from "@tanstack/react-query";

import {
  getCapabilities,
  getProjectOverview,
  listProjects,
  listRepositories,
} from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

export function useProjects(credentialId: string) {
  return useQuery({
    queryKey: azureKeys.projects(credentialId),
    queryFn: ({ signal }) => listProjects(credentialId, signal),
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
    // No organization chosen yet (e.g. while credentials load): nothing to ask for.
    enabled: credentialId !== "",
  });
}

export function useProjectOverview(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.project(credentialId, projectId),
    queryFn: () => getProjectOverview(credentialId, projectId),
    retry: retryUnlessClientError,
  });
}

export function useRepositories(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.repositories(credentialId, projectId),
    queryFn: ({ signal }) => listRepositories(credentialId, projectId, signal),
    retry: retryUnlessClientError,
  });
}

export function useCapabilities(credentialId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: azureKeys.capabilities(credentialId),
    queryFn: ({ signal }) => getCapabilities(credentialId, signal),
    enabled: options.enabled ?? true,
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}
