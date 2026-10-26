import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { useAiPreference } from "@/features/ai/hooks/use-ai";
import { enqueueAiChecks, listAiChecks } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
import type { AiCheck } from "../types/sop.types";

const MAX_IDS = 200;
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
 * AI checks for these tickets. When the user has set up an AI model, every
 * new `loadToken` (a page load or refresh) asks the server to check tickets
 * that changed; unchanged ones cost nothing. Results are polled until done.
 */
export function useSopAiChecks(credentialId: string, workItemIds: number[], loadToken: string | null) {
  const queryClient = useQueryClient();
  const preference = useAiPreference();
  const configured = Boolean(preference.data?.provider && preference.data.model);
  // New AI settings (provider, model, effort) change what a check would use, so they re-ask too.
  const settingsToken = preference.data
    ? `${preference.data.provider ?? ""}|${preference.data.model ?? ""}|${preference.data.effort}|${preference.data.updatedAt ?? ""}`
    : "";
  const idsKey = useMemo(() => [...new Set(workItemIds)].sort((a, b) => a - b).slice(0, MAX_IDS).join(","), [workItemIds]);

  const results = useQuery({
    queryKey: sopKeys.aiResults(credentialId, idsKey),
    queryFn: () => listAiChecks(credentialId, idsKey.split(",").map(Number)),
    enabled: configured && idsKey !== "",
    refetchInterval: (query) => {
      const checks = query.state.data ?? [];
      return checks.some(isAiCheckBusy) ? POLL_MS : checks.some(isAiCheckPaused) ? PAUSED_POLL_MS : false;
    },
  });

  const enqueue = useMutation({
    mutationFn: ({ ids, force }: { ids: number[]; force: boolean }) => enqueueAiChecks(credentialId, ids, force),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sopKeys.ai(credentialId) }),
  });
  const { mutate } = enqueue;

  useEffect(() => {
    if (configured && idsKey !== "" && loadToken) {
      mutate({ ids: idsKey.split(",").map(Number), force: false });
    }
  }, [configured, idsKey, loadToken, settingsToken, mutate]);

  const checks = useMemo(() => new Map((results.data ?? []).map((check) => [check.workItemId, check])), [results.data]);

  return {
    configured,
    /** The provider checks would use now (a paused check may belong to an earlier one). */
    currentProvider: preference.data?.provider ?? null,
    checks,
    /** Re-check now, even if nothing changed. */
    recheck: (ids: number[]) => enqueue.mutate({ ids, force: true }),
    isRechecking: enqueue.isPending,
    enqueueError: enqueue.error,
  };
}
