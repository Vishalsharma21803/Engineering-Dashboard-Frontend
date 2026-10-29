import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { editRules, getEffectiveRules, getRulebook, getRulesList, listRulebookVersions, saveRulebook } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
import type { RuleEditsInput } from "../types/rules-list.types";
import type { RulebookScope } from "../types/sop.types";

export function useRulebook(scope: RulebookScope) {
  return useQuery({ queryKey: sopKeys.rulebook(scope), queryFn: () => getRulebook(scope) });
}

export function useRulebookVersions(scope: RulebookScope) {
  return useQuery({ queryKey: sopKeys.versions(scope), queryFn: () => listRulebookVersions(scope) });
}

export function useEffectiveRules() {
  return useQuery({ queryKey: sopKeys.effective, queryFn: getEffectiveRules });
}

export function useSaveRulebook(scope: RulebookScope) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ content, note }: { content: string; note?: string }) => saveRulebook(scope, content, note),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: sopKeys.all }),
  });
}

export function useRulesList() {
  return useQuery({ queryKey: sopKeys.rulesList, queryFn: getRulesList });
}

/**
 * Edits from the rules list. Success waits for the list to reload, so the next
 * edit is made on the new version; a 409 (changed elsewhere) reloads it too.
 */
export function useEditRules(scope: RulebookScope) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RuleEditsInput) => editRules(scope, input),
    onSuccess: () =>
      Promise.all(
        [sopKeys.rulesList, sopKeys.effective, sopKeys.rulebook(scope), sopKeys.versions(scope)].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void queryClient.invalidateQueries({ queryKey: sopKeys.rulesList });
      }
    },
  });
}
