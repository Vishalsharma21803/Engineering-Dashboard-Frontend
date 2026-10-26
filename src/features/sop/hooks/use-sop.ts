import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getEffectiveRules, getRulebook, listRulebookVersions, saveRulebook } from "../api/sop.api";
import { sopKeys } from "../api/sop.keys";
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
