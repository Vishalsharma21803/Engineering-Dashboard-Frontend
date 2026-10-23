import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveAction,
  listActions,
  listAuditLogs,
  proposeAction,
  rejectAction,
} from "../api/action.api";
import { actionKeys, azureKeys } from "../api/azure.keys";
import type { ActionStatus, ProposedAction } from "../types/action.types";
import { retryUnlessClientError } from "../utils/query-retry";

export function useActions(status?: ActionStatus) {
  return useQuery({
    queryKey: actionKeys.list(status),
    queryFn: () => listActions(status ? { status } : {}),
    retry: retryUnlessClientError,
  });
}

export function useAuditLogs(actionId?: string) {
  return useQuery({
    queryKey: actionKeys.audit(actionId),
    queryFn: () => listAuditLogs(actionId),
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
      void queryClient.invalidateQueries({ queryKey: azureKeys.all });
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
    },
  });
}
