import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMountedRef } from "@/hooks/use-mounted-ref";
import { ApiError } from "@/lib/api-client";
import { errorMessage } from "@/lib/error-text";
import { pushGlobalNotice, stampSession } from "@/lib/global-errors";

import {
  APPROVE_TIMEOUT_TEXT,
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
    queryFn: ({ signal }) => listActions(filter, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
    // Pending changes expire on the server after a while; counts and lists follow without a reload.
    ...(filter.status === "PENDING" ? { refetchInterval: 60_000 } : {}),
  });
}

export function useAuditLogs(filter: Omit<ActionListFilter, "status" | "history"> = {}) {
  return useQuery({
    queryKey: actionKeys.audit(filter),
    queryFn: ({ signal }) => listAuditLogs(filter, signal),
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
}

const APPROVALS_LINK = { to: "/actions", label: "Open Approvals" };

/** Creates a pending action with a preview. Does not touch Azure DevOps. */
export function useProposeAction() {
  const queryClient = useQueryClient();
  // While the page is open it shows the result (the review dialog, or its error).
  const mounted = useMountedRef();

  return useMutation({
    mutationFn: proposeAction,
    // A result for a session that has since ended is never shown to the next account.
    onMutate: stampSession,
    onSuccess: (_action, _input, stamp) => {
      void queryClient.invalidateQueries({ queryKey: actionKeys.all });
      // Pending approvals are one of the notifications.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });

      if (!mounted.current) {
        pushGlobalNotice({ tone: "info", title: "Change prepared", message: "Review it in Approvals; nothing changes until you approve it.", link: APPROVALS_LINK }, stamp);
      }
    },
    onError: (error, _input, stamp) => {
      if (!mounted.current) {
        pushGlobalNotice({ tone: "error", title: "Could not prepare the change", message: errorMessage(error, "The action could not be prepared.") }, stamp);
      }
    },
  });
}

/** The single path that changes Azure DevOps, triggered only by the Approve button. */
export function useApproveAction() {
  const queryClient = useQueryClient();
  // The review dialog shows the outcome while it is open; after it is gone, a toast does.
  const mounted = useMountedRef();

  return useMutation({
    mutationFn: (action: Pick<ProposedAction, "id" | "payloadHash">) => approveAction(action),
    onMutate: stampSession,
    onSuccess: (response, _action, stamp) => {
      if (!mounted.current) {
        pushGlobalNotice({ tone: "info", title: "Change applied", message: response.action.summary, link: APPROVALS_LINK }, stamp);
      }
    },
    onError: (error, _action, stamp) => {
      if (!mounted.current) {
        const timedOut = error instanceof ApiError && error.kind === "timeout";
        pushGlobalNotice({
          tone: "error",
          title: timedOut ? "Approval not confirmed" : "The change failed",
          message: timedOut ? APPROVE_TIMEOUT_TEXT : errorMessage(error, "The action could not be executed."),
          link: APPROVALS_LINK,
        }, stamp);
      }
    },
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
  const mounted = useMountedRef();

  return useMutation({
    mutationFn: ({ actionId, reason }: { actionId: string; reason?: string }) =>
      rejectAction(actionId, reason),
    onMutate: stampSession,
    onError: (error, _input, stamp) => {
      if (!mounted.current) {
        pushGlobalNotice({ tone: "error", title: "Could not reject the change", message: errorMessage(error, "The action could not be rejected."), link: APPROVALS_LINK }, stamp);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: actionKeys.all });
      // Pending approvals are one of the notifications.
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
