import { useQuery } from "@tanstack/react-query";

import {
  getCapabilities,
  getProjectOverview,
  listProjectPullRequests,
  listProjects,
  listRepositories,
} from "../api/azure.api";
import { azureKeys } from "../api/azure.keys";
import { retryUnlessClientError } from "../utils/query-retry";

export function useProjects(credentialId: string) {
  return useQuery({
    queryKey: azureKeys.projects(credentialId),
    queryFn: () => listProjects(credentialId),
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}

export function useProjectOverview(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.project(credentialId, projectId),
    queryFn: () => getProjectOverview(credentialId, projectId),
    retry: retryUnlessClientError,
  });
}

export function useProjectPullRequests(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.projectPullRequests(credentialId, projectId),
    queryFn: () => listProjectPullRequests(credentialId, projectId),
    retry: retryUnlessClientError,
  });
}

export function useRepositories(credentialId: string, projectId: string) {
  return useQuery({
    queryKey: azureKeys.repositories(credentialId, projectId),
    queryFn: () => listRepositories(credentialId, projectId),
    retry: retryUnlessClientError,
  });
}

export function useCapabilities(credentialId: string) {
  return useQuery({
    queryKey: azureKeys.capabilities(credentialId),
    queryFn: () => getCapabilities(credentialId),
    retry: retryUnlessClientError,
    staleTime: 5 * 60_000,
  });
}
