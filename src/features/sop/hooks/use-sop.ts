import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { azureKeys } from "@/features/azure-devops/api/azure.keys";
import { ApiError } from "@/lib/api-client";
import { editRules, getEffectiveRules, getRulebook, getRulesList, listRulebookVersions, saveRulebook } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
import type { RuleEditsInput } from "../types/rules-list.types";
import type { RulebookScope } from "../types/sop.types";

export function useRulebook(scope: RulebookScope) {
  return useQuery({ queryKey: sopKeys.rulebook(scope), queryFn: ({ signal }) => getRulebook(scope, signal) });
}

export function useRulebookVersions(scope: RulebookScope) {
  return useQuery({ queryKey: sopKeys.versions(scope), queryFn: ({ signal }) => listRulebookVersions(scope, signal) });
}

export function useEffectiveRules() {
  return useQuery({ queryKey: sopKeys.effective, queryFn: ({ signal }) => getEffectiveRules(signal) });
}

export function useSaveRulebook(scope: RulebookScope) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ content, note }: { content: string; note?: string }) => saveRulebook(scope, content, note),
    // Every SOP result on tickets, My work and the dashboard follows the new rules.
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: sopKeys.all }), queryClient.invalidateQueries({ queryKey: azureKeys.all })]),
  });
}

export function useRulesList() {
  return useQuery({ queryKey: sopKeys.rulesList, queryFn: ({ signal }) => getRulesList(signal) });
}

/**
 * Edits from the rules list. Success waits for the list to reload, so the next
 * edit is made on the new version; a 409 (changed elsewhere) reloads it too.
 */
export function useEditRules(scope: RulebookScope) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RuleEditsInput) => editRules(scope, input),
    onSuccess: () => {
      // SOP results on tickets, My work and the dashboard follow the new rules (not awaited: the list must not wait for them).
      void queryClient.invalidateQueries({ queryKey: azureKeys.all });
      return Promise.all(
        [sopKeys.rulesList, sopKeys.effective, sopKeys.rulebook(scope), sopKeys.versions(scope)].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: sopKeys.rulesList });
      }
    },
  });
}
