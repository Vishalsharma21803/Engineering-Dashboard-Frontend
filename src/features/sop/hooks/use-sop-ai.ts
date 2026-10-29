import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useAiPreference } from "@/features/ai/hooks/use-ai";
import { enqueueAiChecks, listAiChecks } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
import type { AiCheck } from "../types/sop.types";

const POLL_MS = 3_000;
const PAUSED_POLL_MS = 60_000;

/** Waiting out a provider rate limit; it retries by itself at `notBefore`. */
export function isAiCheckPaused(check: AiCheck | undefined): boolean {
  return check?.status === "QUEUED" && check.notBefore !== null && new Date(check.notBefore).getTime() > Date.now();
}

/** Queued to run now, or running. */
export function isAiCheckBusy(check: AiCheck | undefined): boolean {
  return (check?.status === "QUEUED" && !isAiCheckPaused(check)) || check?.status === "RUNNING";
}

/**
 * The AI review of one ticket, for its page. Opening the ticket asks the
 * server to review it; the server skips that when the saved review already
 * matches this revision, rules and AI settings, so it costs nothing then.
 * When a new review lands, `onReviewed` runs (the page reloads the ticket,
 * whose SOP result then shows the AI's clears). The dashboard never calls this.
 */
export function useSopAiReview(credentialId: string, workItem: { id: number; rev: number } | undefined, onReviewed?: () => void) {
  const queryClient = useQueryClient();
  const preference = useAiPreference();
  const configured = Boolean(preference.data?.provider && preference.data.model);
  // New AI settings (provider, model, effort) change what a review would use, so they ask again too.
  const settingsToken = preference.data
    ? `${preference.data.provider ?? ""}|${preference.data.model ?? ""}|${preference.data.effort}|${preference.data.updatedAt ?? ""}`
    : "";
  const id = workItem?.id ?? null;

  const results = useQuery({
    queryKey: sopKeys.aiResults(credentialId, String(id ?? "")),
    queryFn: () => listAiChecks(credentialId, [id as number]),
    enabled: configured && id !== null,
    refetchInterval: (query) => {
      const checks = query.state.data ?? [];
      return checks.some(isAiCheckBusy) ? POLL_MS : checks.some(isAiCheckPaused) ? PAUSED_POLL_MS : false;
    },
  });

  const enqueue = useMutation({
    mutationFn: ({ force }: { force: boolean }) => enqueueAiChecks(credentialId, [id as number], force),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sopKeys.ai(credentialId) }),
  });
  const { mutate } = enqueue;
  const revision = workItem ? `${workItem.id}:${workItem.rev}` : null;

  useEffect(() => {
    if (configured && revision) {
      mutate({ force: false });
    }
  }, [configured, revision, settingsToken, mutate]);

  const check = results.data?.find((row) => row.workItemId === id);
  const finished = check?.status === "DONE" ? check.finishedAt : null;
  const seen = useRef<string | null | undefined>(undefined);
  const reviewed = useRef(onReviewed);

  useEffect(() => {
    reviewed.current = onReviewed;
  }, [onReviewed]);

  // A review that finishes while the page is open: reload the ticket once (not for the result already there on arrival).
  useEffect(() => {
    if (results.isFetched && seen.current === undefined) {
      seen.current = finished;
      return;
    }

    if (finished && seen.current !== undefined && finished !== seen.current) {
      seen.current = finished;
      reviewed.current?.();
    }
  }, [finished, results.isFetched]);

  return {
    configured,
    /** The provider reviews would use now (a paused review may belong to an earlier one). */
    currentProvider: preference.data?.provider ?? null,
    check,
    /** Review again now, even if nothing changed. */
    recheck: () => enqueue.mutate({ force: true }),
    isRechecking: enqueue.isPending,
    enqueueError: enqueue.error,
  };
}
