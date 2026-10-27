import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { ApiError } from "@/lib/api-client";
import { triageKeys } from "../api/azure.keys";
import { clearTriage, listTriage, upsertTriage } from "../api/triage.api";
import type { Dashboard, Recommendation } from "../types/azure.types";
import type { ResolvedTriage, TriageMark, TriageStatus, UpsertTriageInput } from "../types/triage.types";
import { retryUnlessClientError } from "../utils/query-retry";
import {
  buildSignalIndex,
  projectKey,
  projectSignals,
  recommendationKey,
  resolveTriage,
} from "../utils/triage";

export type TriageTarget = { itemKey: string } | { projectName: string };

export interface DashboardTriage {
  /** Controls are disabled until marks load, and stay disabled if loading failed. */
  ready: boolean;
  /** Changes whenever marks change (also optimistically), so server-filtered lists can refresh. */
  version: number;
  /** Changes only once the server has saved (or failed to save) a change, so paged lists reload once, with the saved state. */
  savedVersion: number;
  isLoading: boolean;
  loadError: unknown;
  isSaving: boolean;
  saveError: string | null;
  clearSaveError: () => void;
  projectMarks: TriageMark[];
  keyFor: (recommendation: Recommendation) => string | null;
  resolve: (itemKey: string | null, projectName: string | null) => ResolvedTriage;
  mark: (target: TriageTarget, status: TriageStatus, snoozedUntil?: Date) => void;
  clear: (mark: TriageMark) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.status < 500 && error.message ? error.message : fallback;
}

/** Snooze / acknowledge / abandon state for the dashboard, with optimistic updates. */
export function useDashboardTriage(credentialId: string, dashboard: Dashboard | undefined): DashboardTriage {
  const queryClient = useQueryClient();
  const queryKey = triageKeys.list(credentialId);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState(0);

  const query = useQuery({
    queryKey,
    queryFn: () => listTriage(credentialId),
    retry: retryUnlessClientError,
    enabled: credentialId !== "",
  });

  const replaceMarks = async (update: (marks: TriageMark[]) => TriageMark[]) => {
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<TriageMark[]>(queryKey);
    queryClient.setQueryData<TriageMark[]>(queryKey, update(previous ?? []));
    return { previous };
  };

  const rollback = (context: { previous: TriageMark[] | undefined } | undefined) => {
    if (context) {
      queryClient.setQueryData(queryKey, context.previous);
    }
  };

  const upsert = useMutation({
    mutationFn: upsertTriage,
    onMutate: (input: UpsertTriageInput) => {
      setSaveError(null);
      const now = new Date().toISOString();

      return replaceMarks((marks) => {
        const existing = marks.find((mark) => mark.itemKey === input.itemKey);
        const optimistic: TriageMark = {
          id: existing?.id ?? `pending:${input.itemKey}`,
          credentialId: input.credentialId,
          itemKey: input.itemKey,
          status: input.status,
          snoozedUntil: input.snoozedUntil ?? null,
          signals: input.signals,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        return [optimistic, ...marks.filter((mark) => mark.itemKey !== input.itemKey)];
      });
    },
    onError: (error, _input, context) => {
      rollback(context);
      setSaveError(errorMessage(error, "Could not save that change. Please try again."));
    },
    onSettled: () => {
      setSavedVersion((current) => current + 1);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: (mark: TriageMark) => clearTriage(mark.id),
    onMutate: (mark: TriageMark) => {
      setSaveError(null);
      return replaceMarks((marks) => marks.filter((item) => item.id !== mark.id));
    },
    onError: (error, _mark, context) => {
      rollback(context);
      setSaveError(errorMessage(error, "Could not restore that item. Please try again."));
    },
    onSettled: () => {
      setSavedVersion((current) => current + 1);
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const marks = query.data;
  const marksByKey = useMemo(() => new Map((marks ?? []).map((mark) => [mark.itemKey, mark])), [marks]);
  const builds = dashboard?.sections.pipelines.data;
  const buildsById = useMemo(() => new Map((builds ?? []).map((build) => [build.id, build])), [builds]);
  const signalIndex = useMemo(
    () => buildSignalIndex(dashboard?.recommendations ?? [], builds ?? []),
    [dashboard?.recommendations, builds]
  );

  const keyFor = useCallback(
    (recommendation: Recommendation) => recommendationKey(recommendation, buildsById),
    [buildsById]
  );

  const resolve = useCallback(
    (itemKey: string | null, projectName: string | null) =>
      resolveTriage(marksByKey, itemKey, projectName, itemKey ? signalIndex.get(itemKey)?.signals ?? [] : []),
    [marksByKey, signalIndex]
  );

  const { mutate: upsertMutate } = upsert;
  const { mutate: removeMutate } = remove;

  const mark = useCallback(
    (target: TriageTarget, status: TriageStatus, snoozedUntil?: Date) => {
      const isProject = "projectName" in target;
      const itemKey = isProject ? projectKey(target.projectName) : target.itemKey;
      const signals = isProject
        ? projectSignals(signalIndex, target.projectName)
        : signalIndex.get(itemKey)?.signals ?? [];

      upsertMutate({
        credentialId,
        itemKey,
        status,
        signals,
        ...(status === "SNOOZED" && snoozedUntil ? { snoozedUntil: snoozedUntil.toISOString() } : {}),
      });
    },
    [credentialId, signalIndex, upsertMutate]
  );

  return {
    ready: query.isSuccess,
    version: query.dataUpdatedAt,
    savedVersion,
    isLoading: query.isLoading,
    loadError: query.error,
    isSaving: upsert.isPending || remove.isPending,
    saveError,
    clearSaveError: () => setSaveError(null),
    projectMarks: (marks ?? []).filter((item) => item.itemKey.startsWith("project:")),
    keyFor,
    resolve,
    mark,
    clear: removeMutate,
  };
}
