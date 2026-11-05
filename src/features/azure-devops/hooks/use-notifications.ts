import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import { useMountedRef } from "@/hooks/use-mounted-ref";
import { errorMessage } from "@/lib/error-text";
import { pushGlobalNotice, sameSession, stampSession, type SessionStamp } from "@/lib/global-errors";

import { notificationKeys } from "../api/azure.keys";
import { listNotifications, readAllNotifications, setNotificationStatus } from "../api/notification.api";
import type { RelayNotification, NotificationStatus } from "../types/notification.types";
import { retryUnlessClientError } from "../utils/query-retry";

/**
 * This organization's notifications (one project's plus those tied to none, when a project is chosen).
 * `dashboardToken` changes when the dashboard reloads, which is when they are brought up to date.
 */
export function useNotifications(credentialId: string, projectName: string | undefined, dashboardToken: string) {
  const list = notificationKeys.list(credentialId, projectName);
  return useQuery({
    queryKey: [...list, dashboardToken],
    queryFn: ({ signal }) => listNotifications(credentialId, projectName, signal),
    retry: retryUnlessClientError,
    enabled: credentialId !== "",
    // The last list stays while the dashboard reloads, but never another project's.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === list[2] ? previous : undefined),
  });
}

/**
 * Called for every failed save, not only the latest (the mutation's own `error` only
 * reflects its last call, so an earlier failure would otherwise go unseen).
 */
export type NotificationSaveFailure = (input: { id: string | null; status: NotificationStatus; error: unknown }) => void;
/**
 * Called when a save worked, so an earlier failure for it can go. `id` null: Mark all as
 * read, which saved `markedRead` (the rows it changed from unread to read).
 */
export type NotificationSaved = (input: { id: string | null; markedRead: string[] }) => void;

type Snapshot = Array<[QueryKey, RelayNotification[] | undefined]>;

/** Puts back only the rows this save changed, to the status each had before; other saves keep theirs. */
function rollBack(queryClient: QueryClient, before: Snapshot, changed: (row: RelayNotification) => boolean) {
  for (const [key, rows] of before) {
    const previous = new Map((rows ?? []).filter(changed).map((row) => [row.id, row.status]));
    queryClient.setQueryData<RelayNotification[]>(key, (current) =>
      current?.map((row) => {
        const status = previous.get(row.id);
        return status === undefined ? row : { ...row, status };
      })
    );
  }
}

/** The menu is gone (the user left the dashboard): the failure still has to be seen. */
function toastFailure(what: string, error: unknown, stamp: SessionStamp | undefined) {
  pushGlobalNotice({ tone: "error", title: "Notification change not saved", message: `${what}: ${errorMessage(error, "the change could not be saved.")}` }, stamp);
}

const statusMutationKey = (credentialId: string) => ["notifications", credentialId, "status"] as const;

/** Ids whose status is being saved right now (several rows can save at once). */
export function useSavingNotificationIds(credentialId: string): string[] {
  return useMutationState({
    filters: { mutationKey: statusMutationKey(credentialId), status: "pending" },
    select: (mutation) => (mutation.state.variables as { id: string } | undefined)?.id ?? "",
  });
}

/** Read, unread (restore) or abandoned, shown at once; put back if saving fails. */
export function useNotificationStatus(credentialId: string, onFailure?: NotificationSaveFailure, onSaved?: NotificationSaved) {
  const queryClient = useQueryClient();
  const scope = { queryKey: ["notifications", credentialId] };
  const mounted = useMountedRef();

  return useMutation({
    mutationKey: statusMutationKey(credentialId),
    mutationFn: ({ id, status }: { id: string; status: NotificationStatus }) => setNotificationStatus(id, status),
    onMutate: async ({ id, status }) => {
      const stamp = stampSession();
      await queryClient.cancelQueries(scope);
      const before = queryClient.getQueriesData<RelayNotification[]>(scope);
      queryClient.setQueriesData<RelayNotification[]>(scope, (rows) => rows?.map((row) => (row.id === id ? { ...row, status } : row)));
      return { before, ...stamp };
    },
    onError: (error, { id, status }, context) => {
      const before = context?.before ?? [];
      rollBack(queryClient, before, (row) => row.id === id);

      // Signed out or another account signed in meanwhile: the failure belongs to the ended session.
      if (!sameSession(context)) {
        return;
      }

      if (mounted.current) {
        onFailure?.({ id, status, error });
      } else {
        const title = before.flatMap(([, rows]) => rows ?? []).find((row) => row.id === id)?.title;
        toastFailure(title ?? "A notification", error, context);
      }
    },
    onSuccess: (_result, { id }, context) => {
      if (mounted.current && sameSession(context)) {
        onSaved?.({ id, markedRead: [] });
      }
    },
    onSettled: () => queryClient.invalidateQueries(scope),
  });
}

export function useReadAllNotifications(credentialId: string, projectName: string | undefined, onFailure?: NotificationSaveFailure, onSaved?: NotificationSaved) {
  const queryClient = useQueryClient();
  const mounted = useMountedRef();
  // Only this project's list (the server marks this project plus those tied to none); the rest refetch after.
  const scope = { queryKey: notificationKeys.list(credentialId, projectName) };

  return useMutation({
    mutationFn: () => readAllNotifications(credentialId, projectName),
    onMutate: async () => {
      const stamp = stampSession();
      await queryClient.cancelQueries(scope);
      const before = queryClient.getQueriesData<RelayNotification[]>(scope);
      queryClient.setQueriesData<RelayNotification[]>(scope, (rows) => rows?.map((row) => (row.status === "UNREAD" ? { ...row, status: "READ" } : row)));
      return { before, ...stamp };
    },
    onError: (error, _input, context) => {
      // Only the ones this marked read go back to unread.
      rollBack(queryClient, context?.before ?? [], (row) => row.status === "UNREAD");

      if (!sameSession(context)) {
        return;
      }

      if (mounted.current) {
        onFailure?.({ id: null, status: "READ", error });
      } else {
        toastFailure("Mark all as read", error, context);
      }
    },
    onSuccess: (_result, _input, context) => {
      if (mounted.current && sameSession(context)) {
        const markedRead = (context?.before ?? []).flatMap(([, rows]) => rows ?? []).filter((row) => row.status === "UNREAD").map((row) => row.id);
        onSaved?.({ id: null, markedRead });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["notifications", credentialId] }),
  });
}
