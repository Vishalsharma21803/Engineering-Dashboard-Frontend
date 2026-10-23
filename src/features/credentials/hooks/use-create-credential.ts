import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createCredential } from "../api/credential.api";
import { credentialKeys } from "../api/credential.keys";
import type { Credential } from "../types/credential.types";

export function useCreateCredential() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createCredential,
    onSuccess: (credential) => {
      const current = queryClient.getQueryData<Credential[]>(
        credentialKeys.list
      );

      if (current) {
        queryClient.setQueryData<Credential[]>(
          credentialKeys.list,
          [credential, ...current]
        );
        return;
      }

      void queryClient.invalidateQueries({
        queryKey: credentialKeys.list,
      });
    },
  });
}
