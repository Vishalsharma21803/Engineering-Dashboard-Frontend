import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { ApiError } from "@/lib/api-client";
import { useApproveAction, useRejectAction } from "../hooks/use-actions";
import type { ActionFailurePayload, ProposedAction, Verification } from "../types/action.types";
import { formatDateTime, formatValue } from "../utils/format";
import { ACTION_STATUS_TONES, actionKindLabel } from "../utils/labels";
import { StatusBadge } from "./status-badge";

interface ActionReviewDialogProps {
  action: ProposedAction | null;
  onClose: () => void;
}

type Outcome =
  | { kind: "executed"; action: ProposedAction; verification: Verification }
  | { kind: "rejected"; action: ProposedAction }
  | { kind: "failed"; message: string; action: ProposedAction | null };

/**
 * Shows exactly what will change and requires an explicit click on
 * Approve before anything is sent to Azure DevOps (or Solidtime).
 */
export function ActionReviewDialog({ action, onClose }: ActionReviewDialogProps) {
  const wasOpen = useRef(false);
  const approveMutation = useApproveAction();
  const rejectMutation = useRejectAction();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const isPending = approveMutation.isPending || rejectMutation.isPending;

  // A fresh review starts each time the dialog opens (not when the open action refetches).
  useEffect(() => {
    if (action && !wasOpen.current) {
      setOutcome(null);
    }
    wasOpen.current = action !== null;
  }, [action]);

  const current = outcome?.action ?? action;
  // Keeps the last action on screen while the dialog animates closed.
  const [lastShown, setLastShown] = useState(current);
  if (current && current !== lastShown) {
    setLastShown(current);
  }
  const shown = current ?? lastShown;
  const platform = shown?.kind.startsWith("SOLIDTIME_") ? "Solidtime" : "Azure DevOps";
  const canDecide = shown?.status === "PENDING" && outcome === null;

  function handleApprove() {
    if (!action) {
      return;
    }

    approveMutation.mutate(
      { id: action.id, payloadHash: action.payloadHash },
      {
        onSuccess: (response) =>
          setOutcome({ kind: "executed", action: response.action, verification: response.verification }),
        onError: (error) => {
          const payload = error instanceof ApiError ? (error.payload as ActionFailurePayload | null) : null;
          setOutcome({
            kind: "failed",
            message: error instanceof ApiError ? error.message : "The action could not be executed.",
            action: payload?.action ?? null,
          });
        },
      }
    );
  }

  function handleReject() {
    if (!action) {
      return;
    }

    rejectMutation.mutate(
      { actionId: action.id },
      {
        onSuccess: (rejected) => setOutcome({ kind: "rejected", action: rejected }),
        onError: (error) =>
          setOutcome({
            kind: "failed",
            message: error instanceof ApiError ? error.message : "The action could not be rejected.",
            action: null,
          }),
      }
    );
  }

  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        // As before: only Escape or Close end the review, never a click on the backdrop.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (isPending) {
            event.preventDefault();
          }
        }}
        className="block max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto rounded-xl border-slate-200 bg-surface p-6 text-slate-950 shadow-2xl sm:max-w-xl"
      >
        {shown ? (
          <div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">
                {canDecide ? "Approval required" : "Action"} · {actionKindLabel(shown.kind)}
              </p>
              <StatusBadge tone={ACTION_STATUS_TONES[shown.status]}>{shown.status}</StatusBadge>
            </div>

            <DialogTitle className="mt-2 text-lg font-semibold tracking-tight">
              {shown.summary}
            </DialogTitle>

            <p className="mt-1 text-xs text-slate-500">
              {shown.organizationUrl}
              {/* Solidtime organizations are ids, not names worth showing. */}
              {shown.kind.startsWith("SOLIDTIME_") ? "" : ` · ${shown.projectId}`}
              {shown.status === "PENDING" ? ` · expires ${formatDateTime(shown.expiresAt)}` : ""}
            </p>

            <table className="mt-4 w-full overflow-hidden rounded-lg border border-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Current</th>
                  <th className="px-3 py-2 font-medium">Proposed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.preview.map((change) => (
                  <tr key={change.field}>
                    <td className="px-3 py-2 font-medium text-slate-700">{change.field}</td>
                    <td className="whitespace-pre-wrap px-3 py-2 text-slate-500">{formatValue(change.before)}</td>
                    <td className="whitespace-pre-wrap px-3 py-2 font-medium text-slate-950">
                      {formatValue(change.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {outcome?.kind === "executed" ? (
              <div role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-medium">Executed in {platform}.</p>
                <ul className="mt-1 space-y-0.5">
                  {outcome.verification.checks.map((check) => (
                    <li key={check.check}>
                      {check.passed ? "✓" : "✗"} Verified: {check.check}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {outcome?.kind === "rejected" ? (
              <p role="status" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Rejected. Nothing was changed in {platform}.
              </p>
            ) : null}

            {outcome?.kind === "failed" ? (
              <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {outcome.message}
              </p>
            ) : null}

            {!outcome && shown.errorMessage ? (
              <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {shown.errorMessage}
              </p>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={onClose} disabled={isPending} autoFocus>
                Close
              </Button>

              {canDecide ? (
                <>
                  <Button variant="secondary" onClick={handleReject} disabled={isPending}>
                    {rejectMutation.isPending ? <Spinner className="size-4" /> : null}
                    Reject
                  </Button>
                  <Button onClick={handleApprove} disabled={isPending}>
                    {approveMutation.isPending ? (
                      <>
                        <Spinner className="size-4" />
                        Executing...
                      </>
                    ) : (
                      "Approve & execute"
                    )}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
