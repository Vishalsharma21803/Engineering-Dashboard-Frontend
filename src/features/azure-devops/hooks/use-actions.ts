import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveAction,
  listActions,
  listAuditLogs,
  proposeAction,
  rejectAction,
} from "../api/action.api";
import { actionKeys, azureKeys, notificationKeys } from "../api/azure.keys";
import type { ActionListFilter, ProposedAction } from "../types/action.types";
import { retryUnlessClientError } from "../utils/query-retry";

/** One page of actions; `total` counts every match (e.g. the pending badge). */
export function useActions(filter: ActionListFilter = {}) {
  return useQuery({
    queryKey: actionKeys.list(filter),
    queryFn: () => listActions(filter),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    // Pending changes expire on the server after a while; counts and lists follow without a reload.
    ...(filter.status === "PENDING" ? { refetchInterval: 60_000 } : {}),
  });
}

export function useAuditLogs(filter: Omit<ActionListFilter, "status" | "history"> = {}) {
  return useQuery({
    queryKey: actionKeys.audit(filter),
    queryFn: () => listAuditLogs(filter),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

/** Creates a pending action with a preview. Does not touch Azure DevOps. */
export function useProposeAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: proposeAction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: actionKeys.all });
      // Pending approvals are one of the notifications.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

/** The single path that changes Azure DevOps, triggered only by the Approve button. */
export function useApproveAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (action: Pick<ProposedAction, "id" | "payloadHash">) => approveAction(action),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: actionKeys.all });
      // Pending approvals are one of the notifications.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      void queryClient.invalidateQueries({ queryKey: azureKeys.all });
      // Approved Solidtime changes (timer, entries) show up in the time views.
      void queryClient.invalidateQueries({ queryKey: ["solidtime"] });
    },
  });
}

export function useRejectAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ actionId, reason }: { actionId: string; reason?: string }) =>
      rejectAction(actionId, reason),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: actionKeys.all });
      // Pending approvals are one of the notifications.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
