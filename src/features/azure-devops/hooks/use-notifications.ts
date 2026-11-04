import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { notificationKeys } from "../api/azure.keys";
import { listNotifications, readAllNotifications, setNotificationStatus } from "../api/notification.api";
import type { CockpitNotification, NotificationStatus } from "../types/notification.types";
import { retryUnlessClientError } from "../utils/query-retry";

/**
 * This organization's notifications (one project's plus those tied to none, when a project is chosen).
 * `dashboardToken` changes when the dashboard reloads, which is when they are brought up to date.
 */
export function useNotifications(credentialId: string, projectName: string | undefined, dashboardToken: string) {
  const list = notificationKeys.list(credentialId, projectName);
  return useQuery({
    queryKey: [...list, dashboardToken],
    queryFn: () => listNotifications(credentialId, projectName),
    retry: retryUnlessClientError,
    enabled: credentialId !== "",
    // The last list stays while the dashboard reloads, but never another project's.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === list[2] ? previous : undefined),
  });
}

/** Read, unread (restore) or abandoned, shown at once; put back if saving fails. */
export function useNotificationStatus(credentialId: string) {
  const queryClient = useQueryClient();
  const scope = { queryKey: ["notifications", credentialId] };

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: NotificationStatus }) => setNotificationStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries(scope);
      const before = queryClient.getQueriesData<CockpitNotification[]>(scope);
      queryClient.setQueriesData<CockpitNotification[]>(scope, (rows) => rows?.map((row) => (row.id === id ? { ...row, status } : row)));
      return { before };
    },
    onError: (_error, _input, context) => {
      for (const [key, rows] of context?.before ?? []) queryClient.setQueryData(key, rows);
    },
    onSettled: () => queryClient.invalidateQueries(scope),
  });
}

export function useReadAllNotifications(credentialId: string, projectName: string | undefined) {
  const queryClient = useQueryClient();
  // Only this project's list (the server marks this project plus those tied to none); the rest refetch after.
  const scope = { queryKey: notificationKeys.list(credentialId, projectName) };

  return useMutation({
    mutationFn: () => readAllNotifications(credentialId, projectName),
    onMutate: async () => {
      await queryClient.cancelQueries(scope);
      const before = queryClient.getQueriesData<CockpitNotification[]>(scope);
      queryClient.setQueriesData<CockpitNotification[]>(scope, (rows) => rows?.map((row) => (row.status === "UNREAD" ? { ...row, status: "READ" } : row)));
      return { before };
    },
    onError: (_error, _input, context) => {
      for (const [key, rows] of context?.before ?? []) queryClient.setQueryData(key, rows);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications", credentialId] }),
  });
}
