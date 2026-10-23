import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api-client";
import { validateCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type { Credential } from "../types/credential.types";

export function useValidateCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: validateCredential,
    onSuccess: (result, credentialId) => {
      const current = queryClient.getQueryData<Credential[]>(
        credentialKeys.list
      );

      if (current) {
        queryClient.setQueryData<Credential[]>(
          credentialKeys.list,
          current.map((item) =>
            item.id === credentialId
              ? {
                  ...item,
                  lastValidatedAt: result.lastValidatedAt,
                  lastValidationStatus: result.valid
                    ? "VALID"
                    : "INVALID",
                }
              : item
          )
        );
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: credentialKeys.list,
      });
    },
    onError: (error) => {
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 502)
      ) {
        void queryClient.invalidateQueries({
          queryKey: credentialKeys.list,
        });
      }
    },
  });
}
