import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  deleteAiCredential,
  getAiPreference,
  getAiUsage,
  getSopCheckTiming,
  getOpenRouterAllowlist,
  listAiCredentials,
  listAiModels,
  replaceAiKey,
  setOpenRouterAllowlist,
  updateAiPreference,
  validateAiCredential,
} from "../api/ai.api";
import { aiKeys } from "../api/ai.keys";
import type { AiProvider } from "../types/ai.types";

export function useAiCredentials() {
  return useQuery({ queryKey: aiKeys.credentials, queryFn: listAiCredentials });
}

export function useAiModels(provider: AiProvider | null, enabled = true) {
  return useQuery({
    queryKey: aiKeys.models(provider ?? "none"),
    queryFn: () => listAiModels(provider ?? "CLAUDE"),
    enabled: provider !== null && enabled,
    staleTime: 10 * 60_000,
  });
}

export function useAiPreference() {
  return useQuery({ queryKey: aiKeys.preference, queryFn: getAiPreference });
}

export function useAiUsage() {
  return useQuery({ queryKey: aiKeys.usage, queryFn: getAiUsage });
}

export function useSopCheckTiming() {
  return useQuery({ queryKey: aiKeys.timing, queryFn: getSopCheckTiming });
}

export function useOpenRouterAllowlist() {
  return useQuery({ queryKey: aiKeys.allowlist, queryFn: getOpenRouterAllowlist });
}

/** Any key change can invalidate the saved AI settings, so refresh everything AI-related. */
function useInvalidateAi() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: aiKeys.all });
}

export function useReplaceAiKey() {
  const invalidate = useInvalidateAi();
  return useMutation({
    mutationFn: ({ id, apiKey }: { id: string; apiKey: string }) => replaceAiKey(id, apiKey),
    onSettled: invalidate,
  });
}

export function useDeleteAiCredential() {
  const invalidate = useInvalidateAi();
  return useMutation({ mutationFn: deleteAiCredential, onSettled: invalidate });
}

export function useValidateAiCredential() {
  const invalidate = useInvalidateAi();
  return useMutation({ mutationFn: validateAiCredential, onSettled: invalidate });
}

export function useUpdateAiPreference() {
  const invalidate = useInvalidateAi();
  return useMutation({ mutationFn: updateAiPreference, onSettled: invalidate });
}

export function useSetOpenRouterAllowlist() {
  const invalidate = useInvalidateAi();
  return useMutation({ mutationFn: setOpenRouterAllowlist, onSettled: invalidate });
}
